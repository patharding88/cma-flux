import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { TopBar } from "./components/TopBar";
import { Palette } from "./components/Palette";
import { Inspector } from "./components/Inspector";
import { CanvasBoard, makeEdge, makeNode } from "./components/CanvasBoard";
import { GanttPanel } from "./components/GanttPanel";
import { api } from "./lib/api";
import { edgeData, edgeTouchesExternal } from "./lib/edges";
import type { EdgePatch, FluxNodeData, NodeKind, PresencePerson, WorkflowSummary } from "./types";
import { normaliseNodeData } from "./lib/teams";
import { isSingletonTaken, SINGLETON_KINDS } from "./nodes/kinds";
import {
  adoptIntoNests,
  detachFromNests,
  makeNestGroup,
  placeInNest,
  wrapInNest,
} from "./lib/nest";

const CLIENT_KEY = "cma-flux-client";
const NAME_KEY = "cma-flux-name";

function clientId() {
  const existing = sessionStorage.getItem(CLIENT_KEY);
  if (existing) return existing;
  const id = nanoid(12);
  sessionStorage.setItem(CLIENT_KEY, id);
  return id;
}

function asNodes(value: unknown): Node<FluxNodeData>[] {
  if (!Array.isArray(value)) return [];
  return value.map((node) => {
    const item = node as Node<FluxNodeData>;
    return {
      ...item,
      data: normaliseNodeData(item.data),
    };
  });
}

function asEdges(value: unknown): Edge[] {
  return Array.isArray(value) ? (value as Edge[]) : [];
}

function keepFirstSingletons(nodes: Node<FluxNodeData>[]) {
  const seen = new Set<NodeKind>();
  return nodes.filter((node) => {
    const kind = node.data?.kind;
    if (!SINGLETON_KINDS.includes(kind)) return true;
    if (seen.has(kind)) return false;
    seen.add(kind);
    return true;
  });
}

function sameIds(current: string[], next: string[]) {
  return current.length === next.length && current.every((id, index) => id === next[index]);
}

function cloneGraph(nodes: Node<FluxNodeData>[], edges: Edge[]) {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { ...node.position },
      data: { ...node.data },
      selected: node.selected,
      width: node.width,
      height: node.height,
      parentId: node.parentId,
      extent: node.extent,
      expandParent: node.expandParent,
      style: node.style ? { ...node.style } : undefined,
      measured: node.measured ? { ...node.measured } : undefined,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      label: edge.label,
      data: edge.data ? { ...edge.data } : undefined,
      style: edge.style,
      selected: edge.selected,
    })),
  };
}

