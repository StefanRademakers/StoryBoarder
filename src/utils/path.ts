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

export function toFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  let s = String(filePath).replace(/\\/g, "/");
  if (!s.startsWith("/")) {
    s = `/${s}`;
  }
  return `file://${s}`;
}