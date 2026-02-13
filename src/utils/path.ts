export function getDirectoryName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return ".";
  }
  return normalized.slice(0, lastSlash);
}

export function joinPath(base: string, segment: string): string {
  if (!base.endsWith("/") && !base.endsWith("\\")) {
    return `${base.replace(/[/\\]+$/, "")}/${segment}`;
  }
  return `${base}${segment}`;
}

export function isAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

export function resolveProjectPath(projectRoot: string, value: string | null | undefined): string {
  if (!value) return "";
  if (isAbsolutePath(value)) return value;
  const relative = value.replace(/^[/\\]+/, "");
  return joinPath(projectRoot, relative);
}

export function toProjectRelativePath(projectRoot: string, value: string | null | undefined): string {
  if (!value) return "";
  if (!isAbsolutePath(value)) return value.replace(/\\/g, "/").replace(/^\/+/, "");
  const rootNorm = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const valueNorm = value.replace(/\\/g, "/");
  if (valueNorm.toLowerCase() === rootNorm.toLowerCase()) {
    return "";
  }
  const prefix = `${rootNorm}/`;
  if (valueNorm.toLowerCase().startsWith(prefix.toLowerCase())) {
    return valueNorm.slice(prefix.length);
  }
  return valueNorm;
}

export function toFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  let s = String(filePath).replace(/\\/g, "/");
  if (!s.startsWith("/")) {
    s = `/${s}`;
  }
  return `file://${s}`;
}
