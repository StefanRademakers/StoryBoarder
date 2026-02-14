export type MediaKind = "image" | "video";

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  kind: MediaKind;
}

export function inferMediaKind(path: string): MediaKind {
  const lower = path.toLowerCase();
  if (
    lower.endsWith(".mp4")
    || lower.endsWith(".mov")
    || lower.endsWith(".webm")
    || lower.endsWith(".mkv")
    || lower.endsWith(".avi")
    || lower.endsWith(".m4v")
  ) {
    return "video";
  }
  return "image";
}

