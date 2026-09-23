import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { EdgeColour, FluxEdgeData, FluxNodeData } from "../types";

export const EDGE_COLOUR_VALUES: Record<EdgeColour, string> = {
  default: "#0a0a0a",
  green: "#15803d",
  red: "#b91c1c",
  orange: "#c2410c",
};

export const EDGE_COLOUR_OPTIONS: { id: EdgeColour; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "green", label: "Green" },
  { id: "red", label: "Red" },
  { id: "orange", label: "Orange" },
];

export const EDGE_ARROW_SIZE = { width: 12, height: 12 };

export const EDGE_LABEL_STYLE = {
  fontSize: 20,
  fill: EDGE_COLOUR_VALUES.default,
};

export function normaliseEdgeColour(value: unknown): EdgeColour {
  if (value === "green" || value === "red" || value === "orange") return value;
  return "default";
}

export function edgeData(value: unknown): FluxEdgeData {
  const data = (value || {}) as Partial<FluxEdgeData>;
  const next: FluxEdgeData = {
    colour: normaliseEdgeColour(data.colour),
  };
  if (typeof data.dashed === "boolean") next.dashed = data.dashed;
  return next;
}

export function edgeTouchesExternal(
  edge: Pick<Edge, "source" | "target">,
  nodes: Node<FluxNodeData>[],
) {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  const dashedFrom = (node?: Node<FluxNodeData>) =>
    node?.data.kind === "external" && node.data.dashedLines !== false;
  return dashedFrom(source) || dashedFrom(target);
}

export function edgeIsDashed(edge: Edge, nodes: Node<FluxNodeData>[]) {
  const data = edgeData(edge.data);
  if (typeof data.dashed === "boolean") return data.dashed;
  return edgeTouchesExternal(edge, nodes);
}

export function styleCanvasEdge(edge: Edge, nodes: Node<FluxNodeData>[]): Edge {
  const data = edgeData(edge.data);
  const colour = EDGE_COLOUR_VALUES[data.colour];
  const dashed = edgeIsDashed(edge, nodes);
  return {
    ...edge,
    style: {
      stroke: colour,
      strokeWidth: 1.35,
      strokeDasharray: dashed ? "7 6" : undefined,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: colour,
      ...EDGE_ARROW_SIZE,
    },
    labelStyle: { ...EDGE_LABEL_STYLE, fill: colour },
  };
}
