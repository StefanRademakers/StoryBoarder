import { MediaContextMenu } from "../../components/common/MediaContextMenu";
import { inferMediaKind } from "../../components/common/mediaTypes";
import { electron } from "../../services/electron";
import type { CandidateAsset, ScenePoolAsset, ShotDisplayMode, ShotModeAsset } from "./types";

interface Position {
  x: number;
  y: number;
}

interface ShotsContextMenusProps {
  revealLabel: string;

  imageMenuPos: Position | null;
  imageMenuOpen: boolean;
  imageMenuHasShot: boolean;
  menuShotAssetPath: string;
  modeIsImage: boolean;
  displayMode: ShotDisplayMode;
  canCreateEmptyConcept: boolean;
  onCloseImageMenu: () => void;
  onReplaceMenuShotAsset: () => Promise<void>;
  onCreateEmptyConceptImage: () => Promise<void>;
  onOpenMenuShotInPhotoshop: () => Promise<void>;
  onCopyMenuShotToClipboard: () => Promise<void>;
  onRevealMenuShotInExplorer: () => Promise<void>;

  versionMenuPos: Position | null;
  versionMenuAsset: ShotModeAsset | null;
  onCloseVersionMenu: () => void;
  onSetFavoriteForVersionMenuAsset: () => Promise<void>;
  onDeleteVersionMenuAsset: () => void;
  onOpenVersionAssetInPhotoshop: () => Promise<void>;
  onCopyVersionAssetToClipboard: () => Promise<void>;
  onRevealVersionAssetInExplorer: () => Promise<void>;

  poolMenuPos: Position | null;
  poolMenuAsset: ScenePoolAsset | null;
  onClosePoolMenu: () => void;
  onOpenPoolAssetInPhotoshop: () => Promise<void>;
  onCopyPoolAssetToClipboard: () => Promise<void>;
  onRevealPoolAssetInExplorer: () => Promise<void>;

  candidateMenuPos: Position | null;
  candidateMenuAsset: CandidateAsset | null;
  onCloseCandidateMenu: () => void;
  onCopyCandidateAssetToClipboard: () => Promise<void>;
  onRevealCandidateAssetInExplorer: () => Promise<void>;
}

