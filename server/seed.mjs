function node(id, x, y, data) {
  const team = data.team || data.department || "";
  const people = Array.isArray(data.people)
    ? data.people
    : data.owner
      ? [data.owner]
      : TEAM_PEOPLE[team] || [];
  return {
    id,
    type: "flux",
    position: { x, y },
    data: {
      description: "",
      durationDays: 0,
      futureApp: "",
      status: "current",
      ...data,
      team,
      people,
      department: team,
      owner: people.join(", "),
    },
  };
}

const TEAM_PEOPLE = {
  Sales: ["New home consultant"],
  "Design studio": ["Designer"],
  Estimating: ["Estimator"],
  Contracts: ["Contracts coordinator"],
  Approvals: ["Certifier liaison"],
  Construction: ["Site supervisor"],
  "Client care": ["Client care"],
  Finance: ["Broker"],
};

function edge(source, target, label = "", sourceHandle = "out") {
  return {
    id: `e-${source}-${target}-${sourceHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle: "in",
    label,
    type: "smoothstep",
  };
}

const COL = 340;
const ROW = 150;

export function clientJourneyGraph() {
  const nodes = [
    node("stg-enquiry", 0 * COL, 0, {
      kind: "stage",
      label: "Enquiry",
      department: "Sales",
      description: "First contact through to a qualified lead.",
    }),
    node("stg-design", 1 * COL, 0, {
      kind: "stage",
      label: "Design",
      department: "Design studio",
      description: "Concept, selections and working drawings.",
    }),
    node("stg-contract", 2 * COL, 0, {
      kind: "stage",
      label: "Contract",
      department: "Estimating",
      description: "Price, finance and signing.",
    }),
    node("stg-approvals", 3 * COL, 0, {
      kind: "stage",
      label: "Approvals",
      department: "Contracts",
      description: "Private certifier and council paperwork.",
    }),
    node("stg-build", 4 * COL, 0, {
      kind: "stage",
      label: "Construction",
      department: "Construction",
      description: "Site start through to practical completion.",
    }),
    node("stg-handover", 5 * COL, 0, {
      kind: "stage",
      label: "Handover",
      department: "Client care",
      description: "Keys, defects and the maintenance period.",
    }),

    node("enq-received", 0 * COL, ROW, {
      kind: "task",
      label: "Enquiry received",
      department: "Sales",
      durationDays: 1,
      description: "Phone, web form or display home walk-in.",
    }),
    node("app-crm", 0 * COL, ROW * 2, {
      kind: "application",
      label: "CRM",
      department: "Sales",
      status: "planned",
      futureApp: "CMA CRM",
      description: "Future system of record for leads and follow-up.",
    }),
    node("auto-lead", 0 * COL, ROW * 3, {
      kind: "automation",
      label: "Lead notify",
      department: "Sales",
      status: "planned",
      futureApp: "n8n",
      description: "Ping sales when a new enquiry lands.",
    }),
    node("enq-qualify", 0 * COL + 40, ROW * 4, {
      kind: "task",
      label: "Qualify the lead",
      department: "Sales",
      durationDays: 2,
      owner: "New home consultant",
      description: "Block, budget, timing and series.",
    }),
    node("enq-site", 0 * COL + 40, ROW * 5, {
      kind: "task",
      label: "Site or display appointment",
      department: "Sales",
      durationDays: 3,
      description: "Walk the land or a display home.",
    }),

    node("des-concept", 1 * COL, ROW, {
      kind: "task",
      label: "Concept appointment",
      department: "Design studio",
      durationDays: 5,
      description: "Plan, facade and first inclusions conversation.",
    }),
    node("des-selections", 1 * COL, ROW * 2, {
      kind: "task",
      label: "Selections studio",
      department: "Design studio",
      durationDays: 10,
      description: "Finishes, joinery and electrical.",
    }),
    node("doc-inclusions", 1 * COL, ROW * 3, {
      kind: "document",
      label: "Inclusions schedule",
      department: "Design studio",
      description: "The living inclusions list attached to the quote.",
    }),
    node("des-drawings", 1 * COL, ROW * 4, {
      kind: "task",
      label: "Working drawings",
      department: "Design studio",
      durationDays: 15,
      description: "Town planner and drafting pack.",
    }),

    node("con-estimate", 2 * COL, ROW, {
      kind: "task",
      label: "Estimate",
      department: "Estimating",
      durationDays: 7,
      description: "Take-off against the current price book.",
    }),
    node("app-pricebook", 2 * COL, ROW * 2, {
      kind: "application",
      label: "Price Book",
      department: "Estimating",
      status: "planned",
      futureApp: "CMA Price Book",
      description: "Future pricing source of truth.",
    }),
    node("dec-proceed", 2 * COL, ROW * 3, {
      kind: "decision",
      label: "Ready to proceed?",
      department: "Sales",
      description: "Client signs, or we hold and revise.",
    }),
    node("con-finance", 2 * COL - 40, ROW * 4.6, {
      kind: "task",
      label: "Finance approval",
      department: "Contracts",
      durationDays: 14,
      description: "Lender and deposit.",
    }),
    node("ext-lender", 2 * COL + 80, ROW * 4.6, {
      kind: "external",
      label: "Lender",
      department: "Finance",
      description: "Client's bank or broker.",
    }),
    node("con-sign", 2 * COL, ROW * 6, {
      kind: "task",
      label: "Building contract",
      department: "Contracts",
      durationDays: 3,
      description: "QBCC contract, specs and colour selections locked.",
    }),
    node("auto-contract", 2 * COL, ROW * 7, {
      kind: "automation",
      label: "Contract issued",
      department: "Contracts",
      status: "planned",
      futureApp: "n8n",
      description: "Email pack and kick the construction folder.",
    }),

    node("app-certifier", 3 * COL, ROW, {
      kind: "external",
      label: "Private certifier",
      department: "Approvals",
      description: "Building approval pathway in SEQ.",
    }),
    node("apr-ba", 3 * COL, ROW * 2, {
      kind: "task",
      label: "Building approval",
      department: "Contracts",
      durationDays: 20,
      description: "BA lodged and issued.",
    }),
    node("dec-ba", 3 * COL, ROW * 3, {
      kind: "decision",
      label: "Approval issued?",
      department: "Contracts",
      description: "If not, revise drawings and resubmit.",
    }),

    node("bld-start", 4 * COL, ROW, {
      kind: "task",
      label: "Site start",
      department: "Construction",
      durationDays: 2,
      description: "Peg-out, temp fencing, induction.",
    }),
    node("app-toolbox", 4 * COL, ROW * 2, {
      kind: "application",
      label: "Toolbox",
      department: "Construction",
      status: "planned",
      futureApp: "CMA Toolbox",
      description: "Future site scheduling and trade coordination.",
    }),
    node("bld-slab", 4 * COL, ROW * 3, {
      kind: "task",
      label: "Slab",
      department: "Construction",
      durationDays: 10,
    }),
    node("bld-frame", 4 * COL, ROW * 4, {
      kind: "task",
      label: "Frame and roof",
      department: "Construction",
      durationDays: 15,
    }),
    node("bld-lockup", 4 * COL, ROW * 5, {
      kind: "task",
      label: "Lock-up",
      department: "Construction",
      durationDays: 12,
    }),
    node("bld-fixing", 4 * COL, ROW * 6, {
      kind: "task",
      label: "Fixing and fit-off",
      department: "Construction",
      durationDays: 25,
    }),
    node("role-supervisor", 4 * COL + 160, ROW * 3.5, {
      kind: "role",
      label: "Site supervisor",
      department: "Construction",
      description: "Owns the programme on site.",
    }),

    node("han-pc", 5 * COL, ROW, {
      kind: "task",
      label: "Practical completion",
      department: "Construction",
      durationDays: 5,
    }),
    node("han-defects", 5 * COL, ROW * 2, {
      kind: "task",
      label: "Defects walk",
      department: "Client care",
      durationDays: 7,
    }),
    node("han-keys", 5 * COL, ROW * 3, {
      kind: "task",
      label: "Handover",
      department: "Client care",
      durationDays: 1,
      description: "Keys, manuals and warranty pack.",
    }),
    node("doc-warranty", 5 * COL, ROW * 4, {
      kind: "document",
      label: "Warranty pack",
      department: "Client care",
    }),
  ];

  const edges = [
    edge("stg-enquiry", "enq-received"),
    edge("enq-received", "app-crm"),
    edge("enq-received", "auto-lead"),
    edge("enq-received", "enq-qualify"),
    edge("enq-qualify", "enq-site"),
    edge("enq-site", "des-concept"),
    edge("stg-design", "des-concept"),
    edge("des-concept", "des-selections"),
    edge("des-selections", "doc-inclusions"),
    edge("des-selections", "des-drawings"),
    edge("des-drawings", "con-estimate"),
    edge("stg-contract", "con-estimate"),
    edge("con-estimate", "app-pricebook"),
    edge("con-estimate", "dec-proceed"),
    edge("dec-proceed", "con-finance", "Yes"),
    edge("dec-proceed", "des-selections", "Revise", "no"),
    edge("con-finance", "ext-lender"),
    edge("con-finance", "con-sign"),
    edge("con-sign", "auto-contract"),
    edge("con-sign", "apr-ba"),
    edge("stg-approvals", "apr-ba"),
    edge("apr-ba", "app-certifier"),
    edge("apr-ba", "dec-ba"),
    edge("dec-ba", "bld-start", "Yes"),
    edge("dec-ba", "des-drawings", "Resubmit", "no"),
    edge("stg-build", "bld-start"),
    edge("bld-start", "app-toolbox"),
    edge("bld-start", "bld-slab"),
    edge("bld-slab", "bld-frame"),
    edge("bld-frame", "bld-lockup"),
    edge("bld-lockup", "bld-fixing"),
    edge("role-supervisor", "bld-slab"),
    edge("bld-fixing", "han-pc"),
    edge("stg-handover", "han-pc"),
    edge("han-pc", "han-defects"),
    edge("han-defects", "han-keys"),
    edge("han-keys", "doc-warranty"),
  ];

  return {
    nodes,
    edges,
    viewport: { x: 40, y: 80, zoom: 0.72 },
  };
}

export function emptyGraph() {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    parentWorkflowId: null,
  };
}

export function subprocessGraph(parentWorkflowId = null) {
  return {
    parentWorkflowId,
    nodes: [
      node("start", 40, 120, {
        kind: "start",
        label: "Start",
        description: "Work arrives here from the parent map.",
      }),
      node("end", 520, 120, {
        kind: "end",
        label: "End",
        description: "When this map finishes, the parent map continues.",
      }),
    ],
    edges: [edge("start", "end")],
    viewport: { x: 0, y: 40, zoom: 1 },
  };
}
