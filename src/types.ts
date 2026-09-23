export type NodeKind =
  | "start"
  | "map"
  | "nest"
  | "in"
  | "out"
  | "stage"
  | "task"
  | "decision"
  | "role"
  | "application"
  | "automation"
  | "document"
  | "external"
  | "end";

export type NodeStatus = "current" | "planned" | "automated";

export type NodeAttachment = {
  id: string;
  name: string;
  url: string;
  size: number;
  mime: string;
};

export type FluxNodeData = {
  kind: NodeKind;
  label: string;
  description: string;
  team: string;
  people: string[];
  department: string;
  owner: string;
  durationDays: number;
  futureApp: string;
  status: NodeStatus;
  pathway: string;
  linkedWorkflowId: string;
  attachments: NodeAttachment[];
  dashedLines: boolean;
};

export type EdgeColour = "default" | "green" | "red" | "orange";

export type FluxEdgeData = {
  colour: EdgeColour;
  dashed?: boolean;
};

export type EdgePatch = {
  label?: string;
  colour?: EdgeColour;
  dashed?: boolean;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  description: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowGraph = {
  nodes: unknown[];
  edges: unknown[];
  viewport: Viewport;
  parentWorkflowId?: string | null;
};

export type Workflow = WorkflowSummary & {
  graph_json?: string;
  graph: WorkflowGraph;
  parent?: WorkflowSummary | null;
};

export type PresencePerson = {
  clientId: string;
  name: string;
};

export type GanttRow = {
  id: string;
  label: string;
  kind: NodeKind;
  team: string;
  people: string;
  department: string;
  owner: string;
  durationDays: number;
  startDay: number;
  finishDay: number;
  slack: number;
  critical: boolean;
  predecessors: string;
};
