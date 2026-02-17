import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectState } from "../state/types";
import { electron } from "../services/electron";
import { joinPath, toFileUrl } from "../utils/path";
import { DropOrBrowse } from "../components/common/DropOrBrowse";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { extractPathsFromDrop, handleDragOver } from "../utils/dnd";
import { useAppState } from "../state/appState";
import { MediaContextMenu } from "../components/common/MediaContextMenu";
import { MediaLightbox } from "../components/common/MediaLightbox";
import { MediaTileGrid } from "../components/common/MediaTileGrid";
import { inferMediaKind, type MediaItem } from "../components/common/mediaTypes";
import { SegmentedControl, type SegmentedControlOption } from "../components/common/SegmentedControl";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface ShotsPageProps {
  project: ProjectState;
}

interface SceneMeta {
  id: string;
  name: string;
  order: number;
  active: boolean;
  characterPropBoards?: string[];
  moodboards?: string[];
}

interface ScenesIndex {
  scenes: SceneMeta[];
}

interface ShotItem {
  id: string;
  order: number;
  description: string;
  favoriteConcept?: string;
  favoriteReference?: string;
  favoriteStill?: string;
  favoriteClip?: string;
  conceptAssets?: string[];
  referenceAssets?: string[];
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

type ShotDisplayMode = "concept" | "reference" | "still" | "clip";
type CandidateTab = "stills" | "clips";
type PlaybackMediaKind = "video" | "image" | "placeholder";

interface ShotModeAsset {
  name: string;
  path: string;
  relative: string;
  mtimeMs: number;
  isFavorite: boolean;
}

interface ScenePoolAsset {
  name: string;
  path: string;
  source: string;
  mtimeMs: number;
}

interface CandidateAsset {
  name: string;
  path: string;
  mtimeMs: number;
}

interface PlaybackMedia {
  kind: PlaybackMediaKind;
  path: string;
  sourceMode: ShotDisplayMode | null;
}

interface InlineFullscreenAsset {
  path: string;
  name: string;
  isVideo: boolean;
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
  const { appSettings, projectFilePath } = useAppState();
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
  const [versionMenuAsset, setVersionMenuAsset] = useState<ShotModeAsset | null>(null);
  const [versionMenuPos, setVersionMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [displayMode, setDisplayMode] = useState<ShotDisplayMode>("still");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [modeAssets, setModeAssets] = useState<ShotModeAsset[]>([]);
  const [modeAssetsLoading, setModeAssetsLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [assetDeleteOpen, setAssetDeleteOpen] = useState(false);
  const [assetDeleteTarget, setAssetDeleteTarget] = useState<ShotModeAsset | null>(null);
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [inlineFullscreenAsset, setInlineFullscreenAsset] = useState<InlineFullscreenAsset | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolAssets, setPoolAssets] = useState<ScenePoolAsset[]>([]);
  const [poolPreviewIndex, setPoolPreviewIndex] = useState<number | null>(null);
  const [poolMenuAsset, setPoolMenuAsset] = useState<ScenePoolAsset | null>(null);
  const [poolMenuPos, setPoolMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidateTab, setCandidateTab] = useState<CandidateTab>("stills");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateAssets, setCandidateAssets] = useState<CandidateAsset[]>([]);
  const [candidatePreviewIndex, setCandidatePreviewIndex] = useState<number | null>(null);
  const [candidateMenuAsset, setCandidateMenuAsset] = useState<CandidateAsset | null>(null);
  const [candidateMenuPos, setCandidateMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportColumnsText, setExportColumnsText] = useState("2");
  const [exportStartIndexText, setExportStartIndexText] = useState("1");
  const [exportEndIndexText, setExportEndIndexText] = useState("1");
  const [exportResizeEnabled, setExportResizeEnabled] = useState(false);
  const [exportMaxLongestEdgeText, setExportMaxLongestEdgeText] = useState("2024");
  const [gridExportBusy, setGridExportBusy] = useState(false);
  const [gridExportMessage, setGridExportMessage] = useState<string | null>(null);
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
  const poolPreviewAsset = poolPreviewIndex === null ? null : poolAssets[poolPreviewIndex] ?? null;
  const candidatePreviewAsset = candidatePreviewIndex === null ? null : candidateAssets[candidatePreviewIndex] ?? null;
  const versionMediaItems = useMemo<Array<MediaItem & ShotModeAsset>>(
    () => modeAssets.map((asset) => ({ ...asset, id: asset.path, kind: inferMediaKind(asset.path) })),
    [modeAssets],
  );
  const poolMediaItems = useMemo<Array<MediaItem & ScenePoolAsset>>(
    () => poolAssets.map((asset) => ({ ...asset, id: asset.path, kind: "image" as const })),
    [poolAssets],
  );
  const candidateMediaItems = useMemo<Array<MediaItem & CandidateAsset>>(
    () => candidateAssets.map((asset) => ({ ...asset, id: asset.path, kind: inferMediaKind(asset.path) })),
    [candidateAssets],
  );

