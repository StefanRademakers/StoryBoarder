import { useEffect, useMemo, useState } from "react";
import type { ProjectState } from "../state/types";
import { joinPath } from "../utils/path";
import { electron } from "../services/electron";
import { useAppState } from "../state/appState";
import { MediaTileGrid } from "../components/common/MediaTileGrid";
import { MediaLightbox } from "../components/common/MediaLightbox";
import { MediaContextMenu } from "../components/common/MediaContextMenu";
import { inferMediaKind, type MediaItem } from "../components/common/mediaTypes";
import { listScenePoolAssets, loadScenesIndex } from "./shots/shotsRepository";

interface ScenePoolPopoutPageProps {
  project: ProjectState;
  sceneId: string;
  title: string;
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
    () => assets.map((asset) => ({ ...asset, id: asset.path, kind: inferMediaKind(asset.path) })),
    [assets],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const scenesRoot = joinPath(project.paths.root, "scenes");
        const indexPath = joinPath(scenesRoot, "scenes.json");
        const normalized = await loadScenesIndex(scenesRoot, indexPath);
        const scene = normalized.scenes.find((entry) => entry.id === sceneId);
        if (!scene) {
          setAssets([]);
          return;
        }
        setSceneName(scene.name || sceneId);
        const rows = await listScenePoolAssets(project.paths.root, scene);
        if (cancelled) return;
        setAssets(rows);
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
        {!loading && !assets.length ? <p className="muted">No media found for this scene pool.</p> : null}
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
        isVideo={previewAsset ? inferMediaKind(previewAsset.path) === "video" : false}
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
          if (!previewAsset || inferMediaKind(previewAsset.path) === "video") return;
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
            visible: Boolean(menuAsset && inferMediaKind(menuAsset.path) !== "video"),
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
            visible: Boolean(menuAsset && inferMediaKind(menuAsset.path) !== "video"),
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
          {
            key: "copy-path",
            label: "Copy as Path",
            visible: Boolean(menuAsset),
            onSelect: async () => {
              if (!menuAsset) return;
              await electron.copyPathToClipboard(menuAsset.path);
              closeMenu();
            },
          },
        ]}
      />
    </div>
  );
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  return platform.includes("mac");
}
