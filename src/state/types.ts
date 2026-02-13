export interface ProjectState {
  schema: string;
  id: string;
  name: string;
  description: string;
  script?: string;
  shotlist?: string;
  thumbnail?: string;
  createdAt: string;
  lastModified: string;
  paths: {
    root: string;
  };
  settings?: {
    width?: number | null;
    height?: number | null;
    framerate?: number | null;
  };
  images?: string[];
}

export interface ProjectsIndexEntry {
  id: string;
  name: string;
  location: string;
  lastModified: string;
  lastUpdated: string;
  thumbnail?: string;
}

export interface ProjectsIndex {
  projects: ProjectsIndexEntry[];
}

export interface AppSettings {
  photoshopPath: string;
}

export interface AppState {
  projectsIndex: ProjectsIndex | null;
  projectsRootPath: string | null;
  appSettings: AppSettings;
  project: ProjectState | null;
  projectFilePath: string | null;
  loading: boolean;
  lastError: string | null;
}

export type ProjectUpdater = (project: ProjectState) => void;

export interface AppStateContextValue extends AppState {
  setProjectsRootPath: (path: string) => Promise<string | undefined>;
  loadProjectsIndex: (path: string) => Promise<void>;
  loadProject: (path: string) => Promise<void>;
  closeProject: () => void;
  updateProject: (updater: ProjectUpdater) => void;
  updateProjectsIndex: (
    updater: (current: ProjectsIndex | null) => ProjectsIndex | null,
  ) => Promise<void>;
  updateAppSettings: (updater: (current: AppSettings) => AppSettings) => void;
}

export type PageKey =
  | "projects"
  | "story"
  | "moodboards"
  | "characterProps"
  | "scenes"
  | "shots"
  | "preview"
  | "delivery";
