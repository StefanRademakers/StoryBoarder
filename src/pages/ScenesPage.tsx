import type { ProjectState } from "../state/types";

interface ScenesPageProps {
  project: ProjectState;
}

export function ScenesPage({ project }: ScenesPageProps) {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Scenes</h1>
          <p className="page-subtitle">Placeholder scenes view for {project.name}.</p>
        </div>
      </header>
      <section className="panel">
        <p className="muted">Scenes content goes here.</p>
      </section>
    </div>
  );
}
