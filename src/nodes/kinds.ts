import type { NodeKind, NodeStatus } from "../types";

export type KindMeta = {
  kind: NodeKind;
  label: string;
  hint: string;
  accent: string;
};

export const NODE_KINDS: KindMeta[] = [
  { kind: "start", label: "Start", hint: "Where this map begins", accent: "#16a34a" },
  { kind: "map", label: "Map", hint: "A subprocess with its own canvas, bridged by Start and End", accent: "#1d4ed8" },
  { kind: "nest", label: "Phase", hint: "A nest for substages and tasks, with its own In and Out", accent: "#52525b" },
  { kind: "stage", label: "Sub stage", hint: "A slice of a phase", accent: "#0a0a0a" },
  { kind: "task", label: "Task", hint: "A job with a duration in days", accent: "#3d3d3d" },
  { kind: "decision", label: "Decision", hint: "Split into different pathways", accent: "#8a7a5c" },
  { kind: "role", label: "Role", hint: "Who owns the work", accent: "#4a5560" },
  { kind: "application", label: "Application", hint: "A future system", accent: "#2c4a3e" },
  { kind: "automation", label: "Automation", hint: "A future n8n-style job", accent: "#3d4a5c" },
  { kind: "document", label: "Document", hint: "An artefact that travels with the job", accent: "#6b5a4a" },
  { kind: "external", label: "External", hint: "Client, council, lender, trade", accent: "#5c4a4a" },
  { kind: "end", label: "End", hint: "Where this map finishes", accent: "#b91c1c" },
];

export const PORT_KINDS: KindMeta[] = [
  { kind: "in", label: "In", hint: "Door into a phase nest", accent: "#16a34a" },
  { kind: "out", label: "Out", hint: "Door out of a phase nest", accent: "#b91c1c" },
];

export const SINGLETON_KINDS: NodeKind[] = ["start", "end"];

export function isSingletonTaken(
  nodes: { id?: string; data?: { kind?: NodeKind } }[],
  kind: NodeKind,
  exceptId?: string,
) {
  if (!SINGLETON_KINDS.includes(kind)) return false;
  return nodes.some((node) => node.data?.kind === kind && node.id !== exceptId);
}

export const INSPECTOR_KINDS: KindMeta[] = [...NODE_KINDS, ...PORT_KINDS];

export const KIND_MAP = Object.fromEntries(
  INSPECTOR_KINDS.map((item) => [item.kind, item]),
) as Record<NodeKind, KindMeta>;

export const STATUS_LABELS: Record<NodeStatus, string> = {
  current: "Current",
  planned: "Planned",
  automated: "Automated",
};

export function defaultData(kind: NodeKind) {
  const label =
    kind === "in" ? "In" : kind === "out" ? "Out" : NODE_KINDS.find((item) => item.kind === kind)?.label ?? "Node";
  return {
    kind,
    label,
    description: "",
    team: "",
    people: [] as string[],
    department: "",
    owner: "",
    durationDays: kind === "task" ? 1 : 0,
    futureApp: kind === "automation" ? "n8n" : "",
    status: (kind === "application" || kind === "automation" ? "planned" : "current") as NodeStatus,
    pathway: "",
    linkedWorkflowId: "",
    attachments: [] as { id: string; name: string; url: string; size: number; mime: string }[],
    dashedLines: kind === "external",
  };
}
