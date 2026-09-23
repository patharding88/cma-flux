export type PatchItem = { id: string; selected?: boolean };

export type GraphPatch = {
  upsertNodes: PatchItem[];
  deleteNodeIds: string[];
  upsertEdges: PatchItem[];
  deleteEdgeIds: string[];
  viewport?: { x: number; y: number; zoom: number };
  parentWorkflowId?: string | null;
};

export type GraphShape = {
  nodes?: PatchItem[];
  edges?: PatchItem[];
  viewport?: { x: number; y: number; zoom: number };
  parentWorkflowId?: string | null;
};

export function sameNode(left: PatchItem, right: PatchItem): boolean;
export function sameEdge(left: PatchItem, right: PatchItem): boolean;
export function diffItems<T extends PatchItem>(
  previous: T[],
  local: T[],
  same: (left: T, right: T) => boolean,
): { upserts: T[]; deleteIds: string[] };
export function mergeItems<T extends PatchItem>(
  previous: T[],
  local: T[],
  incoming: T[],
  same: (left: T, right: T) => boolean,
): T[];
export function foldItems<T extends PatchItem>(
  previous: T[],
  incoming: T[],
  snapshot: T[],
  local: T[],
  same: (left: T, right: T) => boolean,
): T[];
export function diffGraph(previous: GraphShape, local: GraphShape): GraphPatch;
export function preferServerCopy<T extends PatchItem>(
  merged: T[],
  incoming: T[],
  sent: T[],
  same: (left: T, right: T) => boolean,
): T[];
export function patchIsEmpty(patch: GraphPatch, options?: { viewport?: boolean }): boolean;
export function applyPatch(graph: GraphShape, patch: GraphPatch): GraphShape;
