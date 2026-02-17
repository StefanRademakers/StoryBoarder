import { electron } from "../../services/electron";
import { joinPath } from "../../utils/path";
import { fileExtension, getBaseName, isImageFile, normalizeBoardRefs, sanitizeFileName, uniqueFileName } from "./utils";
import type { CandidateTab, CandidateAsset, ScenePoolAsset, ShotDisplayMode } from "./types";

export interface SceneMetaRecord {
  id: string;
  name: string;
  order: number;
  active: boolean;
  characterPropBoards?: string[];
  moodboards?: string[];
}

export function shotsIndexPathForScene(scenesRoot: string, sceneId: string): string {
  return joinPath(joinPath(scenesRoot, sceneId), "shots.json");
}

export function shotsDirForScene(scenesRoot: string, sceneId: string): string {
  return joinPath(joinPath(scenesRoot, sceneId), "shots");
}

function candidateFolderName(tab: CandidateTab): "CandidateStills" | "CandidateClips" {
  return tab === "stills" ? "CandidateStills" : "CandidateClips";
}

export function candidateDirForScene(scenesRoot: string, sceneId: string, tab: CandidateTab): string {
  return joinPath(joinPath(scenesRoot, sceneId), candidateFolderName(tab));
}

export async function loadScenesIndex(scenesRoot: string, scenesIndexPath: string): Promise<{ scenes: SceneMetaRecord[] }> {
  await electron.ensureDir(scenesRoot);
  const exists = await electron.exists(scenesIndexPath);
  if (!exists) {
    return { scenes: [] };
  }

  try {
    const text = await electron.readText(scenesIndexPath);
    const parsed = JSON.parse(text) as { scenes?: SceneMetaRecord[] };
    return {
      scenes: (parsed.scenes ?? []).map((scene, idx) => ({
        id: scene.id,
        name: scene.name || `Scene ${String(idx + 1).padStart(2, "0")}`,
        order: typeof scene.order === "number" ? scene.order : idx,
        active: scene.active !== false,
        characterPropBoards: normalizeBoardRefs(scene.characterPropBoards),
        moodboards: normalizeBoardRefs(scene.moodboards),
      })),
    };
  } catch {
    return { scenes: [] };
  }
}

export async function readShotsForScene<TShot>(
  scenesRoot: string,
  sceneId: string,
  normalizeShotsIndex: (index: unknown) => { shots: TShot[] },
): Promise<TShot[]> {
  const shotsIndexPath = shotsIndexPathForScene(scenesRoot, sceneId);
  const exists = await electron.exists(shotsIndexPath);
  if (!exists) {
    return [];
  }
  try {
    const text = await electron.readText(shotsIndexPath);
    const parsed = JSON.parse(text) as unknown;
    return normalizeShotsIndex(parsed).shots;
  } catch {
    return [];
  }
}

export async function persistShotsIndex<TShot extends { id: string; order: number }>(
  scenesRoot: string,
  sceneId: string,
  next: { shots: TShot[] },
): Promise<void> {
  const normalized = {
    shots: [...next.shots]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((shot, idx) => ({ ...shot, order: idx })),
  };
  await electron.writeText(shotsIndexPathForScene(scenesRoot, sceneId), JSON.stringify(normalized, null, 2));
}

export async function ensureShotsIndexExists<TShot>(
  scenesRoot: string,
  sceneId: string,
  emptyIndex: { shots: TShot[] },
): Promise<boolean> {
  const scenePath = joinPath(scenesRoot, sceneId);
  await electron.ensureDir(scenePath);
  await electron.ensureDir(shotsDirForScene(scenesRoot, sceneId));

  const indexPath = shotsIndexPathForScene(scenesRoot, sceneId);
  const exists = await electron.exists(indexPath);
  if (!exists) {
    await electron.writeText(indexPath, JSON.stringify(emptyIndex, null, 2));
    return false;
  }
  return true;
}

