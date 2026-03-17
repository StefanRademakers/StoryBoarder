import { electron } from "../../services/electron";
import { getDirectoryName, joinPath, toFileUrl } from "../../utils/path";

const THUMB_MAX_SIZE = 256;
const THUMB_QUALITY = 0.8;
const THUMB_SUFFIX = ".thumb.q80.256.jpg";

const resolvedThumbnailCache = new Map<string, string | null>();
const inflightThumbnailCache = new Map<string, Promise<string | null>>();
let thumbnailQueue: Promise<void> = Promise.resolve();

interface ThumbnailVersion {
  sourceMtimeMs: number;
  thumbnailMtimeMs: number;
}

const thumbnailVersionCache = new Map<string, ThumbnailVersion | null>();

function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

export function getImageThumbnailPath(sourcePath: string): string {
  const directory = getDirectoryName(sourcePath);
  const cacheDirectory = joinPath(directory, ".cache");
  return joinPath(cacheDirectory, `${getFileName(sourcePath)}${THUMB_SUFFIX}`);
}

async function loadImage(path: string): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${path}`));
    image.src = toFileUrl(path);
  });
}

async function renderThumbnailBuffer(sourcePath: string): Promise<ArrayBuffer> {
  const image = await loadImage(sourcePath);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error(`Invalid image dimensions for ${sourcePath}`);
  }

  const scale = Math.min(1, THUMB_MAX_SIZE / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to acquire thumbnail canvas context");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error(`Failed to encode thumbnail for ${sourcePath}`));
      },
      "image/jpeg",
      THUMB_QUALITY,
    );
  });

  return await blob.arrayBuffer();
}

async function generateThumbnail(sourcePath: string, thumbnailPath: string): Promise<void> {
  const sourceStat = await electron.stat(sourcePath);
  if (!sourceStat?.isFile) {
    throw new Error(`Source file missing for thumbnail: ${sourcePath}`);
  }

  const thumbnailStat = await electron.stat(thumbnailPath);
  if (thumbnailStat?.isFile && thumbnailStat.mtimeMs >= sourceStat.mtimeMs) {
    return;
  }

  const thumbnailBuffer = await renderThumbnailBuffer(sourcePath);
  await electron.ensureDir(getDirectoryName(thumbnailPath));
  await electron.writeBinary(thumbnailPath, thumbnailBuffer);
}

export async function ensureImageThumbnail(sourcePath: string): Promise<string | null> {
  const thumbnailPath = getImageThumbnailPath(sourcePath);
  const [sourceStat, thumbnailStat] = await Promise.all([
    electron.stat(sourcePath),
    electron.stat(thumbnailPath),
  ]);

  if (!sourceStat?.isFile) {
    resolvedThumbnailCache.set(sourcePath, null);
    thumbnailVersionCache.set(sourcePath, null);
    return null;
  }

  const sourceMtimeMs = sourceStat.mtimeMs ?? 0;
  const thumbnailMtimeMs = thumbnailStat?.isFile ? thumbnailStat.mtimeMs ?? 0 : 0;
  const cachedPath = resolvedThumbnailCache.get(sourcePath);
  const cachedVersion = thumbnailVersionCache.get(sourcePath);
  const thumbnailFresh = Boolean(thumbnailStat?.isFile) && thumbnailMtimeMs >= sourceMtimeMs;

  if (
    cachedPath !== undefined
    && cachedVersion
    && cachedVersion.sourceMtimeMs === sourceMtimeMs
    && cachedVersion.thumbnailMtimeMs === thumbnailMtimeMs
  ) {
    return cachedPath;
  }

  if (thumbnailFresh) {
    resolvedThumbnailCache.set(sourcePath, thumbnailPath);
    thumbnailVersionCache.set(sourcePath, {
      sourceMtimeMs,
      thumbnailMtimeMs,
    });
    return thumbnailPath;
  }

  const inflight = inflightThumbnailCache.get(sourcePath);
  if (inflight) {
    return await inflight;
  }

  const promise = (async () => {
    try {
      thumbnailQueue = thumbnailQueue
        .catch(() => undefined)
        .then(async () => {
          await generateThumbnail(sourcePath, thumbnailPath);
        });
      await thumbnailQueue;
      const regeneratedThumbnailStat = await electron.stat(thumbnailPath);
      const regeneratedThumbnailMtimeMs = regeneratedThumbnailStat?.isFile ? regeneratedThumbnailStat.mtimeMs ?? Date.now() : Date.now();
      resolvedThumbnailCache.set(sourcePath, thumbnailPath);
      thumbnailVersionCache.set(sourcePath, {
        sourceMtimeMs,
        thumbnailMtimeMs: regeneratedThumbnailMtimeMs,
      });
      return thumbnailPath;
    } catch {
      resolvedThumbnailCache.set(sourcePath, null);
      thumbnailVersionCache.set(sourcePath, null);
      return null;
    } finally {
      inflightThumbnailCache.delete(sourcePath);
    }
  })();

  inflightThumbnailCache.set(sourcePath, promise);
  return await promise;
}
