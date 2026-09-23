import type { Edge, Node } from "@xyflow/react";
import type { FluxNodeData, GanttRow } from "../types";

export function listPathways(nodes: Node<FluxNodeData>[]): string[] {
  const found = new Set<string>();
  for (const node of nodes) {
    const tag = node.data.pathway?.trim();
    if (tag) found.add(tag);
  }
  return [...found].sort((left, right) => left.localeCompare(right));
}

export function filterGraphForPathway(
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
  pathway?: string,
) {
  const selected = (pathway || "").trim().toLowerCase();
  if (!selected) return { nodes, edges };
  const keep = new Set(
    nodes
      .filter((node) => {
        const tag = node.data.pathway?.trim().toLowerCase();
        return !tag || tag === selected;
      })
      .map((node) => node.id),
  );
  return {
    nodes: nodes.filter((node) => keep.has(node.id)),
    edges: edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
  };
}

export function computeGantt(
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
  pathway?: string,
): GanttRow[] {
  const filtered = filterGraphForPathway(nodes, edges, pathway);
  nodes = filtered.nodes;
  edges = filtered.edges;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const duration = new Map(
    nodes.map((node) => {
      const kind = node.data.kind;
      if (kind === "nest" || kind === "in" || kind === "out" || kind === "start" || kind === "end") {
        return [node.id, 0] as const;
      }
      return [node.id, Number(node.data.durationDays) || 0] as const;
    }),
  );
  const preds = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const item of edges) {
    if (preds.has(item.target) && byId.has(item.source)) {
      preds.get(item.target)!.push(item.source);
    }
  }

  const start = new Map<string, number>();
  const visiting = new Set<string>();

  function earliest(id: string): number {
    const cached = start.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const incoming = preds.get(id) || [];
    const value = incoming.reduce((max, predId) => {
      return Math.max(max, earliest(predId) + (duration.get(predId) || 0));
    }, 0);
    visiting.delete(id);
    start.set(id, value);
    return value;
  }

  for (const node of nodes) earliest(node.id);

  const maxFinish = nodes.reduce((max, node) => {
    return Math.max(max, (start.get(node.id) || 0) + (duration.get(node.id) || 0));
  }, 0);

  const latest = new Map<string, number>();
  const lateVisiting = new Set<string>();
  const successors = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const item of edges) {
    if (successors.has(item.source) && byId.has(item.target)) {
      successors.get(item.source)!.push(item.target);
    }
  }

  function latestStart(id: string): number {
    const cached = latest.get(id);
    if (cached != null) return cached;
    if (lateVisiting.has(id)) return maxFinish - (duration.get(id) || 0);
    lateVisiting.add(id);
    const outgoing = successors.get(id) || [];
    const dur = duration.get(id) || 0;
    if (!outgoing.length) {
      const value = maxFinish - dur;
      latest.set(id, value);
      lateVisiting.delete(id);
      return value;
    }
    const value = outgoing.reduce((min, nextId) => Math.min(min, latestStart(nextId) - dur), maxFinish);
    latest.set(id, value);
    lateVisiting.delete(id);
    return value;
  }

  for (const node of nodes) latestStart(node.id);

  return nodes
    .map((node) => {
      const days = duration.get(node.id) || 0;
      const begin = start.get(node.id) || 0;
      const late = latest.get(node.id) ?? begin;
      const slack = Math.max(0, late - begin);
      return {
        id: node.id,
        label: node.data.label || node.id,
        kind: node.data.kind,
        team: node.data.team || node.data.department || "",
        people: (node.data.people || []).join("; ") || node.data.owner || "",
        department: node.data.team || node.data.department || "",
        owner: (node.data.people || []).join("; ") || node.data.owner || "",
        durationDays: days,
        startDay: begin,
        finishDay: begin + days,
        slack,
        critical: days > 0 && slack === 0,
        predecessors: (preds.get(node.id) || [])
          .map((id) => byId.get(id)?.data.label || id)
          .join("; "),
      };
    })
    .filter((row) => row.durationDays > 0)
    .sort((a, b) => a.startDay - b.startDay || a.label.localeCompare(b.label));
}
