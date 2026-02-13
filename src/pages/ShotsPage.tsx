import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectState } from "../state/types";
import { electron } from "../services/electron";
import { joinPath, toFileUrl } from "../utils/path";
import { DropOrBrowse } from "../components/common/DropOrBrowse";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { extractPathsFromDrop, handleDragOver } from "../utils/dnd";

interface ShotsPageProps {
  project: ProjectState;
}

interface SceneMeta {
  id: string;
  name: string;
  order: number;
  active: boolean;
}

interface ScenesIndex {
  scenes: SceneMeta[];
}

interface ShotItem {
  id: string;
  order: number;
  description: string;
  favoriteConcept?: string;
  favoriteStill?: string;
  favoriteClip?: string;
  conceptAssets?: string[];
  stillAssets?: string[];
  clipAssets?: string[];
  durationSeconds?: number | null;
  framing?: string;
  action?: string;
  camera?: string;
}

interface ShotsIndex {
  shots: ShotItem[];
}

type ShotDisplayMode = "concept" | "still" | "clip";
type PlaybackMediaKind = "video" | "image" | "placeholder";

interface ShotModeAsset {
  name: string;
  path: string;
  relative: string;
  mtimeMs: number;
  isFavorite: boolean;
}

interface PlaybackMedia {
  kind: PlaybackMediaKind;
  path: string;
  sourceMode: ShotDisplayMode | null;
}

