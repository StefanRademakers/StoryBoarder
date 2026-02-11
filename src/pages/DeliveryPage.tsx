import type { ProjectState } from "../state/types";

interface DeliveryPageProps {
  project: ProjectState;
}

export function DeliveryPage({ project }: DeliveryPageProps) {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Delivery</h1>
          <p className="page-subtitle">Placeholder delivery view for {project.name}.</p>
        </div>
      </header>
      <section className="panel">
        <p className="muted">Delivery content goes here.</p>
      </section>
    </div>
  );
}
