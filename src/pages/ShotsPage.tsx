import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectState } from "../state/types";
import { electron } from "../services/electron";
import { joinPath } from "../utils/path";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { useAppState } from "../state/appState";
import { inferMediaKind, type MediaItem } from "../components/common/mediaTypes";
import type { SegmentedControlOption } from "../components/common/SegmentedControl";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { CandidatesModal } from "./shots/CandidatesModal";
import { ExportGridDialog } from "./shots/ExportGridDialog";
import { HtmlExportDialog } from "./shots/HtmlExportDialog";
import { ScenePoolModal } from "./shots/ScenePoolModal";
import { ShotsContextMenus } from "./shots/ShotsContextMenus";
import { ShotsLightboxes } from "./shots/ShotsLightboxes";
import { ShotsList } from "./shots/ShotsList";
import { ShotsPlaybackOverlay } from "./shots/ShotsPlaybackOverlay";
import { ShotsToolbar } from "./shots/ShotsToolbar";
import { ShotVersionsModal } from "./shots/ShotVersionsModal";
import {
  copyMediaIntoShotMode,
  ensureShotsIndexExists,
  importCandidatePaths as importCandidatePathsToRepo,
  listCandidateAssets,
  listScenePoolAssets,
  loadScenesIndex,
  persistShotsIndex,
  readShotsForScene,
  shotsDirForScene,
} from "./shots/shotsRepository";
import type { CandidateAsset, CandidateTab, InlineFullscreenAsset, ScenePoolAsset, ShotDisplayMode, ShotModeAsset } from "./shots/types";
import { useShotsCrud } from "./shots/useShotsCrud";
import { useShotPlayback } from "./shots/useShotPlayback";
import { useShotsExport } from "./shots/useShotsExport";
import {
  VIDEO_EXTENSIONS,
  SHOT_MODES,
  capitalizeMode,
  createWhitePng,
  fileExtension,
  getBaseName,
  imageExtensionFromName,
  isEditableTarget,
  isFileAllowedForMode,
  isMacPlatform,
  isVideoExtension,
  isWebOrDataUrl,
  modeFolderName,
  normalizeShotsIndex,
  resolveProjectDimension,
  uniqueFileName,
  uniqueStrings,
} from "./shots/utils";

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
  action?: string;
  notes?: string;
}

interface ShotsIndex {
  shots: ShotItem[];
}

