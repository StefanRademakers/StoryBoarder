import { getDirectoryName, isAbsolutePath, joinPath, toProjectRelativePath } from "../utils/path";
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
  "notes",
  "resources",
  "todos",
  "prompts",
  "moodboards",
  "characters",
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

function isTransientMoveError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "EPERM" || code === "EBUSY";
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithRetry(oldPath: string, newPath: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await electron.rename(oldPath, newPath);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientMoveError(error) || attempt === 4) {
        break;
      }
      await delay(80 * (attempt + 1));
    }
  }
  throw lastError;
}

function randomProjectId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `proj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function rebaseProjectLocalPath(value: string | undefined, oldRoot: string, newRoot: string): string | undefined {
  if (!value) return value;
  if (!isAbsolutePath(value)) {
    return toProjectRelativePath(newRoot, value);
  }
  const oldNorm = resolveProjectsIndexLocation(oldRoot).replace(/\\/g, "/").replace(/\/+$/, "");
  const currentNorm = resolveProjectsIndexLocation(value).replace(/\\/g, "/");
  const prefix = `${oldNorm}/`;
  if (currentNorm.toLowerCase().startsWith(prefix.toLowerCase())) {
    const suffix = currentNorm.slice(prefix.length);
    return toProjectRelativePath(newRoot, joinPath(newRoot, suffix));
  }
  return toProjectRelativePath(newRoot, value);
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

export async function renameProjectWorkspace(entry: ProjectsIndexEntry, nextNameRaw: string): Promise<void> {
  const nextName = nextNameRaw.trim();
  if (!nextName) {
    throw new Error("Project name cannot be empty.");
  }
  const sourceDir = resolveProjectsIndexLocation(entry.location);
  const rootPath = getDirectoryName(sourceDir);
  const slugBase = slugify(nextName) || "project";
  const sourceBase = sourceDir.replace(/\\/g, "/").split("/").pop() ?? "";
  let targetSlug = slugBase;
  if (slugBase !== sourceBase) {
    targetSlug = await ensureUniqueSlug(rootPath, slugBase);
  }
  const targetDir = joinPath(rootPath, targetSlug);
  if (normalizePathForCompare(sourceDir) !== normalizePathForCompare(targetDir) && await electron.exists(targetDir)) {
    throw new Error("A project folder with that name already exists.");
  }
  if (normalizePathForCompare(sourceDir) !== normalizePathForCompare(targetDir)) {
    try {
      await renameWithRetry(sourceDir, targetDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not rename project folder. ${message}`);
    }
  }

  const projectFile = joinPath(targetDir, "project.json");
  const content = await electron.readText(projectFile);
  const state = JSON.parse(content) as ProjectState;
  state.name = nextName;
  state.lastModified = new Date().toISOString();
  state.paths.root = targetDir;
  state.thumbnail = rebaseProjectLocalPath(state.thumbnail, sourceDir, targetDir);
  await electron.writeText(projectFile, JSON.stringify(state, null, 2));
}

export async function duplicateProjectWorkspace(entry: ProjectsIndexEntry): Promise<void> {
  const sourceDir = resolveProjectsIndexLocation(entry.location);
  const rootPath = getDirectoryName(sourceDir);
  const sourceSlug = sourceDir.replace(/\\/g, "/").split("/").pop() ?? "project";
  const targetSlug = await ensureUniqueSlug(rootPath, `${sourceSlug}-copy`);
  const targetDir = joinPath(rootPath, targetSlug);
  await electron.copyDir(sourceDir, targetDir);

  const projectFile = joinPath(targetDir, "project.json");
  const content = await electron.readText(projectFile);
  const state = JSON.parse(content) as ProjectState;
  const now = new Date().toISOString();
  state.id = randomProjectId();
  state.name = `${state.name} Copy`;
  state.createdAt = now;
  state.lastModified = now;
  state.paths.root = targetDir;
  state.thumbnail = rebaseProjectLocalPath(state.thumbnail, sourceDir, targetDir);
  await electron.writeText(projectFile, JSON.stringify(state, null, 2));
}
