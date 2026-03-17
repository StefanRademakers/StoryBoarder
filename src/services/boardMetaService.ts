import { joinPath } from "../utils/path";
import { electron } from "./electron";

const BOARD_META_FILE_NAME = ".storybuilder-board.json";
const BOARD_META_SCHEMA = "storybuilder.board-meta/v1";

interface BoardMeta {
  schema?: unknown;
  favorites?: unknown;
}

function normalizeFavoriteNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function getMetaPath(boardDir: string): string {
  return joinPath(boardDir, BOARD_META_FILE_NAME);
}

async function readBoardMeta(boardDir: string): Promise<BoardMeta> {
  const metaPath = getMetaPath(boardDir);
  const exists = await electron.exists(metaPath);
  if (!exists) {
    return {};
  }

  try {
    const raw = await electron.readText(metaPath);
    const parsed = JSON.parse(raw) as BoardMeta;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export async function loadBoardFavorites(boardDir: string): Promise<string[]> {
  const meta = await readBoardMeta(boardDir);
  return normalizeFavoriteNames(meta.favorites);
}

export async function saveBoardFavorites(boardDir: string, favorites: string[]): Promise<void> {
  const meta = await readBoardMeta(boardDir);
  const normalized = normalizeFavoriteNames(favorites);
  const payload = {
    ...meta,
    schema: BOARD_META_SCHEMA,
    favorites: normalized,
  };
  const metaPath = getMetaPath(boardDir);
  await electron.writeText(metaPath, JSON.stringify(payload, null, 2));
}