  const sceneDir = activeScene ? joinPath(scenesRoot, activeScene.id) : null;
  const modeOptions: Array<SegmentedControlOption<ShotDisplayMode>> = [
    {
      value: "concept",
      label: "Concept",
      icon: <img src="icons/concept.png" width={16} height={16} alt="" aria-hidden />,
    },
    {
      value: "still",
      label: "Still",
      icon: <img src="icons/still.png" width={16} height={16} alt="" aria-hidden />,
    },
    {
      value: "clip",
      label: "Clip",
      icon: <img src="icons/clip.png" width={16} height={16} alt="" aria-hidden />,
    },
    {
      value: "reference",
      label: "Reference",
      icon: <img src="icons/still.png" width={16} height={16} alt="" aria-hidden />,
    },
  ];

  const candidateTabOptions: Array<SegmentedControlOption<CandidateTab>> = [
    {
      value: "stills",
      label: "Candidate Stills",
      icon: <img src="icons/still.png" width={16} height={16} alt="" aria-hidden />,
    },
    {
      value: "clips",
      label: "Candidate Clips",
      icon: <img src="icons/clip.png" width={16} height={16} alt="" aria-hidden />,
    },
  ];

  const getFavoriteRelative = (shot: ShotItem, mode: ShotDisplayMode): string => {
    if (mode === "concept") {
      return shot.favoriteConcept ?? "";
    }
    if (mode === "reference") {
      return shot.favoriteReference ?? "";
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
    if (mode === "reference") {
      return { ...shot, favoriteReference: relative };
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
    if (mode === "reference") {
      return shot.referenceAssets ?? [];
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
    if (mode === "reference") {
      return { ...shot, referenceAssets: cleaned };
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
          characterPropBoards: normalizeBoardRefs(scene.characterPropBoards),
          moodboards: normalizeBoardRefs(scene.moodboards),
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
    setPoolOpen(false);
    setPoolPreviewIndex(null);
    setPoolAssets([]);
    setCandidatesOpen(false);
    setCandidatePreviewIndex(null);
    setCandidateAssets([]);
    closeCandidateMenu();
  }, [activeSceneId]);

  useEffect(() => {
    if (!candidatesOpen || !activeScene) return;
    void refreshCandidateAssets();
  }, [candidatesOpen, candidateTab, activeScene?.id]);

  useEffect(() => {
    if (!candidatesOpen || !activeScene) return;

    const onPaste = async (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const imageItem = Array.from(clipboardData.items).find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (candidateTab !== "stills") return;
      if (isEditableTarget(event.target)) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        const tempPath = await window.electronAPI.saveClipboardImage(buffer);
        if (!tempPath) return;
        await importCandidatePaths([tempPath]);
      } catch {
        // Ignore paste failures and keep UI responsive.
      }
    };

    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("paste", onPaste, true);
    };
  }, [candidatesOpen, activeScene?.id, candidateTab]);

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
      if (event.key === "F1") {
        event.preventDefault();
        setDisplayMode("concept");
        return;
      }

      if (event.key === "F2") {
        event.preventDefault();
        setDisplayMode("still");
        return;
      }

      if (event.key === "F3") {
        event.preventDefault();
        setDisplayMode("clip");
        return;
      }

      if (event.key === "F4") {
        event.preventDefault();
        setDisplayMode("reference");
        return;
      }

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
      favoriteReference: "",
      favoriteStill: "",
      favoriteClip: "",
      conceptAssets: [],
      referenceAssets: [],
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

  const openInlineFullscreen = (shot: ShotItem) => {
    const path = shotAssetPath(shot);
    if (!path) return;
    setPreviewIndex(null);
    setInlineFullscreenAsset({
      path,
      name: `${shot.id} ${capitalizeMode(displayMode)}`,
      isVideo: inferMediaKind(path) === "video",
    });
  };

  const loadScenePoolAssets = async (scene: SceneMeta) => {
    const refs: Array<{ rootFolder: "characters" | "moodboards"; boardName: string }> = [];
    for (const boardName of normalizeBoardRefs(scene.characterPropBoards)) {
      refs.push({ rootFolder: "characters", boardName });
    }
    for (const boardName of normalizeBoardRefs(scene.moodboards)) {
      refs.push({ rootFolder: "moodboards", boardName });
    }

    const rows: ScenePoolAsset[] = [];
    for (const ref of refs) {
      const boardDir = joinPath(joinPath(project.paths.root, ref.rootFolder), ref.boardName);
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
    setPoolAssets(Array.from(unique.values()));
  };

  const openPool = async () => {
    if (!activeScene) return;
    setPoolOpen(true);
    setPoolPreviewIndex(null);
    setPoolLoading(true);
    try {
      await loadScenePoolAssets(activeScene);
    } finally {
      setPoolLoading(false);
    }
  };

  const closePoolMenu = () => {
    setPoolMenuAsset(null);
    setPoolMenuPos(null);
  };

  const openPoolMenu = (event: React.MouseEvent, asset: ScenePoolAsset) => {
    event.preventDefault();
    event.stopPropagation();
    setPoolMenuAsset(asset);
    setPoolMenuPos({ x: event.clientX, y: event.clientY });
  };

  const candidateFolderName = (tab: CandidateTab): "CandidateStills" | "CandidateClips" => (
    tab === "stills" ? "CandidateStills" : "CandidateClips"
  );

  const candidateDirForScene = (sceneId: string, tab: CandidateTab) => (
    joinPath(joinPath(scenesRoot, sceneId), candidateFolderName(tab))
  );

  const loadCandidateAssets = async (sceneId: string, tab: CandidateTab) => {
    const dir = candidateDirForScene(sceneId, tab);
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
    setCandidateAssets(rows);
  };

  const refreshCandidateAssets = async () => {
    if (!activeScene) return;
    setCandidateLoading(true);
    try {
      await loadCandidateAssets(activeScene.id, candidateTab);
    } finally {
      setCandidateLoading(false);
    }
  };

  const importCandidatePaths = async (paths: string[]) => {
    if (!activeScene || !paths.length) return;
    const targetDir = candidateDirForScene(activeScene.id, candidateTab);
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

    await refreshCandidateAssets();
  };

  const openCandidates = async () => {
    if (!activeScene) return;
    setCandidatesOpen(true);
    setCandidatePreviewIndex(null);
    setCandidateMenuAsset(null);
    setCandidateMenuPos(null);
    await refreshCandidateAssets();
  };

  const closeCandidateMenu = () => {
    setCandidateMenuAsset(null);
    setCandidateMenuPos(null);
  };

  const openCandidateMenu = (event: React.MouseEvent, asset: CandidateAsset) => {
    event.preventDefault();
    event.stopPropagation();
    setCandidateMenuAsset(asset);
    setCandidateMenuPos({ x: event.clientX, y: event.clientY });
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

  const exportSceneGrid = async () => {
    if (!activeScene || !shots.length || gridExportBusy) return;
    if (displayMode === "clip") {
      setGridExportMessage("Export is only available in Concept, Reference, or Still mode.");
      return;
    }
    const mode: "concept" | "reference" | "still" = displayMode;

    const columnsRaw = parsePositiveInteger(exportColumnsText);
    const columns = Math.max(1, Math.min(24, columnsRaw ?? 2));
    const totalShots = shots.length;
    const startRaw = parsePositiveInteger(exportStartIndexText);
    const endRaw = parsePositiveInteger(exportEndIndexText);
    const startIndex = Math.max(1, Math.min(totalShots, startRaw ?? 1));
    const endIndex = Math.max(startIndex, Math.min(totalShots, endRaw ?? totalShots));
    const exportShots = shots.slice(startIndex - 1, endIndex);
    if (!exportShots.length) {
      setGridExportMessage("No shots in selected range.");
      return;
    }
    const maxLongestEdge = parsePositiveInteger(exportMaxLongestEdgeText) ?? 2024;
    const width = resolveProjectDimension(project.settings?.width, 1920);
    const height = resolveProjectDimension(project.settings?.height, 1080);
    const modeName = mode === "concept" ? "concept_board" : mode === "reference" ? "reference_board" : "still_board";
    const defaultName = `${modeName}_${activeScene.name.replace(/[\\/:*?"<>|]+/g, "_")}.png`;
    const pickedFile = await electron.pickSaveFile({
      title: "Save grid export",
      defaultPath: joinPath(joinPath(scenesRoot, activeScene.id), defaultName),
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!pickedFile) return;
    const items = exportShots.map((shot, idx) => {
      const absolute = shotAssetPath(shot, mode);
      const shotNumber = startIndex + idx;
      return {
        path: absolute,
        label: `SHOT ${String(shotNumber).padStart(3, "0")}`,
      };
    });

    setGridExportBusy(true);
    setGridExportMessage(null);
    try {
      const expectedOutputPath = pickedFile.toLowerCase().endsWith(".png") ? pickedFile : `${pickedFile}.png`;
      const response = await electron.runPythonCommand(
        "create_image_grid",
        {
          paths: [],
          data: {
            items,
            xTiles: columns,
            tileWidth: width,
            tileHeight: height,
            fitMode: "contain",
            padding: 24,
            addLabels: true,
            textColor: "#ffffff",
            backgroundColor: "#ffffff",
            resizeToMaxLongestEdge: exportResizeEnabled,
            maxLongestEdge,
            outputPath: pickedFile,
          },
        },
        { timeoutMs: 120000 },
      );
      if (!response.ok) {
        setGridExportMessage(`Export failed: ${response.error.message}`);
        return;
      }
      const message = typeof response.data?.message === "string"
        ? response.data.message
        : "Grid export completed.";
      setGridExportMessage(message);
      await electron.revealInFileManager(expectedOutputPath);
      setExportDialogOpen(false);
    } catch (error) {
      setGridExportMessage(`Export failed: ${toErrorMessage(error)}`);
    } finally {
      setGridExportBusy(false);
    }
  };

  const openExportDialog = () => {
    const totalShots = shots.length || 1;
    setExportColumnsText("2");
    setExportStartIndexText("1");
    setExportEndIndexText(String(totalShots));
    setExportResizeEnabled(false);
    setExportMaxLongestEdgeText("2024");
    setExportDialogOpen(true);
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

  const closeVersionMenu = () => {
    setVersionMenuAsset(null);
    setVersionMenuPos(null);
  };

  const openImageMenu = (event: React.MouseEvent, shotId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setImageMenuShotId(shotId);
    setImageMenuPos({ x: event.clientX, y: event.clientY });
  };

  const openVersionMenu = (event: React.MouseEvent, asset: ShotModeAsset) => {
    event.preventDefault();
    event.stopPropagation();
    setVersionMenuAsset(asset);
    setVersionMenuPos({ x: event.clientX, y: event.clientY });
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
      ? (["clip", "still", "reference", "concept"] as ShotDisplayMode[])
      : displayMode === "still"
        ? (["still", "reference", "concept"] as ShotDisplayMode[])
        : displayMode === "reference"
          ? (["reference", "concept"] as ShotDisplayMode[])
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
    const configuredPath = appSettings.photoshopPath.trim();
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
    closeVersionMenu();
    setAssetDeleteOpen(false);
    setAssetDeleteTarget(null);
  };

  useEscapeKey(versionsOpen, closeVersionsBrowser);
  useEscapeKey(poolOpen, () => setPoolOpen(false));
  useEscapeKey(candidatesOpen, () => setCandidatesOpen(false));
  useEscapeKey(exportDialogOpen, () => setExportDialogOpen(false));

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

  const openVersionAssetInPhotoshop = async () => {
    if (!versionMenuAsset) return;
    if (displayMode === "clip") return;
    const configuredPath = appSettings.photoshopPath.trim();
    if (!configuredPath) return;
    await electron.openWithApp(configuredPath, versionMenuAsset.path);
    closeVersionMenu();
  };

  const copyVersionAssetToClipboard = async () => {
    if (!versionMenuAsset) return;
    if (displayMode === "clip") return;
    await electron.copyImageToClipboard(versionMenuAsset.path);
    closeVersionMenu();
  };

  const revealVersionAssetInExplorer = async () => {
    if (!versionMenuAsset) return;
    await electron.revealInFileManager(versionMenuAsset.path);
    closeVersionMenu();
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
            <h1>{activeScene ? `${activeScene.name} Shots` : "Shots"}</h1>
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
                  <button
                    type="button"
                    className="pill-button"
                    onClick={(event) => {
                      if (event.ctrlKey && projectFilePath && activeScene) {
                        void electron.openScenePoolPopout({
                          projectFilePath,
                          sceneId: activeScene.id,
                          title: `${activeScene.name} - Pool`,
                        });
                        return;
                      }
                      void openPool();
                    }}
                    disabled={!activeScene}
                  >
                    Pool
                  </button>
                  <button
                    type="button"
                    className="pill-button"
                    onClick={() => {
                      void openCandidates();
                    }}
                    disabled={!activeScene}
                  >
                    Candidates
                  </button>
                  <button
                    type="button"
                    className="pill-button"
                    disabled={!shots.length || gridExportBusy}
                    onClick={openExportDialog}
                  >
                    Export
                  </button>
                </div>
                <SegmentedControl
                  className="shots-toolbar__modes"
                  ariaLabel="Shot mode"
                  options={modeOptions}
                  value={displayMode}
                  onChange={setDisplayMode}
                />
              </div>
              {gridExportMessage ? <p className="muted">{gridExportMessage}</p> : null}
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
                        <div className="shots-row__number">
                          <button
                            type="button"
                            className="shots-row__move-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void moveShot(shot.id, -1);
                            }}
                            aria-label="Move shot up"
                            title="Move up"
                          >
                            <img src="icons/up.png" alt="" aria-hidden="true" />
                          </button>
                          <span className="shots-row__number-label">{shotNumber}</span>
                          <button
                            type="button"
                            className="shots-row__move-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void moveShot(shot.id, 1);
                            }}
                            aria-label="Move shot down"
                            title="Move down"
                          >
                            <img src="icons/down.png" alt="" aria-hidden="true" />
                          </button>
                        </div>
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
                        <div className="shots-row__delete" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="shots-row__delete-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDeleteShot(shot);
                            }}
                            aria-label="Delete shot"
                            title="Delete shot"
                          >
                            <img src="icons/delete.png" alt="" aria-hidden="true" />
                          </button>
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
                                    onDoubleClick={() => openInlineFullscreen(shot)}
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
              <MediaTileGrid
                items={versionMediaItems}
                className="moodboard-grid shot-versions-grid"
                getKey={(item) => item.path}
                getTileClassName={(item) => `moodboard-tile${item.isFavorite ? " moodboard-tile--favorite" : ""}`}
                onOpen={(_item, idx) => setPreviewIndex(idx)}
                onContextMenu={(event, item) => openVersionMenu(event, item)}
                renderActions={(asset) => (
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
                )}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {poolOpen ? (
        <div className="modal-backdrop" onClick={() => setPoolOpen(false)}>
          <div className="modal shot-pool-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">
                Scene Pool
              </h3>
              <button type="button" className="pill-button" onClick={() => setPoolOpen(false)}>
                Close
              </button>
            </div>
            {poolLoading ? <p className="muted">Loading pool images...</p> : null}
            {!poolLoading && !poolAssets.length ? (
              <p className="muted">No images found in this scene's referenced Character/Props and Moodboards.</p>
            ) : null}
            {!poolLoading && poolAssets.length ? (
              <MediaTileGrid
                items={poolMediaItems}
                className="moodboard-grid shot-pool-grid"
                getKey={(item) => item.path}
                onOpen={(_item, idx) => setPoolPreviewIndex(idx)}
                onContextMenu={(event, item) => openPoolMenu(event, item)}
                renderActions={(asset) => (
                  <div className="shot-pool-grid__meta">{asset.source}</div>
                )}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {candidatesOpen ? (
        <div className="modal-backdrop" onClick={() => setCandidatesOpen(false)}>
          <div className="modal shot-pool-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Candidates</h3>
              <button type="button" className="pill-button" onClick={() => setCandidatesOpen(false)}>
                Close
              </button>
            </div>

            <SegmentedControl
              className="shot-candidates__tabs"
              ariaLabel="Candidates tab"
              options={candidateTabOptions}
              value={candidateTab}
              onChange={setCandidateTab}
            />

            <DropOrBrowse
              className="moodboard-dropzone"
              label="Drop media here or click to browse"
              enablePasteContextMenu={false}
              onPathsSelected={(paths) => {
                void importCandidatePaths(paths);
              }}
              browse={async () => {
                const picked = await window.electronAPI.pickFile({
                  title: candidateTab === "stills" ? "Select candidate still" : "Select candidate clip",
                  filters: [
                    { name: "Media", extensions: ["png", "jpg", "jpeg", "webp", ...VIDEO_EXTENSIONS] },
                  ],
                });
                return picked;
              }}
            />

            {candidateLoading ? <p className="muted">Loading candidates...</p> : null}
            {!candidateLoading && !candidateAssets.length ? (
              <p className="muted">No assets in this folder yet.</p>
            ) : null}
            {!candidateLoading && candidateAssets.length ? (
              <MediaTileGrid
                items={candidateMediaItems}
                className="moodboard-grid shot-pool-grid"
                getKey={(item) => item.path}
                onOpen={(_item, idx) => setCandidatePreviewIndex(idx)}
                onContextMenu={(event, item) => openCandidateMenu(event, item)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {exportDialogOpen ? (
        <div className="modal-backdrop">
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Export Grid</h3>
            </div>
            <div className="form-section">
              <p className="muted">
                Mode: <strong>{displayMode === "concept" ? "Concept" : displayMode === "reference" ? "Reference" : displayMode === "still" ? "Still" : "Clip (not supported)"}</strong>
              </p>
              <div className="export-grid-fields">
                <label className="form-row">
                  <span className="section-title">Columns (X)</span>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    value={exportColumnsText}
                    onChange={(event) => setExportColumnsText(event.target.value)}
                  />
                </label>
                <label className="form-row">
                  <span className="section-title">Start index:</span>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    value={exportStartIndexText}
                    onChange={(event) => setExportStartIndexText(event.target.value)}
                  />
                </label>
                <label className="form-row">
                  <span className="section-title">End index:</span>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    value={exportEndIndexText}
                    onChange={(event) => setExportEndIndexText(event.target.value)}
                  />
                </label>
              </div>
              <label className="export-grid-resize-row">
                <input
                  type="checkbox"
                  checked={exportResizeEnabled}
                  onChange={(event) => setExportResizeEnabled(event.target.checked)}
                />
                <span>Resize to max:</span>
                <input
                  className="form-input export-grid-resize-input"
                  type="text"
                  inputMode="numeric"
                  value={exportMaxLongestEdgeText}
                  onChange={(event) => setExportMaxLongestEdgeText(event.target.value)}
                  disabled={!exportResizeEnabled}
                />
                <span>(longest edge)</span>
              </label>
              <p className="muted">
                Tile size: {resolveProjectDimension(project.settings?.width, 1920)} x {resolveProjectDimension(project.settings?.height, 1080)}
              </p>
            </div>
            <div className="modal__footer">
              <button type="button" className="pill-button" onClick={() => setExportDialogOpen(false)} disabled={gridExportBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="pill-button"
                disabled={gridExportBusy}
                onClick={() => {
                  void exportSceneGrid();
                }}
              >
                {gridExportBusy ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MediaLightbox
        open={Boolean(previewAsset)}
        path={previewAsset?.path ?? null}
        isVideo={previewAsset ? inferMediaKind(previewAsset.path) === "video" : false}
        name={previewAsset?.name}
        onClose={() => setPreviewIndex(null)}
        onNext={() => {
          if (!modeAssets.length) return;
          setPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % modeAssets.length;
          });
        }}
        onPrev={() => {
          if (!modeAssets.length) return;
          setPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + modeAssets.length) % modeAssets.length;
          });
        }}
        onContextMenu={(event) => {
          if (!previewAsset) return;
          openVersionMenu(event, previewAsset);
        }}
        onCopy={() => {
          if (!previewAsset || displayMode === "clip") return;
          void electron.copyImageToClipboard(previewAsset.path);
        }}
        onReveal={() => {
          if (!previewAsset) return;
          void electron.revealInFileManager(previewAsset.path);
        }}
      />

      <MediaLightbox
        open={Boolean(poolPreviewAsset)}
        path={poolPreviewAsset?.path ?? null}
        isVideo={false}
        name={poolPreviewAsset?.name}
        meta={poolPreviewAsset?.source}
        onClose={() => setPoolPreviewIndex(null)}
        onNext={() => {
          if (!poolAssets.length) return;
          setPoolPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % poolAssets.length;
          });
        }}
        onPrev={() => {
          if (!poolAssets.length) return;
          setPoolPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + poolAssets.length) % poolAssets.length;
          });
        }}
        onCopy={() => {
          if (!poolPreviewAsset) return;
          void electron.copyImageToClipboard(poolPreviewAsset.path);
        }}
        onReveal={() => {
          if (!poolPreviewAsset) return;
          void electron.revealInFileManager(poolPreviewAsset.path);
        }}
        onContextMenu={(event) => {
          if (!poolPreviewAsset) return;
          openPoolMenu(event, poolPreviewAsset);
        }}
      />

      <MediaLightbox
        open={Boolean(candidatePreviewAsset)}
        path={candidatePreviewAsset?.path ?? null}
        isVideo={candidatePreviewAsset ? inferMediaKind(candidatePreviewAsset.path) === "video" : false}
        name={candidatePreviewAsset?.name}
        onClose={() => setCandidatePreviewIndex(null)}
        onNext={() => {
          if (!candidateAssets.length) return;
          setCandidatePreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % candidateAssets.length;
          });
        }}
        onPrev={() => {
          if (!candidateAssets.length) return;
          setCandidatePreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + candidateAssets.length) % candidateAssets.length;
          });
        }}
        onCopy={() => {
          if (!candidatePreviewAsset || inferMediaKind(candidatePreviewAsset.path) === "video") return;
          void electron.copyImageToClipboard(candidatePreviewAsset.path);
        }}
        onReveal={() => {
          if (!candidatePreviewAsset) return;
          void electron.revealInFileManager(candidatePreviewAsset.path);
        }}
        onContextMenu={(event) => {
          if (!candidatePreviewAsset) return;
          openCandidateMenu(event, candidatePreviewAsset);
        }}
      />

      <MediaLightbox
        open={Boolean(inlineFullscreenAsset)}
        path={inlineFullscreenAsset?.path ?? null}
        isVideo={inlineFullscreenAsset?.isVideo ?? false}
        name={inlineFullscreenAsset?.name}
        onClose={() => setInlineFullscreenAsset(null)}
        onCopy={() => {
          if (!inlineFullscreenAsset || inlineFullscreenAsset.isVideo) return;
          void electron.copyImageToClipboard(inlineFullscreenAsset.path);
        }}
        onReveal={() => {
          if (!inlineFullscreenAsset) return;
          void electron.revealInFileManager(inlineFullscreenAsset.path);
        }}
      />

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

      <MediaContextMenu
        open={Boolean(imageMenuPos && menuShot)}
        position={imageMenuPos}
        onClose={closeImageMenu}
        actions={[
          {
            key: "replace",
            label: displayMode === "clip"
              ? (menuShotAssetPath ? "Replace clip" : "Add clip")
              : (menuShotAssetPath ? "Replace image" : "Add image"),
            visible: Boolean(menuShot),
            onSelect: async () => {
              await replaceMenuShotAsset();
            },
          },
          {
            key: "create-empty",
            label: "Create empty image",
            visible: canCreateEmptyConcept,
            onSelect: async () => {
              await createEmptyConceptImage();
            },
          },
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: modeIsImage && Boolean(menuShotAssetPath),
            onSelect: async () => {
              await openMenuShotInPhotoshop();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: modeIsImage && Boolean(menuShotAssetPath),
            onSelect: async () => {
              await copyMenuShotToClipboard();
            },
          },
          {
            key: "reveal",
            label: isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer",
            visible: Boolean(menuShotAssetPath),
            onSelect: async () => {
              await revealMenuShotInExplorer();
            },
          },
        ]}
      />

      <MediaContextMenu
        open={Boolean(versionMenuPos && versionMenuAsset)}
        position={versionMenuPos}
        onClose={closeVersionMenu}
        actions={[
          {
            key: "set-favorite",
            label: "Set favorite",
            visible: Boolean(versionMenuAsset && !versionMenuAsset.isFavorite),
            onSelect: async () => {
              if (!versionMenuAsset) return;
              await setFavoriteForAsset(versionMenuAsset);
              closeVersionMenu();
            },
          },
          {
            key: "delete-version",
            label: "Delete version",
            visible: Boolean(versionMenuAsset),
            onSelect: async () => {
              if (!versionMenuAsset) return;
              requestDeleteAsset(versionMenuAsset);
              closeVersionMenu();
            },
          },
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: Boolean(versionMenuAsset && displayMode !== "clip"),
            onSelect: async () => {
              await openVersionAssetInPhotoshop();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(versionMenuAsset && displayMode !== "clip"),
            onSelect: async () => {
              await copyVersionAssetToClipboard();
            },
          },
          {
            key: "reveal",
            label: isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer",
            visible: Boolean(versionMenuAsset),
            onSelect: async () => {
              await revealVersionAssetInExplorer();
            },
          },
        ]}
      />

      <MediaContextMenu
        open={Boolean(poolMenuPos && poolMenuAsset)}
        position={poolMenuPos}
        onClose={closePoolMenu}
        actions={[
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: Boolean(poolMenuAsset),
            onSelect: async () => {
              if (!poolMenuAsset) return;
              const configuredPath = appSettings.photoshopPath.trim();
              if (!configuredPath) return;
              await electron.openWithApp(configuredPath, poolMenuAsset.path);
              closePoolMenu();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(poolMenuAsset),
            onSelect: async () => {
              if (!poolMenuAsset) return;
              await electron.copyImageToClipboard(poolMenuAsset.path);
              closePoolMenu();
            },
          },
          {
            key: "reveal",
            label: isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer",
            visible: Boolean(poolMenuAsset),
            onSelect: async () => {
              if (!poolMenuAsset) return;
              await electron.revealInFileManager(poolMenuAsset.path);
              closePoolMenu();
            },
          },
        ]}
      />

      <MediaContextMenu
        open={Boolean(candidateMenuPos && candidateMenuAsset)}
        position={candidateMenuPos}
        onClose={closeCandidateMenu}
        actions={[
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(candidateMenuAsset && inferMediaKind(candidateMenuAsset.path) !== "video"),
            onSelect: async () => {
              if (!candidateMenuAsset) return;
              await electron.copyImageToClipboard(candidateMenuAsset.path);
              closeCandidateMenu();
            },
          },
          {
            key: "reveal",
            label: isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer",
            visible: Boolean(candidateMenuAsset),
            onSelect: async () => {
              if (!candidateMenuAsset) return;
              await electron.revealInFileManager(candidateMenuAsset.path);
              closeCandidateMenu();
            },
          },
        ]}
      />
    </div>
  );
}

