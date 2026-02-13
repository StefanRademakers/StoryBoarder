import { useState } from "react";
import type { ProjectState } from "../state/types";
import { SidebarNav } from "../components/common/SidebarNav";
import { useAppState } from "../state/appState";
import { MdxTextSection } from "../components/common/MdxTextSection";
import { NotesSection } from "../components/story/NotesSection";
import { LibrarySection } from "../components/story/LibrarySection";
import { joinPath, resolveProjectPath, toProjectRelativePath } from "../utils/path";
import { electron } from "../services/electron";
import { ImageAssetField } from "../components/common/ImageAssetField";

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
  const { updateProject, projectFilePath, appSettings } = useAppState();
  const scriptTargetPath = joinPath(joinPath(project.paths.root, "script"), "script.md");
  const shotlistTargetPath = joinPath(joinPath(project.paths.root, "script"), "shotlist.md");

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
            <div className="project-settings-grid">
              <div className="project-settings-grid__image">
                <label className="form-row">
                  <span className="section-title">Project Thumbnail</span>
                  <ImageAssetField
                    imagePath={resolveProjectPath(project.paths.root, project.thumbnail)}
                    emptyLabel="Drop image here or click to browse"
                    onReplace={async (paths) => {
                      if (!paths.length) return;
                      const picked = paths[0];
                      const ext = getImageExtension(picked);
                      const fileName = ext ? `project_main_image${ext}` : "project_main_image";
                      const destDir = joinPath(project.paths.root, "resources");
                      const dest = joinPath(destDir, fileName);
                      await electron.copyFile(picked, dest);
                      updateProject((draft) => {
                        draft.thumbnail = toProjectRelativePath(project.paths.root, dest);
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
                          draft.thumbnail = toProjectRelativePath(project.paths.root, dest);
                        });
                      }
                      return picked;
                    }}
                    photoshopPath={appSettings.photoshopPath}
                  />
                </label>
              </div>

              <div className="project-settings-grid__fields">
                <div className="project-settings__meta">
                  <label className="form-row">
                    <span className="section-title">Width</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="form-input"
                      value={project.settings?.width ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        const parsed = raw === "" ? null : Number.parseInt(raw, 10);
                        if (raw !== "" && Number.isNaN(parsed)) return;
                        updateProject((draft) => {
                          draft.settings ??= {};
                          draft.settings.width = parsed;
                        });
                      }}
                      placeholder="1920"
                    />
                  </label>

                  <label className="form-row">
                    <span className="section-title">Height</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="form-input"
                      value={project.settings?.height ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        const parsed = raw === "" ? null : Number.parseInt(raw, 10);
                        if (raw !== "" && Number.isNaN(parsed)) return;
                        updateProject((draft) => {
                          draft.settings ??= {};
                          draft.settings.height = parsed;
                        });
                      }}
                      placeholder="1080"
                    />
                  </label>

                  <label className="form-row">
                    <span className="section-title">Framerate</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="form-input"
                      value={project.settings?.framerate ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        const parsed = raw === "" ? null : Number.parseFloat(raw);
                        if (raw !== "" && Number.isNaN(parsed)) return;
                        updateProject((draft) => {
                          draft.settings ??= {};
                          draft.settings.framerate = parsed;
                        });
                      }}
                      placeholder="24"
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeSection === "script" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div className="panel-meta">
                  <span className="label">Script Editor</span>
                  <span className="value">script/script.md</span>
                </div>
                <button
                  type="button"
                  className="pill-button"
                  onClick={() => {
                    if (!projectFilePath) return;
                    void electron.openEditorPopout({
                      projectFilePath,
                      targetPath: scriptTargetPath,
                      title: `Script - ${project.name}`,
                    });
                  }}
                >
                  Pop out
                </button>
              </div>
              <MdxTextSection
                value={project.script ?? ""}
                onChange={(markdown) => updateProject((draft) => { draft.script = markdown; })}
                projectRoot={project.paths.root}
                fileName="script.md"
                targetPath={scriptTargetPath}
                wrapInPanel={false}
              />
            </section>
          </>
        ) : null}

        {activeSection === "shotlist" ? (
          <section className="panel">
            <div className="panel-header">
              <div className="panel-meta">
                <span className="label">Shotlist Editor</span>
                <span className="value">script/shotlist.md</span>
              </div>
              <button
                type="button"
                className="pill-button"
                onClick={() => {
                  if (!projectFilePath) return;
                  void electron.openEditorPopout({
                    projectFilePath,
                    targetPath: shotlistTargetPath,
                    title: `Shotlist - ${project.name}`,
                  });
                }}
              >
                Pop out
              </button>
            </div>
            <MdxTextSection
              value={project.shotlist ?? ""}
              onChange={(markdown) => updateProject((draft) => { draft.shotlist = markdown; })}
              projectRoot={project.paths.root}
              fileName="shotlist.md"
              targetPath={shotlistTargetPath}
              wrapInPanel={false}
            />
          </section>
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
