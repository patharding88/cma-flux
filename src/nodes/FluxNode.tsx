import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FluxNodeData } from "../types";
import { KIND_MAP } from "./kinds";
import { KindIcon } from "./KindIcon";
import { teamColour } from "../lib/teams";

export type FluxFlowNode = Node<FluxNodeData, "flux">;

export function FluxNode({ data, selected }: NodeProps<FluxFlowNode>) {
  const kind = data?.kind || "task";
  const meta = KIND_MAP[kind] ?? KIND_MAP.task;
  const days = Number(data?.durationDays) || 0;
  const team = data.team || data.department || "";
  const people = data.people?.length ? data.people : data.owner ? [data.owner] : [];
  const colour = teamColour(team);
  const pathway = data.pathway?.trim();
  const isMap = kind === "map";
  const isNest = kind === "nest";
  const isPort = kind === "in" || kind === "out";
  const showTarget = kind !== "start" && kind !== "nest";
  const showSource = kind !== "end" && kind !== "nest";
  const linked = Boolean(data.linkedWorkflowId);

  return (
    <div
      className={`flux-node ${kind} ${selected ? "selected" : ""}`}
      style={{ ["--team" as string]: colour }}
    >
      {isNest ? (
        <NodeResizer
          isVisible={selected}
          minWidth={360}
          minHeight={200}
          lineStyle={{ borderColor: colour }}
          handleStyle={{ width: 8, height: 8, borderRadius: 1 }}
        />
      ) : null}
      {showTarget ? <Handle type="target" position={Position.Left} id="in" /> : null}
      <div className="kind-label">
        <KindIcon kind={kind} size={13} />
        <span>{meta.label}</span>
      </div>
      <h3>{data.label || meta.label}</h3>
      {data.description && !isPort ? <p>{data.description}</p> : null}
      {isNest || isPort ? null : (
        <div className="flux-meta">
          {isMap ? (
            <>
              <span className="team-pill">{linked ? "Linked map" : "Name to create"}</span>
              <span>
                {days} day{days === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <>
              {team ? (
                <span className="team-pill">{team}</span>
              ) : (
                <span className="team-pill muted">No team</span>
              )}
              {people.length ? <span>{people.join(", ")}</span> : null}
              {days > 0 ? (
                <span>
                  {days} day{days === 1 ? "" : "s"}
                </span>
              ) : null}
              {pathway ? <span className="pathway-pill">{pathway}</span> : null}
              {kind === "document" && (data.attachments?.length || 0) > 0 ? (
                <span>
                  {data.attachments.length} file{data.attachments.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {data.status !== "current" ? <span>{data.status}</span> : null}
            </>
          )}
        </div>
      )}
      {kind === "decision" ? (
        <>
          <span className="handle-note yes">Yes</span>
          <span className="handle-note no">No</span>
        </>
      ) : null}
      {showSource ? <Handle type="source" position={Position.Right} id="out" /> : null}
      {kind === "decision" ? <Handle type="source" position={Position.Bottom} id="no" /> : null}
    </div>
  );
}
