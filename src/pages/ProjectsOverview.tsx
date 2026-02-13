import { useEffect, useState, type MouseEvent } from "react";
import type { ProjectsIndex, ProjectsIndexEntry } from "../state/types";
import { NewProjectModal } from "../components/layout/NewProjectModal";
import { toFileUrl } from "../utils/path";

const PlusIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const RefreshIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M20 4v6h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

interface ProjectsOverviewProps {
  projectsIndex: ProjectsIndex | null;
  rootPath: string | null;
  loading: boolean;
  lastError: string | null;
  onOpenProject: (entry: ProjectsIndexEntry) => void;
  onCreateProject: (name: string) => void | Promise<void>;
  onChangeRootPath: () => void;
  onReload: () => void | Promise<void>;
  onRenameProject: (entry: ProjectsIndexEntry, nextName: string) => void | Promise<void>;
  onDuplicateProject: (entry: ProjectsIndexEntry) => void | Promise<void>;
}

export function ProjectsOverview({
  projectsIndex,
  rootPath,
  loading,
  lastError,
  onOpenProject,
  onCreateProject,
  onChangeRootPath,
  onReload,
  onRenameProject,
  onDuplicateProject,
}: ProjectsOverviewProps) {
  const projects = projectsIndex?.projects ?? [];
  const [newOpen, setNewOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<ProjectsIndexEntry | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectsIndexEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);

  useEffect(() => {
    try {
      void window.electronAPI.ping();
    } catch {
      // ignore
    }
  }, []);

  const closeMenu = () => {
    setMenuItem(null);
    setMenuPos(null);
  };

  const openMenu = (event: MouseEvent, entry: ProjectsIndexEntry) => {
    event.preventDefault();
    setMenuItem(entry);
    setMenuPos({ x: event.clientX, y: event.clientY });
  };

  const startRename = (entry: ProjectsIndexEntry) => {
    setRenameTarget(entry);
    setRenameValue(entry.name);
    setRenameError(null);
    setRenameOpen(true);
    closeMenu();
  };

  const runRename = async () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next) {
      setRenameError("Project name cannot be empty.");
      return;
    }
    setRenameError(null);
    setRenamingProjectId(renameTarget.id);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      await onRenameProject(renameTarget, next);
      setRenameOpen(false);
      setRenameTarget(null);
      setRenameError(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : String(error));
    } finally {
      setRenamingProjectId(null);
    }
  };

  return (
    <div className="page projects-overview">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Choose an existing project or create a new workspace.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={onReload} title="Reload">
            <span className="icon">{RefreshIcon}</span>
            Reload
          </button>
          <button type="button" onClick={onChangeRootPath}>
            Change Root
          </button>
          <button type="button" onClick={() => setNewOpen(true)}>
            <span className="icon">{PlusIcon}</span>
            New Project
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div className="panel-meta">
            <span className="label">Projects root</span>
            <span className="value">{rootPath ?? "Not configured"}</span>
          </div>
        </div>

        {lastError ? <p className="error">{lastError}</p> : null}
        {loading ? <p>Loading projects...</p> : null}

        <div className="projects-grid">
          <button className="project-tile project-tile--new" type="button" onClick={() => setNewOpen(true)}>
            <div className="project-tile__frame">
              <span className="project-tile__plus">{PlusIcon}</span>
            </div>
            <span className="project-tile__name">New Project</span>
            <span className="project-tile__meta">Create in root directory</span>
          </button>

          {projects.map((p) => {
            const displayLocation = p.location;

            return (
              <button
                key={p.id}
                className="project-tile"
                type="button"
                onClick={() => onOpenProject(p)}
                onContextMenu={(event) => openMenu(event, p)}
              >
                <div className="project-tile__frame" style={{ position: "relative", overflow: "hidden" }}>
                  {p.thumbnail && renamingProjectId !== p.id ? (
                    <img
                      src={toFileUrl(p.thumbnail)}
                      alt=""
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 12, display: "block" }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <span className="project-tile__plus" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{PlusIcon}</span>
                  )}
                </div>
                <span className="project-tile__name" style={{ textAlign: "center", width: "100%" }}>{p.name}</span>
                <span className="project-tile__meta" style={{ textAlign: "center", width: "100%" }}>{displayLocation}</span>
                <span className="project-tile__timestamp" style={{ textAlign: "center", width: "100%" }}>
                  Updated {new Date(p.lastUpdated).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {menuPos && menuItem ? (
        <div className="context-menu-backdrop" onClick={closeMenu}>
          <div
            className="context-menu"
            style={{ top: menuPos.y, left: menuPos.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="context-menu__item" onClick={() => startRename(menuItem)}>
              Rename
            </button>
            <button
              type="button"
              className="context-menu__item"
              onClick={() => {
                closeMenu();
                void onDuplicateProject(menuItem);
              }}
            >
              Duplicate
            </button>
            <button type="button" className="context-menu__item" disabled title="Coming soon">
              Archive
            </button>
            <button type="button" className="context-menu__item" disabled title="Coming soon">
              Backup
            </button>
          </div>
        </div>
      ) : null}

      {renameOpen && renameTarget ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">Rename Project</h3>
            </div>
            <div className="form-section">
              <label className="form-row">
                <span className="section-title">Name</span>
                <input
                  className="form-input"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void runRename();
                    }
                  }}
                />
              </label>
            </div>
            {renameError ? <p className="error">{renameError}</p> : null}
            <div className="modal__footer">
              <button
                type="button"
                className="pill-button"
                onClick={() => {
                  setRenameOpen(false);
                  setRenameTarget(null);
                  setRenameError(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="pill-button" onClick={() => void runRename()}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={onCreateProject} />
    </div>
  );
}
