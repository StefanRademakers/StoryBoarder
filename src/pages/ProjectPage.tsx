import { useMemo } from "react";
import type { ProjectState } from "../state/types";
import { DropOrBrowse } from "../components/common/DropOrBrowse";
import { toFileUrl } from "../utils/path";
import { useAppState } from "../state/appState";

interface ProjectPageProps {
  project: ProjectState;
}

export function ProjectPage({ project }: ProjectPageProps) {
  const { updateProject, closeProject } = useAppState();
  const images = useMemo(() => project.images ?? [], [project.images]);

  return (
    <div className="page project-page">
      <header className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p className="page-subtitle">Drop images below to attach them to the project.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={closeProject}>Back to Projects</button>
        </div>
      </header>

      <section className="panel">
        <h2 className="section-title">Image Drop Tile</h2>
        <DropOrBrowse
          label="Drop images here or Browse"
          onPathsSelected={(paths) => {
            if (!paths.length) return;
            updateProject((draft) => {
              const current = Array.isArray(draft.images) ? draft.images.slice() : [];
              draft.images = [...current, ...paths];
            });
          }}
          browse={async () => {
            const picked = await window.electronAPI.pickFile({
              title: "Select image",
              filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
            });
            if (picked) {
              updateProject((draft) => {
                const current = Array.isArray(draft.images) ? draft.images.slice() : [];
                draft.images = [...current, picked];
              });
            }
            return picked;
          }}
        />
        {images.length > 0 ? (
          <div className="image-grid">
            {images.map((path, index) => (
              <div key={`${path}-${index}`} className="image-tile">
                <img src={toFileUrl(path)} alt="" />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No images added yet.</p>
        )}
      </section>
    </div>
  );
}