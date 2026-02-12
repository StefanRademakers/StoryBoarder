import { useEffect, useState } from "react";
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
}: ProjectsOverviewProps) {
  const projects = projectsIndex?.projects ?? [];
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    try {
      void window.electronAPI.ping();
    } catch {
      // ignore
    }
  }, []);

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
              >
                <div className="project-tile__frame" style={{ position: "relative", overflow: "hidden" }}>
                  {p.thumbnail ? (
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
      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={onCreateProject} />
    </div>
  );
}
