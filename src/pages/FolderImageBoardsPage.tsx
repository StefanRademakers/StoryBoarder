import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { ProjectState } from "../state/types";
import { joinPath, toFileUrl } from "../utils/path";
import { electron } from "../services/electron";
import { DropOrBrowse } from "../components/common/DropOrBrowse";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { useAppState } from "../state/appState";

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

interface BoardImage {
  name: string;
  path: string;
  mtimeMs: number;
}

const SettingsIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Zm8 3.5l-1.86-.58a6.58 6.58 0 0 0-.45-1.09l.9-1.72l-1.42-1.42l-1.72.9c-.35-.18-.71-.33-1.09-.45L14 4h-4l-.58 1.86c-.38.12-.74.27-1.09.45l-1.72-.9L5.2 6.83l.9 1.72c-.18.35-.33.71-.45 1.09L4 12v2l1.86.58c.12.38.27.74.45 1.09l-.9 1.72l1.42 1.42l1.72-.9c.35.18.71.33 1.09.45L10 20h4l.58-1.86c.38-.12.74-.27 1.09-.45l1.72.9l1.42-1.42l-.9-1.72c.18-.35.33-.71.45-1.09L20 14v-2Z"
      fill="currentColor"
    />
  </svg>
);

export function FolderImageBoardsPage({
  project,
  folderName,
  pageTitle,
  sectionTitle,
  singularLabel,
}: FolderImageBoardsPageProps) {
  const { updateProject } = useAppState();
  const revealLabel = isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer";
  const rootDir = joinPath(project.paths.root, folderName);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<BoardImage[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<BoardImage | null>(null);
  const [menuItem, setMenuItem] = useState<BoardItem | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<BoardItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [photoshopPath, setPhotoshopPath] = useState(project.settings?.photoshopPath ?? "");
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageMenuItem, setImageMenuItem] = useState<BoardImage | null>(null);
  const [imageMenuPos, setImageMenuPos] = useState<{ x: number; y: number } | null>(null);

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

  const loadImages = async (dir: string) => {
    const entries = await electron.listDir(dir);
    const files = entries.filter((e) => e.isFile && isImageFile(e.name));
    const list: BoardImage[] = [];
    for (const f of files) {
      const path = joinPath(dir, f.name);
      const stat = await electron.stat(path);
      list.push({ name: f.name, path, mtimeMs: stat?.mtimeMs ?? 0 });
    }
    list.sort((a, b) => b.mtimeMs - a.mtimeMs);
    setImages(list);
  };

  useEffect(() => {
    if (!activeItem) {
      setImages([]);
      return;
    }
    void loadImages(activeItem.path);
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

  const closeImageMenu = () => {
    setImageMenuItem(null);
    setImageMenuPos(null);
  };

  const openImageMenu = (event: MouseEvent, image: BoardImage) => {
    event.preventDefault();
    setImageMenuItem(image);
    setImageMenuPos({ x: event.clientX, y: event.clientY });
  };

  const revealImageInExplorer = async (image: BoardImage) => {
    await electron.revealInFileManager(image.path);
    closeImageMenu();
  };

  const openImageInPhotoshop = async (image: BoardImage) => {
    const configuredPath = project.settings?.photoshopPath?.trim() ?? "";
    if (!configuredPath) {
      setActionError("Set Photoshop location first.");
      setSettingsOpen(true);
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

  const copyImageToClipboard = async (image: BoardImage) => {
    const ok = await electron.copyImageToClipboard(image.path);
    if (!ok) {
      setActionError("Failed to copy image to clipboard.");
    } else {
      setActionError(null);
    }
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
    await loadImages(activeItem.path);
  };

  const closePreview = () => {
    setPreviewIndex(null);
  };

  const currentImage = previewIndex === null ? null : images[previewIndex] ?? null;

  useEffect(() => {
    if (!settingsOpen) return;
    setPhotoshopPath(project.settings?.photoshopPath ?? "");
  }, [settingsOpen, project.settings?.photoshopPath]);

  useEffect(() => {
    if (!currentImage) {
      setPreviewSize(null);
      return;
    }
    let canceled = false;
    const img = new Image();
    img.onload = () => {
      if (canceled) return;
      setPreviewSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (canceled) return;
      setPreviewSize(null);
    };
    img.src = toFileUrl(currentImage.path);
    return () => {
      canceled = true;
    };
  }, [currentImage?.path]);

  useEffect(() => {
    if (previewIndex === null) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreview();
      } else if (event.key === "ArrowRight") {
        setPreviewIndex((prev) => {
          if (prev === null) return prev;
          return (prev + 1) % images.length;
        });
      } else if (event.key === "ArrowLeft") {
        setPreviewIndex((prev) => {
          if (prev === null) return prev;
          return (prev - 1 + images.length) % images.length;
        });
      } else if (event.key === "Delete") {
        if (currentImage) {
          setConfirmTarget(currentImage);
          setConfirmOpen(true);
        }
      } else if (event.key === "Enter") {
        if (!currentImage) return;
        const configuredPath = project.settings?.photoshopPath?.trim() ?? "";
        if (configuredPath) {
          void electron.openWithApp(configuredPath, currentImage.path);
        } else {
          setActionError("Set Photoshop location first.");
          setSettingsOpen(true);
        }
        void electron.revealInFileManager(currentImage.path);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewIndex, images.length, currentImage?.path]);

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    await electron.deleteFile(confirmTarget.path);
    setConfirmOpen(false);
    setConfirmTarget(null);
    if (activeItem) {
      await loadImages(activeItem.path);
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
          <div className="actions">
            <button type="button" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <span className="icon">{SettingsIcon}</span>
            </button>
          </div>
        </header>

        <section className="panel">
          {actionError ? <p className="error">{actionError}</p> : null}
          {!activeItem ? (
            <p className="muted">Select a {singularLabel.toLowerCase()} to begin.</p>
          ) : (
            <>
              <DropOrBrowse
                label="Drop images here or click to browse"
                className="moodboard-dropzone"
                onPathsSelected={copyToActive}
                browse={async () => {
                  const picked = await window.electronAPI.pickFile({
                    title: "Select images",
                    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
                  });
                  return picked;
                }}
              />
              <div className="moodboard-grid">
                {images.map((img, idx) => (
                  <button
                    key={img.path}
                    type="button"
                    className="moodboard-tile"
                    onClick={() => setPreviewIndex(idx)}
                    onContextMenu={(event) => openImageMenu(event, img)}
                  >
                    <div className="moodboard-tile__img">
                      <img src={toFileUrl(img.path)} alt="" />
                    </div>
                    <div className="moodboard-tile__label">{img.name}</div>
                  </button>
                ))}
              </div>
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

      {settingsOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">Settings</h3>
            </div>
            <div className="form-section">
              <label className="form-row">
                <span className="section-title">Photoshop location</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="form-input"
                    value={photoshopPath}
                    onChange={(event) => setPhotoshopPath(event.target.value)}
                  />
                  <button
                    type="button"
                    className="pill-button"
                    onClick={async () => {
                      const picked = await window.electronAPI.pickFile({
                        title: "Select Photoshop executable",
                        defaultPath: photoshopPath || undefined,
                      });
                      if (picked) {
                        setPhotoshopPath(picked);
                      }
                    }}
                  >
                    Browse
                  </button>
                </div>
              </label>
            </div>
            <div className="modal__footer">
              <button
                type="button"
                className="pill-button"
                onClick={() => {
                  setSettingsOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pill-button"
                onClick={() => {
                  updateProject((draft) => {
                    draft.settings ??= {};
                    draft.settings.photoshopPath = photoshopPath.trim();
                  });
                  setSettingsOpen(false);
                  setActionError(null);
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewIndex !== null && currentImage ? (
        <div className="moodboard-preview" onClick={closePreview}>
          <div
            className="moodboard-preview__inner"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(event) => openImageMenu(event, currentImage)}
          >
            <img src={toFileUrl(currentImage.path)} alt="" />
            <div className="moodboard-preview__name">
              {currentImage.name}
              {previewSize ? ` (${previewSize.width}x${previewSize.height})` : ""}
            </div>
          </div>
        </div>
      ) : null}

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
            <button type="button" className="context-menu__item" onClick={() => startRename(menuItem)}>
              Rename
            </button>
          </div>
        </div>
      ) : null}

      {imageMenuPos && imageMenuItem ? (
        <div className="context-menu-backdrop" onClick={closeImageMenu}>
          <div
            className="context-menu"
            style={{ top: imageMenuPos.y, left: imageMenuPos.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="context-menu__item" onClick={() => void openImageInPhotoshop(imageMenuItem)}>
              Open in Photoshop
            </button>
            <button type="button" className="context-menu__item" onClick={() => void copyImageToClipboard(imageMenuItem)}>
              Copy to Clipboard
            </button>
            <button type="button" className="context-menu__item" onClick={() => void revealImageInExplorer(imageMenuItem)}>
              {revealLabel}
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Image"
        message="Are you sure you want to delete this image?"
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

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp");
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
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
