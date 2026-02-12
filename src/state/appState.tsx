import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppStateContextValue, ProjectState, ProjectsIndex } from "./types";
import { debounce } from "../utils/debounce";
import { deepClone } from "../utils/deepClone";
import { getDirectoryName, joinPath } from "../utils/path";
import { electron } from "../services/electron";
import { ensureDirectoryExists } from "../services/projectService";
import { resolveProjectsIndexLocation, setProjectsRoot, toProjectsIndexRelative } from "../utils/projectsIndexPaths";

const DEFAULT_AUTOSAVE_DELAY_MS = 500;
const LOCAL_STORAGE_ROOT_PATH_KEY = "storybuilder.projectsRootPath";
const DEFAULT_PROJECTS_ROOT = "D:/Storyboards";
const EMPTY_PROJECTS_INDEX: ProjectsIndex = { projects: [] };

const AppStateContext = createContext<AppStateContextValue | null>(null);

function hashString(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function scanProjects(rootPath: string): Promise<ProjectsIndex> {
  try {
    const entries = await electron.listDir(rootPath);
    const projects = [] as ProjectsIndex["projects"];
    for (const e of entries) {
      if (!e.isDirectory) continue;
      const dir = joinPath(rootPath, e.name);
      const pj = joinPath(dir, "project.json");
      const hasProject = await electron.exists(pj);
      if (!hasProject) continue;
      try {
        const text = await electron.readText(pj);
        const parsed = JSON.parse(text) as ProjectState;
        const stat = await electron.stat(pj);
        const last = parsed.lastModified ?? (stat ? new Date(stat.mtimeMs).toISOString() : new Date().toISOString());
        const abs = resolveProjectsIndexLocation(dir);
        const rel = toProjectsIndexRelative(abs);
        const id = `p-${hashString(abs.toLowerCase())}`;
        projects.push({
          id,
          name: parsed.name || e.name,
          location: rel,
          lastModified: last,
          lastUpdated: last,
          thumbnail: parsed.thumbnail,
        });
      } catch {
        // ignore broken project.json
      }
    }
    return { projects };
  } catch (error) {
    console.error("Failed to scan projects", error);
    return EMPTY_PROJECTS_INDEX;
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [projectsIndex, setProjectsIndex] = useState<ProjectsIndex | null>(null);
  const [projectsRootPath, setProjectsRootPathState] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [projectFilePath, setProjectFilePathState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const projectPathRef = useRef<string | null>(null);
  const projectRef = useRef<ProjectState | null>(null);
  const dirtyRef = useRef(false);

  const readFile = useCallback((filePath: string) => electron.readText(filePath), []);
  const writeFile = useCallback((filePath: string, text: string) => electron.writeText(filePath, text), []);

  const loadProjectsIndex = useCallback(async (indexPath: string) => {
    setLoading(true);
    setLastError(null);
    const root = indexPath.toLowerCase().endsWith("projects.json") ? getDirectoryName(indexPath) : indexPath;
    try {
      const scanned = await scanProjects(root);
      const normalized = scanned.projects.map((entry) => ({
        ...entry,
        location: toProjectsIndexRelative(resolveProjectsIndexLocation(entry.location)),
      }));
      setProjectsIndex({ projects: normalized });
    } catch (error) {
      console.error("Failed to load projects index", error);
      setLastError(error instanceof Error ? error.message : String(error));
      setProjectsIndex(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProject = useCallback(async (filePath: string) => {
    setLoading(true);
    setLastError(null);
    try {
      const content = await readFile(filePath);
      const parsed = JSON.parse(content) as ProjectState;
      projectPathRef.current = filePath;
      projectRef.current = parsed;
      setProject(parsed);
      setProjectFilePathState(filePath);
      dirtyRef.current = false;
    } catch (error) {
      console.error("Failed to load project", error);
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [readFile]);

  const persistProject = useCallback(async (draft: ProjectState | null) => {
    if (!draft || !projectPathRef.current) return;
    try {
      await writeFile(projectPathRef.current, JSON.stringify(draft, null, 2));
      dirtyRef.current = false;
    } catch (error) {
      console.error("Failed to save project", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [writeFile]);

  const autosaveRef = useRef(
    debounce(async () => {
      if (dirtyRef.current) {
        await persistProject(projectRef.current);
      }
    }, DEFAULT_AUTOSAVE_DELAY_MS)
  );

  const updateProject = useCallback((updater: (draft: ProjectState) => void) => {
    setProject((previous) => {
      if (!previous) return previous;
      const clone = deepClone(previous);
      updater(clone);
      clone.lastModified = new Date().toISOString();
      dirtyRef.current = true;
      projectRef.current = clone;
      autosaveRef.current();
      return clone;
    });
  }, []);

  const closeProject = useCallback(() => {
    projectPathRef.current = null;
    projectRef.current = null;
    setProject(null);
    setProjectFilePathState(null);
  }, []);

  const setProjectsRootPath = useCallback(async (root: string) => {
    if (!root) return undefined;
    try {
      await ensureDirectoryExists(root);
      setProjectsRoot(root);
      const scanned = await scanProjects(root);
      setProjectsIndex(scanned);
      setProjectsRootPathState(root);
      try {
        localStorage.setItem(LOCAL_STORAGE_ROOT_PATH_KEY, root);
      } catch (error) {
        console.warn("Failed to persist projects root", error);
      }
      return root;
    } catch (error) {
      console.error("Failed to set projects root", error);
      setLastError(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }, []);

  const updateProjectsIndex = useCallback(
    async (_updater: (current: ProjectsIndex | null) => ProjectsIndex | null) => {
      const root = projectsRootPath;
      if (!root) {
        setLastError("Projects root path is not configured.");
        return;
      }
      const scanned = await scanProjects(root);
      setProjectsIndex(scanned);
    },
    [projectsRootPath]
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => () => autosaveRef.current.cancel(), []);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      let storedRoot: string | null = null;
      try {
        storedRoot = localStorage.getItem(LOCAL_STORAGE_ROOT_PATH_KEY);
      } catch (error) {
        console.warn("Failed to read stored root path", error);
      }

      let initialRoot = storedRoot ?? DEFAULT_PROJECTS_ROOT;
      if (!storedRoot) {
        try {
          const homeDir = await electron.getPath("home");
          initialRoot = joinPath(homeDir, "Storyboards");
        } catch (error) {
          console.warn("Failed to resolve home directory", error);
        }
      }
      if (mounted) {
        await setProjectsRootPath(initialRoot);
      }
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [setProjectsRootPath]);

  const value = useMemo<AppStateContextValue>(() => ({
    projectsIndex,
    projectsRootPath,
    project,
    projectFilePath,
    loading,
    lastError,
    setProjectsRootPath,
    loadProjectsIndex,
    loadProject,
    closeProject,
    updateProjectsIndex,
    updateProject,
  }), [projectsIndex, projectsRootPath, project, projectFilePath, loading, lastError, setProjectsRootPath, loadProjectsIndex, loadProject, closeProject, updateProjectsIndex, updateProject]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}
