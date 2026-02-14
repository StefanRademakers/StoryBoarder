import { useState, type MouseEvent } from "react";
import { electron } from "../../services/electron";
import { extractPathsFromDrop, handleDragOver } from "../../utils/dnd";
import { toFileUrl } from "../../utils/path";
import { MediaContextMenu } from "./MediaContextMenu";

interface ImageAssetFieldProps {
  imagePath?: string | null;
  emptyLabel?: string;
  onReplace: (paths: string[]) => Promise<void> | void;
  browse: () => Promise<string | string[] | null | undefined>;
  photoshopPath?: string;
}

export function ImageAssetField({
  imagePath,
  emptyLabel = "Drop image here or click to browse",
  onReplace,
  browse,
  photoshopPath,
}: ImageAssetFieldProps) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const hasImage = Boolean(imagePath);
  const revealLabel = isMacPlatform() ? "Reveal in Finder" : "Reveal in Explorer";

  const handleBrowse = async () => {
    const picked = await browse();
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    const normalized = paths.filter(Boolean) as string[];
    if (!normalized.length) return;
    await onReplace(normalized);
  };

  const openMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!hasImage) return;
    event.preventDefault();
    setMenuPos({ x: event.clientX, y: event.clientY });
  };

  const closeMenu = () => {
    setMenuPos(null);
  };

  const replaceImage = async () => {
    await handleBrowse();
    closeMenu();
  };

  const openInPhotoshop = async () => {
    if (!imagePath) return;
    const configuredPath = photoshopPath?.trim() ?? "";
    if (!configuredPath) {
      setActionError("Set Photoshop location first.");
      closeMenu();
      return;
    }
    const ok = await electron.openWithApp(configuredPath, imagePath);
    if (!ok) {
      setActionError("Failed to open image in Photoshop.");
    } else {
      setActionError(null);
    }
    closeMenu();
  };

  const copyToClipboard = async () => {
    if (!imagePath) return;
    const ok = await electron.copyImageToClipboard(imagePath);
    if (!ok) {
      setActionError("Failed to copy image to clipboard.");
    } else {
      setActionError(null);
    }
    closeMenu();
  };

  const revealInExplorer = async () => {
    if (!imagePath) return;
    const ok = await electron.revealInFileManager(imagePath);
    if (!ok) {
      setActionError("Failed to reveal image.");
    } else {
      setActionError(null);
    }
    closeMenu();
  };

  return (
    <div className="image-asset-field">
      {actionError ? <p className="error">{actionError}</p> : null}
      {!hasImage ? (
        <div
          className="image-asset-field__empty moodboard-dropzone"
          role="button"
          tabIndex={0}
          onClick={() => {
            void handleBrowse();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void handleBrowse();
            }
          }}
          onDragOver={handleDragOver}
          onDrop={async (event) => {
            const paths = await extractPathsFromDrop(event);
            if (!paths.length) return;
            await onReplace(paths);
          }}
        >
          {emptyLabel}
        </div>
      ) : (
        <div
          className="image-asset-field__preview"
          role="button"
          tabIndex={0}
          onClick={() => {
            void handleBrowse();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void handleBrowse();
            }
          }}
          onDragOver={handleDragOver}
          onDrop={async (event) => {
            const paths = await extractPathsFromDrop(event);
            if (!paths.length) return;
            await onReplace(paths);
          }}
          onContextMenu={openMenu}
        >
          <img src={toFileUrl(imagePath)} alt="" />
        </div>
      )}

      <MediaContextMenu
        open={Boolean(menuPos && imagePath)}
        position={menuPos}
        onClose={closeMenu}
        actions={[
          {
            key: "replace",
            label: "Replace image",
            visible: Boolean(imagePath),
            onSelect: async () => {
              await replaceImage();
            },
          },
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: Boolean(imagePath),
            onSelect: async () => {
              await openInPhotoshop();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(imagePath),
            onSelect: async () => {
              await copyToClipboard();
            },
          },
          {
            key: "reveal",
            label: revealLabel,
            visible: Boolean(imagePath),
            onSelect: async () => {
              await revealInExplorer();
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
