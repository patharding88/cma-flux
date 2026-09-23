import { useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { api } from "../lib/api";
import { EDGE_COLOUR_OPTIONS, EDGE_COLOUR_VALUES, edgeData } from "../lib/edges";
import type { EdgePatch, FluxNodeData, NodeAttachment, NodeKind, WorkflowSummary } from "../types";
import { KIND_MAP, INSPECTOR_KINDS, STATUS_LABELS } from "../nodes/kinds";
import { KindIcon } from "../nodes/KindIcon";
import { TEAM_PRESETS, teamColour } from "../lib/teams";

type Props = {
  node: Node<FluxNodeData> | null;
  edge: Edge | null;
  selectedCount: number;
  knownTeams: string[];
  knownPathways: string[];
  onChangeNode: (id: string, patch: Partial<FluxNodeData>) => void;
  onChangeEdge: (id: string, patch: EdgePatch) => void;
  inheritedDashed?: boolean;
  onWrapPhase: () => void;
  workflows: WorkflowSummary[];
  currentWorkflowId: string | null;
  onCommitMapName: (id: string, typedName?: string) => void;
  onOpenMap: (workflowId: string) => void;
  onLinkExisting: (nodeId: string, workflowId: string) => void;
  takenKinds: NodeKind[];
};

export function Inspector({
  node,
  edge,
  selectedCount,
  knownTeams,
  knownPathways,
  onChangeNode,
  onChangeEdge,
  inheritedDashed = false,
  onWrapPhase,
  workflows,
  currentWorkflowId,
  onCommitMapName,
  onOpenMap,
  onLinkExisting,
  takenKinds,
}: Props) {
  if (node) {
    const kind = node.data?.kind || "task";
    const meta = KIND_MAP[kind] ?? KIND_MAP.task;
    const showDuration = kind === "task" || kind === "stage";
    const showApp = kind === "application" || kind === "automation";
    const isPort = kind === "in" || kind === "out";
    const isMap = kind === "map";
    const isNest = kind === "nest";
    const team = node.data.team || node.data.department || "";
    const people = node.data.people?.length
      ? node.data.people
      : node.data.owner
        ? node.data.owner.split(",").map((item) => item.trim()).filter(Boolean)
        : [];
    const teams = [...new Set([...TEAM_PRESETS, ...knownTeams])];

    return (
      <aside className="side right inspector">
        <h2>
          <KindIcon kind={kind} size={15} />
          {meta.label}
        </h2>
        {selectedCount > 1 ? (
          <button type="button" className="ghost wrap-btn" onClick={onWrapPhase}>
            Wrap {selectedCount} nodes in a phase
          </button>
        ) : null}
        <label className="field">
          <span>Type</span>
          <div className="type-row">
            <KindIcon kind={kind} size={16} />
            <select
              value={kind}
              onChange={(event) =>
                onChangeNode(node.id, { kind: event.target.value as NodeKind })
              }
            >
              {INSPECTOR_KINDS.map((item) => (
                <option
                  key={item.kind}
                  value={item.kind}
                  disabled={item.kind !== kind && takenKinds.includes(item.kind)}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="field">
          <span>Name</span>
          <input
            value={node.data.label}
            onChange={(event) => onChangeNode(node.id, { label: event.target.value })}
            onBlur={(event) => {
              if (isMap) onCommitMapName(node.id, event.currentTarget.value);
            }}
            placeholder={isMap ? "Name this map to create it" : undefined}
            onKeyDown={(event) => {
              if (isMap && event.key === "Enter") {
                event.preventDefault();
                onCommitMapName(node.id, event.currentTarget.value);
              }
            }}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            rows={3}
            value={node.data.description}
            onChange={(event) => onChangeNode(node.id, { description: event.target.value })}
          />
        </label>
        {kind === "document" ? (
          <AttachmentsField
            workflowId={currentWorkflowId}
            attachments={node.data.attachments || []}
            onChange={(attachments) => onChangeNode(node.id, { attachments })}
          />
        ) : null}
        {kind === "external" ? (
          <>
            <label className="check-field">
              <input
                type="checkbox"
                checked={node.data.dashedLines !== false}
                onChange={(event) => onChangeNode(node.id, { dashedLines: event.target.checked })}
              />
              <span>Dashed connections</span>
            </label>
            <p className="empty-hint">
              Lines to and from this party start dashed so they read as outside CMA.
            </p>
          </>
        ) : null}
        {isPort ? (
          <p className="empty-hint">
            In and Out are the only doors on this phase, so connect the rest of the map to these
            rather than to the substages inside.
          </p>
        ) : null}
        {isNest ? (
          <p className="empty-hint">
            Drag substages and tasks into this box, or Shift-select them and wrap. Connections in
            and out of the phase should go through the In and Out nodes.
          </p>
        ) : null}
        {isMap ? (
          <>
            <p className="empty-hint">
              Naming this box creates a linked map. Lines in arrive at that map&apos;s Start, and
              lines out leave from its End. The days on this node are the sum of the nodes on that
              map.
            </p>
            <p className="empty-hint">
              {node.data.linkedWorkflowId
                ? `${node.data.durationDays} day${node.data.durationDays === 1 ? "" : "s"} on the linked map.`
                : "No linked map yet."}
            </p>
            {node.data.linkedWorkflowId ? (
              <button
                type="button"
                className="ghost wrap-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onOpenMap(node.data.linkedWorkflowId)}
              >
                Open map
              </button>
            ) : (
              <button
                type="button"
                className="ghost wrap-btn"
                onClick={() => onCommitMapName(node.id, node.data.label)}
              >
                Create linked map
              </button>
            )}
            <label className="field">
              <span>Or link an existing map</span>
              <select
                value={node.data.linkedWorkflowId || ""}
                onChange={(event) => onLinkExisting(node.id, event.target.value)}
              >
                <option value="">Create from the name above</option>
                {workflows
                  .filter((item) => item.id !== currentWorkflowId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : null}
        {isPort || isMap ? null : (
          <>
            <label className="field">
              <span>Team</span>
              <input
                list="flux-teams"
                value={team}
                onChange={(event) => {
                  const next = event.target.value;
                  onChangeNode(node.id, { team: next, department: next });
                }}
                placeholder="Sales, Construction…"
              />
              <datalist id="flux-teams">
                {teams.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              {team ? (
                <span className="team-swatch-row">
                  <span className="swatch" style={{ background: teamColour(team) }} />
                  Box colour for this team
                </span>
              ) : null}
            </label>
            {isNest ? null : (
              <>
                <PeopleField
                  key={node.id}
                  people={people}
                  onChange={(next) => onChangeNode(node.id, { people: next, owner: next.join(", ") })}
                />
                {showDuration ? (
                  <label className="field">
                    <span>Duration (days)</span>
                    <input
                      type="number"
                      min={0}
                      value={node.data.durationDays}
                      onChange={(event) =>
                        onChangeNode(node.id, { durationDays: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span>Pathway</span>
                  <input
                    list="flux-pathways"
                    value={node.data.pathway || ""}
                    onChange={(event) => onChangeNode(node.id, { pathway: event.target.value })}
                    placeholder="Creative, Prelim… blank for every path"
                  />
                  <datalist id="flux-pathways">
                    {knownPathways.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
                {kind === "decision" ? (
                  <p className="empty-hint">
                    Draw Yes and No out of this node, then tag each exclusive branch with a pathway so the
                    Gantt can pick Creative or Prelim without counting both.
                  </p>
                ) : null}
                {kind === "start" || kind === "end" ? (
                  <p className="empty-hint">
                    Start only has an output and End only has an input, so they bookend the map without
                    sitting on the Gantt unless you give them days.
                  </p>
                ) : null}
                {showApp ? (
                  <>
                    <label className="field">
                      <span>Future app</span>
                      <input
                        value={node.data.futureApp}
                        onChange={(event) => onChangeNode(node.id, { futureApp: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={node.data.status}
                        onChange={(event) =>
                          onChangeNode(node.id, { status: event.target.value as FluxNodeData["status"] })
                        }
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </aside>
    );
  }

  if (edge) {
    const data = edgeData(edge.data);
    const dashed = typeof data.dashed === "boolean" ? data.dashed : inheritedDashed;
    return (
      <aside className="side right inspector">
        <h2>Connection</h2>
        <label className="field">
          <span>Label</span>
          <input
            value={String(edge.label || "")}
            onChange={(event) => onChangeEdge(edge.id, { label: event.target.value })}
            placeholder="Yes, No, then…"
          />
        </label>
        <div className="field">
          <span>Colour</span>
          <div className="colour-row">
            {EDGE_COLOUR_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`colour-chip ${option.id} ${data.colour === option.id ? "selected" : ""}`}
                style={{ background: EDGE_COLOUR_VALUES[option.id] }}
                title={option.label}
                aria-label={option.label}
                onClick={() => onChangeEdge(edge.id, { colour: option.id })}
              />
            ))}
          </div>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={dashed}
            onChange={(event) => onChangeEdge(edge.id, { dashed: event.target.checked })}
          />
          <span>Dashed line</span>
        </label>
        <p className="empty-hint">
          Click the line, then Delete to remove it. You can also loop two nodes together, and the
          Gantt will only walk each box once so it will not run forever.
        </p>
      </aside>
    );
  }

  return (
    <aside className="side right inspector">
      <h2>Inspector</h2>
      <p className="empty-hint">
        Select a node to change its type, or Shift-select a few and wrap them in a phase nest with
        its own In and Out.
      </p>
    </aside>
  );
}

function PeopleField({
  people,
  onChange,
}: {
  people: string[];
  onChange: (people: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const chunks = draft
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!chunks.length) return;
    const next = [...people];
    for (const name of chunks) {
      if (!next.includes(name)) next.push(name);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className="field">
      <span>People</span>
      <div className="chip-row">
        {people.map((person) => (
          <button
            key={person}
            type="button"
            className="chip"
            onClick={() => onChange(people.filter((item) => item !== person))}
            title="Remove"
          >
            {person}
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Name, then Enter"
      />
    </div>
  );
}

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsField({
  workflowId,
  attachments,
  onChange,
}: {
  workflowId: string | null;
  attachments: NodeAttachment[];
  onChange: (attachments: NodeAttachment[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addFiles(fileList: FileList | File[]) {
    if (!workflowId || busy) return;
    const files = [...fileList];
    if (!files.length) return;
    setBusy(true);
    setError("");
    const next = [...attachments];
    try {
      for (const file of files) {
        const uploaded = await api.uploadFile(workflowId, file);
        next.push(uploaded);
      }
      onChange(next);
    } catch {
      setError("Could not attach that file.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!workflowId) {
      onChange(attachments.filter((item) => item.id !== id));
      return;
    }
    try {
      await api.deleteFile(workflowId, id);
    } catch {
      // The map should still drop the link even if the file is already gone.
    }
    onChange(attachments.filter((item) => item.id !== id));
  }

  return (
    <div
      className="field"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
      }}
    >
      <span>Attachments</span>
      <p className="empty-hint">Drop files here or attach PDFs, drawings and other artefacts.</p>
      {attachments.length ? (
        <ul className="attachment-list">
          {attachments.map((item) => (
            <li key={item.id} className="attachment-row">
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.name}
                {item.size ? <small>{formatSize(item.size)}</small> : null}
              </a>
              <button type="button" className="chip" onClick={() => remove(item.id)} title="Remove">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-hint">No files yet.</p>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.currentTarget.files?.length) addFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className="ghost wrap-btn"
        disabled={!workflowId || busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Attaching…" : "Attach files"}
      </button>
      {error ? <p className="empty-hint">{error}</p> : null}
    </div>
  );
}
