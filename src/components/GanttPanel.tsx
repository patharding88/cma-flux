import { computeGantt, listPathways } from "../lib/gantt";
import { teamColour } from "../lib/teams";
import type { FluxNodeData } from "../types";
import type { Edge, Node } from "@xyflow/react";

type Props = {
  name: string;
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  pathway: string;
  onPathway: (pathway: string) => void;
};

export function GanttPanel({ name, nodes, edges, pathway, onPathway }: Props) {
  const pathways = listPathways(nodes);
  const selected = pathways.includes(pathway) ? pathway : "";
  const rows = computeGantt(nodes, edges, selected);
  const total = rows.reduce((max, row) => Math.max(max, row.finishDay), 0) || 1;

  return (
    <section className="gantt">
      <div className="gantt-head">
        <div>
          <h1>{name}</h1>
          <p className="empty-hint">
            Finish-to-start from the canvas. Pick a pathway to schedule one exclusive branch,
            Creative versus Prelim for example, and leave a node untagged if it belongs on every
            scenario. Loops on the canvas are walked once so the programme stays finite. Critical
            path is solid and slack is the pale bar to the right of a task.
          </p>
        </div>
        <div className="gantt-actions">
          {pathways.length ? (
            <label className="field">
              <span>Pathway</span>
              <select value={selected} onChange={(event) => onPathway(event.target.value)}>
                <option value="">All paths</option>
                {pathways.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div>
            Programme length <strong>{total} days</strong>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty-hint">Give a task a number of days and it will land here.</p>
      ) : (
        rows.map((row) => (
          <div className="gantt-row" key={row.id}>
            <div className="gantt-label">
              <strong>{row.label}</strong>
              <small>
                {row.team || "No team"}
                {row.people ? ` · ${row.people}` : ""} · {row.durationDays} day
                {row.durationDays === 1 ? "" : "s"}
                {row.critical ? " · critical" : row.slack ? ` · ${row.slack}d slack` : ""}
              </small>
            </div>
            <div className="gantt-track">
              <div
                className="gantt-bar"
                style={{
                  left: `${(row.startDay / total) * 100}%`,
                  width: `${Math.max((row.durationDays / total) * 100, 0.8)}%`,
                  background: teamColour(row.team),
                }}
              />
              {row.slack > 0 ? (
                <div
                  className="gantt-bar slack"
                  style={{
                    left: `${(row.finishDay / total) * 100}%`,
                    width: `${(row.slack / total) * 100}%`,
                    opacity: 0.7,
                  }}
                />
              ) : null}
            </div>
            <div>
              d{row.startDay}–{row.finishDay}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
