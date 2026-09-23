import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { PresencePerson, WorkflowSummary } from "../types";
import cmaLogo from "../assets/cma-logo.png";

type Props = {
  workflows: WorkflowSummary[];
  workflowId: string | null;
  workflowName: string;
  view: "canvas" | "gantt";
  saveState: "saved" | "saving" | "offline";
  people: PresencePerson[];
  displayName: string;
  onSelectWorkflow: (id: string) => void;
  onRename: (name: string) => void;
  onNew: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onView: (view: "canvas" | "gantt") => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onName: (name: string) => void;
  parent: { id: string; name: string } | null;
  onOpenParent: () => void;
};

export function TopBar({
  workflows,
  workflowId,
  workflowName,
  view,
  saveState,
  people,
  displayName,
  onSelectWorkflow,
  onRename,
  onNew,
  onCopy,
  onDelete,
  onView,
  onExportCsv,
  onExportJson,
  onImportJson,
  onName,
  parent,
  onOpenParent,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const initials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?";

  return (
    <header className="topbar">
      <div className="brand">
        <img src={cmaLogo} alt="CMA" className="brand-logo" />
        <span>FLUX</span>
      </div>
      <div className="topbar-main">
        <select
          value={workflowId || ""}
          onChange={(event) => onSelectWorkflow(event.target.value)}
          aria-label="Workflow"
        >
          {workflows.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          className="workflow-name"
          value={workflowName}
          onChange={(event) => onRename(event.target.value)}
          aria-label="Workflow name"
        />
        <button type="button" className="ghost" onClick={onNew}>
          New map
        </button>
        {parent ? (
          <button type="button" className="ghost" onClick={onOpenParent} title={parent.name}>
            Parent map
          </button>
        ) : null}
        <div className="view-toggle">
          <button type="button" className={view === "canvas" ? "active" : ""} onClick={() => onView("canvas")}>
            Canvas
          </button>
          <button type="button" className={view === "gantt" ? "active" : ""} onClick={() => onView("gantt")}>
            Gantt
          </button>
        </div>
        <button type="button" className="ghost settings-btn" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
          Settings
        </button>
      </div>
      <div className="topbar-meta">
        <span className={`save-dot ${saveState}`} title={saveState} />
        <span>{saveState === "saving" ? "Saving" : saveState === "offline" ? "Offline" : "Live"}</span>
        <div className="people" title="People on this map">
          {people.slice(0, 5).map((person) => (
            <span key={person.clientId} className="avatar">
              {initials(person.name)}
            </span>
          ))}
          <span>{people.length} on this map</span>
        </div>
        <input
          className="name-input"
          value={displayName}
          onChange={(event) => onName(event.target.value)}
          aria-label="Your name"
          placeholder="Your name"
        />
      </div>
      {settingsOpen ? (
        <div className="dialog-overlay" onClick={() => setSettingsOpen(false)}>
          <div
            className="dialog"
            role="dialog"
            aria-labelledby="map-settings-title"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="map-settings-title">Map settings</h2>
            <p className="empty-hint">Copy, import, export or delete this map.</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                onImportJson(file);
                setSettingsOpen(false);
              }}
            />
            <button
              type="button"
              className="ghost dialog-action"
              onClick={() => {
                setSettingsOpen(false);
                onCopy();
              }}
            >
              Copy map
            </button>
            <button type="button" className="ghost dialog-action" onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <button
              type="button"
              className="ghost dialog-action"
              onClick={() => {
                onExportJson();
                setSettingsOpen(false);
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              className="ghost dialog-action"
              onClick={() => {
                onExportCsv();
                setSettingsOpen(false);
              }}
            >
              Export Gantt
            </button>
            <button type="button" className="ghost dialog-action" onClick={() => setSettingsOpen(false)}>
              Close
            </button>
            <button
              type="button"
              className="ghost dialog-action danger"
              onClick={() => {
                setSettingsOpen(false);
                onDelete();
              }}
            >
              Delete this map
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
