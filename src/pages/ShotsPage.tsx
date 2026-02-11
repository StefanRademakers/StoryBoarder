import type { ProjectState } from "../state/types";

interface ShotsPageProps {
  project: ProjectState;
}

export function ShotsPage({ project }: ShotsPageProps) {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Shots</h1>
          <p className="page-subtitle">Placeholder shots view for {project.name}.</p>
        </div>
      </header>
      <section className="panel">
        <p className="muted">Shots content goes here.</p>
      </section>
    </div>
  );
}
