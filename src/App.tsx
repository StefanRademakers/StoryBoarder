import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectsOverview } from "./pages/ProjectsOverview";
import { StoryPage } from "./pages/StoryPage";
import { PreviewPage } from "./pages/PreviewPage";
import { ScenesPage } from "./pages/ScenesPage";
import { ShotsPage } from "./pages/ShotsPage";
import { DeliveryPage } from "./pages/DeliveryPage";
import { MoodboardsPage } from "./pages/MoodboardsPage";
import { CharactersPage } from "./pages/CharactersPage";
import { EditorPopoutPage } from "./pages/EditorPopoutPage";
import { BottomNav } from "./components/layout/BottomNav";
import { useAppState } from "./state/appState";
import { createProjectState } from "./state/projectTemplates";
import type { PageKey, ProjectsIndexEntry } from "./state/types";
import {
  createProjectWorkspace,
  duplicateProjectWorkspace,
  normalizePathForCompare,
  renameProjectWorkspace,
  resolveProjectFilePath,
} from "./services/projectService";
import { electron } from "./services/electron";

export default function App() {
  const {
    projectsIndex,
    projectsRootPath,
    project,
    loading,
    lastError,
    setProjectsRootPath,
    loadProject,
    updateProjectsIndex,
    closeProject,
    projectFilePath,
  } = useAppState();

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isEditorPopout = searchParams.get("popout") === "editor";
  const popoutProjectFilePath = searchParams.get("projectFilePath");
  const popoutTargetPath = searchParams.get("targetPath");
  const popoutTitle = searchParams.get("title") ?? "Editor";

  const [activePage, setActivePage] = useState<PageKey>("projects");
  const projectAvailable = Boolean(project);

  useEffect(() => {
    if (!isEditorPopout) return;
    if (!popoutProjectFilePath) return;
    if (projectFilePath === popoutProjectFilePath) return;
    void loadProject(popoutProjectFilePath);
  }, [isEditorPopout, popoutProjectFilePath, loadProject, projectFilePath]);

  useEffect(() => {
    if (!projectAvailable && activePage !== "projects") {
      setActivePage("projects");
    }
  }, [projectAvailable, activePage]);

  useEffect(() => {
    if (isEditorPopout) return;
    const titleMap: Partial<Record<PageKey, string>> = {
      preview: "StoryBuilder - Preview",
      moodboards: "StoryBuilder - Moodboards",
      characterProps: "StoryBuilder - Character & Props",
      scenes: "StoryBuilder - Scenes",
      shots: "StoryBuilder - Shots",
      delivery: "StoryBuilder - Delivery",
    };
    const title = titleMap[activePage] ?? (project ? `StoryBuilder - ${project.name}` : "StoryBuilder");
    try {
      void electron.setWindowTitle(title);
    } catch {
      // ignore when preload is not available
    }
  }, [activePage, project, isEditorPopout]);

  const handleChangeRootPath = useCallback(async () => {
    const picked = await electron.pickDir({
      title: "Select projects root",
      defaultPath: projectsRootPath ?? undefined,
    });
    if (!picked) return undefined;
    return await setProjectsRootPath(picked);
  }, [projectsRootPath, setProjectsRootPath]);

  const handleOpenProject = useCallback(async (entry: ProjectsIndexEntry) => {
    const projectPath = resolveProjectFilePath(entry);
    await loadProject(projectPath);
    setActivePage("story");
  }, [loadProject]);

  const handleCreateProject = useCallback(async (nameFromUI?: string) => {
    const ensureRoot = async (): Promise<string | undefined> => {
      if (projectsRootPath) return projectsRootPath;
      const picked = await handleChangeRootPath();
      return picked ?? undefined;
    };

    const root = await ensureRoot();
    if (!root) return;

    const name = nameFromUI?.trim();
    if (!name) return;

    try {
      const { projectDir, projectFile, indexEntry } = await createProjectWorkspace({
        name,
        rootPath: root,
        createState: createProjectState,
      });

      await updateProjectsIndex((current): typeof projectsIndex => {
        const index = current ?? { projects: [] };
        const normalizedDir = normalizePathForCompare(projectDir);
        const filtered = index.projects.filter((item) => normalizePathForCompare(item.location) !== normalizedDir);
        return { projects: [indexEntry, ...filtered] };
      });

      await loadProject(projectFile);
      setActivePage("story");
    } catch (error) {
      console.error("Failed to create project", error);
      alert(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectsRootPath, handleChangeRootPath, updateProjectsIndex, loadProject, projectsIndex]);

  const handleRenameProject = useCallback(async (entry: ProjectsIndexEntry, nextName: string) => {
    try {
      await renameProjectWorkspace(entry, nextName);
      await updateProjectsIndex((current) => current);
    } catch (error) {
      console.error("Failed to rename project", error);
      throw error;
    }
  }, [updateProjectsIndex]);

  const handleDuplicateProject = useCallback(async (entry: ProjectsIndexEntry) => {
    try {
      await duplicateProjectWorkspace(entry);
      await updateProjectsIndex((current) => current);
    } catch (error) {
      console.error("Failed to duplicate project", error);
      alert(`Failed to duplicate project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [updateProjectsIndex]);

  const content = useMemo(() => {
    if (isEditorPopout) {
      if (!project || !popoutTargetPath) {
        return (
          <div className="page">
            <section className="panel">
              <p className="muted">Loading editor...</p>
            </section>
          </div>
        );
      }
      return <EditorPopoutPage project={project} targetPath={popoutTargetPath} title={popoutTitle} />;
    }

    if (activePage === "projects") {
      return (
        <ProjectsOverview
          projectsIndex={projectsIndex}
          rootPath={projectsRootPath}
          loading={loading}
          lastError={lastError}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onChangeRootPath={handleChangeRootPath}
          onReload={async () => {
            await updateProjectsIndex((current) => current);
          }}
          onRenameProject={handleRenameProject}
          onDuplicateProject={handleDuplicateProject}
        />
      );
    }

    if (activePage === "preview") {
      return <PreviewPage />;
    }

    if (activePage === "moodboards" && project) {
      return <MoodboardsPage project={project} />;
    }

    if (activePage === "characterProps" && project) {
      return <CharactersPage project={project} />;
    }

    if (activePage === "scenes" && project) {
      return <ScenesPage project={project} />;
    }

    if (activePage === "shots" && project) {
      return <ShotsPage project={project} />;
    }

    if (activePage === "delivery" && project) {
      return <DeliveryPage project={project} />;
    }

    if (activePage === "story" && project) {
      return <StoryPage project={project} />;
    }

    return null;
  }, [
    activePage,
    isEditorPopout,
    popoutTargetPath,
    popoutTitle,
    projectsIndex,
    projectsRootPath,
    loading,
    lastError,
    handleOpenProject,
    handleCreateProject,
    handleRenameProject,
    handleDuplicateProject,
    handleChangeRootPath,
    updateProjectsIndex,
    project,
  ]);

  return (
    <div className="app-root">
      <main className="app-content">{content}</main>
      {!isEditorPopout ? (
        <footer className="app-footer">
          <div className="footer-left">
            {loading ? <span className="badge badge--queued">Loading...</span> : null}
          </div>
          <BottomNav
            active={activePage}
            onSelect={(page) => {
              if (page === "projects") {
                closeProject();
              }
              setActivePage(page);
            }}
            projectAvailable={projectAvailable}
          />
          <div className="footer-right" />
        </footer>
      ) : null}
    </div>
  );
}
