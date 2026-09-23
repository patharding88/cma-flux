function nodePathway(node) {
  return String(node?.data?.pathway || "").trim();
}

function filterGraphForPathway(nodes = [], edges = [], pathway = "") {
  const selected = String(pathway || "").trim().toLowerCase();
  if (!selected) return { nodes, edges };
  const keep = new Set(
    nodes
      .filter((node) => {
        const tag = nodePathway(node).toLowerCase();
        return !tag || tag === selected;
      })
      .map((node) => node.id),
  );
  return {
    nodes: nodes.filter((node) => keep.has(node.id)),
    edges: edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
  };
}

export function computeGantt(nodes = [], edges = [], pathway = "") {
  const filtered = filterGraphForPathway(nodes, edges, pathway);
  nodes = filtered.nodes;
  edges = filtered.edges;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const duration = new Map(
    nodes.map((node) => {
      const kind = node.data?.kind;
      if (kind === "nest" || kind === "in" || kind === "out" || kind === "start" || kind === "end") {
        return [node.id, 0];
      }
      return [node.id, Number(node.data?.durationDays) || 0];
    }),
  );
  const preds = new Map(nodes.map((node) => [node.id, []]));
  for (const item of edges) {
    if (preds.has(item.target) && byId.has(item.source)) {
      preds.get(item.target).push(item.source);
    }
  }

  const start = new Map();
  const visiting = new Set();

  function earliest(id) {
    if (start.has(id)) return start.get(id);
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

  const latest = new Map();
  const lateVisiting = new Set();
  const successors = new Map(nodes.map((node) => [node.id, []]));
  for (const item of edges) {
    if (successors.has(item.source) && byId.has(item.target)) {
      successors.get(item.source).push(item.target);
    }
  }

  function latestStart(id) {
    if (latest.has(id)) return latest.get(id);
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
    const value = outgoing.reduce((min, nextId) => {
      return Math.min(min, latestStart(nextId) - dur);
    }, maxFinish);
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
        label: node.data?.label || node.id,
        kind: node.data?.kind || "task",
        team: node.data?.team || node.data?.department || "",
        people: Array.isArray(node.data?.people)
          ? node.data.people.join("; ")
          : node.data?.owner || "",
        department: node.data?.team || node.data?.department || "",
        owner: Array.isArray(node.data?.people)
          ? node.data.people.join("; ")
          : node.data?.owner || "",
        durationDays: days,
        startDay: begin,
        finishDay: begin + days,
        slack,
        critical: days > 0 && slack === 0,
        predecessors: (preds.get(node.id) || [])
          .map((id) => byId.get(id)?.data?.label || id)
          .join("; "),
      };
    })
    .filter((row) => row.durationDays > 0)
    .sort((a, b) => a.startDay - b.startDay || a.label.localeCompare(b.label));
}

export function ganttToCsv(rows) {
  const header = [
    "Name",
    "Kind",
    "Team",
    "People",
    "Duration (days)",
    "Start day",
    "Finish day",
    "Slack (days)",
    "Critical",
    "Predecessors",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const cells = [
      row.label,
      row.kind,
      row.team || row.department,
      row.people || row.owner,
      row.durationDays,
      row.startDay,
      row.finishDay,
      row.slack,
      row.critical ? "Yes" : "No",
      row.predecessors,
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}
