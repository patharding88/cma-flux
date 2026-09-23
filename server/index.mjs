import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { db, nowIso } from "./db.mjs";
import { clientJourneyGraph, emptyGraph, subprocessGraph } from "./seed.mjs";
import { computeGantt, ganttToCsv } from "./gantt.mjs";
import { enrichMapNodes, findParentIds } from "./maps.mjs";
import {
  copyWorkflowFiles,
  findStored,
  isFileId,
  removeStored,
  removeWorkflowFiles,
  sanitizeName,
  storedOriginalName,
  workflowDir,
} from "./files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

function newId() {
  return crypto.randomUUID();
}

function parseGraph(row) {
  try {
    return JSON.parse(row.graph_json);
  } catch {
    return emptyGraph();
  }
}

function listWorkflows() {
  return db
    .prepare(
      `SELECT id, name, description, revision, created_at, updated_at
       FROM workflows
       ORDER BY updated_at DESC`,
    )
    .all();
}

function getWorkflow(id) {
  const row = db.prepare("SELECT * FROM workflows WHERE id = ?").get(id);
  if (!row) return null;
  const graph = parseGraph(row);
  const enriched = enrichMapNodes(graph, getWorkflowRaw, row.id);
  const parentId = enriched.parentWorkflowId || null;
  const parent = parentId ? parentSummary(parentId) : null;
  return { ...row, graph: enriched, parent };
}

function getWorkflowRaw(id) {
  const row = db.prepare("SELECT * FROM workflows WHERE id = ?").get(id);
  if (!row) return null;
  return { ...row, graph: parseGraph(row) };
}

function parentSummary(id) {
  const row = db
    .prepare("SELECT id, name, description, revision, created_at, updated_at FROM workflows WHERE id = ?")
    .get(id);
  return row || null;
}

function refreshLinkedParents(childId) {
  const rows = db.prepare("SELECT id, graph_json FROM workflows").all();
  const parentIds = findParentIds(rows, parseGraph, childId);
  for (const parentId of parentIds) {
    if (parentId === childId) continue;
    const current = getWorkflowRaw(parentId);
    if (!current) continue;
    const graph = enrichMapNodes(current.graph, getWorkflowRaw, parentId);
    const now = nowIso();
    const revision = current.revision + 1;
    db.prepare(
      `UPDATE workflows SET graph_json = ?, revision = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(graph), revision, now, parentId);
    broadcast(parentId, {
      type: "graph",
      workflowId: parentId,
      revision,
      graph,
      senderId: null,
      updatedAt: now,
    });
  }
}

function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM workflows").get().n;
  if (count > 0) return;
  const now = nowIso();
  db.prepare(
    `INSERT INTO workflows (id, name, description, graph_json, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    newId(),
    "Client journey — enquiry to handover",
    "The full client-facing build process, with future apps and automations marked in.",
    JSON.stringify(clientJourneyGraph()),
    now,
    now,
  );
}

seedIfEmpty();

const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/workflows", (_req, res) => {
  res.json(listWorkflows());
});

app.post("/api/workflows", (req, res) => {
  const now = nowIso();
  const id = newId();
  const name = String(req.body?.name || "Untitled workflow").trim() || "Untitled workflow";
  const description = String(req.body?.description || "").trim();
  const parentWorkflowId = String(req.body?.parentWorkflowId || "").trim() || null;
  const graph = req.body?.subprocess ? subprocessGraph(parentWorkflowId) : emptyGraph();
  if (parentWorkflowId) graph.parentWorkflowId = parentWorkflowId;
  db.prepare(
    `INSERT INTO workflows (id, name, description, graph_json, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, name, description, JSON.stringify(graph), now, now);
  res.status(201).json(getWorkflow(id));
});

app.get("/api/workflows/:id", (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  res.json(workflow);
});

app.post("/api/workflows/:id/copy", (req, res) => {
  const current = getWorkflowRaw(req.params.id);
  if (!current) return res.status(404).json({ error: "Workflow not found" });
  const id = newId();
  const name = `Copy of ${current.name}`;
  const graph = copyWorkflowFiles(current.id, id, structuredClone(current.graph));
  const now = nowIso();
  db.prepare(
    `INSERT INTO workflows (id, name, description, graph_json, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, name, current.description || "", JSON.stringify(graph), now, now);
  res.status(201).json(getWorkflow(id));
});

app.patch("/api/workflows/:id", (req, res) => {
  const current = getWorkflowRaw(req.params.id);
  if (!current) return res.status(404).json({ error: "Workflow not found" });
  const name = req.body?.name != null ? String(req.body.name).trim() : current.name;
  const description =
    req.body?.description != null ? String(req.body.description) : current.description;
  let graph = current.graph;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "parentWorkflowId")) {
    const parentWorkflowId = req.body.parentWorkflowId
      ? String(req.body.parentWorkflowId).trim() || null
      : null;
    graph = { ...graph, parentWorkflowId };
  }
  const now = nowIso();
  db.prepare(
    `UPDATE workflows SET name = ?, description = ?, graph_json = ?, updated_at = ? WHERE id = ?`,
  ).run(name || current.name, description, JSON.stringify(graph), now, current.id);
  refreshLinkedParents(current.id);
  res.json(getWorkflow(current.id));
});