export function ShotsContextMenus({
  revealLabel,

  imageMenuPos,
  imageMenuOpen,
  imageMenuHasShot,
  menuShotAssetPath,
  modeIsImage,
  displayMode,
  canCreateEmptyConcept,
  onCloseImageMenu,
  onReplaceMenuShotAsset,
  onCreateEmptyConceptImage,
  onOpenMenuShotInPhotoshop,
  onCopyMenuShotToClipboard,
  onRevealMenuShotInExplorer,

  versionMenuPos,
  versionMenuAsset,
  onCloseVersionMenu,
  onSetFavoriteForVersionMenuAsset,
  onDeleteVersionMenuAsset,
  onOpenVersionAssetInPhotoshop,
  onCopyVersionAssetToClipboard,
  onRevealVersionAssetInExplorer,

  poolMenuPos,
  poolMenuAsset,
  onClosePoolMenu,
  onOpenPoolAssetInPhotoshop,
  onCopyPoolAssetToClipboard,
  onRevealPoolAssetInExplorer,

  candidateMenuPos,
  candidateMenuAsset,
  onCloseCandidateMenu,
  onCopyCandidateAssetToClipboard,
  onRevealCandidateAssetInExplorer,
}: ShotsContextMenusProps) {
  return (
    <>
      <MediaContextMenu
        open={imageMenuOpen}
        position={imageMenuPos}
        onClose={onCloseImageMenu}
        actions={[
          {
            key: "replace",
            label: displayMode === "clip"
              ? (menuShotAssetPath ? "Replace clip" : "Add clip")
              : displayMode === "performance"
                ? (menuShotAssetPath ? "Replace performance clip" : "Add performance clip")
              : (menuShotAssetPath ? "Replace image" : "Add image"),
            visible: imageMenuHasShot,
            onSelect: async () => {
              await onReplaceMenuShotAsset();
            },
          },
          {
            key: "create-empty",
            label: "Create empty image",
            visible: canCreateEmptyConcept,
            onSelect: async () => {
              await onCreateEmptyConceptImage();
            },
          },
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: modeIsImage && Boolean(menuShotAssetPath),
            onSelect: async () => {
              await onOpenMenuShotInPhotoshop();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: modeIsImage && Boolean(menuShotAssetPath),
            onSelect: async () => {
              await onCopyMenuShotToClipboard();
            },
          },
          {
            key: "reveal",
            label: revealLabel,
            visible: Boolean(menuShotAssetPath),
            onSelect: async () => {
              await onRevealMenuShotInExplorer();
            },
          },
          {
            key: "copy-path",
            label: "Copy as Path",
            visible: Boolean(menuShotAssetPath),
            onSelect: async () => {
              if (!menuShotAssetPath) return;
              await electron.copyPathToClipboard(menuShotAssetPath);
              onCloseImageMenu();
            },
          },
        ]}
      />

      <MediaContextMenu
        open={Boolean(versionMenuPos && versionMenuAsset)}
        position={versionMenuPos}
        onClose={onCloseVersionMenu}
        actions={[
          {
            key: "set-favorite",
            label: "Set favorite",
            visible: Boolean(versionMenuAsset && !versionMenuAsset.isFavorite),
            onSelect: async () => {
              await onSetFavoriteForVersionMenuAsset();
            },
          },
          {
            key: "delete-version",
            label: "Delete version",
            visible: Boolean(versionMenuAsset),
            onSelect: async () => {
              onDeleteVersionMenuAsset();
            },
          },
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: Boolean(versionMenuAsset && displayMode !== "clip" && displayMode !== "performance"),
            onSelect: async () => {
              await onOpenVersionAssetInPhotoshop();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(versionMenuAsset && displayMode !== "clip" && displayMode !== "performance"),
            onSelect: async () => {
              await onCopyVersionAssetToClipboard();
            },
          },
          {
            key: "reveal",
            label: revealLabel,
            visible: Boolean(versionMenuAsset),
            onSelect: async () => {
              await onRevealVersionAssetInExplorer();
            },
          },
          {
            key: "copy-path",
            label: "Copy as Path",
            visible: Boolean(versionMenuAsset),
            onSelect: async () => {
              if (!versionMenuAsset) return;
              await electron.copyPathToClipboard(versionMenuAsset.path);
              onCloseVersionMenu();
            },
          },
        ]}
      />

      <MediaContextMenu
        open={Boolean(poolMenuPos && poolMenuAsset)}
        position={poolMenuPos}
        onClose={onClosePoolMenu}
        actions={[
          {
            key: "open-ps",
            label: "Open in Photoshop",
            visible: Boolean(poolMenuAsset && inferMediaKind(poolMenuAsset.path) !== "video"),
            onSelect: async () => {
              await onOpenPoolAssetInPhotoshop();
            },
          },
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(poolMenuAsset && inferMediaKind(poolMenuAsset.path) !== "video"),
            onSelect: async () => {
              await onCopyPoolAssetToClipboard();
            },
          },
          {
            key: "reveal",
            label: revealLabel,
            visible: Boolean(poolMenuAsset),
            onSelect: async () => {
              await onRevealPoolAssetInExplorer();
            },
          },
          {
            key: "copy-path",
            label: "Copy as Path",
            visible: Boolean(poolMenuAsset),
            onSelect: async () => {
              if (!poolMenuAsset) return;
              await electron.copyPathToClipboard(poolMenuAsset.path);
              onClosePoolMenu();
            },
          },
        ]}
      />

      <MediaContextMenu
        open={Boolean(candidateMenuPos && candidateMenuAsset)}
        position={candidateMenuPos}
        onClose={onCloseCandidateMenu}
        actions={[
          {
            key: "copy",
            label: "Copy to Clipboard",
            visible: Boolean(candidateMenuAsset && inferMediaKind(candidateMenuAsset.path) !== "video"),
            onSelect: async () => {
              await onCopyCandidateAssetToClipboard();
            },
          },
          {
            key: "reveal",
            label: revealLabel,
            visible: Boolean(candidateMenuAsset),
            onSelect: async () => {
              await onRevealCandidateAssetInExplorer();
            },
          },
          {
            key: "copy-path",
            label: "Copy as Path",
            visible: Boolean(candidateMenuAsset),
            onSelect: async () => {
              if (!candidateMenuAsset) return;
              await electron.copyPathToClipboard(candidateMenuAsset.path);
              onCloseCandidateMenu();
            },
          },
        ]}
      />
    </>
  );
}
