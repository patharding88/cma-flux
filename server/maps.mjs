const SKIP = new Set(["nest", "in", "out", "start", "end"]);

export function sumWorkflowDays(getWorkflow, id, visiting = new Set()) {
  if (!id || visiting.has(id)) return 0;
  visiting.add(id);
  const workflow = getWorkflow(id);
  if (!workflow) return 0;
  let total = 0;
  for (const node of workflow.graph?.nodes || []) {
    const kind = node.data?.kind;
    if (SKIP.has(kind)) continue;
    const linked = String(node.data?.linkedWorkflowId || "").trim();
    if (kind === "map" && linked) {
      total += sumWorkflowDays(getWorkflow, linked, visiting);
      continue;
    }
    total += Number(node.data?.durationDays) || 0;
  }
  return total;
}

export function enrichMapNodes(graph, getWorkflow, selfId) {
  const nodes = (graph?.nodes || []).map((node) => {
    if (node.data?.kind !== "map") return node;
    const linked = String(node.data?.linkedWorkflowId || "").trim();
    if (!linked) return node;
    const child = getWorkflow(linked);
    const days = sumWorkflowDays(getWorkflow, linked, new Set([selfId]));
    return {
      ...node,
      data: {
        ...node.data,
        durationDays: days,
        label: child?.name || node.data.label,
      },
    };
  });
  return { ...graph, nodes };
}

export function findParentIds(listRows, parseGraph, childId) {
  const parents = [];
  for (const row of listRows) {
    const graph = parseGraph(row);
    const hit = (graph.nodes || []).some(
      (node) => node.data?.kind === "map" && node.data?.linkedWorkflowId === childId,
    );
    if (hit) parents.push(row.id);
  }
  return parents;
}
