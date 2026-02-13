import { useEffect, useMemo, useState } from "react";
import { electron } from "../../services/electron";
import { joinPath } from "../../utils/path";
import { MdxTextSection } from "../common/MdxTextSection";
import { ConfirmDialog } from "../common/ConfirmDialog";

interface LibraryItem {
  name: string;
  path: string;
  mtimeMs: number;
  content?: string;
}

interface LibrarySectionProps {
  projectRoot: string;
  folderName: string;
  title: string;
  placeholder?: string;
  defaultPrefix?: string;
}

export function LibrarySection({
  projectRoot,
  folderName,
  title,
  placeholder,
  defaultPrefix = "Untitled",
}: LibrarySectionProps) {
  const baseDir = joinPath(projectRoot, folderName);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<LibraryItem | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<LibraryItem | null>(null);
  const revealLabel = isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer";

  const loadItems = async () => {
    await electron.ensureDir(baseDir);
    const entries = await electron.listDir(baseDir);
    const files = entries.filter((e) => e.isFile && e.name.toLowerCase().endsWith(".md"));
    const items: LibraryItem[] = [];
    for (const file of files) {
      const path = joinPath(baseDir, file.name);
      const stat = await electron.stat(path);
      items.push({
        name: file.name,
        path,
        mtimeMs: stat?.mtimeMs ?? 0,
      });
    }
    items.sort((a, b) => b.mtimeMs - a.mtimeMs);
    setItems(items);
  };

  useEffect(() => {
    void loadItems();
  }, [baseDir]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) => {
      if (n.name.toLowerCase().includes(q)) return true;
      if (n.content && n.content.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [items, searchTerm]);

  const activeItem = items.find((n) => n.path === activePath) ?? null;

  const openItem = async (note: LibraryItem) => {
    if (activePath && activePath !== note.path) {
      await electron.writeText(activePath, content);
    }
    const text = await electron.readText(note.path);
    setActivePath(note.path);
    setContent(text);
    setRenameValue(stripExtension(note.name));
  };

  const createItem = async () => {
    await electron.ensureDir(baseDir);
    let index = 1;
    let name = `${defaultPrefix} ${String(index).padStart(3, "0")}.md`;
    const existing = new Set(items.map((n) => n.name.toLowerCase()));
    while (existing.has(name.toLowerCase())) {
      index += 1;
      name = `${defaultPrefix} ${String(index).padStart(3, "0")}.md`;
    }
    const path = joinPath(baseDir, name);
    await electron.writeText(path, "");
    await loadItems();
    await openItem({ name, path, mtimeMs: Date.now() });
  };

  const handleRename = async () => {
    if (!activeItem) return;
    const raw = renameValue.trim();
    if (!raw) return;
    const normalized = normalizeName(raw);
    const nextName = normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
    const nextPath = joinPath(baseDir, nextName);
    if (nextPath === activeItem.path) return;
    const exists = items.some((n) => n.path === nextPath);
    if (exists) {
      setRenameError("Filename already exists.");
      return;
    }
    await electron.rename(activeItem.path, nextPath);
    setRenameError(null);
    setActivePath(nextPath);
    setRenameValue(stripExtension(nextName));
    await loadItems();
  };

  const openMenu = (event: React.MouseEvent, note: LibraryItem) => {
    event.preventDefault();
    setMenuItem(note);
    setMenuPos({ x: event.clientX, y: event.clientY });
  };

  const closeMenu = () => {
    setMenuItem(null);
    setMenuPos(null);
  };

  const requestDelete = (note: LibraryItem) => {
    setConfirmTarget(note);
    setConfirmOpen(true);
    closeMenu();
  };

  const revealInFileManager = async (note: LibraryItem) => {
    await electron.revealInFileManager(note.path);
    closeMenu();
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    await electron.deleteFile(confirmTarget.path);
    if (activePath === confirmTarget.path) {
      setActivePath(null);
      setContent("");
      setRenameValue("");
    }
    setConfirmOpen(false);
    setConfirmTarget(null);
    await loadItems();
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setSearchTerm("");
      return;
    }
    setSearching(true);
    const results = await Promise.all(items.map(async (note) => {
      if (note.content !== undefined) return note;
      const text = await electron.readText(note.path);
      return { ...note, content: text };
    }));
    setItems(results);
    setSearchTerm(q);
    setSearching(false);
  };

  return (
    <section className="panel notes-panel">
      <div className="notes-header">
        <button type="button" className="pill-button" onClick={createItem}>
          New {title}
        </button>
        <div className="notes-search">
          <div className="notes-search__field">
            <input
              className="notes-search__input"
              placeholder="Search"
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (!value.trim()) {
                  setSearchTerm("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void runSearch();
                }
              }}
              onBlur={() => {
                if (!query.trim()) {
                  setSearchTerm("");
                }
              }}
            />
            {query.trim() ? (
              <button
                type="button"
                className="notes-search__clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setSearchTerm("");
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="notes-body">
        <div className="notes-list">
          {filteredItems.map((note) => (
            <button
              key={note.path}
              type="button"
              className={`notes-list__item${note.path === activePath ? " notes-list__item--active" : ""}`}
              onClick={() => void openItem(note)}
              onContextMenu={(event) => openMenu(event, note)}
            >
              <div className="notes-list__title">{stripExtension(note.name)}</div>
              <div className="notes-list__meta">
                {note.mtimeMs ? new Date(note.mtimeMs).toLocaleDateString() : ""}
              </div>
            </button>
          ))}
          {searching ? <p className="muted">Searching...</p> : null}
          {!searching && filteredItems.length === 0 ? <p className="muted">No items found.</p> : null}
        </div>

        <div className="notes-editor">
          {activeItem ? (
            <>
              <div className="notes-title">
                <input
                  className="notes-title__input"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => void handleRename()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <span className="notes-title__suffix">.md</span>
              </div>
              <MdxTextSection
                key={activePath ?? activeItem.path}
                value={content}
                onChange={(markdown) => setContent(markdown)}
                projectRoot={projectRoot}
                fileName={activeItem.name}
                targetPath={activePath ?? activeItem.path}
                placeholder={placeholder ?? "Write your note..."}
                debounceMs={800}
                wrapInPanel={false}
                className="notes-editor__mdx"
              />
            </>
          ) : (
            <div className="notes-empty muted">Select an item to begin.</div>
          )}
        </div>
      </div>

      {renameError ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">Filename exists</h3>
            </div>
            <p className="muted">{renameError}</p>
            <div className="modal__footer">
              <button
                type="button"
                className="pill-button"
                onClick={() => setRenameError(null)}
              >
                Close
              </button>
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
            <button type="button" className="context-menu__item" onClick={() => void revealInFileManager(menuItem)}>
              {revealLabel}
            </button>
            <button type="button" className="context-menu__item" onClick={() => requestDelete(menuItem)}>
              Delete
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${title}`}
        message={`Are you sure you want to delete this ${title.toLowerCase()}?`}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmTarget(null);
        }}
        onConfirm={confirmDelete}
        confirmLabel="OK"
        cancelLabel="Cancel"
      />
    </section>
  );
}

function stripExtension(name: string): string {
  return name.replace(/\.md$/i, "");
}

function normalizeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "").trim();
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  return platform.includes("mac");
}
