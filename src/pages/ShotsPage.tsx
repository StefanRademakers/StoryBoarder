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
  image?: string; // Legacy alias for stillImage
  conceptImage?: string;
  stillImage?: string;
  clipPath?: string;
  durationSeconds?: number | null;
  framing?: string;
  action?: string;
  camera?: string;
}

interface ShotsIndex {
  shots: ShotItem[];
}

type ShotDisplayMode = "concept" | "still" | "clip";

const EMPTY_SCENES: ScenesIndex = { scenes: [] };
const EMPTY_SHOTS: ShotsIndex = { shots: [] };
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "avi", "m4v"] as const;

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
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shotItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scenesRef = useRef<SceneMeta[]>([]);
  const shotsRef = useRef<ShotItem[]>([]);
  const activeSceneIdRef = useRef<string | null>(null);
  const activeShotIdRef = useRef<string | null>(null);
  const displayModeRef = useRef<ShotDisplayMode>("still");
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

  const sceneDir = activeScene ? joinPath(scenesRoot, activeScene.id) : null;

  useEffect(() => () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
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
      setShotsIndex(normalized);
      setActiveShotId((prev) => {
        if (prev && normalized.shots.some((shot) => shot.id === prev)) return prev;
        return normalized.shots[0]?.id ?? null;
      });
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
      image: "",
      conceptImage: "",
      stillImage: "",
      clipPath: "",
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
    const input = paths[0];
    if (isWebOrDataUrl(input)) {
      console.warn("Ignoring non-local media source on Shots page:", input);
      return;
    }
    const sourceExists = await electron.exists(input);
    if (!sourceExists) {
      console.warn("Ignoring missing media source on Shots page:", input);
      return;
    }

    const ext = mode === "clip" ? fileExtension(input) : imageExtension(input);
    if (mode === "clip") {
      if (!ext || !isVideoExtension(ext)) {
        console.warn("Ignoring non-video source for clip mode:", input);
        return;
      }
    } else if (!ext) {
      console.warn("Ignoring non-image source for image mode:", input);
      return;
    }
    const fileNameBase = mode === "concept" ? "concept" : mode === "clip" ? "clip" : "image";
    const fileName = ext ? `${fileNameBase}${ext}` : fileNameBase;
    const shotDir = joinPath(shotsDirForScene(sceneId), shotId);
    await electron.ensureDir(shotDir);
    const target = joinPath(shotDir, fileName);
    await electron.copyFile(input, target);
    const relative = `shots/${shotId}/${fileName}`;
    const next: ShotsIndex = {
      shots: shotsIndex.shots.map((shot) => {
        if (shot.id !== shotId) return shot;
        if (mode === "concept") return { ...shot, conceptImage: relative };
        if (mode === "clip") return { ...shot, clipPath: relative };
        return { ...shot, stillImage: relative, image: relative };
      }),
    };
    await saveShotsState(next, { immediate: true });
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

  const closeImageMenu = () => {
    setImageMenuShotId(null);
    setImageMenuPos(null);
  };

  const openImageMenu = (event: React.MouseEvent, shotId: string) => {
    event.preventDefault();
    setImageMenuShotId(shotId);
    setImageMenuPos({ x: event.clientX, y: event.clientY });
  };

  const shotAssetPath = (shot: ShotItem, mode: ShotDisplayMode = displayMode): string => {
    if (!sceneDir) return "";
    const relative = mode === "concept"
      ? shot.conceptImage
      : mode === "clip"
        ? shot.clipPath
        : shot.stillImage || shot.image;
    if (!relative) return "";
    return joinPath(sceneDir, relative);
  };

  const menuShot = shots.find((shot) => shot.id === imageMenuShotId) ?? null;
  const menuShotAssetPath = menuShot ? shotAssetPath(menuShot) : "";
  const modeIsImage = displayMode !== "clip";

  const replaceMenuShotAsset = async () => {
    if (!menuShot) return;
    setActiveShotId(menuShot.id);
    await browseShotMedia({ shotId: menuShot.id });
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
                                  onPathsSelected={(paths) => void updateShotMedia(paths, { shotId: shot.id })}
                                  browse={async () => {
                                    await browseShotMedia({ shotId: shot.id });
                                    return null;
                                  }}
                                />
                              )}
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

      {imageMenuPos && menuShot && menuShotAssetPath ? (
        <div className="context-menu-backdrop" onClick={closeImageMenu}>
          <div
            className="context-menu"
            style={{ top: imageMenuPos.y, left: imageMenuPos.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="context-menu__item" onClick={() => void replaceMenuShotAsset()}>
              {displayMode === "clip" ? "Replace clip" : "Replace image"}
            </button>
            {modeIsImage ? (
              <button type="button" className="context-menu__item" onClick={() => void openMenuShotInPhotoshop()}>
                Open in Photoshop
              </button>
            ) : null}
            {modeIsImage ? (
              <button type="button" className="context-menu__item" onClick={() => void copyMenuShotToClipboard()}>
                Copy to Clipboard
              </button>
            ) : null}
            <button type="button" className="context-menu__item" onClick={() => void revealMenuShotInExplorer()}>
              {isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function imageExtension(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".jpg")) return ".jpg";
  if (lower.endsWith(".jpeg")) return ".jpeg";
  if (lower.endsWith(".webp")) return ".webp";
  return null;
}

function normalizeShotsIndex(index: ShotsIndex): ShotsIndex {
  return {
    shots: (index.shots ?? [])
      .map((shot, idx) => {
        const stillImage = shot.stillImage ?? shot.image ?? "";
        return {
          id: shot.id,
          order: typeof shot.order === "number" ? shot.order : idx,
          description: shot.description ?? "",
          image: stillImage,
          conceptImage: shot.conceptImage ?? "",
          stillImage,
          clipPath: shot.clipPath ?? "",
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
