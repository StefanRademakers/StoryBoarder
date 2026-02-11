import { joinPath } from "../utils/path";
import { slugify } from "../utils/slug";
import { electron } from "./electron";
import { buildProjectsIndexEntry } from "../state/projectTemplates";
import type { ProjectState, ProjectsIndexEntry } from "../state/types";
import { resolveProjectJsonPath, resolveProjectsIndexLocation, toProjectsIndexRelative } from "../utils/projectsIndexPaths";

export function normalizePathForCompare(value: string): string {
  return resolveProjectsIndexLocation(value).replace(/[\\/]+/g, "/").toLowerCase();
}

export function resolveProjectFilePath(entry: ProjectsIndexEntry): string {
  return resolveProjectJsonPath(entry.location);
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await electron.ensureDir(dirPath);
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("ensureDir"))) {
      throw error;
    }
    const placeholder = joinPath(dirPath, ".keep");
    await electron.writeText(placeholder, "");
  }
}

const PROJECT_SUBDIRECTORIES = [
  "script",
  "scenes",
  "images",
] as const;

async function ensureProjectStructure(projectDir: string): Promise<void> {
  await ensureDirectoryExists(projectDir);
  await Promise.all(PROJECT_SUBDIRECTORIES.map((dir) => ensureDirectoryExists(joinPath(projectDir, dir))));
}

async function ensureUniqueSlug(rootPath: string, slug: string): Promise<string> {
  let attempt = slug;
  let counter = 1;
  while (await electron.exists(joinPath(rootPath, attempt))) {
    counter += 1;
    attempt = `${slug}-${counter}`;
  }
  return attempt;
}

export interface CreateProjectWorkspaceOptions {
  name: string;
  rootPath: string;
  createState: (params: { name: string; rootPath: string }) => ProjectState;
}

export interface CreateProjectWorkspaceResult {
  projectDir: string;
  projectFile: string;
  state: ProjectState;
  indexEntry: ProjectsIndexEntry;
  slug: string;
}

export async function createProjectWorkspace({
  name,
  rootPath,
  createState,
}: CreateProjectWorkspaceOptions): Promise<CreateProjectWorkspaceResult> {
  const baseSlug = slugify(name) || `project-${Date.now()}`;
  const slug = await ensureUniqueSlug(rootPath, baseSlug);
  const projectDir = joinPath(rootPath, slug);
  await ensureProjectStructure(projectDir);

  const state = createState({ name, rootPath: projectDir });
  const projectFile = joinPath(projectDir, "project.json");
  await electron.writeText(projectFile, JSON.stringify(state, null, 2));

  const indexEntry = buildProjectsIndexEntry(state, toProjectsIndexRelative(projectDir));
  return { projectDir, projectFile, state, indexEntry, slug };
}
