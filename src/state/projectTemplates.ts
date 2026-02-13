import type { ProjectState, ProjectsIndexEntry } from "./types";

function randomId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `proj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createProjectState(params: { name: string; rootPath: string; description?: string }): ProjectState {
  const { name, rootPath, description = "" } = params;
  const id = randomId();
  const now = new Date().toISOString();

  return {
    schema: "storybuilder.project/v1",
    id,
    name,
    description,
    createdAt: now,
    lastModified: now,
    paths: {
      root: rootPath,
    },
    settings: {
      width: null,
      height: null,
      framerate: null,
    },
    images: [],
    script: "",
    shotlist: "",
    thumbnail: "",
  };
}

export function buildProjectsIndexEntry(project: ProjectState, location: string): ProjectsIndexEntry {
  return {
    id: project.id,
    name: project.name,
    location,
    lastModified: project.lastModified,
    lastUpdated: project.lastModified,
    thumbnail: project.thumbnail,
  };
}
