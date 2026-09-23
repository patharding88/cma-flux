import type { Edge, Node } from "@xyflow/react";
import { nanoid } from "nanoid";
import { defaultData } from "../nodes/kinds";
import type { FluxNodeData } from "../types";

const PORT_WIDTH = 92;
const PORT_HEIGHT = 72;
const PAD_X = 28;
const PAD_Y = 56;

export function makeNode(kind: FluxNodeData["kind"], position: { x: number; y: number }): Node<FluxNodeData> {
  return {
    id: nanoid(10),
    type: "flux",
    position,
    data: defaultData(kind),
  };
}

export function nodeSize(node: Node<FluxNodeData>) {
  const style = node.style || {};
  return {
    w: Number(node.measured?.width || node.width || style.width || (node.data.kind === "nest" ? 560 : 228)),
    h: Number(node.measured?.height || node.height || style.height || (node.data.kind === "nest" ? 320 : 96)),
  };
}

export function nodesById(nodes: Node<FluxNodeData>[]) {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function absolutePosition(node: Node<FluxNodeData>, byId: Map<string, Node<FluxNodeData>>) {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

export function sortParentsFirst(nodes: Node<FluxNodeData>[]) {
  const byId = nodesById(nodes);
  const depth = (node: Node<FluxNodeData>) => {
    let value = 0;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId && byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId);
      value += 1;
      parentId = byId.get(parentId)?.parentId;
    }
    return value;
  };
  return [...nodes].sort((left, right) => depth(left) - depth(right));
}

export function makeNestGroup(position: { x: number; y: number }, label = "Phase"): Node<FluxNodeData>[] {
  const width = 560;
  const height = 320;
  const nest = makeNode("nest", position);
  nest.data = { ...nest.data, label };
  nest.style = { width, height };
  nest.width = width;
  nest.height = height;
  const inbound = makePort(nest.id, "in", {
    x: PAD_X,
    y: Math.round(height / 2 - PORT_HEIGHT / 2),
  });
  const outbound = makePort(nest.id, "out", {
    x: width - PAD_X - PORT_WIDTH,
    y: Math.round(height / 2 - PORT_HEIGHT / 2),
  });
  return [nest, inbound, outbound];
}

function makePort(nestId: string, kind: "in" | "out", position: { x: number; y: number }): Node<FluxNodeData> {
  const node = makeNode(kind, position);
  node.parentId = nestId;
  node.extent = "parent";
  node.expandParent = true;
  node.data = { ...node.data, label: kind === "in" ? "In" : "Out" };
  return node;
}

export function setParent(
  nodes: Node<FluxNodeData>[],
  id: string,
  parentId: string | undefined,
) {
  const byId = nodesById(nodes);
  const node = byId.get(id);
  if (!node) return nodes;
  const world = absolutePosition(node, byId);
  if (!parentId) {
    const { parentId: _p, extent: _e, expandParent: _x, ...rest } = node;
    return nodes.map((item) =>
      item.id === id ? { ...rest, position: world } : item,
    );
  }
  if (parentId === id) return nodes;
  const parent = byId.get(parentId);
  if (!parent) return nodes;
  const origin = absolutePosition(parent, byId);
  return nodes.map((item) =>
    item.id === id
      ? {
          ...item,
          parentId,
          extent: "parent" as const,
          expandParent: true,
          position: { x: world.x - origin.x, y: world.y - origin.y },
        }
      : item,
  );
}

export function findNestAt(
  nodes: Node<FluxNodeData>[],
  point: { x: number; y: number },
  ignoreIds: Set<string> = new Set(),
) {
  const byId = nodesById(nodes);
  let hit: Node<FluxNodeData> | null = null;
  let area = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    if (node.data.kind !== "nest" || ignoreIds.has(node.id)) continue;
    const origin = absolutePosition(node, byId);
    const { w, h } = nodeSize(node);
    if (point.x < origin.x || point.y < origin.y || point.x > origin.x + w || point.y > origin.y + h) {
      continue;
    }
    const nextArea = w * h;
    if (nextArea < area) {
      area = nextArea;
      hit = node;
    }
  }
  return hit;
}

export function adoptIntoNests(nodes: Node<FluxNodeData>[], dragged: Node<FluxNodeData>[]) {
  if (!dragged.length) return nodes;
  const merged = nodes.map((node) => {
    const latest = dragged.find((item) => item.id === node.id);
    return latest ? { ...node, ...latest, data: node.data } : node;
  });
  const byId = nodesById(merged);
  const draggedIds = new Set(dragged.map((node) => node.id));
  let next = merged;
  let changed = false;
  for (const node of dragged) {
    if (node.data.kind === "nest") continue;
    const current = byId.get(node.id);
    if (!current) continue;
    const { w, h } = nodeSize(current);
    const world = absolutePosition(current, byId);
    const nest = findNestAt(
      next,
      { x: world.x + w / 2, y: world.y + h / 2 },
      draggedIds,
    );
    const desired = nest && nest.id !== current.id ? nest.id : undefined;
    if ((current.parentId || undefined) === desired) continue;
    if (desired && isInsideTree(next, current.id, desired)) continue;
    changed = true;
    next = setParent(next, current.id, desired);
  }
  return changed ? sortParentsFirst(next) : nodes;
}