const EMPTY_SCENES: ScenesIndex = { scenes: [] };
const EMPTY_SHOTS: ShotsIndex = { shots: [] };
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
  const [assetRefreshTokens, setAssetRefreshTokens] = useState<Record<string, number>>({});
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const previewAsset = previewIndex === null ? null : modeAssets[previewIndex] ?? null;
  const poolPreviewAsset = poolPreviewIndex === null ? null : poolAssets[poolPreviewIndex] ?? null;
  const candidatePreviewAsset = candidatePreviewIndex === null ? null : candidateAssets[candidatePreviewIndex] ?? null;
  const versionMediaItems = useMemo<Array<MediaItem & ShotModeAsset>>(
    () => modeAssets.map((asset) => ({ ...asset, id: asset.path, kind: inferMediaKind(asset.path) })),
    [modeAssets],
  );
  const poolMediaItems = useMemo<Array<MediaItem & ScenePoolAsset>>(
    () => poolAssets.map((asset) => ({ ...asset, id: asset.path, kind: inferMediaKind(asset.path) })),
    [poolAssets],
  );
  const candidateMediaItems = useMemo<Array<MediaItem & CandidateAsset>>(
    () => candidateAssets.map((asset) => ({ ...asset, id: asset.path, kind: inferMediaKind(asset.path) })),
    [candidateAssets],
  );

  const sceneDir = activeScene ? joinPath(scenesRoot, activeScene.id) : null;
  const projectWidth = resolveProjectDimension(project.settings?.width, 1920);
  const projectHeight = resolveProjectDimension(project.settings?.height, 1080);
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
      value: "performance",
      label: "Performance",
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
    if (mode === "performance") {
      return shot.favoritePerformance ?? "";
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
    if (mode === "performance") {
      return { ...shot, favoritePerformance: relative };
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
    if (mode === "performance") {
      return shot.performanceAssets ?? [];
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
    if (mode === "performance") {
      return { ...shot, performanceAssets: cleaned };
    }
    return { ...shot, stillAssets: cleaned };
  };

  const normalizeUnknownShots = (index: unknown) => normalizeShotsIndex(index as ShotsIndex);

  const listModeAssets = async (
    sceneId: string,
    shot: ShotItem,
    mode: ShotDisplayMode,
  ): Promise<ShotModeAsset[]> => {
    const modeDir = joinPath(joinPath(shotsDirForScene(scenesRoot, sceneId), shot.id), modeFolderName(mode));
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
  }, []);

  const loadScenes = async () => {
    const normalized = await loadScenesIndex(scenesRoot, scenesIndexPath);
    if (!normalized.scenes.length) {
      setScenesIndex(EMPTY_SCENES);
      setActiveSceneId(null);
      return;
    }
    setScenesIndex(normalized);
    setActiveSceneId((prev) => {
      if (prev && normalized.scenes.some((scene) => scene.id === prev)) return prev;
      return normalized.scenes[0]?.id ?? null;
    });
  };

  const loadShots = async (sceneId: string | null) => {
    if (!sceneId) {
      setShotsIndex(EMPTY_SHOTS);
      setActiveShotId(null);
      return;
    }

    const exists = await ensureShotsIndexExists(scenesRoot, sceneId, EMPTY_SHOTS);
    if (!exists) {
      setShotsIndex(EMPTY_SHOTS);
      setActiveShotId(null);
      return;
    }

    try {
      const normalized = {
        shots: await readShotsForScene(scenesRoot, sceneId, normalizeUnknownShots),
      };
      const repaired = await cleanMediaStateForScene(sceneId, normalized.shots);
      const nextIndex: ShotsIndex = { shots: repaired.shots };
      setShotsIndex(nextIndex);
      setActiveShotId((prev) => {
        if (prev && nextIndex.shots.some((shot) => shot.id === prev)) return prev;
        return nextIndex.shots[0]?.id ?? null;
      });
      if (repaired.changed) {
        await persistShotsIndex(scenesRoot, sceneId, nextIndex);
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
      await persistShotsIndex(scenesRoot, activeSceneId, next);
      return;
    }
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistShotsIndex(scenesRoot, activeSceneId, next);
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
        : await readShotsForScene(scenesRoot, currentScene.id, normalizeUnknownShots);

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
          const sceneShots = await readShotsForScene(scenesRoot, scene.id, normalizeUnknownShots);
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
        const sceneShots = await readShotsForScene(scenesRoot, scene.id, normalizeUnknownShots);
        if (!sceneShots.length) continue;
        setActiveShotId(sceneShots[sceneShots.length - 1].id);
        setActiveSceneId(scene.id);
        return;
      }
    } finally {
      navigatingRef.current = false;
    }
  };

  const createShot = async (options?: { afterSelected?: boolean }) => {
    await createShotCrud(() => ({
      id: `shot-${Date.now()}`,
      order: 0,
      description: "",
      favoriteConcept: "",
      favoriteReference: "",
      favoriteStill: "",
      favoriteClip: "",
      favoritePerformance: "",
      conceptAssets: [],
      referenceAssets: [],
      stillAssets: [],
      clipAssets: [],
      performanceAssets: [],
      durationSeconds: 2,
      angle: "",
      shotSize: "",
      characterFraming: "",
      movement: "",
      action: "",
      notes: "",
    }), options);
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

      if (event.key === "F5") {
        event.preventDefault();
        setDisplayMode("performance");
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
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        if (displayModeRef.current === "clip" || displayModeRef.current === "performance") return;
        const sceneId = activeSceneIdRef.current;
        const shotId = activeShotIdRef.current;
        if (!sceneId || !shotId) return;
        const shot = shotsRef.current.find((item) => item.id === shotId);
        if (!shot) return;
        const relative = getPlayableRelative(shot, displayModeRef.current);
        if (!relative) return;
        const absolutePath = joinPath(joinPath(scenesRoot, sceneId), relative);
        setAssetRefreshTokens((current) => ({
          ...current,
          [absolutePath]: Date.now(),
        }));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createShot, navigateShotTimeline, scenesRoot]);

  const requestDeleteShot = (shot: ShotItem) => {
    setConfirmTarget(shot);
    setConfirmOpen(true);
  };

  const confirmDeleteShot = async () => {
    if (!confirmTarget) return;
    await deleteShot(confirmTarget.id);
    setConfirmOpen(false);
    setConfirmTarget(null);
  };

  const updateShotMedia = async (
    paths: string[],
    options?: { shotId?: string; mode?: ShotDisplayMode },
  ) => {
    const sceneId = activeSceneIdRef.current;
    const shotId = options?.shotId ?? activeShotIdRef.current;
    const mode = options?.mode ?? displayModeRef.current;
    if (!sceneId || !shotId || !paths.length) return;
    const accepted = paths.filter((input) => {
      if (isWebOrDataUrl(input)) return false;
      return true;
    });
    if (!accepted.length) return;

    const copiedRelatives = await copyMediaIntoShotMode(
      scenesRoot,
      sceneId,
      shotId,
      modeFolderName(mode),
      accepted,
      (value) => isFileAllowedForMode(value, mode),
    );
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
    const isVideoMode = mode === "clip" || mode === "performance";
    const picked = await window.electronAPI.pickFile({
      title: mode === "performance" ? "Select performance clip" : (mode === "clip" ? "Select shot clip" : "Select shot image"),
      filters: isVideoMode
        ? [{ name: "Videos", extensions: [...VIDEO_EXTENSIONS] }]
        : [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (picked) {
      await updateShotMedia([picked], options);
    }
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
    const rows = await listScenePoolAssets(project.paths.root, scene);
    setPoolAssets(rows);
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

  const loadCandidateAssets = async (sceneId: string, tab: CandidateTab) => {
    const rows = await listCandidateAssets(scenesRoot, sceneId, tab);
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
    await importCandidatePathsToRepo(scenesRoot, activeScene.id, candidateTab, paths);
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
    startPlayback();
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!activeSceneIdRef.current || !activeShotIdRef.current) return;
      if (displayModeRef.current === "clip" || displayModeRef.current === "performance") return;
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

  const shotAssetPathForScene = (
    sceneId: string,
    shot: ShotItem,
    mode: ShotDisplayMode = displayMode,
  ): string => {
    const relative = getPlayableRelative(shot, mode);
    if (!relative) return "";
    return joinPath(joinPath(scenesRoot, sceneId), relative);
  };

  const shotAssetPath = (shot: ShotItem, mode: ShotDisplayMode = displayMode): string => {
    if (!activeSceneId) return "";
    return shotAssetPathForScene(activeSceneId, shot, mode);
  };

  const resolveShotAssetPathForFcp7 = (shot: ShotItem): { path: string; mediaType: "video" | "image"; durationSeconds?: number | null } | null => {
    if (!sceneDir) return null;
    const pickRelative = (mode: "clip" | "performance" | "still" | "concept"): string | null => {
      const favorite = getFavoriteRelative(shot, mode).replace(/\\/g, "/").trim();
      if (favorite && isFileAllowedForMode(favorite, mode)) {
        return favorite;
      }
      const assets = getModeAssets(shot, mode);
      for (let idx = assets.length - 1; idx >= 0; idx -= 1) {
        const candidate = assets[idx];
        if (isFileAllowedForMode(candidate, mode)) {
          return candidate;
        }
      }
      return null;
    };

    const relative = pickRelative("clip") ?? pickRelative("performance") ?? pickRelative("still") ?? pickRelative("concept");
    if (!relative) return null;
    const ext = fileExtension(relative);
    const mediaType = ext && isVideoExtension(ext) ? "video" : "image";
    return {
      path: joinPath(sceneDir, relative),
      mediaType,
      durationSeconds: shot.durationSeconds ?? null,
    };
  };
  const resolveFavoriteClipPathForExport = (shot: ShotItem): string => {
    if (!sceneDir) return "";
    const relative = getFavoriteRelative(shot, "clip").replace(/\\/g, "/").trim();
    if (!relative || !isFileAllowedForMode(relative, "clip")) return "";
    return joinPath(sceneDir, relative);
  };
  const {
    playbackOpen,
    playbackIndex,
    playbackShot,
    playbackMedia,
    startPlayback,
    closePlayback,
    stepPlayback,
  } = useShotPlayback({
    shots,
    displayMode,
    resolvePath: shotAssetPath,
    onActivateShot: setActiveShotId,
  });
  const {
    exportDialogOpen,
    exportColumnsText,
    exportStartIndexText,
    exportEndIndexText,
    exportResizeEnabled,
    exportMaxLongestEdgeText,
    htmlExportDialogOpen,
    htmlExportStartIndexText,
    htmlExportEndIndexText,
    htmlExportModes,
    htmlExportImageFormat,
    htmlExportSceneScope,
    gridExportBusy,
    gridExportMessage,
    setExportColumnsText,
    setExportStartIndexText,
    setExportEndIndexText,
    setExportResizeEnabled,
    setExportMaxLongestEdgeText,
    setHtmlExportStartIndexText,
    setHtmlExportEndIndexText,
    setHtmlExportModes,
    setHtmlExportImageFormat,
    setHtmlExportSceneScope,
    openExportDialog,
    closeExportDialog,
    openHtmlExportDialog,
    closeHtmlExportDialog,
    exportSceneGrid,
    exportSceneFcp7,
    exportSceneClips,
    exportSceneHtml,
  } = useShotsExport({
    activeScene: activeScene ? { id: activeScene.id, name: activeScene.name } : null,
    exportScenes: scenes.map((scene) => ({ id: scene.id, name: scene.name })),
    loadShotsForScene: async (sceneId) => {
      const loaded = await readShotsForScene(scenesRoot, sceneId, normalizeUnknownShots);
      const repaired = await cleanMediaStateForScene(sceneId, loaded);
      return repaired.shots;
    },
    shots,
    displayMode,
    projectRoot: project.paths.root,
    scenesRoot,
    projectFrameRate: resolveProjectDimension(project.settings?.framerate, 24),
    projectWidth,
    projectHeight,
    resolveShotAssetPath: (shot, mode) => shotAssetPath(shot, mode),
    resolveShotAssetPathForScene: (sceneId, shot, mode) => shotAssetPathForScene(sceneId, shot, mode),
    resolveFcp7Media: resolveShotAssetPathForFcp7,
    resolveFavoriteClipPath: resolveFavoriteClipPathForExport,
    resolveShotDescription: (shot) => shot.description,
    resolveShotDetails: (shot) => ({
      durationSeconds: shot.durationSeconds ?? null,
      angle: shot.angle ?? "",
      shotSize: shot.shotSize ?? "",
      characterFraming: shot.characterFraming ?? "",
      movement: shot.movement ?? "",
      action: shot.action ?? "",
      notes: shot.notes ?? "",
    }),
  });
  const {
    createShot: createShotCrud,
    moveShot,
    deleteShot,
    updateShot,
  } = useShotsCrud({
    scenesRoot,
    shots,
    shotsIndex,
    activeSceneId,
    activeSceneIdRef,
    activeShotIdRef,
    shotsRef,
    persistTimerRef,
    modeFolders: SHOT_MODES,
    saveShotsState,
    setShotsIndex,
    setActiveShotId,
  });

  const menuShot = shots.find((shot) => shot.id === imageMenuShotId) ?? null;
  const menuShotAssetPath = menuShot ? shotAssetPath(menuShot) : "";
  const modeIsImage = displayMode !== "clip" && displayMode !== "performance";
  const canCreateEmptyConcept = displayMode === "concept" && !!menuShot;
  const revealLabel = isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer";

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
    const conceptDir = joinPath(joinPath(shotsDirForScene(scenesRoot, sceneId), shotId), modeFolderName("concept"));
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
  useEscapeKey(exportDialogOpen, closeExportDialog);
  useEscapeKey(htmlExportDialogOpen, closeHtmlExportDialog);

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
    if (displayMode === "clip" || displayMode === "performance") return;
    const configuredPath = appSettings.photoshopPath.trim();
    if (!configuredPath) return;
    await electron.openWithApp(configuredPath, versionMenuAsset.path);
    closeVersionMenu();
  };

  const copyVersionAssetToClipboard = async () => {
    if (!versionMenuAsset) return;
    if (displayMode === "clip" || displayMode === "performance") return;
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

  const handleToolbarPoolClick = (openPopout: boolean) => {
    if (openPopout && projectFilePath && activeScene) {
      void electron.openScenePoolPopout({
        projectFilePath,
        sceneId: activeScene.id,
        title: `${activeScene.name} - Pool`,
      });
      return;
    }
    void openPool();
  };

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
            <ShotsToolbar
              hasShots={shots.length > 0}
              poolDisabled={!activeScene}
              gridExportBusy={gridExportBusy}
              gridExportMessage={gridExportMessage}
              modeOptions={modeOptions}
              displayMode={displayMode}
              onCreateShot={() => {
                void createShot({ afterSelected: true });
              }}
              onPlay={openPlayback}
              onPool={handleToolbarPoolClick}
              onOpenCandidates={() => {
                void openCandidates();
              }}
              onOpenExport={openExportDialog}
              onExportFcp7={() => {
                void exportSceneFcp7();
              }}
              onExportClips={() => {
                void exportSceneClips();
              }}
              onExportHtml={() => {
                openHtmlExportDialog();
              }}
              onDisplayModeChange={setDisplayMode}
            />

            <ShotsList
              shots={shots}
              activeShotId={activeShotId}
              displayMode={displayMode}
              versionsIcon={VersionsIcon}
              setShotItemRef={(shotId, element) => {
                shotItemRefs.current[shotId] = element;
              }}
              getShotAssetPath={shotAssetPath}
              onSelectShot={setActiveShotId}
              onMoveShot={(shotId, direction) => {
                void moveShot(shotId, direction);
              }}
              onRequestDeleteShot={(shot) => requestDeleteShot(shot)}
              onOpenInlineFullscreen={openInlineFullscreen}
              onOpenImageMenu={openImageMenu}
              onUpdateShotMedia={updateShotMedia}
              onBrowseShotMedia={browseShotMedia}
              onOpenVersionsBrowser={openVersionsBrowser}
              onUpdateShot={updateShot}
              getAssetCacheToken={(assetPath) => assetRefreshTokens[assetPath]}
            />
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

      <ShotVersionsModal
        open={versionsOpen}
        displayMode={displayMode}
        modeAssetsLoading={modeAssetsLoading}
        modeAssets={modeAssets}
        versionMediaItems={versionMediaItems}
        onClose={closeVersionsBrowser}
        onRevealFolder={() => {
          if (!activeSceneId || !activeShot) return;
          const modeDir = joinPath(joinPath(shotsDirForScene(scenesRoot, activeSceneId), activeShot.id), modeFolderName(displayMode));
          void electron.revealInFileManager(modeDir);
        }}
        onOpenPreview={(idx) => setPreviewIndex(idx)}
        onOpenVersionMenu={(event, item) => openVersionMenu(event, item)}
        onSetFavorite={(asset) => {
          void setFavoriteForAsset(asset);
        }}
        onRequestDeleteAsset={requestDeleteAsset}
      />

      <ScenePoolModal
        open={poolOpen}
        loading={poolLoading}
        assets={poolAssets}
        mediaItems={poolMediaItems}
        onClose={() => setPoolOpen(false)}
        onOpenPreview={(idx) => setPoolPreviewIndex(idx)}
        onContextMenu={(event, item) => openPoolMenu(event, item)}
      />

      <CandidatesModal
        open={candidatesOpen}
        candidateTab={candidateTab}
        candidateTabOptions={candidateTabOptions}
        loading={candidateLoading}
        assets={candidateAssets}
        mediaItems={candidateMediaItems}
        onClose={() => setCandidatesOpen(false)}
        onTabChange={setCandidateTab}
        onImportPaths={(paths) => {
          void importCandidatePaths(paths);
        }}
        onBrowse={async () => {
          const picked = await window.electronAPI.pickFile({
            title: candidateTab === "stills" ? "Select candidate still" : "Select candidate clip",
            filters: [
              { name: "Media", extensions: ["png", "jpg", "jpeg", "webp", ...VIDEO_EXTENSIONS] },
            ],
          });
          return picked;
        }}
        onOpenPreview={(idx) => setCandidatePreviewIndex(idx)}
        onContextMenu={(event, item) => openCandidateMenu(event, item)}
      />

      <ExportGridDialog
        open={exportDialogOpen}
        displayMode={displayMode}
        exportColumnsText={exportColumnsText}
        exportStartIndexText={exportStartIndexText}
        exportEndIndexText={exportEndIndexText}
        exportResizeEnabled={exportResizeEnabled}
        exportMaxLongestEdgeText={exportMaxLongestEdgeText}
        tileWidth={projectWidth}
        tileHeight={projectHeight}
        gridExportBusy={gridExportBusy}
        onChangeColumns={setExportColumnsText}
        onChangeStartIndex={setExportStartIndexText}
        onChangeEndIndex={setExportEndIndexText}
        onChangeResizeEnabled={setExportResizeEnabled}
        onChangeMaxLongestEdge={setExportMaxLongestEdgeText}
        onCancel={closeExportDialog}
        onExport={() => {
          void exportSceneGrid();
        }}
      />

      <HtmlExportDialog
        open={htmlExportDialogOpen}
        startIndexText={htmlExportStartIndexText}
        endIndexText={htmlExportEndIndexText}
        selectedModes={htmlExportModes}
        imageFormat={htmlExportImageFormat}
        sceneScope={htmlExportSceneScope}
        exportBusy={gridExportBusy}
        onChangeStartIndex={setHtmlExportStartIndexText}
        onChangeEndIndex={setHtmlExportEndIndexText}
        onChangeSelectedModes={setHtmlExportModes}
        onChangeImageFormat={setHtmlExportImageFormat}
        onChangeSceneScope={setHtmlExportSceneScope}
        onCancel={closeHtmlExportDialog}
        onExport={() => {
          void exportSceneHtml();
        }}
      />

      <ShotsLightboxes
        previewAsset={previewAsset}
        modeAssetsCount={modeAssets.length}
        displayMode={displayMode}
        onSetPreviewIndex={setPreviewIndex}
        onOpenVersionMenu={(event, asset) => openVersionMenu(event, asset)}
        onCopyImageToClipboard={(path) => {
          void electron.copyImageToClipboard(path);
        }}
        onRevealInFileManager={(path) => {
          void electron.revealInFileManager(path);
        }}
        poolPreviewAsset={poolPreviewAsset}
        poolAssetsCount={poolAssets.length}
        onSetPoolPreviewIndex={setPoolPreviewIndex}
        onOpenPoolMenu={(event, asset) => openPoolMenu(event, asset)}
        candidatePreviewAsset={candidatePreviewAsset}
        candidateAssetsCount={candidateAssets.length}
        onSetCandidatePreviewIndex={setCandidatePreviewIndex}
        onOpenCandidateMenu={(event, asset) => openCandidateMenu(event, asset)}
        inlineFullscreenAsset={inlineFullscreenAsset}
        onCloseInlineFullscreen={() => setInlineFullscreenAsset(null)}
      />

      <ShotsPlaybackOverlay
        open={playbackOpen}
        playbackShot={playbackShot}
        playbackMedia={playbackMedia}
        playbackIndex={playbackIndex}
        shotsLength={shots.length}
        activeSceneName={activeScene?.name ?? null}
        onClose={closePlayback}
        onStep={stepPlayback}
      />

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

      <ShotsContextMenus
        revealLabel={revealLabel}
        imageMenuPos={imageMenuPos}
        imageMenuOpen={Boolean(imageMenuPos && menuShot)}
        imageMenuHasShot={Boolean(menuShot)}
        menuShotAssetPath={menuShotAssetPath}
        modeIsImage={modeIsImage}
        displayMode={displayMode}
        canCreateEmptyConcept={canCreateEmptyConcept}
        onCloseImageMenu={closeImageMenu}
        onReplaceMenuShotAsset={replaceMenuShotAsset}
        onCreateEmptyConceptImage={createEmptyConceptImage}
        onOpenMenuShotInPhotoshop={openMenuShotInPhotoshop}
        onCopyMenuShotToClipboard={copyMenuShotToClipboard}
        onRevealMenuShotInExplorer={revealMenuShotInExplorer}
        versionMenuPos={versionMenuPos}
        versionMenuAsset={versionMenuAsset}
        onCloseVersionMenu={closeVersionMenu}
        onSetFavoriteForVersionMenuAsset={async () => {
          if (!versionMenuAsset) return;
          await setFavoriteForAsset(versionMenuAsset);
          closeVersionMenu();
        }}
        onDeleteVersionMenuAsset={() => {
          if (!versionMenuAsset) return;
          requestDeleteAsset(versionMenuAsset);
          closeVersionMenu();
        }}
        onOpenVersionAssetInPhotoshop={openVersionAssetInPhotoshop}
        onCopyVersionAssetToClipboard={copyVersionAssetToClipboard}
        onRevealVersionAssetInExplorer={revealVersionAssetInExplorer}
        poolMenuPos={poolMenuPos}
        poolMenuAsset={poolMenuAsset}
        onClosePoolMenu={closePoolMenu}
        onOpenPoolAssetInPhotoshop={async () => {
          if (!poolMenuAsset) return;
          const configuredPath = appSettings.photoshopPath.trim();
          if (!configuredPath) return;
          await electron.openWithApp(configuredPath, poolMenuAsset.path);
          closePoolMenu();
        }}
        onCopyPoolAssetToClipboard={async () => {
          if (!poolMenuAsset) return;
          await electron.copyImageToClipboard(poolMenuAsset.path);
          closePoolMenu();
        }}
        onRevealPoolAssetInExplorer={async () => {
          if (!poolMenuAsset) return;
          await electron.revealInFileManager(poolMenuAsset.path);
          closePoolMenu();
        }}
        candidateMenuPos={candidateMenuPos}
        candidateMenuAsset={candidateMenuAsset}
        onCloseCandidateMenu={closeCandidateMenu}
        onCopyCandidateAssetToClipboard={async () => {
          if (!candidateMenuAsset) return;
          await electron.copyImageToClipboard(candidateMenuAsset.path);
          closeCandidateMenu();
        }}
        onRevealCandidateAssetInExplorer={async () => {
          if (!candidateMenuAsset) return;
          await electron.revealInFileManager(candidateMenuAsset.path);
          closeCandidateMenu();
        }}
      />
    </div>
  );
}
