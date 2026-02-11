import { useState } from "react";
import type { ProjectState } from "../state/types";
import { SidebarNav } from "../components/common/SidebarNav";
import { useAppState } from "../state/appState";
import { RichTextSection } from "../components/common/RichTextSection";

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
            <h1>{activeSection === "script" ? "Script" : activeSection === "shotlist" ? "Shotlist" : project.name}</h1>
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
          <RichTextSection
            value={project.script ?? ""}
            onChange={(markdown) => updateProject((draft) => { draft.script = markdown; })}
            projectRoot={project.paths.root}
            fileName="script.md"
          />
        ) : null}

        {activeSection === "shotlist" ? (
          <RichTextSection
            value={project.shotlist ?? ""}
            onChange={(markdown) => updateProject((draft) => { draft.shotlist = markdown; })}
            projectRoot={project.paths.root}
            fileName="shotlist.md"
          />
        ) : null}
      </div>
    </div>
  );
}
