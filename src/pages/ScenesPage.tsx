import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectState } from "../state/types";
import { electron } from "../services/electron";
import { joinPath } from "../utils/path";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { MdxTextSection } from "../components/common/MdxTextSection";
import { useAppState } from "../state/appState";
import { ImageAssetField } from "../components/common/ImageAssetField";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { buildSceneId, parseSceneId, renameSceneIdPreservingToken } from "../utils/sceneId";

interface ScenesPageProps {
  project: ProjectState;
}

interface SceneMeta {
  id: string;
  name: string;
  order: number;
  active: boolean;
  image?: string;
  timeOfDay?: string;
  lighting?: string;
  characterPropBoards?: string[];
  moodboards?: string[];
}

interface ScenesIndex {
  scenes: SceneMeta[];
}

interface SceneEditorProps {
  project: ProjectState;
  photoshopPath: string;
  scene: SceneMeta;
  scenesRoot: string;
  projectFilePath: string | null;
  onUpdateScene: (sceneId: string, updater: (scene: SceneMeta) => SceneMeta) => void;
  onRenameScene: (sceneId: string, nextName: string) => Promise<void>;
}

const EMPTY_INDEX: ScenesIndex = { scenes: [] };
const MAX_SCENE_BOARD_REFS = 5;

