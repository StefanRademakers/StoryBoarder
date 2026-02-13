import React, { useEffect, useRef } from "react";
import { extractPathsFromDrop, handleDragOver } from "../../utils/dnd";

const ImageIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
    <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 14l2.5-3 3 4 2-2 2.5 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="9" cy="10" r="1.5" fill="currentColor" />
  </svg>
);

export interface DropOrBrowseProps {
  label?: string;
  onPathsSelected: (paths: string[]) => void;
  browse?: () => Promise<string | string[] | null | undefined>;
  className?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  enablePasteContextMenu?: boolean;
}

export function DropOrBrowse({
  label = "Drop or Browse",
  onPathsSelected,
  browse,
  className = "card__dropzone",
  onContextMenu,
  enablePasteContextMenu = true,
}: DropOrBrowseProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handlePaste = async (event: ClipboardEvent) => {
      event.preventDefault();
      if (!event.clipboardData) return;

      const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        const tempPath = await window.electronAPI.saveClipboardImage(buffer);
        if (tempPath) {
          onPathsSelected([tempPath]);
        }
      } catch (error) {
        console.error("Failed to handle pasted image:", error);
      }
    };

    element.addEventListener("paste", handlePaste);
    return () => {
      element.removeEventListener("paste", handlePaste);
    };
  }, [onPathsSelected]);

  const onClick = async () => {
    if (!browse) return;
    const result = await browse();
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    const filtered = paths.filter(Boolean) as string[];
    if (filtered.length) onPathsSelected(filtered);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragOver={handleDragOver}
      onDrop={async (e) => {
        const files = await extractPathsFromDrop(e);
        if (files.length) onPathsSelected(files);
      }}
      style={{ cursor: browse ? "pointer" : "default" }}
      onContextMenu={async (e) => {
        onContextMenu?.(e);
        if (e.defaultPrevented || !enablePasteContextMenu) {
          return;
        }
        e.preventDefault();
        const menu = document.createElement("div");
        menu.style.position = "fixed";
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.background = "#222";
        menu.style.color = "#fff";
        menu.style.padding = "8px 16px";
        menu.style.borderRadius = "6px";
        menu.style.zIndex = "9999";
        menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
        menu.style.cursor = "pointer";
        menu.textContent = "Paste";
        menu.onclick = async () => {
          menu.remove();
          try {
            const clipboardItems = await navigator.clipboard.read();
            const imageItem = clipboardItems.find(item => item.types.some(type => type.startsWith("image/")));
            if (imageItem) {
              const blob = await imageItem.getType(imageItem.types.find(type => type.startsWith("image/"))!);
              const buffer = await blob.arrayBuffer();
              const tempPath = await window.electronAPI.saveClipboardImage(buffer);
              if (tempPath) {
                onPathsSelected([tempPath]);
              }
            }
          } catch (err) {
            console.error("Failed to paste image from clipboard:", err);
          }
        };
        document.body.appendChild(menu);
        const removeMenu = () => menu.remove();
        setTimeout(() => {
          document.addEventListener("click", removeMenu, { once: true });
        }, 0);
      }}
    >
      <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
        <span aria-hidden>{ImageIcon}</span>
        <div>{label}</div>
      </div>
    </div>
  );
}
