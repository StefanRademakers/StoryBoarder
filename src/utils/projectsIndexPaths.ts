let projectsRootPath: string | null = null;

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function normalizeAbsolute(value: string): string {
  let normalized = normalizeSlashes(value.trim());
  if (!normalized) return "";
  if (/^[a-zA-Z]:$/.test(normalized)) {
    normalized += "/";
  }
  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized[0].toUpperCase() + normalized.slice(1);
  }
  return trimTrailingSlash(normalized);
}

function resolveWithRoot(relative: string): string {
  const root = projectsRootPath;
  if (!root) {
    return normalizeAbsolute(relative);
  }
  const cleanedRelative = normalizeSlashes(relative).replace(/^\/+/, "");
  const rootNormalized = normalizeAbsolute(root);
  return normalizeAbsolute(`${rootNormalized}/${cleanedRelative}`);
}

export function setProjectsRoot(root: string | null): void {
  projectsRootPath = root ? normalizeAbsolute(root) : null;
}

export function resolveProjectsIndexLocation(location: string): string {
  if (!location) {
    return projectsRootPath ?? "";
  }
  if (isAbsolutePath(location)) {
    return normalizeAbsolute(location);
  }
  return resolveWithRoot(location);
}

export function toProjectsIndexRelative(path: string): string {
  const root = projectsRootPath;
  if (!path) {
    return "";
  }
  const normalized = normalizeAbsolute(path);
  if (!root) {
    return normalized;
  }
  const rootNormalized = normalizeAbsolute(root);
  if (normalized.toLowerCase().startsWith(`${rootNormalized.toLowerCase()}/`)) {
    const relative = normalized.slice(rootNormalized.length + 1);
    return normalizeSlashes(relative);
  }
  return normalizeSlashes(path);
}

export function resolveProjectJsonPath(location: string): string {
  const absolute = resolveProjectsIndexLocation(location);
  if (absolute.toLowerCase().endsWith(".json")) {
    return absolute;
  }
  return `${absolute}/project.json`;
}