function normalizeShotsIndex(index: ShotsIndex): ShotsIndex {
  return {
    shots: (index.shots ?? [])
      .map((shot, idx) => {
        const conceptAssets = normalizeAssetList(shot.conceptAssets);
        const referenceAssets = normalizeAssetList(shot.referenceAssets);
        const stillAssets = normalizeAssetList(shot.stillAssets);
        const clipAssets = normalizeAssetList(shot.clipAssets);
        const favoriteConcept = typeof shot.favoriteConcept === "string" ? shot.favoriteConcept : "";
        const favoriteReference = typeof shot.favoriteReference === "string" ? shot.favoriteReference : "";
        const favoriteStill = typeof shot.favoriteStill === "string" ? shot.favoriteStill : "";
        const favoriteClip = typeof shot.favoriteClip === "string" ? shot.favoriteClip : "";
        return {
          id: shot.id,
          order: typeof shot.order === "number" ? shot.order : idx,
          description: shot.description ?? "",
          favoriteConcept: conceptAssets.includes(favoriteConcept) ? favoriteConcept : (conceptAssets[conceptAssets.length - 1] ?? ""),
          favoriteReference: referenceAssets.includes(favoriteReference) ? favoriteReference : (referenceAssets[referenceAssets.length - 1] ?? ""),
          favoriteStill: stillAssets.includes(favoriteStill) ? favoriteStill : (stillAssets[stillAssets.length - 1] ?? ""),
          favoriteClip: clipAssets.includes(favoriteClip) ? favoriteClip : (clipAssets[clipAssets.length - 1] ?? ""),
          conceptAssets,
          referenceAssets,
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

function modeFolderName(mode: ShotDisplayMode): "concept" | "reference" | "still" | "clip" {
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

function normalizeBoardRefs(value: unknown): string[] {
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

function isImageFile(name: string): boolean {
  return imageExtensionFromName(name) !== null;
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

function parsePositiveInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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

const SHOT_MODES: ShotDisplayMode[] = ["concept", "reference", "still", "clip"];