function isInsideTree(nodes: Node<FluxNodeData>[], ancestorId: string, nodeId: string) {
  const byId = nodesById(nodes);
  let parentId = byId.get(nodeId)?.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    if (parentId === ancestorId) return true;
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return false;
}

export function placeInNest(
  nodes: Node<FluxNodeData>[],
  node: Node<FluxNodeData>,
  absPosition: { x: number; y: number },
) {
  const nest = findNestAt(nodes, absPosition);
  if (!nest || nest.id === node.id) {
    return [...nodes, node];
  }
  const origin = absolutePosition(nest, nodesById(nodes));
  return sortParentsFirst([
    ...nodes,
    {
      ...node,
      parentId: nest.id,
      extent: "parent",
      expandParent: true,
      position: { x: absPosition.x - origin.x, y: absPosition.y - origin.y },
    },
  ]);
}

export function detachFromNests(nodes: Node<FluxNodeData>[], nestIds: Set<string>) {
  if (!nestIds.size) return nodes;
  const previous = nodesById(nodes);
  return nodes.flatMap((node) => {
    if (!node.parentId || !nestIds.has(node.parentId)) return [node];
    if (node.data.kind === "in" || node.data.kind === "out") return [];
    const world = absolutePosition(node, previous);
    const { parentId: _p, extent: _e, expandParent: _x, ...rest } = node;
    return [{ ...rest, position: world }];
  });
}

export function wrapInNest(
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
  selectedIds: string[],
) {
  const selected = nodes.filter(
    (node) => selectedIds.includes(node.id) && node.data.kind !== "nest" && node.data.kind !== "in" && node.data.kind !== "out",
  );
  if (!selected.length) return null;
  const byId = nodesById(nodes);
  const boxes = selected.map((node) => {
    const origin = absolutePosition(node, byId);
    const { w, h } = nodeSize(node);
    return { node, origin, w, h };
  });
  const minX = Math.min(...boxes.map((item) => item.origin.x));
  const minY = Math.min(...boxes.map((item) => item.origin.y));
  const maxX = Math.max(...boxes.map((item) => item.origin.x + item.w));
  const maxY = Math.max(...boxes.map((item) => item.origin.y + item.h));
  const width = Math.max(520, maxX - minX + PAD_X * 2 + PORT_WIDTH * 2);
  const height = Math.max(240, maxY - minY + PAD_Y * 2);
  const nestX = minX - PAD_X - PORT_WIDTH;
  const nestY = minY - PAD_Y;
  const [nest, inbound, outbound] = makeNestGroup({ x: nestX, y: nestY }, "Phase");
  nest.style = { width, height };
  nest.width = width;
  nest.height = height;
  inbound.position = { x: PAD_X, y: Math.round(height / 2 - PORT_HEIGHT / 2) };
  outbound.position = { x: width - PAD_X - PORT_WIDTH, y: Math.round(height / 2 - PORT_HEIGHT / 2) };
  inbound.parentId = nest.id;
  outbound.parentId = nest.id;

  const selectedSet = new Set(selected.map((node) => node.id));
  const moved = nodes.map((node) => {
    if (!selectedSet.has(node.id)) return node;
    const origin = absolutePosition(node, byId);
    return {
      ...node,
      parentId: nest.id,
      extent: "parent" as const,
      expandParent: true,
      position: { x: origin.x - nestX, y: origin.y - nestY },
    };
  });

  const nextEdges: Edge[] = [];
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const seenIn = new Set<string>();
  const seenOut = new Set<string>();

  for (const edge of edges) {
    const srcIn = selectedSet.has(edge.source);
    const tgtIn = selectedSet.has(edge.target);
    if (srcIn && tgtIn) {
      nextEdges.push(edge);
      continue;
    }
    if (!srcIn && tgtIn) {
      const key = `${edge.source}|${edge.sourceHandle || ""}`;
      if (!seenIn.has(key)) {
        seenIn.add(key);
        nextEdges.push({
          ...edge,
          id: nanoid(10),
          target: inbound.id,
          targetHandle: "in",
        });
      }
      const list = incoming.get(edge.target) || [];
      list.push(edge.source);
      incoming.set(edge.target, list);
      continue;
    }
    if (srcIn && !tgtIn) {
      const key = `${edge.target}|${edge.targetHandle || ""}`;
      if (!seenOut.has(key)) {
        seenOut.add(key);
        nextEdges.push({
          ...edge,
          id: nanoid(10),
          source: outbound.id,
          sourceHandle: "out",
        });
      }
      const list = outgoing.get(edge.source) || [];
      list.push(edge.target);
      outgoing.set(edge.source, list);
      continue;
    }
    nextEdges.push(edge);
  }

  for (const targetId of incoming.keys()) {
    nextEdges.push({
      id: nanoid(10),
      source: inbound.id,
      target: targetId,
      sourceHandle: "out",
      targetHandle: "in",
      type: "smoothstep",
    });
  }
  for (const sourceId of outgoing.keys()) {
    nextEdges.push({
      id: nanoid(10),
      source: sourceId,
      target: outbound.id,
      sourceHandle: "out",
      targetHandle: "in",
      type: "smoothstep",
    });
  }

  return {
    nodes: sortParentsFirst([...moved, nest, inbound, outbound]),
    edges: nextEdges,
    nestId: nest.id,
  };
}