export async function listScenePoolAssets(
  projectRoot: string,
  scene: SceneMetaRecord,
): Promise<ScenePoolAsset[]> {
  const refs: Array<{ rootFolder: "characters" | "moodboards"; boardName: string }> = [];
  for (const boardName of normalizeBoardRefs(scene.characterPropBoards)) {
    refs.push({ rootFolder: "characters", boardName });
  }
  for (const boardName of normalizeBoardRefs(scene.moodboards)) {
    refs.push({ rootFolder: "moodboards", boardName });
  }

  const rows: ScenePoolAsset[] = [];
  for (const ref of refs) {
    const boardDir = joinPath(joinPath(projectRoot, ref.rootFolder), ref.boardName);
    const exists = await electron.exists(boardDir);
    if (!exists) continue;
    const entries = await electron.listDir(boardDir);
    for (const entry of entries) {
      if (!entry.isFile) continue;
      if (!isImageFile(entry.name)) continue;
      const filePath = joinPath(boardDir, entry.name);
      const stat = await electron.stat(filePath);
      rows.push({
        name: entry.name,
        path: filePath,
        source: `${ref.rootFolder}/${ref.boardName}`,
        mtimeMs: stat?.mtimeMs ?? 0,
      });
    }
  }

  rows.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  const unique = new Map<string, ScenePoolAsset>();
  for (const row of rows) {
    if (!unique.has(row.path)) {
      unique.set(row.path, row);
    }
  }
  return Array.from(unique.values());
}

export async function listCandidateAssets(
  scenesRoot: string,
  sceneId: string,
  tab: CandidateTab,
): Promise<CandidateAsset[]> {
  const dir = candidateDirForScene(scenesRoot, sceneId, tab);
  await electron.ensureDir(dir);
  const entries = await electron.listDir(dir);
  const rows: CandidateAsset[] = [];
  for (const entry of entries) {
    if (!entry.isFile) continue;
    const path = joinPath(dir, entry.name);
    const stat = await electron.stat(path);
    rows.push({
      name: entry.name,
      path,
      mtimeMs: stat?.mtimeMs ?? 0,
    });
  }
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  return rows;
}

export async function importCandidatePaths(
  scenesRoot: string,
  sceneId: string,
  tab: CandidateTab,
  paths: string[],
): Promise<void> {
  const targetDir = candidateDirForScene(scenesRoot, sceneId, tab);
  await electron.ensureDir(targetDir);

  for (const inputPath of paths) {
    try {
      const base = getBaseName(inputPath);
      const fileName = await uniqueFileName(targetDir, base);
      const destination = joinPath(targetDir, fileName);
      await electron.copyFile(inputPath, destination);
    } catch {
      // Skip non-file entries or copy failures and continue with remaining paths.
    }
  }
}

export async function ensureShotModeDirectories(
  scenesRoot: string,
  sceneId: string,
  shotId: string,
  modeFolders: ReadonlyArray<ShotDisplayMode>,
): Promise<string> {
  const shotDir = joinPath(shotsDirForScene(scenesRoot, sceneId), shotId);
  await electron.ensureDir(shotDir);
  await Promise.all(modeFolders.map((mode) => electron.ensureDir(joinPath(shotDir, mode))));
  return shotDir;
}

export async function deleteShotDirectory(
  scenesRoot: string,
  sceneId: string,
  shotId: string,
): Promise<void> {
  const shotDir = joinPath(shotsDirForScene(scenesRoot, sceneId), shotId);
  await electron.deleteDir(shotDir);
}

export async function copyMediaIntoShotMode(
  scenesRoot: string,
  sceneId: string,
  shotId: string,
  modeFolder: ShotDisplayMode,
  paths: string[],
  isFileAllowed: (pathOrName: string) => boolean,
): Promise<string[]> {
  const shotModeDir = joinPath(joinPath(shotsDirForScene(scenesRoot, sceneId), shotId), modeFolder);
  await electron.ensureDir(shotModeDir);

  const copiedRelatives: string[] = [];
  for (const inputPath of paths) {
    const sourceExists = await electron.exists(inputPath);
    if (!sourceExists) {
      continue;
    }
    const ext = fileExtension(inputPath);
    if (!ext || !isFileAllowed(inputPath)) {
      continue;
    }
    const sourceName = sanitizeFileName(getBaseName(inputPath));
    if (!sourceName) continue;
    const uniqueName = await uniqueFileName(shotModeDir, sourceName);
    const target = joinPath(shotModeDir, uniqueName);
    await electron.copyFile(inputPath, target);
    copiedRelatives.push(`shots/${shotId}/${modeFolder}/${uniqueName}`);
  }
  return copiedRelatives;
}