export function ScenesPage({ project }: ScenesPageProps) {
  const { projectFilePath, appSettings } = useAppState();
  const scenesRoot = joinPath(project.paths.root, "scenes");
  const indexPath = joinPath(scenesRoot, "scenes.json");

  const [index, setIndex] = useState<ScenesIndex>(EMPTY_INDEX);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<SceneMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const indexRef = useRef<ScenesIndex>(EMPTY_INDEX);
  const activeIdRef = useRef<string | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadSeqRef = useRef(0);

  const scenes = useMemo(
    () => [...index.scenes].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [index.scenes],
  );

  const activeScene = useMemo(() => scenes.find((scene) => scene.id === activeId) ?? null, [scenes, activeId]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const queuePersistIndex = useCallback(async (next: ScenesIndex) => {
    const snapshot: ScenesIndex = {
      scenes: next.scenes.map((scene) => ({ ...scene })),
    };

    const run = persistQueueRef.current.then(async () => {
      await electron.ensureDir(scenesRoot);
      await electron.writeText(indexPath, JSON.stringify(snapshot, null, 2));
    });

    persistQueueRef.current = run.catch(() => undefined);
    await run;
  }, [indexPath, scenesRoot]);

  const commitIndex = useCallback((nextRaw: ScenesIndex, preferredActiveId?: string | null): void => {
    const normalized: ScenesIndex = {
      scenes: normalizeSceneOrder(nextRaw.scenes),
    };

    setIndex(normalized);
    indexRef.current = normalized;

    const candidate = preferredActiveId !== undefined ? preferredActiveId : activeIdRef.current;
    const resolvedActiveId = candidate && normalized.scenes.some((scene) => scene.id === candidate)
      ? candidate
      : normalized.scenes[0]?.id ?? null;

    setActiveId(resolvedActiveId);
    activeIdRef.current = resolvedActiveId;

    setSaveError(null);
    void queuePersistIndex(normalized).catch((error) => {
      setSaveError(`Failed to save scenes index: ${toErrorMessage(error)}`);
    });
  }, [queuePersistIndex]);

  const loadScenes = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoadError(null);
    setSaveError(null);

    await electron.ensureDir(scenesRoot);
    const exists = await electron.exists(indexPath);

    if (!exists) {
      const empty = EMPTY_INDEX;
      await electron.writeText(indexPath, JSON.stringify(empty, null, 2));
      if (seq !== loadSeqRef.current) return;
      setIndex(empty);
      indexRef.current = empty;
      setActiveId(null);
      activeIdRef.current = null;
      return;
    }

    try {
      const text = await electron.readText(indexPath);
      const parsed = JSON.parse(text) as ScenesIndex;
      const normalizedResult = normalizeLoadedScenes(parsed.scenes ?? []);

      if (seq !== loadSeqRef.current) return;

      const normalized: ScenesIndex = {
        scenes: normalizeSceneOrder(normalizedResult.scenes),
      };

      setIndex(normalized);
      indexRef.current = normalized;

      const current = activeIdRef.current;
      const resolvedActiveId = current && normalized.scenes.some((scene) => scene.id === current)
        ? current
        : normalized.scenes[0]?.id ?? null;

      setActiveId(resolvedActiveId);
      activeIdRef.current = resolvedActiveId;

      if (normalizedResult.didNormalize) {
        setSaveError(null);
        void queuePersistIndex(normalized).catch((error) => {
          setSaveError(`Failed to save repaired scene index: ${toErrorMessage(error)}`);
        });
      }
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      setLoadError(`Failed to load scenes: ${toErrorMessage(error)}`);
      setIndex(EMPTY_INDEX);
      indexRef.current = EMPTY_INDEX;
      setActiveId(null);
      activeIdRef.current = null;
    }
  }, [indexPath, queuePersistIndex, scenesRoot]);

  useEffect(() => {
    void loadScenes();
  }, [loadScenes]);

  const createScene = async () => {
    const currentScenes = indexRef.current.scenes;
    const nextIndex = currentScenes.length + 1;
    const name = `Scene ${String(nextIndex).padStart(2, "0")}`;
    const id = makeSceneId(name);

    const scene: SceneMeta = {
      id,
      name,
      order: currentScenes.length,
      active: true,
      image: "",
      timeOfDay: "",
      lighting: "",
      characterPropBoards: [],
      moodboards: [],
    };

    const dir = joinPath(scenesRoot, id);
    await electron.ensureDir(dir);
    await Promise.all([
      electron.writeText(joinPath(dir, "scene.md"), ""),
      electron.writeText(joinPath(dir, "shotlist.md"), ""),
    ]);

    commitIndex({ scenes: [...currentScenes, scene] }, id);
  };

  const updateSceneById = useCallback((sceneId: string, updater: (scene: SceneMeta) => SceneMeta): void => {
    const current = indexRef.current;
    if (!current.scenes.some((scene) => scene.id === sceneId)) {
      return;
    }
    const nextScenes = current.scenes.map((scene) => (scene.id === sceneId ? updater(scene) : scene));
    commitIndex({ scenes: nextScenes }, activeIdRef.current);
  }, [commitIndex]);

  const renameSceneById = useCallback(async (sceneId: string, nextNameRaw: string): Promise<void> => {
    const nextName = nextNameRaw.trim();
    if (!nextName) {
      throw new Error("Scene name cannot be empty.");
    }
    if (nextName.includes("-")) {
      throw new Error('Scene name cannot contain "-".');
    }

    const current = indexRef.current;
    const target = current.scenes.find((scene) => scene.id === sceneId);
    if (!target) {
      throw new Error("Scene not found.");
    }

    const nextId = renameSceneIdPreservingToken(target.id, nextName);
    const idChanged = nextId !== target.id;
    const fromDir = joinPath(scenesRoot, target.id);
    const toDir = joinPath(scenesRoot, nextId);

    if (idChanged) {
      const [fromExists, toExists] = await Promise.all([
        electron.exists(fromDir),
        electron.exists(toDir),
      ]);
      if (!fromExists) {
        throw new Error(`Scene folder does not exist: ${fromDir}`);
      }
      if (toExists) {
        throw new Error(`Target scene folder already exists: ${toDir}`);
      }
    }

    const nextScenes = current.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return {
        ...scene,
        id: nextId,
        name: nextName,
      };
    });
    const normalized: ScenesIndex = {
      scenes: normalizeSceneOrder(nextScenes),
    };

    // Wait for earlier index writes to complete before this critical rename flow.
    await persistQueueRef.current.catch(() => undefined);

    let renamedOnDisk = false;
    let copiedOnDisk = false;
    try {
      if (idChanged) {
        try {
          await renameDirWithRetry(fromDir, toDir);
          renamedOnDisk = true;
        } catch (renameError) {
          // Windows can return EPERM when a directory is temporarily locked.
          // Fallback to copy so user-facing rename can still complete.
          await electron.copyDir(fromDir, toDir);
          copiedOnDisk = true;
          if (!(await electron.exists(toDir))) {
            throw renameError;
          }
        }
      }

      await electron.writeText(indexPath, JSON.stringify(normalized, null, 2));
      persistQueueRef.current = Promise.resolve();

      setIndex(normalized);
      indexRef.current = normalized;

      const currentActive = activeIdRef.current;
      const resolvedActiveId = currentActive === sceneId ? nextId : currentActive;
      setActiveId(resolvedActiveId);
      activeIdRef.current = resolvedActiveId;
      setSaveError(null);

      if (copiedOnDisk) {
        try {
          await electron.deleteDir(fromDir);
        } catch (cleanupError) {
          setSaveError(`Scene renamed, but old folder cleanup failed: ${toErrorMessage(cleanupError)}`);
        }
      }
    } catch (error) {
      if (renamedOnDisk) {
        try {
          await electron.rename(toDir, fromDir);
        } catch (rollbackError) {
          throw new Error(
            `Rename failed and rollback also failed. Rename: ${toErrorMessage(error)}. Rollback: ${toErrorMessage(rollbackError)}`,
          );
        }
      }
      if (copiedOnDisk) {
        try {
          await electron.deleteDir(toDir);
        } catch {
          // Keep original error below. This leaves duplicate data and should be handled manually.
        }
      }
      throw error;
    }
  }, [indexPath, scenesRoot]);

  const moveActive = async (direction: -1 | 1) => {
    const currentActive = activeIdRef.current;
    if (!currentActive) return;
    const sorted = [...indexRef.current.scenes].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const idx = sorted.findIndex((scene) => scene.id === currentActive);
    if (idx < 0) return;

    const target = idx + direction;
    if (target < 0 || target >= sorted.length) return;

    const temp = sorted[idx];
    sorted[idx] = sorted[target];
    sorted[target] = temp;

    const reordered = sorted.map((scene, order) => ({ ...scene, order }));
    commitIndex({ scenes: reordered }, currentActive);
  };

  const openActiveSceneFolder = async () => {
    if (!activeScene) return;
    const sceneDir = joinPath(scenesRoot, activeScene.id);
    try {
      const opened = await electron.openInExplorer(sceneDir);
      if (!opened) {
        setSaveError(`Failed to open scene folder: ${sceneDir}`);
      }
    } catch (error) {
      setSaveError(`Failed to open scene folder: ${toErrorMessage(error)}`);
    }
  };

  const requestDeleteScene = () => {
    if (!activeScene) return;
    setConfirmDeleteTarget(activeScene);
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteScene = async () => {
    if (!confirmDeleteTarget) return;

    const dir = joinPath(scenesRoot, confirmDeleteTarget.id);
    await electron.deleteDir(dir);

    const nextScenes = indexRef.current.scenes.filter((scene) => scene.id !== confirmDeleteTarget.id);
    commitIndex({ scenes: nextScenes }, activeIdRef.current === confirmDeleteTarget.id ? null : activeIdRef.current);

    setConfirmDeleteOpen(false);
    setConfirmDeleteTarget(null);
  };

  return (
    <div className="page project-page project-page--with-sidebar">
      <div className="sidebar-nav moodboards-sidebar">
        <div className="sidebar-nav__items">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`sidebar-nav__button${scene.id === activeId ? " sidebar-nav__button--active" : ""}`}
              onClick={() => setActiveId(scene.id)}
            >
              {scene.name}
            </button>
          ))}
          <button type="button" className="sidebar-nav__button moodboards-sidebar__new" onClick={() => void createScene()}>
            + New scene
          </button>
        </div>
      </div>

      <div className="project-page__content">
        <header className="page-header">
          <div>
            <h1>Scenes</h1>
            <p className="page-subtitle">Create, order, and prepare scene notes.</p>
          </div>
          {activeScene ? (
            <div className="actions">
              <button type="button" onClick={() => void openActiveSceneFolder()} title="Open scene folder">
                Open folder
              </button>
              <button type="button" onClick={() => void moveActive(-1)} title="Move up">Move Up</button>
              <button type="button" onClick={() => void moveActive(1)} title="Move down">Move Down</button>
              <button type="button" onClick={requestDeleteScene} title="Delete scene">Delete</button>
            </div>
          ) : null}
        </header>

        {loadError ? <p className="error">{loadError}</p> : null}
        {saveError ? <p className="error">{saveError}</p> : null}

        {!activeScene ? (
          <section className="panel">
            <p className="muted">Create a scene to begin.</p>
          </section>
        ) : (
          <SceneEditor
            key={activeScene.id}
            project={project}
            photoshopPath={appSettings.photoshopPath}
            scene={activeScene}
            scenesRoot={scenesRoot}
            projectFilePath={projectFilePath}
            onUpdateScene={updateSceneById}
            onRenameScene={renameSceneById}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Scene"
        message="Are you sure you want to delete this scene? This will delete its notes and image files."
        onCancel={() => {
          setConfirmDeleteOpen(false);
          setConfirmDeleteTarget(null);
        }}
        onConfirm={() => void confirmDeleteScene()}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
}

function SceneEditor({
  project,
  photoshopPath,
  scene,
  scenesRoot,
  projectFilePath,
  onUpdateScene,
  onRenameScene,
}: SceneEditorProps) {
  const sceneDir = joinPath(scenesRoot, scene.id);
  const scriptPath = joinPath(sceneDir, "scene.md");
  const shotlistPath = joinPath(sceneDir, "shotlist.md");
  const imagePath = scene.image ? joinPath(sceneDir, scene.image) : "";

  const [scriptValue, setScriptValue] = useState("");
  const [shotlistValue, setShotlistValue] = useState("");
  const [characterBoardOptions, setCharacterBoardOptions] = useState<string[]>([]);
  const [moodboardOptions, setMoodboardOptions] = useState<string[]>([]);
  const [docLoadError, setDocLoadError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(scene.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const docsSeqRef = useRef(0);

  useEscapeKey(renameOpen, () => {
    setRenameOpen(false);
    setRenameError(null);
  });

  useEffect(() => {
    const seq = ++docsSeqRef.current;
    setScriptValue("");
    setShotlistValue("");
    setDocLoadError(null);

    const loadDocs = async () => {
      try {
        await electron.ensureDir(sceneDir);

        const [scriptExists, shotlistExists] = await Promise.all([
          electron.exists(scriptPath),
          electron.exists(shotlistPath),
        ]);

        if (!scriptExists) {
          await electron.writeText(scriptPath, "");
        }
        if (!shotlistExists) {
          await electron.writeText(shotlistPath, "");
        }

        const [sceneMd, shotlistMd] = await Promise.all([
          electron.readText(scriptPath),
          electron.readText(shotlistPath),
        ]);

        if (seq !== docsSeqRef.current) return;
        setScriptValue(sceneMd);
        setShotlistValue(shotlistMd);
      } catch (error) {
        if (seq !== docsSeqRef.current) return;
        setDocLoadError(`Failed to load scene docs: ${toErrorMessage(error)}`);
      }
    };

    void loadDocs();

    return () => {
      docsSeqRef.current += 1;
    };
  }, [scene.id, sceneDir, scriptPath, shotlistPath]);

  useEffect(() => {
    let cancelled = false;
    const loadBoardOptions = async () => {
      const charactersDir = joinPath(project.paths.root, "characters");
      const moodboardsDir = joinPath(project.paths.root, "moodboards");
      await Promise.all([electron.ensureDir(charactersDir), electron.ensureDir(moodboardsDir)]);
      const [characterEntries, moodEntries] = await Promise.all([
        electron.listDir(charactersDir),
        electron.listDir(moodboardsDir),
      ]);
      if (cancelled) return;
      setCharacterBoardOptions(
        characterEntries
          .filter((entry) => entry.isDirectory)
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b)),
      );
      setMoodboardOptions(
        moodEntries
          .filter((entry) => entry.isDirectory)
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b)),
      );
    };
    void loadBoardOptions();
    return () => {
      cancelled = true;
    };
  }, [project.paths.root]);

  const updateSceneImage = async (paths: string[]) => {
    if (!paths.length) return;
    const input = paths[0];
    const ext = imageExtension(input);
    const fileName = ext ? `scene_image${ext}` : "scene_image";
    const destination = joinPath(sceneDir, fileName);

    await electron.copyFile(input, destination);
    onUpdateScene(scene.id, (previous) => ({ ...previous, image: fileName }));
  };

  const openRenameDialog = () => {
    setRenameValue(scene.name);
    setRenameError(null);
    setRenameOpen(true);
  };

  const submitRename = async () => {
    const next = renameValue.trim();
    if (!next) {
      setRenameError("Scene name cannot be empty.");
      return;
    }
    if (next.includes("-")) {
      setRenameError('Scene name cannot contain "-".');
      return;
    }
    if (next === scene.name) {
      setRenameOpen(false);
      setRenameError(null);
      return;
    }
    try {
      await onRenameScene(scene.id, next);
      setRenameOpen(false);
      setRenameError(null);
    } catch (error) {
      setRenameError(toErrorMessage(error));
    }
  };

  const characterSlots = boardSlots(scene.characterPropBoards);
  const moodboardSlots = boardSlots(scene.moodboards);

  const updateBoardSlot = (
    kind: "characterPropBoards" | "moodboards",
    slotIndex: number,
    value: string,
  ) => {
    onUpdateScene(scene.id, (previous) => {
      const currentSlots = boardSlots(kind === "characterPropBoards" ? previous.characterPropBoards : previous.moodboards);
      currentSlots[slotIndex] = value.trim();
      const nextValues = normalizeBoardRefs(currentSlots);
      if (kind === "characterPropBoards") {
        return { ...previous, characterPropBoards: nextValues };
      }
      return { ...previous, moodboards: nextValues };
    });
  };

  return (
    <>
      {docLoadError ? <p className="error">{docLoadError}</p> : null}

      <section className="panel">
        <div className="scene-header-grid">
          <div className="scene-header-grid__image">
            <label className="form-row">
              <span className="section-title">Image</span>
              <ImageAssetField
                imagePath={imagePath}
                emptyLabel="Drop image here or click to browse"
                onReplace={updateSceneImage}
                browse={async () => {
                  const picked = await window.electronAPI.pickFile({
                    title: "Select scene image",
                    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
                  });
                  return picked;
                }}
                photoshopPath={photoshopPath}
              />
            </label>
          </div>

          <div className="scene-header-grid__meta">
            <label className="form-row">
              <span className="section-title">Scene Name</span>
              <div className="scene-name-row">
                <input
                  className="form-input"
                  value={scene.name}
                  readOnly
                  aria-readonly="true"
                />
                <button type="button" className="pill-button" onClick={openRenameDialog}>
                  Rename
                </button>
              </div>
            </label>

            <label className="form-row">
              <span className="section-title">Time of day</span>
              <input
                className="form-input"
                value={scene.timeOfDay ?? ""}
                onChange={(event) => {
                  onUpdateScene(scene.id, (previous) => ({ ...previous, timeOfDay: event.target.value }));
                }}
                placeholder="e.g. Day / Night / Dusk"
              />
            </label>

            <label className="form-row">
              <span className="section-title">Lighting</span>
              <input
                className="form-input"
                value={scene.lighting ?? ""}
                onChange={(event) => {
                  onUpdateScene(scene.id, (previous) => ({ ...previous, lighting: event.target.value }));
                }}
                placeholder="e.g. Soft window light / Hard backlight"
              />
            </label>

            <label className="form-row scene-active-row">
              <input
                type="checkbox"
                checked={scene.active}
                onChange={(event) => {
                  onUpdateScene(scene.id, (previous) => ({ ...previous, active: event.target.checked }));
                }}
              />
              <span>[x] Active</span>
            </label>
          </div>
        </div>

        <div className="scene-reference-grid">
          <div className="scene-reference-grid__column">
            <h3 className="section-title">Character and props boards</h3>
            {characterSlots.map((value, idx) => (
              <label key={`character-board-slot-${idx}`} className="form-row">
                <span className="muted">Reference {idx + 1}</span>
                <select
                  className="form-input"
                  value={value}
                  onChange={(event) => updateBoardSlot("characterPropBoards", idx, event.target.value)}
                >
                  <option value="">-- none --</option>
                  {boardSelectOptions(characterBoardOptions, characterSlots).map((option) => (
                    <option key={`character-board-option-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="scene-reference-grid__column">
            <h3 className="section-title">Moodboards</h3>
            {moodboardSlots.map((value, idx) => (
              <label key={`moodboard-slot-${idx}`} className="form-row">
                <span className="muted">Reference {idx + 1}</span>
                <select
                  className="form-input"
                  value={value}
                  onChange={(event) => updateBoardSlot("moodboards", idx, event.target.value)}
                >
                  <option value="">-- none --</option>
                  {boardSelectOptions(moodboardOptions, moodboardSlots).map((option) => (
                    <option key={`moodboard-option-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="scene-docs-grid">
        <section className="panel">
          <div className="panel-header">
            <div className="panel-meta">
              <span className="label">Scene Script</span>
              <span className="value">{scriptPath.replace(/\\/g, "/")}</span>
            </div>
            <button
              type="button"
              className="pill-button"
              onClick={() => {
                if (!projectFilePath) return;
                void electron.openEditorPopout({
                  projectFilePath,
                  targetPath: scriptPath,
                  title: `${scene.name} - Script`,
                });
              }}
            >
              Pop out
            </button>
          </div>
          <MdxTextSection
            key={scriptPath}
            value={scriptValue}
            onChange={(markdown) => setScriptValue(markdown)}
            projectRoot={project.paths.root}
            fileName="scene.md"
            targetPath={scriptPath}
            placeholder="Write scene script notes..."
            wrapInPanel={false}
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-meta">
              <span className="label">Scene Shotlist</span>
              <span className="value">{shotlistPath.replace(/\\/g, "/")}</span>
            </div>
            <button
              type="button"
              className="pill-button"
              onClick={() => {
                if (!projectFilePath) return;
                void electron.openEditorPopout({
                  projectFilePath,
                  targetPath: shotlistPath,
                  title: `${scene.name} - Shotlist`,
                });
              }}
            >
              Pop out
            </button>
          </div>
          <MdxTextSection
            key={shotlistPath}
            value={shotlistValue}
            onChange={(markdown) => setShotlistValue(markdown)}
            projectRoot={project.paths.root}
            fileName="shotlist.md"
            targetPath={shotlistPath}
            placeholder="Write shotlist notes for this scene..."
            wrapInPanel={false}
          />
        </section>
      </div>

      {renameOpen ? (
        <div className="modal-backdrop">
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">Rename Scene</h3>
            </div>
            <div className="form-section">
              <label className="form-row">
                <span className="section-title">Scene Name</span>
                <input
                  className="form-input"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void submitRename();
                    }
                  }}
                />
              </label>
            </div>
            {renameError ? <p className="error">{renameError}</p> : null}
            <div className="modal__footer">
              <button
                type="button"
                className="pill-button"
                onClick={() => {
                  setRenameOpen(false);
                  setRenameError(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="pill-button" onClick={() => void submitRename()}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function normalizeSceneOrder(scenes: SceneMeta[]): SceneMeta[] {
  return [...scenes]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((scene, idx) => ({
      id: scene.id,
      name: scene.name,
      order: idx,
      active: scene.active !== false,
      image: scene.image ?? "",
      timeOfDay: scene.timeOfDay ?? "",
      lighting: scene.lighting ?? "",
      characterPropBoards: normalizeBoardRefs(scene.characterPropBoards),
      moodboards: normalizeBoardRefs(scene.moodboards),
    }));
}

function normalizeLoadedScenes(input: SceneMeta[]): {
  scenes: SceneMeta[];
  didNormalize: boolean;
} {
  const usedIds = new Set<string>();
  let didNormalize = false;

  const normalized = input.map((scene, idx) => {
    const originalId = String(scene.id ?? "").trim();
    let id = originalId;

    if (!id) {
      throw new Error(`Scene at index ${idx} is missing an id.`);
    }

    try {
      parseSceneId(id);
    } catch (error) {
      throw new Error(`Invalid scene id "${id}": ${toErrorMessage(error)}`);
    }

    if (usedIds.has(id)) {
      id = makeSceneId(scene.name);
      didNormalize = true;
    }

    usedIds.add(id);

    const name = String(scene.name ?? "").trim() || `Scene ${String(idx + 1).padStart(2, "0")}`;
    const order = typeof scene.order === "number" ? scene.order : idx;

    if (
      name !== scene.name
      || order !== scene.order
      || scene.active === undefined
      || scene.image === undefined
      || scene.timeOfDay === undefined
      || scene.lighting === undefined
      || scene.characterPropBoards === undefined
      || scene.moodboards === undefined
      || id !== originalId
    ) {
      didNormalize = true;
    }

    return {
      id,
      name,
      order,
      active: scene.active !== false,
      image: scene.image ?? "",
      timeOfDay: scene.timeOfDay ?? "",
      lighting: scene.lighting ?? "",
      characterPropBoards: normalizeBoardRefs(scene.characterPropBoards),
      moodboards: normalizeBoardRefs(scene.moodboards),
    };
  });

  return {
    scenes: normalized,
    didNormalize,
  };
}

function imageExtension(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".jpg")) return ".jpg";
  if (lower.endsWith(".jpeg")) return ".jpeg";
  if (lower.endsWith(".webp")) return ".webp";
  return null;
}

function makeSceneId(namePart?: string): string {
  return buildSceneId(makeSceneToken(), namePart);
}

function makeSceneToken(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${timestamp}${randomPart}`;
}

async function renameDirWithRetry(fromDir: string, toDir: string): Promise<void> {
  const attempts = 4;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await electron.rename(fromDir, toDir);
      return;
    } catch (error) {
      lastError = error;
      if (!isWindowsEperm(error) || attempt === attempts - 1) {
        break;
      }
      await sleep(120 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isWindowsEperm(error: unknown): boolean {
  const message = toErrorMessage(error).toUpperCase();
  return message.includes("EPERM");
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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
    if (out.length >= MAX_SCENE_BOARD_REFS) break;
  }
  return out;
}

function boardSlots(values: unknown): string[] {
  const normalized = normalizeBoardRefs(values);
  const slots = Array.from({ length: MAX_SCENE_BOARD_REFS }, () => "");
  for (let idx = 0; idx < normalized.length && idx < MAX_SCENE_BOARD_REFS; idx += 1) {
    slots[idx] = normalized[idx];
  }
  return slots;
}

function boardSelectOptions(options: string[], selectedValues: string[]): string[] {
  const set = new Set<string>();
  for (const option of options) {
    const cleaned = option.trim();
    if (!cleaned) continue;
    set.add(cleaned);
  }
  for (const selected of selectedValues) {
    const cleaned = selected.trim();
    if (!cleaned) continue;
    set.add(cleaned);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