const EMPTY_SCENES: ScenesIndex = { scenes: [] };
const EMPTY_SHOTS: ShotsIndex = { shots: [] };
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "avi", "m4v"] as const;
const VersionsIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
    <path
      d="M5 6.5h11a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 18.5H5A1.5 1.5 0 0 1 3.5 17V8A1.5 1.5 0 0 1 5 6.5Zm3-3h11A1.5 1.5 0 0 1 20.5 5v9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function ShotsPage({ project }: ShotsPageProps) {
  const scenesRoot = joinPath(project.paths.root, "scenes");
  const scenesIndexPath = joinPath(scenesRoot, "scenes.json");

  const [scenesIndex, setScenesIndex] = useState<ScenesIndex>(EMPTY_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [shotsIndex, setShotsIndex] = useState<ShotsIndex>(EMPTY_SHOTS);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ShotItem | null>(null);
  const [imageMenuShotId, setImageMenuShotId] = useState<string | null>(null);
  const [imageMenuPos, setImageMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [displayMode, setDisplayMode] = useState<ShotDisplayMode>("still");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [modeAssets, setModeAssets] = useState<ShotModeAsset[]>([]);
  const [modeAssetsLoading, setModeAssetsLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [assetDeleteOpen, setAssetDeleteOpen] = useState(false);
  const [assetDeleteTarget, setAssetDeleteTarget] = useState<ShotModeAsset | null>(null);
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shotItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scenesRef = useRef<SceneMeta[]>([]);
  const shotsRef = useRef<ShotItem[]>([]);
  const activeSceneIdRef = useRef<string | null>(null);
  const activeShotIdRef = useRef<string | null>(null);
  const displayModeRef = useRef<ShotDisplayMode>("still");
  const assetsSeqRef = useRef(0);
  const navigatingRef = useRef(false);

  const scenes = useMemo(
    () => [...(scenesIndex.scenes ?? [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [scenesIndex],
  );

  const activeScene = useMemo(() => scenes.find((s) => s.id === activeSceneId) ?? null, [scenes, activeSceneId]);

  const shots = useMemo(
    () => [...shotsIndex.shots].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [shotsIndex],
  );

  const activeShot = useMemo(() => shots.find((s) => s.id === activeShotId) ?? null, [shots, activeShotId]);
  const playbackShot = playbackOpen ? shots[playbackIndex] ?? null : null;
  const previewAsset = previewIndex === null ? null : modeAssets[previewIndex] ?? null;

  const sceneDir = activeScene ? joinPath(scenesRoot, activeScene.id) : null;

  const getFavoriteRelative = (shot: ShotItem, mode: ShotDisplayMode): string => {
    if (mode === "concept") {
      return shot.favoriteConcept ?? "";
    }
    if (mode === "clip") {
      return shot.favoriteClip ?? "";
    }
    return shot.favoriteStill ?? "";
  };

  const withFavoriteRelative = (shot: ShotItem, mode: ShotDisplayMode, relative: string): ShotItem => {
    if (mode === "concept") {
      return { ...shot, favoriteConcept: relative };
    }
    if (mode === "clip") {
      return { ...shot, favoriteClip: relative };
    }
    return { ...shot, favoriteStill: relative };
  };

  const getModeAssets = (shot: ShotItem, mode: ShotDisplayMode): string[] => {
    if (mode === "concept") {
      return shot.conceptAssets ?? [];
    }
    if (mode === "clip") {
      return shot.clipAssets ?? [];
    }
    return shot.stillAssets ?? [];
  };

  const getPlayableRelative = (shot: ShotItem, mode: ShotDisplayMode): string => {
    const favorite = getFavoriteRelative(shot, mode).replace(/\\/g, "/").trim();
    if (favorite && isFileAllowedForMode(favorite, mode)) {
      return favorite;
    }

    const assets = getModeAssets(shot, mode);
    for (let idx = assets.length - 1; idx >= 0; idx -= 1) {
      const candidate = assets[idx].replace(/\\/g, "/").trim();
      if (candidate && isFileAllowedForMode(candidate, mode)) {
        return candidate;
      }
    }

    return "";
  };

  const withModeAssets = (shot: ShotItem, mode: ShotDisplayMode, assets: string[]): ShotItem => {
    const cleaned = uniqueStrings(assets);
    if (mode === "concept") {
      return { ...shot, conceptAssets: cleaned };
    }
    if (mode === "clip") {
      return { ...shot, clipAssets: cleaned };
    }
    return { ...shot, stillAssets: cleaned };
  };

  const listModeAssets = async (
    sceneId: string,
    shot: ShotItem,
    mode: ShotDisplayMode,
  ): Promise<ShotModeAsset[]> => {
    const modeDir = joinPath(joinPath(shotsDirForScene(sceneId), shot.id), modeFolderName(mode));
    await electron.ensureDir(modeDir);
    const expectedPrefix = `shots/${shot.id}/${modeFolderName(mode)}/`;
    const rows: ShotModeAsset[] = [];
    const favorite = getFavoriteRelative(shot, mode);
    const rels = getModeAssets(shot, mode);
    for (const relative of rels) {
      const normalizedRelative = relative.replace(/\\/g, "/");
      if (!normalizedRelative.toLowerCase().startsWith(expectedPrefix.toLowerCase())) {
        continue;
      }
      if (!isFileAllowedForMode(normalizedRelative, mode)) {
        continue;
      }
      const absolute = joinPath(joinPath(scenesRoot, sceneId), normalizedRelative);
      const exists = await electron.exists(absolute);
      if (!exists) {
        continue;
      }
      const stat = await electron.stat(absolute);
      rows.push({
        name: getBaseName(normalizedRelative),
        path: absolute,
        relative: normalizedRelative,
        mtimeMs: stat?.mtimeMs ?? 0,
        isFavorite: normalizedRelative === favorite,
      });
    }
    rows.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
    return rows;
  };

  const cleanMediaStateForScene = async (sceneId: string, sourceShots: ShotItem[]): Promise<{ shots: ShotItem[]; changed: boolean }> => {
    let changed = false;
    const cleanedShots: ShotItem[] = [];

    for (const shot of sourceShots) {
      let nextShot = { ...shot };
      for (const mode of SHOT_MODES) {
        const expectedPrefix = `shots/${shot.id}/${modeFolderName(mode)}/`;
        const currentAssets = getModeAssets(nextShot, mode);
        const validAssets: string[] = [];
        for (const relative of currentAssets) {
          const normalizedRelative = relative.replace(/\\/g, "/");
          if (!normalizedRelative.toLowerCase().startsWith(expectedPrefix.toLowerCase())) {
            changed = true;
            continue;
          }
          if (!isFileAllowedForMode(normalizedRelative, mode)) {
            changed = true;
            continue;
          }
          const absolute = joinPath(joinPath(scenesRoot, sceneId), normalizedRelative);
          const exists = await electron.exists(absolute);
          if (!exists) {
            changed = true;
            continue;
          }
          validAssets.push(normalizedRelative);
        }
        const uniqueAssets = uniqueStrings(validAssets);
        if (uniqueAssets.length !== currentAssets.length) {
          changed = true;
        }
        nextShot = withModeAssets(nextShot, mode, uniqueAssets);

        const currentFavorite = getFavoriteRelative(nextShot, mode).replace(/\\/g, "/");
        const hasFavorite = currentFavorite ? uniqueAssets.includes(currentFavorite) : false;
        const fallback = uniqueAssets[uniqueAssets.length - 1] ?? "";
        const resolved = hasFavorite ? currentFavorite : fallback;
        if (resolved !== currentFavorite) {
          changed = true;
          nextShot = withFavoriteRelative(nextShot, mode, resolved);
        }
      }
      cleanedShots.push(nextShot);
    }

    return { shots: cleanedShots, changed };
  };

  useEffect(() => () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const loadScenes = async () => {
    await electron.ensureDir(scenesRoot);
    const exists = await electron.exists(scenesIndexPath);
    if (!exists) {
      setScenesIndex(EMPTY_SCENES);
      setActiveSceneId(null);
      return;
    }

    try {
      const text = await electron.readText(scenesIndexPath);
      const parsed = JSON.parse(text) as ScenesIndex;
      const normalized: ScenesIndex = {
        scenes: (parsed.scenes ?? []).map((scene, idx) => ({
          id: scene.id,
          name: scene.name || `Scene ${String(idx + 1).padStart(2, "0")}`,
          order: typeof scene.order === "number" ? scene.order : idx,
          active: scene.active !== false,
        })),
      };
      setScenesIndex(normalized);
      setActiveSceneId((prev) => {
        if (prev && normalized.scenes.some((scene) => scene.id === prev)) return prev;
        return normalized.scenes[0]?.id ?? null;
      });
    } catch {
      setScenesIndex(EMPTY_SCENES);
      setActiveSceneId(null);
    }
  };

  const shotsIndexPathForScene = (sceneId: string) => joinPath(joinPath(scenesRoot, sceneId), "shots.json");

  const shotsDirForScene = (sceneId: string) => joinPath(joinPath(scenesRoot, sceneId), "shots");

  const readShotsForScene = async (sceneId: string): Promise<ShotItem[]> => {
    const shotsIndexPath = shotsIndexPathForScene(sceneId);
    const exists = await electron.exists(shotsIndexPath);
    if (!exists) {
      return [];
    }
    try {
      const text = await electron.readText(shotsIndexPath);
      const parsed = JSON.parse(text) as ShotsIndex;
      return normalizeShotsIndex(parsed).shots;
    } catch {
      return [];
    }
  };

  const persistShotsIndex = async (sceneId: string, next: ShotsIndex) => {
    const normalized: ShotsIndex = {
      shots: [...next.shots]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((shot, idx) => ({ ...shot, order: idx })),
    };
    await electron.writeText(shotsIndexPathForScene(sceneId), JSON.stringify(normalized, null, 2));
  };

  const loadShots = async (sceneId: string | null) => {
    if (!sceneId) {
      setShotsIndex(EMPTY_SHOTS);
      setActiveShotId(null);
      return;
    }

    const scenePath = joinPath(scenesRoot, sceneId);
    await electron.ensureDir(scenePath);
    await electron.ensureDir(shotsDirForScene(sceneId));

    const shotsIndexPath = shotsIndexPathForScene(sceneId);
    const exists = await electron.exists(shotsIndexPath);
    if (!exists) {
      await electron.writeText(shotsIndexPath, JSON.stringify(EMPTY_SHOTS, null, 2));
      setShotsIndex(EMPTY_SHOTS);
      setActiveShotId(null);
      return;
    }

    try {
      const text = await electron.readText(shotsIndexPath);
      const parsed = JSON.parse(text) as ShotsIndex;
      const normalized = normalizeShotsIndex(parsed);
      const repaired = await cleanMediaStateForScene(sceneId, normalized.shots);
      const nextIndex: ShotsIndex = { shots: repaired.shots };
      setShotsIndex(nextIndex);
      setActiveShotId((prev) => {
        if (prev && nextIndex.shots.some((shot) => shot.id === prev)) return prev;
        return nextIndex.shots[0]?.id ?? null;
      });
      if (repaired.changed) {
        await persistShotsIndex(sceneId, nextIndex);
      }
    } catch {
      setShotsIndex(EMPTY_SHOTS);
      setActiveShotId(null);
    }
  };

  const saveShotsState = async (next: ShotsIndex, options?: { immediate?: boolean }) => {
    setShotsIndex(next);
    if (!activeSceneId) return;
    if (options?.immediate) {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      await persistShotsIndex(activeSceneId, next);
      return;
    }
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistShotsIndex(activeSceneId, next);
    }, 350);
  };

  useEffect(() => {
    void loadScenes();
  }, [project.paths.root]);

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  useEffect(() => {
    activeSceneIdRef.current = activeSceneId;
  }, [activeSceneId]);

  useEffect(() => {
    activeShotIdRef.current = activeShotId;
  }, [activeShotId]);

  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);

  useEffect(() => {
    setImageMenuShotId(null);
    setImageMenuPos(null);
  }, [displayMode]);

  useEffect(() => {
    void loadShots(activeSceneId);
  }, [activeSceneId]);

  useEffect(() => {
    if (!activeShotId) return;

    let rafA = 0;
    let rafB = 0;

    const centerActiveShot = () => {
      const node = shotItemRefs.current[activeShotId];
      if (!node) return;
      node.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    };

    // Run twice to handle post-render height changes (inline editor expansion).
    rafA = window.requestAnimationFrame(() => {
      centerActiveShot();
      rafB = window.requestAnimationFrame(() => {
        centerActiveShot();
      });
    });

    return () => {
      if (rafA) window.cancelAnimationFrame(rafA);
      if (rafB) window.cancelAnimationFrame(rafB);
    };
  }, [activeShotId]);

  const navigateShotTimeline = async (direction: -1 | 1) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    try {
      const orderedScenes = scenesRef.current;
      if (!orderedScenes.length) return;

      const currentSceneId = activeSceneIdRef.current ?? orderedScenes[0]?.id ?? null;
      if (!currentSceneId) return;

      let currentSceneIdx = orderedScenes.findIndex((scene) => scene.id === currentSceneId);
      if (currentSceneIdx < 0) currentSceneIdx = 0;

      const currentScene = orderedScenes[currentSceneIdx];
      const currentShotList = currentScene.id === activeSceneIdRef.current
        ? shotsRef.current
        : await readShotsForScene(currentScene.id);

      const currentShotId = activeShotIdRef.current;
      const currentShotIdx = currentShotList.findIndex((shot) => shot.id === currentShotId);

      if (direction > 0) {
        if (currentShotList.length && currentShotIdx >= 0 && currentShotIdx < currentShotList.length - 1) {
          setActiveShotId(currentShotList[currentShotIdx + 1].id);
          return;
        }
        if (currentShotList.length && currentShotIdx < 0) {
          setActiveShotId(currentShotList[0].id);
          return;
        }

        for (let idx = currentSceneIdx + 1; idx < orderedScenes.length; idx += 1) {
          const scene = orderedScenes[idx];
          const sceneShots = await readShotsForScene(scene.id);
          if (!sceneShots.length) continue;
          setActiveShotId(sceneShots[0].id);
          setActiveSceneId(scene.id);
          return;
        }
        return;
      }

      if (currentShotList.length && currentShotIdx > 0) {
        setActiveShotId(currentShotList[currentShotIdx - 1].id);
        return;
      }
      if (currentShotList.length && currentShotIdx < 0) {
        setActiveShotId(currentShotList[currentShotList.length - 1].id);
        return;
      }

      for (let idx = currentSceneIdx - 1; idx >= 0; idx -= 1) {
        const scene = orderedScenes[idx];
        const sceneShots = await readShotsForScene(scene.id);
        if (!sceneShots.length) continue;
        setActiveShotId(sceneShots[sceneShots.length - 1].id);
        setActiveSceneId(scene.id);
        return;
      }
    } finally {
      navigatingRef.current = false;
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        void navigateShotTimeline(1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        void navigateShotTimeline(-1);
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        void createShot({ afterSelected: true });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scenesRoot]);

  const createShot = async (options?: { afterSelected?: boolean }) => {
    const sceneId = activeSceneIdRef.current;
    if (!sceneId) return;
    const id = `shot-${Date.now()}`;
    const shot: ShotItem = {
      id,
      order: 0,
      description: "",
      favoriteConcept: "",
      favoriteStill: "",
      favoriteClip: "",
      conceptAssets: [],
      stillAssets: [],
      clipAssets: [],
      durationSeconds: 2,
      framing: "",
      action: "",
      camera: "",
    };

    const ordered = [...shotsRef.current];
    let insertAt = ordered.length;
    if (options?.afterSelected) {
      const selectedId = activeShotIdRef.current;
      if (selectedId) {
        const selectedIdx = ordered.findIndex((item) => item.id === selectedId);
        if (selectedIdx >= 0) {
          insertAt = selectedIdx + 1;
        }
      }
    }
    ordered.splice(insertAt, 0, shot);

    const next: ShotsIndex = {
      shots: ordered.map((item, order) => ({ ...item, order })),
    };

    const shotDir = joinPath(shotsDirForScene(sceneId), id);
    await electron.ensureDir(shotDir);
    await Promise.all(
      SHOT_MODES.map((mode) => electron.ensureDir(joinPath(shotDir, modeFolderName(mode)))),
    );

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    shotsRef.current = next.shots;
    setShotsIndex(next);
    activeShotIdRef.current = id;
    setActiveShotId(id);
    await persistShotsIndex(sceneId, next);
  };

  const moveShot = async (shotId: string, direction: -1 | 1) => {
    const sorted = [...shots];
    const idx = sorted.findIndex((shot) => shot.id === shotId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const temp = sorted[idx];
    sorted[idx] = sorted[targetIdx];
    sorted[targetIdx] = temp;
    const reordered: ShotsIndex = {
      shots: sorted.map((shot, order) => ({ ...shot, order })),
    };
    await saveShotsState(reordered, { immediate: true });
  };

  const requestDeleteShot = (shot: ShotItem) => {
    setConfirmTarget(shot);
    setConfirmOpen(true);
  };

  const confirmDeleteShot = async () => {
    if (!confirmTarget || !activeSceneId) return;
    const next: ShotsIndex = {
      shots: shotsIndex.shots.filter((shot) => shot.id !== confirmTarget.id),
    };
    const shotDir = joinPath(shotsDirForScene(activeSceneId), confirmTarget.id);
    await electron.deleteDir(shotDir);
    await saveShotsState(next, { immediate: true });
    setActiveShotId((prev) => (prev === confirmTarget.id ? next.shots[0]?.id ?? null : prev));
    setConfirmOpen(false);
    setConfirmTarget(null);
  };

  const updateDescription = async (shotId: string, description: string) => {
    const next: ShotsIndex = {
      shots: shotsIndex.shots.map((shot) => (shot.id === shotId ? { ...shot, description } : shot)),
    };
    await saveShotsState(next);
  };

  const updateShot = async (shotId: string, updater: (shot: ShotItem) => ShotItem) => {
    const next: ShotsIndex = {
      shots: shotsIndex.shots.map((shot) => (shot.id === shotId ? updater(shot) : shot)),
    };
    await saveShotsState(next);
  };

  const updateShotMedia = async (
    paths: string[],
    options?: { shotId?: string; mode?: ShotDisplayMode },
  ) => {
    const sceneId = activeSceneIdRef.current;
    const shotId = options?.shotId ?? activeShotIdRef.current;
    const mode = options?.mode ?? displayModeRef.current;
    if (!sceneId || !shotId || !paths.length) return;
    const shotModeDir = joinPath(joinPath(shotsDirForScene(sceneId), shotId), modeFolderName(mode));
    await electron.ensureDir(shotModeDir);

    const accepted = paths.filter((input) => {
      if (isWebOrDataUrl(input)) return false;
      return true;
    });
    if (!accepted.length) return;

    const copiedRelatives: string[] = [];
    for (const input of accepted) {
      const sourceExists = await electron.exists(input);
      if (!sourceExists) {
        continue;
      }
      const ext = fileExtension(input);
      if (!ext || !isFileAllowedForMode(input, mode)) {
        continue;
      }
      const sourceName = sanitizeFileName(getBaseName(input));
      if (!sourceName) continue;
      const uniqueName = await uniqueFileName(shotModeDir, sourceName);
      const target = joinPath(shotModeDir, uniqueName);
      await electron.copyFile(input, target);
      copiedRelatives.push(`shots/${shotId}/${modeFolderName(mode)}/${uniqueName}`);
    }
    if (!copiedRelatives.length) return;

    const newestRelative = copiedRelatives[copiedRelatives.length - 1];
    const next: ShotsIndex = {
      shots: shotsIndex.shots.map((shot) => {
        if (shot.id !== shotId) return shot;
        const mergedAssets = uniqueStrings([...getModeAssets(shot, mode), ...copiedRelatives]);
        const withAssets = withModeAssets(shot, mode, mergedAssets);
        return withFavoriteRelative(withAssets, mode, newestRelative);
      }),
    };
    await saveShotsState(next, { immediate: true });
    if (versionsOpen && activeShotIdRef.current === shotId && displayModeRef.current === mode) {
      const shot = next.shots.find((item) => item.id === shotId);
      if (shot) {
        const seq = ++assetsSeqRef.current;
        setModeAssetsLoading(true);
        const loaded = await listModeAssets(sceneId, shot, mode);
        if (seq === assetsSeqRef.current) {
          setModeAssets(loaded);
          setModeAssetsLoading(false);
        }
      }
    }
  };

  const browseShotMedia = async (options?: { shotId?: string; mode?: ShotDisplayMode }) => {
    const mode = options?.mode ?? displayModeRef.current;
    const picked = await window.electronAPI.pickFile({
      title: mode === "clip" ? "Select shot clip" : "Select shot image",
      filters: mode === "clip"
        ? [{ name: "Videos", extensions: [...VIDEO_EXTENSIONS] }]
        : [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (picked) {
      await updateShotMedia([picked], options);
    }
  };

  const closePlayback = () => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setPlaybackOpen(false);
    setPlaybackIndex(0);
  };

  const openPlayback = () => {
    if (!shots.length) return;
    setPreviewIndex(null);
    setVersionsOpen(false);
    setImageMenuShotId(null);
    setImageMenuPos(null);
    setAssetDeleteOpen(false);
    setAssetDeleteTarget(null);
    setPlaybackIndex(0);
    setPlaybackOpen(true);
  };

  const stepPlayback = (direction: -1 | 1) => {
    setPlaybackIndex((current) => {
      if (direction > 0) {
        if (current >= shots.length - 1) {
          closePlayback();
          return current;
        }
        return current + 1;
      }
      return Math.max(0, current - 1);
    });
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!activeSceneIdRef.current || !activeShotIdRef.current) return;
      if (displayModeRef.current === "clip") return;
      if (isEditableTarget(event.target)) return;
      if (!event.clipboardData) return;

      const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const imageFile = imageItem.getAsFile();
      if (!imageFile) return;

      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        try {
          const buffer = await imageFile.arrayBuffer();
          const tempPath = await window.electronAPI.saveClipboardImage(buffer);
          if (!tempPath) return;
          await updateShotMedia([tempPath], { mode: displayModeRef.current });
        } catch (error) {
          console.error("Failed to paste shot media from clipboard:", error);
        }
      })();
    };

    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [updateShotMedia]);

  useEffect(() => {
    if (!playbackOpen) {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }

    if (!shots.length) {
      closePlayback();
      return;
    }

    if (playbackIndex >= shots.length) {
      setPlaybackIndex(shots.length - 1);
      return;
    }

    const currentShot = shots[playbackIndex];
    if (!currentShot) return;

    setActiveShotId(currentShot.id);
    const useVideoEnded = displayMode === "clip" && !!getPlayableRelative(currentShot, "clip");
    if (!useVideoEnded) {
      const durationMs = resolveShotDurationMs(currentShot.durationSeconds);
      playbackTimerRef.current = setTimeout(() => {
        if (playbackIndex >= shots.length - 1) {
          closePlayback();
          return;
        }
        setPlaybackIndex((current) => current + 1);
      }, durationMs);
    }

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [playbackOpen, playbackIndex, shots, displayMode]);

  useEffect(() => {
    if (!playbackOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePlayback();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepPlayback(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepPlayback(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playbackOpen, shots.length]);

  const closeImageMenu = () => {
    setImageMenuShotId(null);
    setImageMenuPos(null);
  };

  const openImageMenu = (event: React.MouseEvent, shotId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setImageMenuShotId(shotId);
    setImageMenuPos({ x: event.clientX, y: event.clientY });
  };

  const shotAssetPath = (shot: ShotItem, mode: ShotDisplayMode = displayMode): string => {
    if (!sceneDir) return "";
    const relative = getPlayableRelative(shot, mode);
    if (!relative) return "";
    return joinPath(sceneDir, relative);
  };
  const playbackMedia: PlaybackMedia = useMemo(() => {
    if (!playbackShot) {
      return { kind: "placeholder", path: "", sourceMode: null };
    }

    const modeOrder = displayMode === "clip"
      ? (["clip", "still", "concept"] as ShotDisplayMode[])
      : displayMode === "still"
        ? (["still", "concept"] as ShotDisplayMode[])
        : (["concept"] as ShotDisplayMode[]);

    for (const mode of modeOrder) {
      const path = shotAssetPath(playbackShot, mode);
      if (!path) continue;
      return {
        kind: mode === "clip" ? "video" : "image",
        path,
        sourceMode: mode,
      };
    }

    return { kind: "placeholder", path: "", sourceMode: null };
  }, [playbackShot, displayMode, sceneDir]);

  const menuShot = shots.find((shot) => shot.id === imageMenuShotId) ?? null;
  const menuShotAssetPath = menuShot ? shotAssetPath(menuShot) : "";
  const modeIsImage = displayMode !== "clip";
  const canCreateEmptyConcept = displayMode === "concept" && !!menuShot;

  const replaceMenuShotAsset = async () => {
    if (!menuShot) return;
    setActiveShotId(menuShot.id);
    await browseShotMedia({ shotId: menuShot.id });
    closeImageMenu();
  };

  const createEmptyConceptImage = async () => {
    if (!menuShot) return;
    const sceneId = activeSceneIdRef.current;
    if (!sceneId) return;

    const shotId = menuShot.id;
    const width = resolveProjectDimension(project.settings?.width, 1920);
    const height = resolveProjectDimension(project.settings?.height, 1080);
    const conceptDir = joinPath(joinPath(shotsDirForScene(sceneId), shotId), modeFolderName("concept"));
    await electron.ensureDir(conceptDir);

    const fileName = await uniqueFileName(conceptDir, `empty_${width}x${height}.png`);
    const targetPath = joinPath(conceptDir, fileName);
    const pngData = await createWhitePng(width, height);
    await electron.writeBinary(targetPath, pngData);

    const relative = `shots/${shotId}/concept/${fileName}`;
    const next: ShotsIndex = {
      shots: shotsIndex.shots.map((shot) => {
        if (shot.id !== shotId) return shot;
        const merged = uniqueStrings([...getModeAssets(shot, "concept"), relative]);
        const withAssets = withModeAssets(shot, "concept", merged);
        return withFavoriteRelative(withAssets, "concept", relative);
      }),
    };

    setActiveShotId(shotId);
    await saveShotsState(next, { immediate: true });
    closeImageMenu();
  };

  const openMenuShotInPhotoshop = async () => {
    if (!modeIsImage || !menuShotAssetPath) return;
    const configuredPath = project.settings?.photoshopPath?.trim() ?? "";
    if (!configuredPath) return;
    await electron.openWithApp(configuredPath, menuShotAssetPath);
    closeImageMenu();
  };

  const copyMenuShotToClipboard = async () => {
    if (!modeIsImage || !menuShotAssetPath) return;
    await electron.copyImageToClipboard(menuShotAssetPath);
    closeImageMenu();
  };

  const revealMenuShotInExplorer = async () => {
    if (!menuShotAssetPath) return;
    await electron.revealInFileManager(menuShotAssetPath);
    closeImageMenu();
  };

  const openVersionsBrowser = (shotId: string) => {
    setActiveShotId(shotId);
    setPreviewIndex(null);
    setVersionsOpen(true);
  };

  const closeVersionsBrowser = () => {
    setVersionsOpen(false);
    setPreviewIndex(null);
    setAssetDeleteOpen(false);
    setAssetDeleteTarget(null);
  };

  const setFavoriteForAsset = async (asset: ShotModeAsset) => {
    if (!activeShotId || !activeSceneId) return;
    const next: ShotsIndex = {
      shots: shotsIndex.shots.map((shot) => {
        if (shot.id !== activeShotId) return shot;
        return withFavoriteRelative(shot, displayMode, asset.relative);
      }),
    };
    await saveShotsState(next, { immediate: true });
    setModeAssets((current) => current.map((entry) => ({ ...entry, isFavorite: entry.relative === asset.relative })));
  };

  const requestDeleteAsset = (asset: ShotModeAsset) => {
    setAssetDeleteTarget(asset);
    setAssetDeleteOpen(true);
  };

  const confirmDeleteAsset = async () => {
    if (!assetDeleteTarget || !activeSceneId) return;
    const activeId = activeShotIdRef.current;
    if (!activeId) return;

    const next: ShotsIndex = {
      shots: shotsIndex.shots.map((shot) => {
        if (shot.id !== activeId) return shot;
        const nextAssets = getModeAssets(shot, displayModeRef.current).filter(
          (relative) => relative !== assetDeleteTarget.relative,
        );
        const withAssets = withModeAssets(shot, displayModeRef.current, nextAssets);
        const currentFavorite = getFavoriteRelative(withAssets, displayModeRef.current);
        if (currentFavorite !== assetDeleteTarget.relative) {
          return withAssets;
        }
        const fallback = nextAssets[nextAssets.length - 1] ?? "";
        return withFavoriteRelative(withAssets, displayModeRef.current, fallback);
      }),
    };

    const stillReferenced = next.shots.some((shot) =>
      SHOT_MODES.some((mode) => getModeAssets(shot, mode).includes(assetDeleteTarget.relative)),
    );
    if (!stillReferenced) {
      await electron.deleteFile(assetDeleteTarget.path);
    }

    await saveShotsState(next, { immediate: true });
    const currentShot = next.shots.find((shot) => shot.id === activeId);
    if (currentShot) {
      const seq = ++assetsSeqRef.current;
      setModeAssetsLoading(true);
      const loaded = await listModeAssets(activeSceneId, currentShot, displayModeRef.current);
      if (seq === assetsSeqRef.current) {
        setModeAssets(loaded);
        setModeAssetsLoading(false);
      }
      if (!loaded.length) {
        setPreviewIndex(null);
      } else if (previewIndex !== null) {
        setPreviewIndex((prev) => {
          if (prev === null) return null;
          return Math.min(prev, loaded.length - 1);
        });
      }
    }
    setAssetDeleteOpen(false);
    setAssetDeleteTarget(null);
  };

  useEffect(() => {
    if (!versionsOpen || !activeSceneId || !activeShot) {
      setModeAssets([]);
      setModeAssetsLoading(false);
      return;
    }
    const seq = ++assetsSeqRef.current;
    setModeAssetsLoading(true);
    setPreviewIndex(null);
    void (async () => {
      const loaded = await listModeAssets(activeSceneId, activeShot, displayMode);
      if (seq !== assetsSeqRef.current) return;
      setModeAssets(loaded);
      setModeAssetsLoading(false);
    })();
  }, [versionsOpen, activeSceneId, activeShot?.id, displayMode, shotsIndex.shots]);

  useEffect(() => {
    if (!previewAsset) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewIndex(null);
        return;
      }
      if (event.key === "ArrowRight") {
        setPreviewIndex((prev) => {
          if (prev === null) return prev;
          return (prev + 1) % modeAssets.length;
        });
        return;
      }
      if (event.key === "ArrowLeft") {
        setPreviewIndex((prev) => {
          if (prev === null) return prev;
          return (prev - 1 + modeAssets.length) % modeAssets.length;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewAsset, modeAssets.length]);

  return (
    <div className="page project-page project-page--with-sidebar">
      <div className="sidebar-nav moodboards-sidebar">
        <div className="sidebar-nav__items">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`sidebar-nav__button${scene.id === activeSceneId ? " sidebar-nav__button--active" : ""}`}
              onClick={() => setActiveSceneId(scene.id)}
            >
              {scene.name}
            </button>
          ))}
        </div>
      </div>

      <div className="project-page__content">
        <header className="page-header">
          <div>
            <h1>Shots</h1>
            <p className="page-subtitle">
              {activeScene ? `Shots for ${activeScene.name}` : "Select a scene first."}
            </p>
          </div>
        </header>

        {!activeScene ? (
          <section className="panel">
            <p className="muted">No scenes found. Create scenes first in the Scenes page.</p>
          </section>
        ) : (
          <>
            <section className="panel shots-toolbar">
              <div className="shots-toolbar__row">
                <div className="shots-toolbar__actions">
                  <button type="button" className="pill-button" onClick={() => void createShot({ afterSelected: true })}>New shot</button>
                  <button type="button" className="pill-button" onClick={openPlayback} disabled={!shots.length}>Play</button>
                </div>
                <div className="shots-toolbar__modes">
                  <button
                    type="button"
                    className={displayMode === "concept" ? "pill-button shots-mode-button shots-mode-button--active" : "pill-button shots-mode-button"}
                    onClick={() => setDisplayMode("concept")}
                  >
                    <img src="icons/concept.png" width={16} height={16} alt="" aria-hidden />
                    Concept
                  </button>
                  <button
                    type="button"
                    className={displayMode === "still" ? "pill-button shots-mode-button shots-mode-button--active" : "pill-button shots-mode-button"}
                    onClick={() => setDisplayMode("still")}
                  >
                    <img src="icons/still.png" width={16} height={16} alt="" aria-hidden />
                    Still
                  </button>
                  <button
                    type="button"
                    className={displayMode === "clip" ? "pill-button shots-mode-button shots-mode-button--active" : "pill-button shots-mode-button"}
                    onClick={() => setDisplayMode("clip")}
                  >
                    <img src="icons/clip.png" width={16} height={16} alt="" aria-hidden />
                    Clip
                  </button>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="shots-list">
                {shots.map((shot, idx) => {
                  const preview = (shot.description || "").replace(/\s+/g, " ").trim();
                  const assetAbsolute = shotAssetPath(shot);
                  const isActive = shot.id === activeShotId;
                  const shotNumber = String(idx + 1).padStart(2, "0");
                  return (
                    <div
                      key={shot.id}
                      className="shots-item"
                      ref={(element) => {
                        shotItemRefs.current[shot.id] = element;
                      }}
                    >
                      <button
                        type="button"
                        className={`shots-row${isActive ? " shots-row--active" : ""}`}
                        onClick={() => setActiveShotId(shot.id)}
                      >
                        <div className="shots-row__number">{shotNumber}</div>
                        <div className="shots-row__image">
                          {assetAbsolute ? (
                            displayMode === "clip" ? (
                              <video src={toFileUrl(assetAbsolute)} muted playsInline preload="metadata" />
                            ) : (
                              <img src={toFileUrl(assetAbsolute)} alt="" />
                            )
                          ) : (
                            <span className="muted">{displayMode === "clip" ? "Clip" : "Image"}</span>
                          )}
                        </div>
                        <div className="shots-row__text">
                          {preview || <span className="muted">Start of the description text...</span>}
                        </div>
                        <div className="shots-row__actions" onClick={(event) => event.stopPropagation()}>
                          <button type="button" className="pill-button" onClick={() => setActiveShotId(shot.id)}>Edit</button>
                          <button type="button" className="pill-button" onClick={() => void moveShot(shot.id, -1)}>Up</button>
                          <button type="button" className="pill-button" onClick={() => void moveShot(shot.id, 1)}>Down</button>
                          <button type="button" className="pill-button" onClick={() => requestDeleteShot(shot)}>Delete</button>
                        </div>
                      </button>

                      {isActive ? (
                        <div className="shots-inline-editor">
                          <div className="shot-editor">
                            <div className="shot-editor__image">
                              <div className="shot-editor__media-shell">
                                {assetAbsolute ? (
                                  <div
                                    className="shot-editor__image-preview"
                                    onContextMenu={(event) => openImageMenu(event, shot.id)}
                                    onDragOver={handleDragOver}
                                    onDrop={async (event) => {
                                      const paths = await extractPathsFromDrop(event);
                                      if (!paths.length) return;
                                      setActiveShotId(shot.id);
                                      await updateShotMedia(paths, { shotId: shot.id });
                                    }}
                                  >
                                    {displayMode === "clip" ? (
                                      <video src={toFileUrl(assetAbsolute)} controls preload="metadata" />
                                    ) : (
                                      <img src={toFileUrl(assetAbsolute)} alt="Shot" />
                                    )}
                                  </div>
                                ) : (
                                  <DropOrBrowse
                                    label={displayMode === "clip" ? "Drop clip here or click to browse" : "Drop image here or click to browse"}
                                    className="moodboard-dropzone"
                                    onContextMenu={(event) => openImageMenu(event, shot.id)}
                                    enablePasteContextMenu={false}
                                    onPathsSelected={(paths) => void updateShotMedia(paths, { shotId: shot.id })}
                                    browse={async () => {
                                      await browseShotMedia({ shotId: shot.id });
                                      return null;
                                    }}
                                  />
                                )}
                                <button
                                  type="button"
                                  className="shot-editor__versions-button"
                                  title={`Browse ${displayMode} versions`}
                                  onClick={() => openVersionsBrowser(shot.id)}
                                >
                                  {VersionsIcon}
                                  <span className="sr-only">Browse versions</span>
                                </button>
                              </div>
                            </div>

                            <div className="shot-editor__properties">
                              <div className="shot-editor__meta">
                                <label className="form-row">
                                  <span className="section-title">Duration (seconds)</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="form-input"
                                    value={shot.durationSeconds ?? ""}
                                    onChange={(event) => {
                                      const raw = event.target.value.trim();
                                      const parsed = raw === "" ? null : Number.parseFloat(raw);
                                      if (raw !== "" && Number.isNaN(parsed)) {
                                        return;
                                      }
                                      void updateShot(shot.id, (prev) => ({ ...prev, durationSeconds: parsed }));
                                    }}
                                    placeholder="e.g. 2.50"
                                  />
                                </label>
                                <label className="form-row">
                                  <span className="section-title">Framing</span>
                                  <input
                                    className="form-input"
                                    value={shot.framing ?? ""}
                                    onChange={(event) => {
                                      void updateShot(shot.id, (prev) => ({ ...prev, framing: event.target.value }));
                                    }}
                                    placeholder="e.g. CU / MS / WS"
                                  />
                                </label>
                              </div>

                              <label className="form-row">
                                <span className="section-title">Description</span>
                                <textarea
                                  rows={4}
                                  className="form-input shot-editor__textarea"
                                  value={shot.description}
                                  onChange={(event) => {
                                    void updateDescription(shot.id, event.target.value);
                                  }}
                                  placeholder="Describe the shot..."
                                />
                              </label>

                              <label className="form-row">
                                <span className="section-title">Action</span>
                                <textarea
                                  rows={2}
                                  className="form-input shot-editor__textarea shot-editor__textarea--small"
                                  value={shot.action ?? ""}
                                  onChange={(event) => {
                                    void updateShot(shot.id, (prev) => ({ ...prev, action: event.target.value }));
                                  }}
                                  placeholder="Action in the shot..."
                                />
                              </label>

                              <label className="form-row">
                                <span className="section-title">Camera</span>
                                <textarea
                                  rows={2}
                                  className="form-input shot-editor__textarea shot-editor__textarea--small"
                                  value={shot.camera ?? ""}
                                  onChange={(event) => {
                                    void updateShot(shot.id, (prev) => ({ ...prev, camera: event.target.value }));
                                  }}
                                  placeholder="Camera movement/behavior..."
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {shots.length ? <div className="shots-list__tail-space" aria-hidden /> : null}
                {!shots.length ? <p className="muted">No shots yet.</p> : null}
              </div>
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Shot"
        message="Are you sure you want to delete this shot?"
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmTarget(null);
        }}
        onConfirm={() => void confirmDeleteShot()}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />

      {versionsOpen ? (
        <div className="modal-backdrop" onClick={closeVersionsBrowser}>
          <div className="modal shot-versions-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">
                {capitalizeMode(displayMode)} Versions
              </h3>
              <button type="button" className="pill-button" onClick={closeVersionsBrowser}>
                Close
              </button>
            </div>
            {modeAssetsLoading ? <p className="muted">Loading versions...</p> : null}
            {!modeAssetsLoading && !modeAssets.length ? <p className="muted">No versions yet in this mode.</p> : null}
            {!modeAssetsLoading && modeAssets.length ? (
              <div className="moodboard-grid shot-versions-grid">
                {modeAssets.map((asset, idx) => (
                  <button
                    key={asset.path}
                    type="button"
                    className={`moodboard-tile${asset.isFavorite ? " moodboard-tile--favorite" : ""}`}
                    onClick={() => setPreviewIndex(idx)}
                  >
                    <div className="moodboard-tile__img">
                      {displayMode === "clip" ? (
                        <video src={toFileUrl(asset.path)} muted playsInline preload="metadata" />
                      ) : (
                        <img src={toFileUrl(asset.path)} alt="" />
                      )}
                    </div>
                    <div className="moodboard-tile__label">{asset.name}</div>
                    <div className="shot-versions-grid__actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className={`shot-versions-grid__icon-button${asset.isFavorite ? " shot-versions-grid__icon-button--active" : ""}`}
                        disabled={asset.isFavorite}
                        onClick={() => void setFavoriteForAsset(asset)}
                        aria-label={asset.isFavorite ? "Favorite (active)" : "Set favorite"}
                        title={asset.isFavorite ? "Favorite" : "Set favorite"}
                      >
                        <img
                          src={asset.isFavorite ? "icons/favorite_active.png" : "icons/favorite_not_active.png"}
                          alt=""
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        className="shot-versions-grid__icon-button"
                        onClick={() => requestDeleteAsset(asset)}
                        aria-label="Delete version"
                        title="Delete version"
                      >
                        <img src="icons/delete.png" alt="" aria-hidden />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {previewAsset ? (
        <div className="moodboard-preview" onClick={() => setPreviewIndex(null)}>
          <div className="moodboard-preview__inner" onClick={(event) => event.stopPropagation()}>
            {displayMode === "clip" ? (
              <video src={toFileUrl(previewAsset.path)} controls autoPlay preload="metadata" />
            ) : (
              <img src={toFileUrl(previewAsset.path)} alt="" />
            )}
            <div className="moodboard-preview__name">
              {previewAsset.name}
            </div>
          </div>
        </div>
      ) : null}

      {playbackOpen && playbackShot ? (
        <div className="shots-playback" onClick={closePlayback}>
          <div className="shots-playback__inner" onClick={(event) => event.stopPropagation()}>
            <div className="shots-playback__header">
              <div className="shots-playback__title">
                <strong>
                  {String(playbackIndex + 1).padStart(2, "0")} / {String(shots.length).padStart(2, "0")}
                </strong>
                <span>{activeScene ? `Scene: ${activeScene.name}` : "Scene preview"}</span>
              </div>
              <div className="shots-playback__actions">
                <button type="button" className="pill-button" onClick={() => stepPlayback(-1)} disabled={playbackIndex <= 0}>
                  Prev
                </button>
                <button type="button" className="pill-button" onClick={() => stepPlayback(1)}>
                  Next
                </button>
                <button type="button" className="pill-button" onClick={closePlayback}>
                  Close
                </button>
              </div>
            </div>

            <div className="shots-playback__media">
              {playbackMedia.kind === "video" ? (
                <video
                  key={playbackMedia.path}
                  src={toFileUrl(playbackMedia.path)}
                  autoPlay
                  muted
                  playsInline
                  onEnded={() => stepPlayback(1)}
                  onError={() => stepPlayback(1)}
                />
              ) : playbackMedia.kind === "image" ? (
                <img src={toFileUrl(playbackMedia.path)} alt={playbackShot.description || "Shot preview"} />
              ) : (
                <div className="shots-playback__empty shots-playback__empty--numbered">
                  <div className="shots-playback__empty-number">{String(playbackIndex + 1).padStart(2, "0")}</div>
                  <div className="shots-playback__empty-label">Shot</div>
                </div>
              )}
            </div>

            <div className="shots-playback__meta">
              <div className="shots-playback__duration">
                Source: {playbackMedia.sourceMode ? playbackModeLabel(playbackMedia.sourceMode) : "Placeholder"}
              </div>
              <div className="shots-playback__duration">Duration: {formatDurationLabel(playbackShot.durationSeconds)}</div>
              <div className="shots-playback__description">{playbackShot.description || "No shot description."}</div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={assetDeleteOpen}
        title="Delete Version"
        message="Delete this version file?"
        onCancel={() => {
          setAssetDeleteOpen(false);
          setAssetDeleteTarget(null);
        }}
        onConfirm={() => void confirmDeleteAsset()}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />

      {imageMenuPos && menuShot ? (
        <div className="context-menu-backdrop" onClick={closeImageMenu}>
          <div
            className="context-menu"
            style={{ top: imageMenuPos.y, left: imageMenuPos.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="context-menu__item" onClick={() => void replaceMenuShotAsset()}>
              {displayMode === "clip"
                ? (menuShotAssetPath ? "Replace clip" : "Add clip")
                : (menuShotAssetPath ? "Replace image" : "Add image")}
            </button>
            {canCreateEmptyConcept ? (
              <button type="button" className="context-menu__item" onClick={() => void createEmptyConceptImage()}>
                Create empty image
              </button>
            ) : null}
            {modeIsImage && menuShotAssetPath ? (
              <button type="button" className="context-menu__item" onClick={() => void openMenuShotInPhotoshop()}>
                Open in Photoshop
              </button>
            ) : null}
            {modeIsImage && menuShotAssetPath ? (
              <button type="button" className="context-menu__item" onClick={() => void copyMenuShotToClipboard()}>
                Copy to Clipboard
              </button>
            ) : null}
            {menuShotAssetPath ? (
              <button type="button" className="context-menu__item" onClick={() => void revealMenuShotInExplorer()}>
                {isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeShotsIndex(index: ShotsIndex): ShotsIndex {
  return {
    shots: (index.shots ?? [])
      .map((shot, idx) => {
        const conceptAssets = normalizeAssetList(shot.conceptAssets);
        const stillAssets = normalizeAssetList(shot.stillAssets);
        const clipAssets = normalizeAssetList(shot.clipAssets);
        const favoriteConcept = typeof shot.favoriteConcept === "string" ? shot.favoriteConcept : "";
        const favoriteStill = typeof shot.favoriteStill === "string" ? shot.favoriteStill : "";
        const favoriteClip = typeof shot.favoriteClip === "string" ? shot.favoriteClip : "";
        return {
          id: shot.id,
          order: typeof shot.order === "number" ? shot.order : idx,
          description: shot.description ?? "",
          favoriteConcept: conceptAssets.includes(favoriteConcept) ? favoriteConcept : (conceptAssets[conceptAssets.length - 1] ?? ""),
          favoriteStill: stillAssets.includes(favoriteStill) ? favoriteStill : (stillAssets[stillAssets.length - 1] ?? ""),
          favoriteClip: clipAssets.includes(favoriteClip) ? favoriteClip : (clipAssets[clipAssets.length - 1] ?? ""),
          conceptAssets,
          stillAssets,
          clipAssets,
          durationSeconds: typeof shot.durationSeconds === "number" && Number.isFinite(shot.durationSeconds)
            ? shot.durationSeconds
            : 2,
          framing: shot.framing ?? "",
          action: shot.action ?? "",
          camera: shot.camera ?? "",
        };
      })
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  };
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  return platform.includes("mac");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function isWebOrDataUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(?:https?|data|blob):/i.test(trimmed);
}

function fileExtension(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/");
  const queryIdx = normalized.indexOf("?");
  const cleaned = queryIdx >= 0 ? normalized.slice(0, queryIdx) : normalized;
  const slashIdx = cleaned.lastIndexOf("/");
  const fileName = slashIdx >= 0 ? cleaned.slice(slashIdx + 1) : cleaned;
  const dotIdx = fileName.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === fileName.length - 1) return null;
  return fileName.slice(dotIdx).toLowerCase();
}

function isVideoExtension(ext: string): boolean {
  const normalized = ext.toLowerCase().replace(/^\./, "");
  return VIDEO_EXTENSIONS.includes(normalized as typeof VIDEO_EXTENSIONS[number]);
}

function imageExtensionFromName(value: string): string | null {
  const ext = fileExtension(value);
  if (!ext) return null;
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return ext;
  return null;
}

function isFileAllowedForMode(value: string, mode: ShotDisplayMode): boolean {
  const ext = fileExtension(value);
  if (!ext) return false;
  if (mode === "clip") return isVideoExtension(ext);
  return imageExtensionFromName(value) !== null;
}

function modeFolderName(mode: ShotDisplayMode): "concept" | "still" | "clip" {
  return mode;
}

function capitalizeMode(mode: ShotDisplayMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function playbackModeLabel(mode: ShotDisplayMode): string {
  if (mode === "concept") return "Sketch";
  return capitalizeMode(mode);
}

function getBaseName(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "").trim();
}

function uniqueStrings(values: string[]): string[] {
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

function normalizeAssetList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
}

function resolveShotDurationMs(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(100, Math.round(value * 1000));
  }
  return 2000;
}

function formatDurationLabel(value: number | null | undefined): string {
  const ms = resolveShotDurationMs(value);
  return `${(ms / 1000).toFixed(2)}s`;
}

function resolveProjectDimension(value: number | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.round(value));
  }
  return fallback;
}

async function createWhitePng(width: number, height: number): Promise<ArrayBuffer> {
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

async function uniqueFileName(dir: string, fileName: string): Promise<string> {
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

const SHOT_MODES: ShotDisplayMode[] = ["concept", "still", "clip"];