export default function App() {
  const me = useMemo(() => clientId(), []);
  const { screenToFlowPosition, setViewport, fitView } = useReactFlow();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("CMA Flux");
  const [nodes, setNodes] = useState<Node<FluxNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setCam] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [view, setView] = useState<"canvas" | "gantt">("canvas");
  const [ganttPathway, setGanttPathway] = useState("");
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [people, setPeople] = useState<PresencePerson[]>([]);
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">("saved");
  const [parentWorkflow, setParentWorkflow] = useState<{ id: string; name: string } | null>(null);
  const applyingRemote = useRef(false);
  const hydrated = useRef(false);
  const loadSeq = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const history = useRef<{ nodes: Node<FluxNodeData>[]; edges: Edge[] }[]>([]);
  const historyIndex = useRef(-1);
  const clipboard = useRef<{ nodes: Node<FluxNodeData>[]; edges: Edge[] } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const graphRef = useRef({
    nodes,
    edges,
    viewport,
    workflowId,
    parentWorkflowId: parentWorkflow?.id || null,
  });
  graphRef.current = {
    nodes,
    edges,
    viewport,
    workflowId,
    parentWorkflowId: parentWorkflow?.id || null,
  };

  const selectedNode = nodes.find((node) => node.id === selectedNodes[0]) || null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdges[0]) || null;
  const knownTeams = useMemo(() => {
    const found = new Set<string>();
    for (const node of nodes) {
      const team = node.data.team || node.data.department;
      if (team) found.add(team);
    }
    return [...found].sort((left, right) => left.localeCompare(right));
  }, [nodes]);
  const knownPathways = useMemo(() => {
    const found = new Set<string>();
    for (const node of nodes) {
      const tag = node.data.pathway?.trim();
      if (tag) found.add(tag);
    }
    return [...found].sort((left, right) => left.localeCompare(right));
  }, [nodes]);
  const takenKinds = useMemo(
    () => SINGLETON_KINDS.filter((kind) => isSingletonTaken(nodes, kind)),
    [nodes],
  );

  const snapshot = useCallback((nextNodes: Node<FluxNodeData>[], nextEdges: Edge[]) => {
    try {
      const item = cloneGraph(nextNodes, nextEdges);
      const last = history.current[historyIndex.current];
      if (last && JSON.stringify(last) === JSON.stringify(item)) return;
      history.current = history.current.slice(0, historyIndex.current + 1);
      history.current.push(item);
      if (history.current.length > 60) history.current.shift();
      historyIndex.current = history.current.length - 1;
    } catch {
      // History is optional; never take down the canvas for it.
    }
  }, []);

  const loadWorkflow = useCallback(
    async (id: string) => {
      const seq = ++loadSeq.current;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      hydrated.current = false;
      applyingRemote.current = true;
      const workflow = await api.getWorkflow(id);
      if (seq !== loadSeq.current) return;
      const nextNodes = asNodes(workflow.graph.nodes);
      const nextEdges = asEdges(workflow.graph.edges);
      const nextViewport = workflow.graph.viewport || { x: 0, y: 0, zoom: 1 };
      const parentId = workflow.parent?.id || workflow.graph.parentWorkflowId || null;
      graphRef.current = {
        nodes: nextNodes,
        edges: nextEdges,
        viewport: nextViewport,
        workflowId: workflow.id,
        parentWorkflowId: parentId,
      };
      setWorkflowId(workflow.id);
      setWorkflowName(workflow.name);
      setParentWorkflow(workflow.parent ? { id: workflow.parent.id, name: workflow.parent.name } : null);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setCam(nextViewport);
      setSelectedNodes([]);
      setSelectedEdges([]);
      history.current = [{ nodes: nextNodes, edges: nextEdges }];
      historyIndex.current = 0;
      requestAnimationFrame(() => {
        if (seq !== loadSeq.current) return;
        if (nextNodes.length) {
          fitView({ padding: 0.16, duration: 0 });
        } else {
          setViewport(nextViewport);
        }
        applyingRemote.current = false;
        hydrated.current = true;
      });
    },
    [fitView, setViewport],
  );

  const refreshList = useCallback(async (preferredId?: string) => {
    const list = await api.listWorkflows();
    setWorkflows(list);
    if (preferredId) await loadWorkflow(preferredId);
    return list;
  }, [loadWorkflow]);

  const loadWorkflowRef = useRef(loadWorkflow);
  loadWorkflowRef.current = loadWorkflow;

  useEffect(() => {
    let cancelled = false;
    api
      .listWorkflows()
      .then(async (list) => {
        if (cancelled) return;
        setWorkflows(list);
        if (list[0]?.id) await loadWorkflowRef.current(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setSaveState("offline");
      });
    return () => {
      cancelled = true;
    };
    // Boot once. Reloading list[0] whenever loadWorkflow changes snaps you off a child map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(() => {
    const current = graphRef.current;
    const id = current.workflowId;
    if (!id || applyingRemote.current || !hydrated.current) return Promise.resolve();
    setSaveState("saving");
    return api
      .saveGraph(id, {
        nodes: current.nodes,
        edges: current.edges,
        viewport: current.viewport,
        parentWorkflowId: current.parentWorkflowId,
        senderId: me,
      })
      .then(() => {
        if (graphRef.current.workflowId === id) setSaveState("saved");
      })
      .catch(() => {
        if (graphRef.current.workflowId === id) setSaveState("offline");
      });
  }, [me]);

  const scheduleSave = useCallback(() => {
    if (applyingRemote.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(persist, 350);
  }, [persist]);

  const setLocalNodes = useCallback(
    (updater: (current: Node<FluxNodeData>[]) => Node<FluxNodeData>[], record = true) => {
      setNodes((current) => {
        const next = updater(current);
        if (record && !applyingRemote.current) snapshot(next, graphRef.current.edges);
        return next;
      });
      scheduleSave();
    },
    [scheduleSave, snapshot],
  );

  const setLocalEdges = useCallback(
    (updater: (current: Edge[]) => Edge[], record = true) => {
      setEdges((current) => {
        const next = updater(current);
        if (record && !applyingRemote.current) snapshot(graphRef.current.nodes, next);
        return next;
      });
      scheduleSave();
    },
    [scheduleSave, snapshot],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<FluxNodeData>>[]) => {
      const dragging = changes.some((change) => change.type === "position" && change.dragging);
      const resizing = changes.some((change) => change.type === "dimensions" && change.resizing);
      const worthSaving = changes.some(
        (change) =>
          change.type === "remove" ||
          change.type === "add" ||
          change.type === "replace" ||
          (change.type === "dimensions" && !change.resizing) ||
          (change.type === "position" && !change.dragging),
      );
      setNodes((current) => {
        const nestIds = new Set(
          changes
            .filter((change) => change.type === "remove")
            .map((change) => change.id)
            .filter((id) => current.find((node) => node.id === id)?.data.kind === "nest"),
        );
        const next = applyNodeChanges(changes, current);
        return nestIds.size ? detachFromNests(next, nestIds) : next;
      });
      if (worthSaving && !dragging && !resizing && !applyingRemote.current) {
        const nestIds = new Set(
          changes
            .filter((change) => change.type === "remove")
            .map((change) => change.id)
            .filter((id) => graphRef.current.nodes.find((node) => node.id === id)?.data.kind === "nest"),
        );
        const next = applyNodeChanges(changes, graphRef.current.nodes);
        snapshot(nestIds.size ? detachFromNests(next, nestIds) : next, graphRef.current.edges);
        scheduleSave();
      }
    },
    [scheduleSave, snapshot],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const worthSaving = changes.some(
        (change) => change.type === "remove" || change.type === "add" || change.type === "replace",
      );
      setEdges((current) => applyEdgeChanges(changes, current));
      if (worthSaving && !applyingRemote.current) {
        snapshot(graphRef.current.nodes, applyEdgeChanges(changes, graphRef.current.edges));
        scheduleSave();
      }
    },
    [scheduleSave, snapshot],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge = makeEdge(connection);
      if (!edge) return;
      setLocalEdges((current) => [...current, edge]);
    },
    [setLocalEdges],
  );

  const onSelection = useCallback((nodeIds: string[], edgeIds: string[]) => {
    setSelectedNodes((current) => (sameIds(current, nodeIds) ? current : nodeIds));
    setSelectedEdges((current) => (sameIds(current, edgeIds) ? current : edgeIds));
  }, []);

  const addKind = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      if (isSingletonTaken(graphRef.current.nodes, kind)) return;
      const point =
        position ||
        screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      setLocalNodes((current) => {
        if (isSingletonTaken(current, kind)) return current;
        if (kind === "nest") {
          const [nest, inbound, outbound] = makeNestGroup(point);
          const withNest = placeInNest(current, nest, point);
          return [...withNest, inbound, outbound];
        }
        return placeInNest(current, makeNode(kind, point), point);
      });
    },
    [screenToFlowPosition, setLocalNodes],
  );

  const onAdopt = useCallback(
    (dragged: Node<FluxNodeData>[]) => {
      setLocalNodes((current) => adoptIntoNests(current, dragged));
    },
    [setLocalNodes],
  );

  const onWrapPhase = useCallback(() => {
    const result = wrapInNest(graphRef.current.nodes, graphRef.current.edges, selectedNodes);
    if (!result) return;
    setNodes(result.nodes);
    setEdges(result.edges);
    snapshot(result.nodes, result.edges);
    scheduleSave();
    setSelectedNodes([result.nestId]);
    setSelectedEdges([]);
  }, [scheduleSave, selectedNodes, snapshot]);

  const onChangeNode = useCallback(
    (id: string, patch: Partial<FluxNodeData>) => {
      if (patch.kind && isSingletonTaken(graphRef.current.nodes, patch.kind, id)) return;
      const nextPatch =
        patch.kind === "external" && patch.dashedLines === undefined
          ? { ...patch, dashedLines: true }
          : patch;
      setLocalNodes((current) =>
        current.map((node) =>
          node.id === id ? { ...node, data: normaliseNodeData({ ...node.data, ...nextPatch }) } : node,
        ),
      );
    },
    [setLocalNodes],
  );

  const onCommitMapName = useCallback(
    async (id: string, typedName?: string) => {
      const node = graphRef.current.nodes.find((item) => item.id === id);
      if (!node || node.data.kind !== "map") return;
      const name = (typedName ?? node.data.label).trim();
      if (!name || name === "Map") return;
      if (node.data.linkedWorkflowId) {
        await api.renameWorkflow(node.data.linkedWorkflowId, name);
        const list = await api.listWorkflows();
        setWorkflows(list);
        return;
      }
      if (!graphRef.current.workflowId) return;
      try {
        const child = await api.createWorkflow(name, {
          parentWorkflowId: graphRef.current.workflowId,
          subprocess: true,
        });
        const nextNodes = graphRef.current.nodes.map((item) =>
          item.id === id
            ? {
                ...item,
                data: normaliseNodeData({
                  ...item.data,
                  linkedWorkflowId: child.id,
                  label: child.name,
                  durationDays: 0,
                }),
              }
            : item,
        );
        graphRef.current = { ...graphRef.current, nodes: nextNodes };
        setNodes(nextNodes);
        snapshot(nextNodes, graphRef.current.edges);
        await persist();
        const list = await api.listWorkflows();
        setWorkflows(list);
      } catch {
        setSaveState("offline");
      }
    },
    [persist, snapshot],
  );

  const onOpenMap = useCallback(
    async (id: string) => {
      if (!id || id === graphRef.current.workflowId) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      await persist();
      await loadWorkflow(id);
    },
    [loadWorkflow, persist],
  );

  const onLinkExisting = useCallback(
    (nodeId: string, linkedId: string) => {
      if (!linkedId) {
        onChangeNode(nodeId, { linkedWorkflowId: "", durationDays: 0 });
        return;
      }
      const linked = workflows.find((item) => item.id === linkedId);
      onChangeNode(nodeId, {
        linkedWorkflowId: linkedId,
        label: linked?.name || graphRef.current.nodes.find((item) => item.id === nodeId)?.data.label || "Map",
      });
      const parentId = graphRef.current.workflowId;
      if (!parentId) return;
      api.setParentWorkflow(linkedId, parentId).catch(() => setSaveState("offline"));
    },
    [onChangeNode, workflows],
  );

  const onOpenNode = useCallback(
    (id: string) => {
      const node = graphRef.current.nodes.find((item) => item.id === id);
      if (node?.data.kind === "map" && node.data.linkedWorkflowId) {
        onOpenMap(node.data.linkedWorkflowId);
      }
    },
    [onOpenMap],
  );

  const onChangeEdge = useCallback(
    (id: string, patch: EdgePatch) => {
      setLocalEdges((current) =>
        current.map((edge) => {
          if (edge.id !== id) return edge;
          const data = edgeData(edge.data);
          if (patch.colour) data.colour = patch.colour;
          if (typeof patch.dashed === "boolean") data.dashed = patch.dashed;
          return {
            ...edge,
            label: patch.label !== undefined ? patch.label : edge.label,
            data,
          };
        }),
      );
    },
    [setLocalEdges],
  );

  useEffect(() => {
    if (!workflowId) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/live`);
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          workflowId,
          name: localStorage.getItem(NAME_KEY) || "Someone",
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "presence") {
        setPeople(message.people || []);
      }
      if (message.type === "graph") {
        if (message.workflowId && message.workflowId !== graphRef.current.workflowId) return;
        if (message.senderId && message.senderId === me) return;
        applyingRemote.current = true;
        setNodes(asNodes(message.graph.nodes));
        setEdges(asEdges(message.graph.edges));
        if (message.graph.viewport) {
          setCam(message.graph.viewport);
        }
        queueMicrotask(() => {
          applyingRemote.current = false;
        });
      }
    });
    socket.addEventListener("close", () => {
      if (socketRef.current === socket) setSaveState((current) => (current === "saving" ? current : "offline"));
    });
    return () => {
      socket.close();
    };
  }, [workflowId, me]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const nextIndex = event.shiftKey ? historyIndex.current + 1 : historyIndex.current - 1;
        const item = history.current[nextIndex];
        if (!item) return;
        historyIndex.current = nextIndex;
        applyingRemote.current = true;
        setNodes(structuredClone(item.nodes));
        setEdges(structuredClone(item.edges));
        queueMicrotask(() => {
          applyingRemote.current = false;
          scheduleSave();
        });
      }
      if (meta && event.key.toLowerCase() === "c" && selectedNodes.length) {
        const copied = nodes.filter((node) => selectedNodes.includes(node.id));
        const copiedEdges = edges.filter(
          (edge) => selectedNodes.includes(edge.source) && selectedNodes.includes(edge.target),
        );
        clipboard.current = structuredClone({ nodes: copied, edges: copiedEdges });
      }
      if (meta && event.key.toLowerCase() === "v" && clipboard.current) {
        event.preventDefault();
        const idMap = new Map<string, string>();
        const usedSingleton = new Set(
          SINGLETON_KINDS.filter((kind) => isSingletonTaken(graphRef.current.nodes, kind)),
        );
        const pastedNodes = clipboard.current.nodes.flatMap((node) => {
          const kind = node.data.kind;
          if (SINGLETON_KINDS.includes(kind)) {
            if (usedSingleton.has(kind)) return [];
            usedSingleton.add(kind);
          }
          const id = nanoid(10);
          idMap.set(node.id, id);
          return [
            {
              ...node,
              id,
              position: { x: node.position.x + 48, y: node.position.y + 48 },
              selected: true,
            },
          ];
        });
        const pastedEdges = clipboard.current.edges
          .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
          .map((edge) => ({
            ...edge,
            id: nanoid(10),
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
          }));
        setLocalNodes((current) => [
          ...current.map((node) => ({ ...node, selected: false })),
          ...pastedNodes,
        ]);
        setLocalEdges((current) => [...current, ...pastedEdges]);
        clipboard.current = {
          nodes: pastedNodes.map((node) => ({
            ...node,
            position: { x: node.position.x, y: node.position.y },
          })),
          edges: pastedEdges,
        };
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edges, nodes, scheduleSave, selectedNodes, setLocalEdges, setLocalNodes]);

  async function onNew() {
    const workflow = await api.createWorkflow("Untitled workflow");
    await refreshList(workflow.id);
  }

  async function onCopy() {
    if (!workflowId) return;
    try {
      await persist();
      const copy = await api.copyWorkflow(workflowId);
      await refreshList(copy.id);
    } catch {
      setSaveState("offline");
    }
  }

  async function onDelete() {
    if (!workflowId) return;
    if (!confirm("Delete this map? That cannot be undone.")) return;
    await api.deleteWorkflow(workflowId);
    const list = await api.listWorkflows();
    setWorkflows(list);
    if (list[0]?.id) await loadWorkflow(list[0].id);
  }

  function onRename(name: string) {
    setWorkflowName(name);
    if (!workflowId) return;
    api.renameWorkflow(workflowId, name).then((workflow) => {
      setWorkflows((current) =>
        current.map((item) => (item.id === workflow.id ? { ...item, name: workflow.name } : item)),
      );
    });
  }

  function onName(name: string) {
    setDisplayName(name);
    localStorage.setItem(NAME_KEY, name);
    socketRef.current?.readyState === 1 &&
      socketRef.current.send(JSON.stringify({ type: "rename", name: name || "Someone" }));
  }

  function onExportCsv() {
    if (!workflowId) return;
    const selected = knownPathways.includes(ganttPathway) ? ganttPathway : "";
    const query = selected ? `?pathway=${encodeURIComponent(selected)}` : "";
    window.location.href = `/api/workflows/${workflowId}/gantt.csv${query}`;
  }

  function onExportJson() {
    const blob = new Blob(
      [JSON.stringify({ name: workflowName, nodes, edges, viewport }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workflowName || "workflow"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImportJson(file: File) {
    try {
      const data = JSON.parse(await file.text()) as {
        name?: string;
        nodes?: unknown;
        edges?: unknown;
        viewport?: Viewport;
        graph?: { nodes?: unknown; edges?: unknown; viewport?: Viewport };
      };
      const rawNodes = data.nodes ?? data.graph?.nodes;
      const rawEdges = data.edges ?? data.graph?.edges;
      if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
        throw new Error("missing graph");
      }
      const nextNodes = keepFirstSingletons(asNodes(rawNodes));
      const nextEdges = asEdges(rawEdges);
      const nextViewport = data.viewport || data.graph?.viewport || { x: 0, y: 0, zoom: 1 };
      const nextName = String(data.name || "").trim();
      graphRef.current = {
        ...graphRef.current,
        nodes: nextNodes,
        edges: nextEdges,
        viewport: nextViewport,
      };
      setNodes(nextNodes);
      setEdges(nextEdges);
      setCam(nextViewport);
      setSelectedNodes([]);
      setSelectedEdges([]);
      snapshot(nextNodes, nextEdges);
      if (nextName && nextName !== workflowName) onRename(nextName);
      await persist();
    } catch {
      window.alert("That file is not a Flux map.");
    }
  }

  const onViewportChange = useCallback(
    (next: Viewport) => {
      setCam(next);
      scheduleSave();
    },
    [scheduleSave],
  );

  return (
    <div className="app">
      <TopBar
        workflows={workflows}
        workflowId={workflowId}
        workflowName={workflowName}
        view={view}
        saveState={saveState}
        people={people}
        displayName={displayName}
        onSelectWorkflow={(id) => loadWorkflow(id)}
        onRename={onRename}
        onNew={onNew}
        onCopy={onCopy}
        onDelete={onDelete}
        onView={setView}
        onExportCsv={onExportCsv}
        onExportJson={onExportJson}
        onImportJson={onImportJson}
        onName={onName}
        parent={parentWorkflow}
        onOpenParent={() => parentWorkflow && onOpenMap(parentWorkflow.id)}
      />
      {view === "gantt" ? (
        <div className="workspace gantt">
          <GanttPanel
            name={workflowName}
            nodes={nodes}
            edges={edges}
            pathway={ganttPathway}
            onPathway={setGanttPathway}
          />
        </div>
      ) : (
        <div className="workspace">
          <Palette onAdd={(kind) => addKind(kind)} teams={knownTeams} takenKinds={takenKinds} />
          <CanvasBoard
            key={workflowId || "empty"}
            nodes={nodes}
            edges={edges}
            viewport={viewport}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onViewportChange={onViewportChange}
            onDropKind={(kind, position) => addKind(kind, position)}
            onSelection={onSelection}
            onAdopt={onAdopt}
            onOpenNode={onOpenNode}
          />
          <Inspector
            node={selectedNode}
            edge={selectedNode ? null : selectedEdge}
            selectedCount={selectedNodes.length}
            knownTeams={knownTeams}
            knownPathways={knownPathways}
            onChangeNode={onChangeNode}
            onChangeEdge={onChangeEdge}
            inheritedDashed={Boolean(selectedEdge && edgeTouchesExternal(selectedEdge, nodes))}
            onWrapPhase={onWrapPhase}
            workflows={workflows}
            currentWorkflowId={workflowId}
            onCommitMapName={onCommitMapName}
            onOpenMap={onOpenMap}
            onLinkExisting={onLinkExisting}
            takenKinds={takenKinds}
          />
        </div>
      )}
    </div>
  );
}
