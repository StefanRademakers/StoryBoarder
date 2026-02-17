import type { DragEvent } from "react";
import { joinPath } from "./path";

export async function extractPathsFromDrop(event: DragEvent<HTMLElement>): Promise<string[]> {
  event.preventDefault();
  event.stopPropagation();

  const items = new Set<string>();
  const webCandidates = new Set<string>();
  const inMemoryFiles: File[] = [];
  const { dataTransfer } = event;
  if (!dataTransfer) return [];

  if (dataTransfer.files?.length) {
    Array.from(dataTransfer.files).forEach((file) => {
      const withPath = file as File & { path?: string };
      if (withPath.path) {
        items.add(withPath.path);
      } else {
        inMemoryFiles.push(file);
      }
    });
  }

  const plain = dataTransfer.getData("text/plain");
  if (plain) {
    const trimmed = plain.trim();
    if (trimmed) {
      items.add(trimmed);
      if (isWebLike(trimmed)) webCandidates.add(trimmed);
    }
  }

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        items.add(line);
        if (isWebLike(line)) webCandidates.add(line);
      });
  }

  const html = dataTransfer.getData("text/html");
  if (html) {
    extractUrlsFromHtml(html).forEach((url) => webCandidates.add(url));
  }

  const localCandidates = filterLocalCandidates(Array.from(items));
  const normalizedLocal = await normalizeLocalCandidates(localCandidates);

  const droppedTemp = await Promise.all(inMemoryFiles.map((file) => saveDroppedFileToTemp(file)));
  const hasDirectPayload = localCandidates.length > 0 || inMemoryFiles.length > 0;
  const downloadedTemp = hasDirectPayload
    ? []
    : await Promise.all(Array.from(webCandidates).map((url) => downloadRemoteToTemp(url)));

  const combined = [
    ...normalizedLocal,
    ...droppedTemp.filter((value): value is string => Boolean(value)),
    ...downloadedTemp.filter((value): value is string => Boolean(value)),
  ];

  if (!combined.length) return [];
  return unique(combined);
}

export function handleDragOver(event: DragEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

async function normalizeLocalCandidates(localCandidates: string[]): Promise<string[]> {
  if (!localCandidates.length) return [];
  try {
    return await window.electronAPI.normalizePaths(localCandidates);
  } catch (error) {
    console.error("Failed to normalize dropped paths", error);
    return localCandidates;
  }
}

async function saveDroppedFileToTemp(file: File): Promise<string | null> {
  const ext = extensionFromName(file.name) || extensionFromMime(file.type) || ".bin";
  try {
    const target = await makeTempDropPath(ext);
    const buffer = await file.arrayBuffer();
    await window.electronAPI.writeBinary(target, buffer);
    return target;
  } catch (error) {
    console.error("Failed to save dropped in-memory file", error);
    return null;
  }
}

async function downloadRemoteToTemp(url: string): Promise<string | null> {
  if (!isWebLike(url)) return null;
  if (url.startsWith("blob:")) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") && !blob.type.startsWith("video/")) {
      return null;
    }
    const ext = extensionFromUrl(url) || extensionFromMime(blob.type) || ".bin";
    const target = await makeTempDropPath(ext);
    const buffer = await blob.arrayBuffer();
    await window.electronAPI.writeBinary(target, buffer);
    return target;
  } catch (error) {
    console.error("Failed to download dropped URL", error);
    return null;
  }
}

function extractUrlsFromHtml(html: string): string[] {
  const out = new Set<string>();
  const re = /\bsrc\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const candidate = match[1]?.trim();
    if (candidate && isWebLike(candidate)) {
      out.add(candidate);
    }
  }
  return Array.from(out);
}

function extensionFromName(name: string): string | null {
  const trimmed = String(name ?? "").trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return null;
  const ext = trimmed.slice(lastDot).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return null;
  return ext;
}

function extensionFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return extensionFromName(parsed.pathname);
  } catch {
    return null;
  }
}

function extensionFromMime(mime: string): string | null {
  const lower = String(mime ?? "").toLowerCase();
  if (lower === "image/png") return ".png";
  if (lower === "image/jpeg") return ".jpg";
  if (lower === "image/webp") return ".webp";
  if (lower === "image/gif") return ".gif";
  if (lower === "video/mp4") return ".mp4";
  if (lower === "video/webm") return ".webm";
  if (lower === "video/quicktime") return ".mov";
  return null;
}

async function makeTempDropPath(ext: string): Promise<string> {
  const userData = await window.electronAPI.getPath("userData");
  const dir = joinPath(userData, "dnd-imports");
  await window.electronAPI.ensureDir(dir);
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return joinPath(dir, `drop_${suffix}${ext}`);
}

function filterLocalCandidates(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(?:https?|data|blob):/i.test(item));
}

function isWebLike(value: string): boolean {
  return /^(?:https?|data|blob):/i.test(value.trim());
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