app.put("/api/workflows/:id/graph", (req, res) => {
  const current = getWorkflowRaw(req.params.id);
  if (!current) return res.status(404).json({ error: "Workflow not found" });
  const graph = enrichMapNodes(
    {
      nodes: Array.isArray(req.body?.nodes) ? req.body.nodes : current.graph.nodes,
      edges: Array.isArray(req.body?.edges) ? req.body.edges : current.graph.edges,
      viewport: req.body?.viewport || current.graph.viewport,
      parentWorkflowId:
        req.body?.parentWorkflowId !== undefined
          ? req.body.parentWorkflowId
          : current.graph.parentWorkflowId || null,
    },
    getWorkflowRaw,
    current.id,
  );
  const now = nowIso();
  const revision = current.revision + 1;
  db.prepare(
    `UPDATE workflows SET graph_json = ?, revision = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify(graph), revision, now, current.id);
  broadcast(current.id, {
    type: "graph",
    workflowId: current.id,
    revision,
    graph,
    senderId: req.body?.senderId || null,
    updatedAt: now,
  });
  refreshLinkedParents(current.id);
  res.json(getWorkflow(current.id));
});

app.get("/api/workflows/:id/gantt", (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  const pathway = String(req.query.pathway || "");
  const rows = computeGantt(workflow.graph.nodes, workflow.graph.edges, pathway);
  res.json({ rows, totalDays: rows.reduce((max, row) => Math.max(max, row.finishDay), 0) });
});

app.get("/api/workflows/:id/gantt.csv", (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  const pathway = String(req.query.pathway || "");
  const rows = computeGantt(workflow.graph.nodes, workflow.graph.edges, pathway);
  const csv = ganttToCsv(rows);
  const filename = `${workflow.name.replace(/[^\w\- ]+/g, "").trim() || "workflow"}-gantt.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

app.delete("/api/workflows/:id", (req, res) => {
  const current = getWorkflow(req.params.id);
  if (!current) return res.status(404).json({ error: "Workflow not found" });
  db.prepare("DELETE FROM workflows WHERE id = ?").run(current.id);
  removeWorkflowFiles(current.id);
  res.status(204).end();
});

app.post("/api/workflows/:id/files", express.raw({ type: "*/*", limit: "25mb" }), (req, res) => {
  const workflow = getWorkflowRaw(req.params.id);
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
  if (!body.length) return res.status(400).json({ error: "Empty file" });
  const fileId = newId();
  const original = sanitizeName(req.query.name || req.headers["x-filename"] || "file");
  const dir = workflowDir(workflow.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${fileId}__${original}`), body);
  res.status(201).json({
    id: fileId,
    name: original,
    size: body.length,
    mime: String(req.headers["content-type"] || "application/octet-stream").split(";")[0],
    url: `/api/files/${workflow.id}/${fileId}`,
  });
});

app.get("/api/files/:workflowId/:fileId", (req, res) => {
  const stored = findStored(req.params.workflowId, req.params.fileId);
  if (!stored) return res.status(404).json({ error: "File not found" });
  const filename = storedOriginalName(stored);
  res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
  res.sendFile(stored);
});

app.delete("/api/files/:workflowId/:fileId", (req, res) => {
  if (!isFileId(req.params.workflowId) || !isFileId(req.params.fileId)) {
    return res.status(400).json({ error: "Bad file" });
  }
  removeStored(req.params.workflowId, req.params.fileId);
  res.status(204).end();
});

const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/live" });
const rooms = new Map();

function room(workflowId) {
  if (!rooms.has(workflowId)) rooms.set(workflowId, new Set());
  return rooms.get(workflowId);
}

function presence(workflowId) {
  return [...room(workflowId)]
    .filter((socket) => socket.readyState === 1)
    .map((socket) => ({
      clientId: socket.clientId,
      name: socket.displayName || "Someone",
    }));
}

function broadcast(workflowId, payload, except) {
  const message = JSON.stringify(payload);
  for (const socket of room(workflowId)) {
    if (socket !== except && socket.readyState === 1) socket.send(message);
  }
}

function broadcastPresence(workflowId) {
  broadcast(workflowId, { type: "presence", people: presence(workflowId) });
}

wss.on("connection", (socket) => {
  socket.clientId = newId();
  socket.workflowId = null;
  socket.displayName = "Someone";

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.type === "join" && message.workflowId) {
      if (socket.workflowId) room(socket.workflowId).delete(socket);
      socket.workflowId = message.workflowId;
      socket.displayName = String(message.name || "Someone").slice(0, 40);
      room(socket.workflowId).add(socket);
      const workflow = getWorkflow(socket.workflowId);
      if (workflow) {
        socket.send(
          JSON.stringify({
            type: "graph",
            workflowId: workflow.id,
            revision: workflow.revision,
            graph: workflow.graph,
            senderId: null,
            updatedAt: workflow.updated_at,
          }),
        );
      }
      broadcastPresence(socket.workflowId);
    }
    if (message.type === "rename") {
      socket.displayName = String(message.name || "Someone").slice(0, 40);
      if (socket.workflowId) broadcastPresence(socket.workflowId);
    }
  });

  socket.on("close", () => {
    if (!socket.workflowId) return;
    room(socket.workflowId).delete(socket);
    broadcastPresence(socket.workflowId);
  });
});

server.listen(PORT, () => {
  console.log(`CMA Flux API on http://127.0.0.1:${PORT}`);
});
