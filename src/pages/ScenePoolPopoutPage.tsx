import { useEffect, useMemo, useState } from "react";
import type { ProjectState } from "../state/types";
import { joinPath } from "../utils/path";
import { electron } from "../services/electron";
import { useAppState } from "../state/appState";
import { MediaTileGrid } from "../components/common/MediaTileGrid";
import { MediaLightbox } from "../components/common/MediaLightbox";
import { MediaContextMenu } from "../components/common/MediaContextMenu";
import type { MediaItem } from "../components/common/mediaTypes";

interface ScenePoolPopoutPageProps {
  project: ProjectState;
  sceneId: string;
  title: string;
}

interface SceneMeta {
  id: string;
  name: string;
  characterPropBoards?: string[];
  moodboards?: string[];
}

interface ScenesIndex {
  scenes: SceneMeta[];
}

interface ScenePoolAsset {
  name: string;
  path: string;
  source: string;
  mtimeMs: number;
}

export function ScenePoolPopoutPage({ project, sceneId, title }: ScenePoolPopoutPageProps) {
  const { appSettings } = useAppState();
  const [sceneName, setSceneName] = useState<string>(sceneId);
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<ScenePoolAsset[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [menuAsset, setMenuAsset] = useState<ScenePoolAsset | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const previewAsset = previewIndex === null ? null : assets[previewIndex] ?? null;

  const mediaItems = useMemo<Array<MediaItem & ScenePoolAsset>>(
    () => assets.map((asset) => ({ ...asset, id: asset.path, kind: "image" as const })),
    [assets],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const indexPath = joinPath(joinPath(project.paths.root, "scenes"), "scenes.json");
        const exists = await electron.exists(indexPath);
        if (!exists) {
          setAssets([]);
          return;
        }
        const text = await electron.readText(indexPath);
        const parsed = JSON.parse(text) as ScenesIndex;
        const scene = (parsed.scenes ?? []).find((entry) => entry.id === sceneId);
        if (!scene) {
          setAssets([]);
          return;
        }
        setSceneName(scene.name || sceneId);

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
          const boardExists = await electron.exists(boardDir);
          if (!boardExists) continue;
          const entries = await electron.listDir(boardDir);
          for (const entry of entries) {
            if (!entry.isFile || !isImageFile(entry.name)) continue;
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
          if (!unique.has(row.path)) unique.set(row.path, row);
        }
        if (cancelled) return;
        setAssets(Array.from(unique.values()));
      } catch {
        if (cancelled) return;
        setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [project.paths.root, sceneId]);

  const closeMenu = () => {
    setMenuAsset(null);
    setMenuPos(null);
  };

  const openMenu = (event: React.MouseEvent, asset: ScenePoolAsset) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuAsset(asset);
    setMenuPos({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className="page">
      <section className="panel">
        <div className="modal__header">
          <h2 className="modal__title">{title || `${sceneName} - Pool`}</h2>
        </div>
        {loading ? <p className="muted">Loading scene pool...</p> : null}
        {!loading && !assets.length ? <p className="muted">No images found for this scene pool.</p> : null}
        {!loading && assets.length ? (
          <MediaTileGrid
            items={mediaItems}
            className="moodboard-grid shot-pool-grid"
            getKey={(item) => item.path}
            onOpen={(_item, idx) => setPreviewIndex(idx)}
            onContextMenu={(event, item) => openMenu(event, item)}
            renderActions={(asset) => <div className="shot-pool-grid__meta">{asset.source}</div>}
          />
        ) : null}
      </section>

      <MediaLightbox
        open={Boolean(previewAsset)}
        path={previewAsset?.path ?? null}
        isVideo={false}
        name={previewAsset?.name}
        meta={previewAsset?.source}
        onClose={() => setPreviewIndex(null)}
        onNext={() => {
          if (!assets.length) return;
          setPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % assets.length;
          });
        }}
        onPrev={() => {
          if (!assets.length) return;
          setPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + assets.length) % assets.length;
          });
        }}
        onCopy={() => {
          if (!previewAsset) return;
          void electron.copyImageToClipboard(previewAsset.path);
        }}
        onReveal={() => {
          if (!previewAsset) return;
          void electron.revealInFileManager(previewAsset.path);
        }}
        onContextMenu={(event) => {
          if (!previewAsset) return;
          openMenu(event, previewAsset);
        }}
      />

      <MediaContextMenu
        open={Boolean(menuPos && menuAsset)}
        position={menuPos}
        onClose={closeMenu}
        actions={[
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: Boolean(menuAsset),
            onSelect: async () => {
              if (!menuAsset) return;
              const configuredPath = appSettings.photoshopPath.trim();
              if (!configuredPath) return;
              await electron.openWithApp(configuredPath, menuAsset.path);
              closeMenu();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(menuAsset),
            onSelect: async () => {
              if (!menuAsset) return;
              await electron.copyImageToClipboard(menuAsset.path);
              closeMenu();
            },
          },
          {
            key: "reveal",
            label: isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer",
            visible: Boolean(menuAsset),
            onSelect: async () => {
              if (!menuAsset) return;
              await electron.revealInFileManager(menuAsset.path);
              closeMenu();
            },
          },
        ]}
      />
    </div>
  );
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
  const lower = name.toLowerCase();
  return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp");
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  return platform.includes("mac");
}
