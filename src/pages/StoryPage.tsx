import { useEffect, useRef, useState } from "react";
import type { ProjectState } from "../state/types";
import { SidebarNav } from "../components/common/SidebarNav";
import { useAppState } from "../state/appState";

const SECTIONS = [
  { key: "settings", label: "Project Settings" },
  { key: "script", label: "Script" },
  { key: "shotlist", label: "Shotlist" },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

interface StoryPageProps {
  project: ProjectState;
}

export function StoryPage({ project }: StoryPageProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("settings");
  const { updateProject } = useAppState();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isEditingRef = useRef(false);
  const scriptValue = project.script ?? "";

  const applyBold = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("bold");
    updateProject((draft) => {
      draft.script = editor.innerHTML;
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (isEditingRef.current) return;
    if (editor.innerHTML !== scriptValue) {
      editor.innerHTML = scriptValue || "";
    }
  }, [scriptValue]);

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
            <h1>{project.name}</h1>
            <p className="page-subtitle">Story workspace sections.</p>
          </div>
        </header>

        {activeSection === "settings" ? (
          <section className="panel">
            <h2 className="section-title">Project Settings</h2>
            <p className="muted">Content goes here.</p>
          </section>
        ) : null}

        {activeSection === "script" ? (
          <section className="panel script-panel">
            <div className="script-toolbar">
              <button type="button" className="pill-button" onClick={applyBold}>
                Bold
              </button>
            </div>
            <div className="script-editor">
              <div
                ref={editorRef}
                className="script-editor__rich"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                data-placeholder="Paste or type your script here..."
                onFocus={() => {
                  isEditingRef.current = true;
                }}
                onBlur={() => {
                  isEditingRef.current = false;
                  const editor = editorRef.current;
                  if (!editor) return;
                  updateProject((draft) => {
                    draft.script = editor.innerHTML;
                  });
                }}
                onInput={() => {
                  const editor = editorRef.current;
                  if (!editor) return;
                  updateProject((draft) => {
                    draft.script = editor.innerHTML;
                  });
                }}
              />
            </div>
          </section>
        ) : null}

        {activeSection === "shotlist" ? (
          <section className="panel">
            <h2 className="section-title">Shotlist</h2>
            <p className="muted">Content goes here.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
