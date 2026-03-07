import { joinPath } from "../../utils/path";

type ShotDisplayMode = "concept" | "reference" | "still" | "clip" | "performance";

interface ShotItem {
  id: string;
  order: number;
  description: string;
  favoriteConcept?: string;
  favoriteReference?: string;
  favoriteStill?: string;
  favoriteClip?: string;
  favoritePerformance?: string;
  conceptAssets?: string[];
  referenceAssets?: string[];
  stillAssets?: string[];
  clipAssets?: string[];
  performanceAssets?: string[];
  durationSeconds?: number | null;
  angle?: string;
  shotSize?: string;
  characterFraming?: string;
  movement?: string;
  // Legacy fields kept for migration.
  framing?: string;
  action?: string;
  camera?: string;
  notes?: string;
}

interface ShotsIndex {
  shots: ShotItem[];
}

export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "avi", "m4v"] as const;

export const SHOT_MODES: ShotDisplayMode[] = ["concept", "reference", "still", "clip", "performance"];

export function normalizeShotsIndex(index: ShotsIndex): ShotsIndex {
  return {
    shots: (index.shots ?? [])
      .map((shot, idx) => {
        const conceptAssets = normalizeAssetList(shot.conceptAssets);
        const referenceAssets = normalizeAssetList(shot.referenceAssets);
        const stillAssets = normalizeAssetList(shot.stillAssets);
        const clipAssets = normalizeAssetList(shot.clipAssets);
        const performanceAssets = normalizeAssetList(shot.performanceAssets);
        const favoriteConcept = typeof shot.favoriteConcept === "string" ? shot.favoriteConcept : "";
        const favoriteReference = typeof shot.favoriteReference === "string" ? shot.favoriteReference : "";
        const favoriteStill = typeof shot.favoriteStill === "string" ? shot.favoriteStill : "";
        const favoriteClip = typeof shot.favoriteClip === "string" ? shot.favoriteClip : "";
        const favoritePerformance = typeof shot.favoritePerformance === "string" ? shot.favoritePerformance : "";
        return {
          id: shot.id,
          order: typeof shot.order === "number" ? shot.order : idx,
          description: shot.description ?? "",
          favoriteConcept: conceptAssets.includes(favoriteConcept) ? favoriteConcept : (conceptAssets[conceptAssets.length - 1] ?? ""),
          favoriteReference: referenceAssets.includes(favoriteReference) ? favoriteReference : (referenceAssets[referenceAssets.length - 1] ?? ""),
          favoriteStill: stillAssets.includes(favoriteStill) ? favoriteStill : (stillAssets[stillAssets.length - 1] ?? ""),
          favoriteClip: clipAssets.includes(favoriteClip) ? favoriteClip : (clipAssets[clipAssets.length - 1] ?? ""),
          favoritePerformance: performanceAssets.includes(favoritePerformance) ? favoritePerformance : (performanceAssets[performanceAssets.length - 1] ?? ""),
          conceptAssets,
          referenceAssets,
          stillAssets,
          clipAssets,
          performanceAssets,
          durationSeconds: typeof shot.durationSeconds === "number" && Number.isFinite(shot.durationSeconds)
            ? shot.durationSeconds
            : 2,
          angle: shot.angle ?? "",
          shotSize: shot.shotSize ?? shot.framing ?? "",
          characterFraming: shot.characterFraming ?? "",
          movement: shot.movement ?? shot.camera ?? "",
          action: shot.action ?? "",
          notes: shot.notes ?? "",
        };
      })
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  };
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  return platform.includes("mac");
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export function isWebOrDataUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(?:https?|data|blob):/i.test(trimmed);
}

export function fileExtension(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/");
  const queryIdx = normalized.indexOf("?");
  const cleaned = queryIdx >= 0 ? normalized.slice(0, queryIdx) : normalized;
  const slashIdx = cleaned.lastIndexOf("/");
  const fileName = slashIdx >= 0 ? cleaned.slice(slashIdx + 1) : cleaned;
  const dotIdx = fileName.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === fileName.length - 1) return null;
  return fileName.slice(dotIdx).toLowerCase();
}

export function isVideoExtension(ext: string): boolean {
  const normalized = ext.toLowerCase().replace(/^\./, "");
  return VIDEO_EXTENSIONS.includes(normalized as typeof VIDEO_EXTENSIONS[number]);
}

export function imageExtensionFromName(value: string): string | null {
  const ext = fileExtension(value);
  if (!ext) return null;
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return ext;
  return null;
}

export function isFileAllowedForMode(value: string, mode: ShotDisplayMode): boolean {
  const ext = fileExtension(value);
  if (!ext) return false;
  if (mode === "clip" || mode === "performance") return isVideoExtension(ext);
  return imageExtensionFromName(value) !== null;
}

export function modeFolderName(mode: ShotDisplayMode): "concept" | "reference" | "still" | "clip" | "performance" {
  return mode;
}

export function capitalizeMode(mode: ShotDisplayMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export function playbackModeLabel(mode: ShotDisplayMode): string {
  if (mode === "concept") return "Sketch";
  return capitalizeMode(mode);
}

export function getBaseName(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "").trim();
}

export function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim().replace(/\\/g, "/");
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function normalizeAssetList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
}

export function normalizeBoardRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const cleaned = entry.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= 5) break;
  }
  return out;
}

export function isImageFile(name: string): boolean {
  return imageExtensionFromName(name) !== null;
}

export function resolveShotDurationMs(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(100, Math.round(value * 1000));
  }
  return 2000;
}

export function formatDurationLabel(value: number | null | undefined): string {
  const ms = resolveShotDurationMs(value);
  return `${(ms / 1000).toFixed(2)}s`;
}

export function resolveProjectDimension(value: number | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.round(value));
  }
  return fallback;
}

export function parsePositiveInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function createWhitePng(width: number, height: number): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create 2D canvas context.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/png");
  });
  if (!blob) {
    throw new Error("Could not encode white PNG.");
  }
  return blob.arrayBuffer();
}

export async function uniqueFileName(dir: string, fileName: string): Promise<string> {
  const safe = sanitizeFileName(fileName);
  if (!safe) return `asset-${Date.now()}`;
  const extIdx = safe.lastIndexOf(".");
  const base = extIdx > 0 ? safe.slice(0, extIdx) : safe;
  const ext = extIdx > 0 ? safe.slice(extIdx) : "";
  let candidate = safe;
  let counter = 1;
  while (await window.electronAPI.exists(joinPath(dir, candidate))) {
    candidate = `${base}-${counter}${ext}`;
    counter += 1;
  }
  return candidate;
}
