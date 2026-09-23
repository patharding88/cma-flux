import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const uploadsDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "..", "data", "uploads");

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFileId(value) {
  return ID_PATTERN.test(String(value || ""));
}

export function sanitizeName(name) {
  const base = path
    .basename(String(name || "file"))
    .replace(/[^\w.\- ()+]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return base || "file";
}

export function workflowDir(workflowId) {
  return path.join(uploadsDir, workflowId);
}

export function findStored(workflowId, fileId) {
  if (!isFileId(workflowId) || !isFileId(fileId)) return null;
  const dir = workflowDir(workflowId);
  if (!fs.existsSync(dir)) return null;
  const prefix = `${fileId}__`;
  const hit = fs.readdirSync(dir).find((item) => item.startsWith(prefix));
  return hit ? path.join(dir, hit) : null;
}

export function storedOriginalName(storedPath) {
  const name = path.basename(storedPath);
  const sep = name.indexOf("__");
  return sep === -1 ? name : name.slice(sep + 2) || name;
}

export function removeStored(workflowId, fileId) {
  const stored = findStored(workflowId, fileId);
  if (stored) fs.unlinkSync(stored);
}

export function removeWorkflowFiles(workflowId) {
  if (!isFileId(workflowId)) return;
  fs.rmSync(workflowDir(workflowId), { recursive: true, force: true });
}

export function copyWorkflowFiles(fromId, toId, graph) {
  if (!isFileId(fromId) || !isFileId(toId)) return graph;
  const nodes = (graph?.nodes || []).map((node) => {
    const attachments = node.data?.attachments;
    if (!Array.isArray(attachments) || !attachments.length) return node;
    return {
      ...node,
      data: {
        ...node.data,
        attachments: attachments.map((item) => {
          const oldId = String(item.id || "");
          const newId = crypto.randomUUID();
          const stored = findStored(fromId, oldId);
          if (stored) {
            const original = storedOriginalName(stored);
            const dir = workflowDir(toId);
            fs.mkdirSync(dir, { recursive: true });
            fs.copyFileSync(stored, path.join(dir, `${newId}__${original}`));
          }
          return {
            ...item,
            id: newId,
            url: `/api/files/${toId}/${newId}`,
          };
        }),
      },
    };
  });
  return { ...graph, nodes };
}
