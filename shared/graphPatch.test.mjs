import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyPatch, diffGraph, foldItems, mergeItems, preferServerCopy, sameNode } from "./graphPatch.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

function node(id, label, extra = {}) {
  return {
    id,
    type: "flux",
    position: { x: 0, y: 0 },
    data: {
      kind: "task",
      label,
      description: "",
      team: "",
      people: [],
      department: "",
      owner: "",
      durationDays: 1,
      futureApp: "",
      status: "current",
      pathway: "",
      linkedWorkflowId: "",
      attachments: [],
      dashedLines: false,
    },
    ...extra,
  };
}

test("two patches on different nodes both stay on the map", () => {
  const base = { nodes: [node("a", "A"), node("b", "B")], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  const first = applyPatch(base, { upsertNodes: [node("a", "A from Pat")], deleteNodeIds: [], upsertEdges: [], deleteEdgeIds: [] });
  const second = applyPatch(first, { upsertNodes: [node("b", "B from Sam")], deleteNodeIds: [], upsertEdges: [], deleteEdgeIds: [] });
  assert.deepEqual(
    second.nodes.map((item) => item.data.label),
    ["A from Pat", "B from Sam"],
  );
});

test("a local edit survives someone else's update to a different node", () => {
  const previous = [node("a", "A"), node("b", "B")];
  const local = [node("a", "A edited"), node("b", "B")];
  const incoming = [node("a", "A"), node("b", "B edited"), node("c", "C added")];
  const merged = mergeItems(previous, local, incoming, sameNode);
  assert.deepEqual(
    merged.map((item) => [item.id, item.data.label]),
    [
      ["a", "A edited"],
      ["b", "B edited"],
      ["c", "C added"],
    ],
  );
});

test("selection and measured size are not treated as edits", () => {
  const previous = { nodes: [node("a", "A")], edges: [], parentWorkflowId: null };
  const local = {
    nodes: [node("a", "A", { selected: true, measured: { width: 40, height: 20 } })],
    edges: [],
    parentWorkflowId: null,
  };
  const patch = diffGraph(previous, local);
  assert.equal(patch.upsertNodes.length, 0);
  assert.equal(patch.deleteNodeIds.length, 0);
});

test("undo history keeps your earlier label when your save comes back", () => {
  const previous = [node("a", "A")];
  const local = [node("a", "A saved")];
  const incoming = [node("a", "A saved"), node("b", "From someone else")];
  const folded = foldItems(previous, incoming, previous, local, sameNode);
  assert.deepEqual(
    folded.map((item) => [item.id, item.data.label]),
    [
      ["a", "A"],
      ["b", "From someone else"],
    ],
  );
});

test("a save takes the server copy when you have not typed again", () => {
  const sent = [node("a", "Map")];
  sent[0].data = { ...sent[0].data, durationDays: 0 };
  const merged = [node("a", "Map", { selected: true })];
  merged[0].data = { ...merged[0].data, durationDays: 0 };
  const incoming = [node("a", "Map")];
  incoming[0].data = { ...incoming[0].data, durationDays: 4 };
  const adopted = preferServerCopy(merged, incoming, sent, sameNode);
  assert.equal(adopted[0].data.durationDays, 4);
  assert.equal(adopted[0].selected, true);

  const typedAgain = [node("a", "Map renamed")];
  const kept = preferServerCopy(typedAgain, incoming, sent, sameNode);
  assert.equal(kept[0].data.label, "Map renamed");
});

test("live server keeps both users' nodes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cma-flux-"));
  const dbPath = path.join(dir, "flux.sqlite");
  const port = 18787;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: path.dirname(root),
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  try {
    await waitForReady(child, () => logs.includes("CMA Flux API"));
    const created = await request(port, "POST", "/api/workflows", { name: "Shared map" });
    const id = created.id;
    await request(port, "PUT", `/api/workflows/${id}/graph`, {
      senderId: "pat",
      upsertNodes: [node("a", "Pat's task"), node("c", "Shared")],
      deleteNodeIds: [],
      upsertEdges: [],
      deleteEdgeIds: [],
    });
    await request(port, "PUT", `/api/workflows/${id}/graph`, {
      senderId: "sam",
      upsertNodes: [node("b", "Sam's task")],
      deleteNodeIds: [],
      upsertEdges: [],
      deleteEdgeIds: [],
    });
    const saved = await request(port, "GET", `/api/workflows/${id}`);
    assert.deepEqual(
      saved.graph.nodes.map((item) => item.data.label).sort(),
      ["Pat's task", "Sam's task", "Shared"],
    );
  } finally {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode != null) resolve();
      else child.once("exit", resolve);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function waitForReady(child, ready) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 15000);
    const tick = () => {
      if (ready()) {
        clearTimeout(timer);
        resolve();
        return;
      }
      if (child.exitCode != null) {
        clearTimeout(timer);
        reject(new Error(`server exited ${child.exitCode}`));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function request(port, method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
