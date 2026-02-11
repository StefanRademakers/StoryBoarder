import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectsOverview } from "./pages/ProjectsOverview";
import { StoryPage } from "./pages/StoryPage";
import { PreviewPage } from "./pages/PreviewPage";
import { ScenesPage } from "./pages/ScenesPage";
import { ShotsPage } from "./pages/ShotsPage";
import { DeliveryPage } from "./pages/DeliveryPage";
import { BottomNav } from "./components/layout/BottomNav";
import { useAppState } from "./state/appState";
import { createProjectState } from "./state/projectTemplates";
import type { PageKey, ProjectsIndexEntry } from "./state/types";
import { createProjectWorkspace, normalizePathForCompare, resolveProjectFilePath } from "./services/projectService";
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
  } = useAppState();

  const [activePage, setActivePage] = useState<PageKey>("projects");
  const projectAvailable = Boolean(project);

  useEffect(() => {
    if (!projectAvailable && activePage !== "projects") {
      setActivePage("projects");
    }
  }, [projectAvailable, activePage]);

  useEffect(() => {
    const titleMap: Partial<Record<PageKey, string>> = {
      preview: "StoryBuilder - Preview",
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
  }, [activePage, project]);

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

  const content = useMemo(() => {
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
        />
      );
    }

    if (activePage === "preview") {
      return <PreviewPage />;
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
    projectsIndex,
    projectsRootPath,
    loading,
    lastError,
    handleOpenProject,
    handleCreateProject,
    handleChangeRootPath,
    updateProjectsIndex,
    project,
  ]);

  return (
    <div className="app-root">
      <main className="app-content">{content}</main>
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
    </div>
  );
}
