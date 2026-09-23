import type { FluxNodeData, NodeAttachment, NodeKind, NodeStatus } from "../types";

export const TEAM_PRESETS = [
  "Admin",
  "Sales",
  "Design studio",
  "Estimating",
  "Contracts",
  "Approvals",
  "Construction",
  "Client care",
  "Finance",
] as const;

const TEAM_COLOURS: Record<string, string> = {
  admin: "#4f46e5",
  sales: "#0f766e",
  "design studio": "#c2410c",
  estimating: "#2563eb",
  contracts: "#db2777",
  approvals: "#7c3aed",
  construction: "#15803d",
  "client care": "#ca8a04",
  finance: "#0284c7",
};

const FALLBACK_COLOURS = [
  "#ea580c",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#4f46e5",
  "#16a34a",
  "#b45309",
  "#334155",
];

function keyOf(name: string) {
  return name.trim().toLowerCase();
}

function hashIndex(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % FALLBACK_COLOURS.length;
}

export function teamColour(team?: string) {
  const name = (team || "").trim();
  if (!name) return "#6b7280";
  return TEAM_COLOURS[keyOf(name)] || FALLBACK_COLOURS[hashIndex(keyOf(name))];
}

export function parsePeople(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function normaliseNodeData(raw: Partial<FluxNodeData> | undefined): FluxNodeData {
  const data = raw || {};
  const team = String(data.team || data.department || "").trim();
  const people = parsePeople(data.people?.length ? data.people : data.owner);
  return {
    kind: (data.kind || "task") as NodeKind,
    label: data.label || "Node",
    description: data.description || "",
    team,
    people,
    department: team,
    owner: people.join(", "),
    durationDays: Number(data.durationDays) || 0,
    futureApp: data.futureApp || "",
    status: (data.status || "current") as NodeStatus,
    pathway: String(data.pathway || "").trim(),
    linkedWorkflowId: String(data.linkedWorkflowId || "").trim(),
    attachments: parseAttachments(data.attachments),
    dashedLines: data.kind === "external" ? data.dashedLines !== false : Boolean(data.dashedLines),
  };
}

function parseAttachments(value: unknown): NodeAttachment[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: NodeAttachment[] = [];
  for (const item of value) {
    const row = item as Partial<NodeAttachment>;
    const id = String(row.id || "").trim();
    const url = String(row.url || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !url || url.startsWith("data:")) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: name || "File",
      url,
      size: Number(row.size) || 0,
      mime: String(row.mime || "").trim(),
    });
  }
  return out;
}
