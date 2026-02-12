import { useState } from "react";
import type { ProjectState } from "../state/types";
import { SidebarNav } from "../components/common/SidebarNav";
import { useAppState } from "../state/appState";
import { MdxTextSection } from "../components/common/MdxTextSection";
import { NotesSection } from "../components/story/NotesSection";
import { LibrarySection } from "../components/story/LibrarySection";
import { DropOrBrowse } from "../components/common/DropOrBrowse";
import { toFileUrl, joinPath } from "../utils/path";
import { electron } from "../services/electron";

const SECTIONS = [
  { key: "settings", label: "Project Settings" },
  { key: "script", label: "Script" },
  { key: "shotlist", label: "Shotlist" },
  { key: "notes", label: "Notes" },
  { key: "todos", label: "Todos" },
  { key: "prompts", label: "Prompts" },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

interface StoryPageProps {
  project: ProjectState;
}

export function StoryPage({ project }: StoryPageProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("settings");
  const { updateProject } = useAppState();

  return (
    <div className="page project-page project-page--with-sidebar">
      <SidebarNav
        items={SECTIONS}
        activeKey={activeSection}
        onSelect={setActiveSection}
        ariaLabel="Story sections"
      />

      <div className="project-page__content">
        <header className="page-header">
          <div>
            <h1>
              {activeSection === "script"
                ? "Script"
                : activeSection === "shotlist"
                  ? "Shotlist"
                  : activeSection === "notes"
                    ? "Notes"
                    : activeSection === "todos"
                      ? "Todos"
                      : activeSection === "prompts"
                        ? "Prompts"
                    : project.name}
            </h1>
            <p className="page-subtitle">Story workspace sections.</p>
          </div>
        </header>

        {activeSection === "settings" ? (
          <section className="panel">
            <h2 className="section-title">Project Settings</h2>
            <div className="form-section">
              <label className="form-row">
                <span className="section-title">Project Thumbnail</span>
                <DropOrBrowse
                  label="Drop image here or Browse"
                  onPathsSelected={async (paths) => {
                    if (!paths.length) return;
                    const picked = paths[0];
                    const ext = getImageExtension(picked);
                    const fileName = ext ? `project_main_image${ext}` : "project_main_image";
                    const destDir = joinPath(project.paths.root, "resources");
                    const dest = joinPath(destDir, fileName);
                    await electron.copyFile(picked, dest);
                    updateProject((draft) => {
                      draft.thumbnail = dest;
                    });
                  }}
                  browse={async () => {
                    const picked = await window.electronAPI.pickFile({
                      title: "Select thumbnail image",
                      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
                    });
                    if (picked) {
                      const ext = getImageExtension(picked);
                      const fileName = ext ? `project_main_image${ext}` : "project_main_image";
                      const destDir = joinPath(project.paths.root, "resources");
                      const dest = joinPath(destDir, fileName);
                      await electron.copyFile(picked, dest);
                      updateProject((draft) => {
                        draft.thumbnail = dest;
                      });
                    }
                    return picked;
                  }}
                />
              </label>
              {project.thumbnail ? (
                <div className="image-tile">
                  <img src={toFileUrl(project.thumbnail)} alt="" />
                </div>
              ) : (
                <p className="muted">No thumbnail selected yet.</p>
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "script" ? (
          <MdxTextSection
            value={project.script ?? ""}
            onChange={(markdown) => updateProject((draft) => { draft.script = markdown; })}
            projectRoot={project.paths.root}
            fileName="script.md"
          />
        ) : null}

        {activeSection === "shotlist" ? (
          <MdxTextSection
            value={project.shotlist ?? ""}
            onChange={(markdown) => updateProject((draft) => { draft.shotlist = markdown; })}
            projectRoot={project.paths.root}
            fileName="shotlist.md"
          />
        ) : null}

        {activeSection === "notes" ? (
          <NotesSection projectRoot={project.paths.root} />
        ) : null}

        {activeSection === "todos" ? (
          <LibrarySection
            projectRoot={project.paths.root}
            folderName="todos"
            title="Todo"
            placeholder="Write your todo..."
          />
        ) : null}

        {activeSection === "prompts" ? (
          <LibrarySection
            projectRoot={project.paths.root}
            folderName="prompts"
            title="Prompt"
            placeholder="Write your prompt..."
          />
        ) : null}
      </div>
    </div>
  );
}

function getImageExtension(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".jpg")) return ".jpg";
  if (lower.endsWith(".jpeg")) return ".jpeg";
  if (lower.endsWith(".webp")) return ".webp";
  return null;
}
