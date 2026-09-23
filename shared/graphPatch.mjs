const CHROME = new Set(["selected", "measured", "dragging", "resizing", "positionAbsolute", "internals"]);

function canonicalData(data = {}) {
  return {
    kind: data.kind ?? "task",
    label: data.label ?? "",
    description: data.description ?? "",
    team: data.team ?? "",
    people: Array.isArray(data.people) ? data.people : [],
    department: data.department ?? "",
    owner: data.owner ?? "",
    durationDays: Number(data.durationDays) || 0,
    futureApp: data.futureApp ?? "",
    status: data.status ?? "current",
    pathway: data.pathway ?? "",
    linkedWorkflowId: data.linkedWorkflowId ?? "",
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    dashedLines: Boolean(data.dashedLines),
  };
}

function canonicalNode(node) {
  return {
    id: node.id,
    type: node.type || "flux",
    position: {
      x: Number(node.position?.x) || 0,
      y: Number(node.position?.y) || 0,
    },
    data: canonicalData(node.data),
    parentId: node.parentId ?? null,
    extent: node.extent ?? null,
    expandParent: Boolean(node.expandParent),
    style: node.style ?? null,
    width: node.width ?? null,
    height: node.height ?? null,
  };
}

function canonicalEdge(edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: edge.type ?? null,
    label: edge.label ?? "",
    data: edge.data ?? null,
    style: edge.style ?? null,
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameNode(left, right) {
  if (!left || !right) return false;
  return sameJson(canonicalNode(left), canonicalNode(right));
}

export function sameEdge(left, right) {
  if (!left || !right) return false;
  return sameJson(canonicalEdge(left), canonicalEdge(right));
}

function stripChrome(item) {
  const next = {};
  for (const [key, value] of Object.entries(item)) {
    if (!CHROME.has(key)) next[key] = value;
  }
  return next;
}

export function diffItems(previous, local, same) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const localIds = new Set(local.map((item) => item.id));
  const upserts = [];
  const deleteIds = [];
  for (const item of local) {
    const prior = previousById.get(item.id);
    if (!prior || !same(prior, item)) upserts.push(stripChrome(item));
  }
  for (const item of previous) {
    if (!localIds.has(item.id)) deleteIds.push(item.id);
  }
  return { upserts, deleteIds };
}

function withChrome(incoming, local) {
  if (!local) return { ...incoming, selected: false };
  const next = { ...incoming, selected: Boolean(local.selected) };
  if (local.measured) next.measured = local.measured;
  if (local.dragging) next.dragging = local.dragging;
  if (local.resizing) next.resizing = local.resizing;
  return next;
}

export function mergeItems(previous, local, incoming, same) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const incomingIds = new Set(incoming.map((item) => item.id));
  const result = [];

  for (const item of incoming) {
    const prior = previousById.get(item.id);
    const mine = localById.get(item.id);
    if (mine && (!prior || !same(prior, mine))) {
      result.push(mine);
      continue;
    }
    if (mine) {
      result.push(withChrome(item, mine));
      continue;
    }
    if (!prior) {
      result.push({ ...item, selected: false });
    }
  }

  for (const item of local) {
    if (incomingIds.has(item.id)) continue;
    const prior = previousById.get(item.id);
    if (!prior || !same(prior, item)) result.push(item);
  }

  return result;
}

export function foldItems(previous, incoming, snapshot, local, same) {
  const mine = diffItems(previous, local, same);
  const skip = new Set([...mine.upserts.map((item) => item.id), ...mine.deleteIds]);
  const merged = mergeItems(
    previous.filter((item) => !skip.has(item.id)),
    snapshot.filter((item) => !skip.has(item.id)),
    incoming.filter((item) => !skip.has(item.id)),
    same,
  );
  const mergedById = new Map(merged.map((item) => [item.id, item]));
  const seen = new Set();
  const result = [];
  for (const item of snapshot) {
    if (skip.has(item.id)) {
      result.push(item);
      seen.add(item.id);
      continue;
    }
    if (mergedById.has(item.id)) {
      result.push(mergedById.get(item.id));
      seen.add(item.id);
    }
  }
  for (const item of merged) {
    if (!seen.has(item.id)) result.push(item);
  }
  return result;
}

export function diffGraph(previous, local) {
  const nodes = diffItems(previous.nodes || [], local.nodes || [], sameNode);
  const edges = diffItems(previous.edges || [], local.edges || [], sameEdge);
  const patch = {
    upsertNodes: nodes.upserts,
    deleteNodeIds: nodes.deleteIds,
    upsertEdges: edges.upserts,
    deleteEdgeIds: edges.deleteIds,
  };
  if (Object.prototype.hasOwnProperty.call(local, "parentWorkflowId")) {
    const nextParent = local.parentWorkflowId ?? null;
    const priorParent = previous.parentWorkflowId ?? null;
    if (nextParent !== priorParent) patch.parentWorkflowId = nextParent;
  }
  return patch;
}

export function preferServerCopy(merged, incoming, sent, same) {
  if (!sent?.length) return merged;
  const sentById = new Map(sent.map((item) => [item.id, item]));
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  return merged.map((item) => {
    const original = sentById.get(item.id);
    const server = incomingById.get(item.id);
    if (!original || !server || !same(item, original)) return item;
    const next = { ...server, selected: Boolean(item.selected) };
    if (item.measured) next.measured = item.measured;
    if (item.dragging) next.dragging = item.dragging;
    if (item.resizing) next.resizing = item.resizing;
    return next;
  });
}

export function patchIsEmpty(patch, { viewport = false } = {}) {
  return (
    !viewport &&
    !patch.upsertNodes?.length &&
    !patch.deleteNodeIds?.length &&
    !patch.upsertEdges?.length &&
    !patch.deleteEdgeIds?.length &&
    !Object.prototype.hasOwnProperty.call(patch, "parentWorkflowId")
  );
}

export function applyPatch(graph, patch) {
  const deleteNodes = new Set(patch.deleteNodeIds || []);
  const deleteEdges = new Set(patch.deleteEdgeIds || []);
  const nodes = (graph.nodes || []).filter((node) => node?.id && !deleteNodes.has(node.id));
  for (const node of patch.upsertNodes || []) {
    if (!node?.id || deleteNodes.has(node.id)) continue;
    const clean = stripChrome(node);
    const index = nodes.findIndex((item) => item.id === node.id);
    if (index === -1) nodes.push(clean);
    else nodes[index] = clean;
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (graph.edges || []).filter(
    (edge) => edge?.id && !deleteEdges.has(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  for (const edge of patch.upsertEdges || []) {
    if (!edge?.id || deleteEdges.has(edge.id)) continue;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const clean = stripChrome(edge);
    const index = edges.findIndex((item) => item.id === edge.id);
    if (index === -1) edges.push(clean);
    else edges[index] = clean;
  }
  const next = {
    ...graph,
    nodes,
    edges,
  };
  if (patch.viewport) next.viewport = patch.viewport;
  if (Object.prototype.hasOwnProperty.call(patch, "parentWorkflowId")) {
    next.parentWorkflowId = patch.parentWorkflowId ?? null;
  }
  return next;
}
