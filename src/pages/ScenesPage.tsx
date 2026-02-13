import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectState } from "../state/types";
import { electron } from "../services/electron";
import { joinPath } from "../utils/path";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { MdxTextSection } from "../components/common/MdxTextSection";
import { useAppState } from "../state/appState";
import { ImageAssetField } from "../components/common/ImageAssetField";

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
}

interface ScenesIndex {
  scenes: SceneMeta[];
}

interface SceneEditorProps {
  project: ProjectState;
  scene: SceneMeta;
  scenesRoot: string;
  projectFilePath: string | null;
  onUpdateScene: (sceneId: string, updater: (scene: SceneMeta) => SceneMeta) => void;
}

const EMPTY_INDEX: ScenesIndex = { scenes: [] };

export function ScenesPage({ project }: ScenesPageProps) {
  const { projectFilePath } = useAppState();
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

      if (normalizedResult.idCopies.length) {
        for (const copy of normalizedResult.idCopies) {
          const fromDir = joinPath(scenesRoot, copy.fromId);
          const toDir = joinPath(scenesRoot, copy.toId);
          const [fromExists, toExists] = await Promise.all([
            electron.exists(fromDir),
            electron.exists(toDir),
          ]);
          if (fromExists && !toExists) {
            await electron.copyDir(fromDir, toDir);
          }
        }
      }

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
    const id = makeStableId("scene");
    const name = `Scene ${String(nextIndex).padStart(2, "0")}`;

    const scene: SceneMeta = {
      id,
      name,
      order: currentScenes.length,
      active: true,
      image: "",
      timeOfDay: "",
      lighting: "",
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
            scene={activeScene}
            scenesRoot={scenesRoot}
            projectFilePath={projectFilePath}
            onUpdateScene={updateSceneById}
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
  scene,
  scenesRoot,
  projectFilePath,
  onUpdateScene,
}: SceneEditorProps) {
  const sceneDir = joinPath(scenesRoot, scene.id);
  const scriptPath = joinPath(sceneDir, "scene.md");
  const shotlistPath = joinPath(sceneDir, "shotlist.md");
  const imagePath = scene.image ? joinPath(sceneDir, scene.image) : "";

  const [scriptValue, setScriptValue] = useState("");
  const [shotlistValue, setShotlistValue] = useState("");
  const [docLoadError, setDocLoadError] = useState<string | null>(null);
  const docsSeqRef = useRef(0);

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

  const updateSceneImage = async (paths: string[]) => {
    if (!paths.length) return;
    const input = paths[0];
    const ext = imageExtension(input);
    const fileName = ext ? `scene_image${ext}` : "scene_image";
    const destination = joinPath(sceneDir, fileName);

    await electron.copyFile(input, destination);
    onUpdateScene(scene.id, (previous) => ({ ...previous, image: fileName }));
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
                photoshopPath={project.settings?.photoshopPath ?? ""}
              />
            </label>
          </div>

          <div className="scene-header-grid__meta">
            <label className="form-row">
              <span className="section-title">Scene Name</span>
              <input
                className="form-input"
                value={scene.name}
                onChange={(event) => {
                  onUpdateScene(scene.id, (previous) => ({ ...previous, name: event.target.value }));
                }}
              />
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
    }));
}

function normalizeLoadedScenes(input: SceneMeta[]): {
  scenes: SceneMeta[];
  didNormalize: boolean;
  idCopies: Array<{ fromId: string; toId: string }>;
} {
  const usedIds = new Set<string>();
  const idCopies: Array<{ fromId: string; toId: string }> = [];
  let didNormalize = false;

  const normalized = input.map((scene, idx) => {
    const originalId = String(scene.id ?? "").trim();
    let id = originalId;

    if (!id || usedIds.has(id)) {
      id = makeStableId("scene");
      didNormalize = true;
      if (originalId) {
        idCopies.push({ fromId: originalId, toId: id });
      }
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
    };
  });

  return {
    scenes: normalized,
    didNormalize,
    idCopies,
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

function makeStableId(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
