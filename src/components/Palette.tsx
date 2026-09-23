import { NODE_KINDS, type KindMeta } from "../nodes/kinds";
import { KindIcon } from "../nodes/KindIcon";
import { teamColour } from "../lib/teams";
import type { NodeKind } from "../types";

type Props = {
  onAdd: (kind: KindMeta["kind"]) => void;
  teams: string[];
  takenKinds: NodeKind[];
};

export function Palette({ onAdd, teams, takenKinds }: Props) {
  const taken = new Set(takenKinds);
  return (
    <aside className="side">
      <h2>Nodes</h2>
      {NODE_KINDS.map((item) => {
        const blocked = taken.has(item.kind);
        return (
          <button
            key={item.kind}
            type="button"
            className={`palette-item${blocked ? " disabled" : ""}`}
            draggable={!blocked}
            disabled={blocked}
            title={blocked ? `This map already has a ${item.label}` : undefined}
            onDragStart={(event) => {
              if (blocked) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.setData("application/cma-flux", item.kind);
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => {
              if (!blocked) onAdd(item.kind);
            }}
          >
            <span className="palette-icon">
              <KindIcon kind={item.kind} size={15} />
            </span>
            <span>
              <strong>{item.label}</strong>
              <small>{blocked ? "Already on this map" : item.hint}</small>
            </span>
          </button>
        );
      })}
      <p className="empty-hint" style={{ marginTop: 18 }}>
        Drag onto the canvas, or click to drop a node in the middle of the view. A Map node is a
        subprocess with its own canvas, Phase is a nest with In and Out, and Start / End bookend a
        map.
      </p>
      {teams.length ? (
        <>
          <h2 style={{ marginTop: 28 }}>Teams</h2>
          {teams.map((team) => (
            <div className="team-legend" key={team}>
              <span className="swatch" style={{ background: teamColour(team) }} />
              <span>{team}</span>
            </div>
          ))}
        </>
      ) : null}
    </aside>
  );
}
