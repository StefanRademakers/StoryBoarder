import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { ProjectState } from "../state/types";
import { getDirectoryName, joinPath } from "../utils/path";
import { electron } from "../services/electron";
import { DropOrBrowse } from "../components/common/DropOrBrowse";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { useAppState } from "../state/appState";
import { MediaContextMenu } from "../components/common/MediaContextMenu";
import { MediaLightbox } from "../components/common/MediaLightbox";
import { MediaTileGrid } from "../components/common/MediaTileGrid";
import { inferMediaKind, type MediaItem } from "../components/common/mediaTypes";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { getImageThumbnailPath } from "../components/common/mediaThumbnails";
import { loadBoardFavorites, saveBoardFavorites } from "../services/boardMetaService";

interface FolderImageBoardsPageProps {
  project: ProjectState;
  folderName: string;
  pageTitle: string;
  sectionTitle: string;
  singularLabel: string;
}

interface BoardItem {
  name: string;
  path: string;
}

interface BoardMedia {
  name: string;
  path: string;
  mtimeMs: number;
  isFavorite: boolean;
}

export function FolderImageBoardsPage({
  project,
  folderName,
  pageTitle,
  sectionTitle,
  singularLabel,
}: FolderImageBoardsPageProps) {
  const { appSettings } = useAppState();
  const revealLabel = isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer";
  const rootDir = joinPath(project.paths.root, folderName);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<BoardMedia[]>([]);
  const [favoriteNames, setFavoriteNames] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<BoardMedia | null>(null);
  const [menuItem, setMenuItem] = useState<BoardItem | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<BoardItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageMenuItem, setImageMenuItem] = useState<BoardMedia | null>(null);
  const [imageMenuPos, setImageMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [mediaRenameOpen, setMediaRenameOpen] = useState(false);
  const [mediaRenameTarget, setMediaRenameTarget] = useState<BoardMedia | null>(null);
  const [mediaRenameValue, setMediaRenameValue] = useState("");
  const [mediaRenameError, setMediaRenameError] = useState<string | null>(null);

  useEscapeKey(dialogOpen, () => setDialogOpen(false));
  useEscapeKey(renameOpen, () => {
    setRenameOpen(false);
    setRenameTarget(null);
    setRenameValue("");
    setRenameError(null);
  });
  useEscapeKey(mediaRenameOpen, () => {
    setMediaRenameOpen(false);
    setMediaRenameTarget(null);
    setMediaRenameValue("");
    setMediaRenameError(null);
  });

  const loadItems = async () => {
    await electron.ensureDir(rootDir);
    const entries = await electron.listDir(rootDir);
    const dirs = entries.filter((e) => e.isDirectory);
    const list = dirs.map((d) => ({ name: d.name, path: joinPath(rootDir, d.name) }));
    setItems(list);
    setActive((prev) => {
      if (prev && list.some((i) => i.path === prev)) {
        return prev;
      }
      return list[0]?.path ?? null;
    });
  };

  useEffect(() => {
    void loadItems();
  }, [rootDir]);

  const activeItem = useMemo(() => items.find((i) => i.path === active) ?? null, [items, active]);
  const mediaItems = useMemo<Array<MediaItem & BoardMedia>>(
    () => images.map((item) => ({ ...item, id: item.path, kind: inferMediaKind(item.path) })),
    [images],
  );

  const loadBoardMedia = async (dir: string) => {
    const entries = await electron.listDir(dir);
    const files = entries.filter((e) => e.isFile && isSupportedMediaFile(e.name));
    const list: BoardMedia[] = [];
    for (const f of files) {
      const path = joinPath(dir, f.name);
      const stat = await electron.stat(path);
      list.push({ name: f.name, path, mtimeMs: stat?.mtimeMs ?? 0, isFavorite: false });
    }
    list.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const loadedFavorites = await loadBoardFavorites(dir);
    const resolvedFavorites = resolveFavoritesAgainstFiles(list.map((item) => item.name), loadedFavorites);
    if (!areStringArraysEqual(loadedFavorites, resolvedFavorites)) {
      await saveBoardFavorites(dir, resolvedFavorites);
    }

    const favoriteLookup = new Set(resolvedFavorites.map((name) => name.toLowerCase()));
    setFavoriteNames(resolvedFavorites);
    setImages(list.map((item) => ({
      ...item,
      isFavorite: favoriteLookup.has(item.name.toLowerCase()),
    })));
  };

  useEffect(() => {
    if (!activeItem) {
      setImages([]);
      setFavoriteNames([]);
      return;
    }
    void loadBoardMedia(activeItem.path);
  }, [activeItem?.path]);

  const createItem = async () => {
    const raw = newName.trim();
    if (!raw) return;
    const safe = normalizeName(raw);
    const dirPath = joinPath(rootDir, safe);
    const exists = await electron.exists(dirPath);
    if (exists) {
      setError(`A ${singularLabel.toLowerCase()} with this name already exists.`);
      return;
    }
    await electron.ensureDir(dirPath);
    setDialogOpen(false);
    setNewName("");
    setError(null);
    await loadItems();
    setActive(dirPath);
  };

  const openMenu = (event: MouseEvent, item: BoardItem) => {
    event.preventDefault();
    setMenuItem(item);
    setMenuPos({ x: event.clientX, y: event.clientY });
  };

  const closeMenu = () => {
    setMenuItem(null);
    setMenuPos(null);
  };

  const openInExplorer = async (item: BoardItem) => {
    await electron.openInExplorer(item.path);
    closeMenu();
  };

  const copyBoardPathToClipboard = async (item: BoardItem) => {
    const ok = await electron.copyPathToClipboard(item.path);
    if (!ok) {
      setActionError("Failed to copy path.");
    } else {
      setActionError(null);
    }
    closeMenu();
  };

  const closeImageMenu = () => {
    setImageMenuItem(null);
    setImageMenuPos(null);
  };

  const openImageMenu = (event: MouseEvent, image: BoardMedia) => {
    event.preventDefault();
    setImageMenuItem(image);
    setImageMenuPos({ x: event.clientX, y: event.clientY });
  };

  const revealImageInExplorer = async (image: BoardMedia) => {
    await electron.revealInFileManager(image.path);
    closeImageMenu();
  };

  const copyMediaPathToClipboard = async (image: BoardMedia) => {
    const ok = await electron.copyPathToClipboard(image.path);
    if (!ok) {
      setActionError("Failed to copy path.");
    } else {
      setActionError(null);
    }
    closeImageMenu();
  };

  const openImageInPhotoshop = async (image: BoardMedia) => {
    if (isVideoFile(image.path)) {
      setActionError("Photoshop action is only available for images.");
      closeImageMenu();
      return;
    }
    const configuredPath = appSettings.photoshopPath.trim();
    if (!configuredPath) {
      setActionError("Set Photoshop location in Projects > Settings.");
      closeImageMenu();
      return;
    }
    const ok = await electron.openWithApp(configuredPath, image.path);
    if (!ok) {
      setActionError("Failed to open image in Photoshop.");
    } else {
      setActionError(null);
    }
    closeImageMenu();
  };

  const copyImageToClipboard = async (image: BoardMedia) => {
    if (isVideoFile(image.path)) {
      setActionError("Copy to clipboard is only available for images.");
      closeImageMenu();
      return;
    }
    const ok = await electron.copyImageToClipboard(image.path);
    if (!ok) {
      setActionError("Failed to copy image to clipboard.");
    } else {
      setActionError(null);
    }
    closeImageMenu();
  };

  const toggleFavorite = async (image: BoardMedia) => {
    if (!activeItem) return;
    const key = image.name.toLowerCase();
    const current = favoriteNames.slice();
    const next = image.isFavorite
      ? current.filter((name) => name.toLowerCase() !== key)
      : [...current, image.name];

    const resolved = resolveFavoritesAgainstFiles(images.map((item) => item.name), next);
    await saveBoardFavorites(activeItem.path, resolved);

    const favoriteLookup = new Set(resolved.map((name) => name.toLowerCase()));
    setFavoriteNames(resolved);
    setImages((itemsCurrent) => itemsCurrent.map((entry) => ({
      ...entry,
      isFavorite: favoriteLookup.has(entry.name.toLowerCase()),
    })));
    closeImageMenu();
  };

  const startMediaRename = (image: BoardMedia) => {
    setMediaRenameTarget(image);
    setMediaRenameValue(image.name);
    setMediaRenameError(null);
    setMediaRenameOpen(true);
    closeImageMenu();
  };

  const startRename = (item: BoardItem) => {
    setRenameTarget(item);
    setRenameValue(item.name);
    setRenameError(null);
    setRenameOpen(true);
    closeMenu();
  };

  const renameItem = async () => {
    if (!renameTarget) return;
    const raw = renameValue.trim();
    const safe = normalizeName(raw);
    if (!safe) {
      setRenameError(`${singularLabel} name cannot be empty.`);
      return;
    }
    const nextPath = joinPath(rootDir, safe);
    if (nextPath === renameTarget.path) {
      setRenameOpen(false);
      setRenameTarget(null);
      setRenameValue("");
      setRenameError(null);
      return;
    }
    if (items.some((item) => item.path === nextPath)) {
      setRenameError(`A ${singularLabel.toLowerCase()} with this name already exists.`);
      return;
    }
    await electron.rename(renameTarget.path, nextPath);
    await loadItems();
    setActive(nextPath);
    setRenameOpen(false);
    setRenameTarget(null);
    setRenameValue("");
    setRenameError(null);
  };

  const copyToActive = async (paths: string[]) => {
    if (!activeItem || !paths.length) return;
    for (const input of paths) {
      const fileName = getBaseName(input);
      const target = await uniqueTargetPath(activeItem.path, fileName);
      await electron.copyFile(input, target);
    }
    await loadBoardMedia(activeItem.path);
  };

  const renameMediaItem = async () => {
    if (!activeItem || !mediaRenameTarget) return;

    const sourceName = mediaRenameTarget.name;
    const sourceExt = getFileExtension(sourceName);
    const raw = mediaRenameValue.trim();
    let nextName = normalizeName(raw);
    if (!nextName) {
      setMediaRenameError("Asset name cannot be empty.");
      return;
    }
    if (!getFileExtension(nextName) && sourceExt) {
      nextName = `${nextName}${sourceExt}`;
    }

    const nextExt = getFileExtension(nextName);
    if (sourceExt.toLowerCase() !== nextExt.toLowerCase()) {
      setMediaRenameError("File extension cannot be changed.");
      return;
    }
    if (!isSupportedMediaFile(nextName)) {
      setMediaRenameError("File type is not supported.");
      return;
    }
    if (sourceName === nextName) {
      setMediaRenameOpen(false);
      setMediaRenameTarget(null);
      setMediaRenameValue("");
      setMediaRenameError(null);
      return;
    }
    if (images.some((item) => item.path !== mediaRenameTarget.path && item.name.toLowerCase() === nextName.toLowerCase())) {
      setMediaRenameError("A file with this name already exists.");
      return;
    }

    const nextPath = joinPath(activeItem.path, nextName);

    try {
      await electron.rename(mediaRenameTarget.path, nextPath);
      await renameLinkedThumbnail(mediaRenameTarget.path, nextPath);

      const sourceKey = sourceName.toLowerCase();
      const nextFavorites = favoriteNames.map((name) => (name.toLowerCase() === sourceKey ? nextName : name));
      const resolved = resolveFavoritesAgainstFiles(
        images
          .filter((item) => item.path !== mediaRenameTarget.path)
          .map((item) => item.name)
          .concat(nextName),
        nextFavorites,
      );
      await saveBoardFavorites(activeItem.path, resolved);

      setPreviewIndex(null);
      setMediaRenameOpen(false);
      setMediaRenameTarget(null);
      setMediaRenameValue("");
      setMediaRenameError(null);
      await loadBoardMedia(activeItem.path);
    } catch (error) {
      setMediaRenameError(error instanceof Error ? error.message : String(error));
    }
  };

  const closePreview = () => {
    setPreviewIndex(null);
  };

  const currentImage = previewIndex === null ? null : images[previewIndex] ?? null;
  const currentIsVideo = currentImage ? inferMediaKind(currentImage.path) === "video" : false;

  useEffect(() => {
    if (previewIndex === null) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Delete") {
        if (currentImage) {
          event.preventDefault();
          setConfirmTarget(currentImage);
          setConfirmOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewIndex, currentImage?.path]);

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    await electron.deleteFile(confirmTarget.path);
    setConfirmOpen(false);
    setConfirmTarget(null);
    if (activeItem) {
      await loadBoardMedia(activeItem.path);
    }
    setPreviewIndex(null);
  };

  return (
    <div className="page project-page project-page--with-sidebar">
      <div className="sidebar-nav moodboards-sidebar">
        <div className="sidebar-nav__items">
          {items.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`sidebar-nav__button${item.path === active ? " sidebar-nav__button--active" : ""}`}
              onClick={() => setActive(item.path)}
              onContextMenu={(event) => openMenu(event, item)}
            >
              {item.name}
            </button>
          ))}
          <button
            type="button"
            className="sidebar-nav__button moodboards-sidebar__new"
            onClick={() => setDialogOpen(true)}
          >
            + New {singularLabel.toLowerCase()}
          </button>
        </div>
      </div>

      <div className="project-page__content">
        <header className="page-header">
          <div>
            <h1>{pageTitle}</h1>
            <p className="page-subtitle">{sectionTitle}</p>
          </div>
        </header>

        <section className="panel">
          {actionError ? <p className="error">{actionError}</p> : null}
          {!activeItem ? (
            <p className="muted">Select a {singularLabel.toLowerCase()} to begin.</p>
          ) : (
            <>
              <DropOrBrowse
                label="Drop media here or click to browse"
                className="moodboard-dropzone"
                onPathsSelected={copyToActive}
                browse={async () => {
                  const picked = await window.electronAPI.pickFile({
                    title: "Select media",
                    filters: [
                      { name: "Media", extensions: ["png", "jpg", "jpeg", "webp", "mp4", "mov", "webm", "mkv", "avi", "m4v"] },
                      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
                      { name: "Videos", extensions: ["mp4", "mov", "webm", "mkv", "avi", "m4v"] },
                    ],
                  });
                  return picked;
                }}
              />
              <MediaTileGrid
                items={mediaItems}
                getKey={(item) => item.path}
                getTileClassName={(item) => `moodboard-tile${item.isFavorite ? " moodboard-tile--favorite" : ""}`}
                actionsPlacement="image-bottom-right"
                onOpen={(_item, idx) => setPreviewIndex(idx)}
                onContextMenu={(event, item) => openImageMenu(event, item)}
                renderActions={(item) => (
                  <button
                    type="button"
                    className={`moodboard-favorite-toggle${item.isFavorite ? " moodboard-favorite-toggle--active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleFavorite(item);
                    }}
                    aria-label={item.isFavorite ? "Unfavorite" : "Set favorite"}
                    title={item.isFavorite ? "Unfavorite" : "Set favorite"}
                  >
                    <img
                      src={item.isFavorite ? "icons/favorite_active.png" : "icons/favorite_not_active.png"}
                      alt=""
                      aria-hidden
                    />
                  </button>
                )}
              />
            </>
          )}
        </section>
      </div>

      {dialogOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">New {singularLabel}</h3>
            </div>
            <div className="form-section">
              <label className="form-row">
                <span className="section-title">Name</span>
                <input
                  className="form-input"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void createItem();
                    }
                  }}
                />
              </label>
            </div>
            {error ? <p className="error">{error}</p> : null}
            <div className="modal__footer">
              <button type="button" className="pill-button" onClick={() => setDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className="pill-button" onClick={() => void createItem()}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameOpen && renameTarget ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">Rename {singularLabel}</h3>
            </div>
            <div className="form-section">
              <label className="form-row">
                <span className="section-title">Name</span>
                <input
                  className="form-input"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void renameItem();
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
                  setRenameTarget(null);
                  setRenameValue("");
                  setRenameError(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="pill-button" onClick={() => void renameItem()}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mediaRenameOpen && mediaRenameTarget ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">Rename Asset</h3>
            </div>
            <div className="form-section">
              <label className="form-row">
                <span className="section-title">Name</span>
                <input
                  className="form-input"
                  value={mediaRenameValue}
                  onChange={(event) => setMediaRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void renameMediaItem();
                    }
                  }}
                />
              </label>
            </div>
            {mediaRenameError ? <p className="error">{mediaRenameError}</p> : null}
            <div className="modal__footer">
              <button
                type="button"
                className="pill-button"
                onClick={() => {
                  setMediaRenameOpen(false);
                  setMediaRenameTarget(null);
                  setMediaRenameValue("");
                  setMediaRenameError(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="pill-button" onClick={() => void renameMediaItem()}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MediaLightbox
        open={previewIndex !== null && Boolean(currentImage)}
        path={currentImage?.path ?? null}
        isVideo={currentIsVideo}
        name={currentImage?.name}
        onClose={closePreview}
        onNext={() => {
          if (!images.length) return;
          setPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % images.length;
          });
        }}
        onPrev={() => {
          if (!images.length) return;
          setPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + images.length) % images.length;
          });
        }}
        onContextMenu={(event) => {
          if (!currentImage) return;
          openImageMenu(event, currentImage);
        }}
        onCopy={() => {
          if (!currentImage) return;
          void copyImageToClipboard(currentImage);
        }}
        onReveal={() => {
          if (!currentImage) return;
          void revealImageInExplorer(currentImage);
        }}
      />

      {menuPos && menuItem ? (
        <div className="context-menu-backdrop" onClick={closeMenu}>
          <div
            className="context-menu"
            style={{ top: menuPos.y, left: menuPos.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="context-menu__item" onClick={() => void openInExplorer(menuItem)}>
              {revealLabel}
            </button>
            <button type="button" className="context-menu__item" onClick={() => void copyBoardPathToClipboard(menuItem)}>
              Copy as Path
            </button>
            <button type="button" className="context-menu__item" onClick={() => startRename(menuItem)}>
              Rename
            </button>
          </div>
        </div>
      ) : null}

      <MediaContextMenu
        open={Boolean(imageMenuPos && imageMenuItem)}
        position={imageMenuPos}
        onClose={closeImageMenu}
        actions={[
          {
            key: "favorite",
            label: imageMenuItem?.isFavorite ? "Unfavorite" : "Set favorite",
            visible: Boolean(imageMenuItem),
            onSelect: async () => {
              if (!imageMenuItem) return;
              await toggleFavorite(imageMenuItem);
            },
          },
          {
            key: "rename",
            label: "Rename...",
            visible: Boolean(imageMenuItem),
            onSelect: async () => {
              if (!imageMenuItem) return;
              startMediaRename(imageMenuItem);
            },
          },
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: Boolean(imageMenuItem && !isVideoFile(imageMenuItem.path)),
            onSelect: async () => {
              if (!imageMenuItem) return;
              await openImageInPhotoshop(imageMenuItem);
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(imageMenuItem && !isVideoFile(imageMenuItem.path)),
            onSelect: async () => {
              if (!imageMenuItem) return;
              await copyImageToClipboard(imageMenuItem);
            },
          },
          {
            key: "reveal",
            label: revealLabel,
            visible: Boolean(imageMenuItem),
            onSelect: async () => {
              if (!imageMenuItem) return;
              await revealImageInExplorer(imageMenuItem);
            },
          },
          {
            key: "copy-path",
            label: "Copy as Path",
            visible: Boolean(imageMenuItem),
            onSelect: async () => {
              if (!imageMenuItem) return;
              await copyMediaPathToClipboard(imageMenuItem);
            },
          },
        ]}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Media"
        message="Are you sure you want to delete this file?"
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmTarget(null);
        }}
        onConfirm={confirmDelete}
        confirmLabel="OK"
        cancelLabel="Cancel"
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

function normalizeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "").trim();
}

function isSupportedMediaFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".png")
    || lower.endsWith(".jpg")
    || lower.endsWith(".jpeg")
    || lower.endsWith(".webp")
    || lower.endsWith(".mp4")
    || lower.endsWith(".mov")
    || lower.endsWith(".webm")
    || lower.endsWith(".mkv")
    || lower.endsWith(".avi")
    || lower.endsWith(".m4v")
  );
}

function isVideoFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".mp4")
    || lower.endsWith(".mov")
    || lower.endsWith(".webm")
    || lower.endsWith(".mkv")
    || lower.endsWith(".avi")
    || lower.endsWith(".m4v")
  );
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0 || idx === fileName.length - 1) {
    return "";
  }
  return fileName.slice(idx);
}

function resolveFavoritesAgainstFiles(fileNames: string[], favorites: string[]): string[] {
  const fileLookup = new Map(fileNames.map((name) => [name.toLowerCase(), name]));
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const favorite of favorites) {
    const key = favorite.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    const existing = fileLookup.get(key);
    if (!existing) continue;
    seen.add(key);
    resolved.push(existing);
  }
  return resolved;
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function renameLinkedThumbnail(sourcePath: string, nextPath: string): Promise<void> {
  if (inferMediaKind(sourcePath) !== "image") {
    return;
  }
  const sourceThumbnailPath = getImageThumbnailPath(sourcePath);
  const nextThumbnailPath = getImageThumbnailPath(nextPath);
  if (sourceThumbnailPath === nextThumbnailPath) {
    return;
  }

  const sourceThumbnailExists = await electron.exists(sourceThumbnailPath);
  if (!sourceThumbnailExists) {
    return;
  }

  await electron.ensureDir(getDirectoryName(nextThumbnailPath));
  const nextThumbnailExists = await electron.exists(nextThumbnailPath);
  if (nextThumbnailExists) {
    await electron.deleteFile(sourceThumbnailPath);
    return;
  }

  await electron.rename(sourceThumbnailPath, nextThumbnailPath);
}

async function uniqueTargetPath(dir: string, fileName: string): Promise<string> {
  const extIdx = fileName.lastIndexOf(".");
  const base = extIdx >= 0 ? fileName.slice(0, extIdx) : fileName;
  const ext = extIdx >= 0 ? fileName.slice(extIdx) : "";
  let candidate = joinPath(dir, fileName);
  let counter = 1;
  while (await window.electronAPI.exists(candidate)) {
    const nextName = `${base}-${counter}${ext}`;
    candidate = joinPath(dir, nextName);
    counter += 1;
  }
  return candidate;
}
