import { useCallback, useMemo, useState, type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nanoid } from "nanoid";
import { FluxNode } from "../nodes/FluxNode";
import { EDGE_COLOUR_VALUES, EDGE_LABEL_STYLE, styleCanvasEdge } from "../lib/edges";
import { teamColour } from "../lib/teams";
import type { FluxNodeData, NodeKind } from "../types";

const nodeTypes = { flux: FluxNode };

type HelperLines = { vertical: number | null; horizontal: number | null };

type Props = {
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  viewport: Viewport;
  onNodesChange: OnNodesChange<Node<FluxNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onViewportChange: (viewport: Viewport) => void;
  onDropKind: (kind: NodeKind, position: { x: number; y: number }) => void;
  onSelection: (nodeIds: string[], edgeIds: string[]) => void;
  onAdopt: (dragged: Node<FluxNodeData>[]) => void;
  onOpenNode: (id: string) => void;
};

export function CanvasBoard({
  nodes,
  edges,
  viewport,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onViewportChange,
  onDropKind,
  onSelection,
  onAdopt,
  onOpenNode,
}: Props) {
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const [helpers, setHelpers] = useState<HelperLines>({ vertical: null, horizontal: null });
  const flowViewport =
    helpers.vertical != null || helpers.horizontal != null ? getViewport() : { x: 0, y: 0, zoom: 1 };

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/cma-flux") as NodeKind;
      if (!kind) return;
      onDropKind(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [onDropKind, screenToFlowPosition],
  );

  const handleConnect = useCallback(
    (connection: Connection) => onConnect(connection),
    [onConnect],
  );

  const handleSelection = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      onSelection(
        selectedNodes.map((node) => node.id),
        selectedEdges.map((edge) => edge.id),
      );
    },
    [onSelection],
  );

  const nodeColor = useCallback((node: Node<FluxNodeData>) => {
    return teamColour(node.data?.team || node.data?.department);
  }, []);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "smoothstep" as const,
      style: { stroke: EDGE_COLOUR_VALUES.default, strokeWidth: 1.15 },
      labelStyle: EDGE_LABEL_STYLE,
      labelBgPadding: [8, 6] as [number, number],
      labelBgBorderRadius: 4,
    }),
    [],
  );
  const markedEdges = useMemo(() => edges.map((edge) => styleCanvasEdge(edge, nodes)), [edges, nodes]);

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={markedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: EDGE_COLOUR_VALUES.default, strokeWidth: 1.15 }}
        onMoveEnd={(_event, next) => onViewportChange(next)}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onSelectionChange={handleSelection}
        onNodeDrag={(_event, node) => {
          let vertical: number | null = null;
          let horizontal: number | null = null;
          for (const other of nodes) {
            if (other.id === node.id) continue;
            if (Math.abs(other.position.x - node.position.x) < 6) vertical = other.position.x;
            if (Math.abs(other.position.y - node.position.y) < 6) horizontal = other.position.y;
          }
          setHelpers({ vertical, horizontal });
        }}
        onNodeDragStop={(_event, _node, dragged) => {
          setHelpers({ vertical: null, horizontal: null });
          onAdopt(dragged as Node<FluxNodeData>[]);
        }}
        onNodeDoubleClick={(_event, node) => onOpenNode(node.id)}
        defaultEdgeOptions={defaultEdgeOptions}
        defaultViewport={viewport}
        snapToGrid
        snapGrid={[8, 8]}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        minZoom={0.2}
        maxZoom={1.8}
        onInit={(instance) => {
          instance.setViewport(viewport);
        }}
      >
        <Background id="dots" variant={BackgroundVariant.Dots} gap={22} size={1} color="#c8c8c8" />
        <MiniMap nodeColor={nodeColor} maskColor="rgb(247, 246, 243, 0.7)" pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
      {helpers.vertical != null ? (
        <div
          className="helper-line v"
          style={{ left: flowViewport.x + helpers.vertical * flowViewport.zoom }}
        />
      ) : null}
      {helpers.horizontal != null ? (
        <div
          className="helper-line h"
          style={{ top: flowViewport.y + helpers.horizontal * flowViewport.zoom }}
        />
      ) : null}
    </div>
  );
}

export { makeNode } from "../lib/nest";

export function makeEdge(connection: Connection): Edge | null {
  if (!connection.source || !connection.target) return null;
  return {
    id: nanoid(10),
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    type: "smoothstep",
    data: { colour: "default" },
  };
}
