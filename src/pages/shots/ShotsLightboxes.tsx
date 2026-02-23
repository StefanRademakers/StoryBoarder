import type { MouseEvent } from "react";
import { MediaLightbox } from "../../components/common/MediaLightbox";
import { inferMediaKind } from "../../components/common/mediaTypes";
import type {
  CandidateAsset,
  InlineFullscreenAsset,
  ScenePoolAsset,
  ShotDisplayMode,
  ShotModeAsset,
} from "./types";

interface ShotsLightboxesProps {
  previewAsset: ShotModeAsset | null;
  modeAssetsCount: number;
  displayMode: ShotDisplayMode;
  onSetPreviewIndex: (updater: (prev: number | null) => number | null) => void;
  onOpenVersionMenu: (event: MouseEvent, asset: ShotModeAsset) => void;
  onCopyImageToClipboard: (path: string) => void;
  onRevealInFileManager: (path: string) => void;

  poolPreviewAsset: ScenePoolAsset | null;
  poolAssetsCount: number;
  onSetPoolPreviewIndex: (updater: (prev: number | null) => number | null) => void;
  onOpenPoolMenu: (event: MouseEvent, asset: ScenePoolAsset) => void;

  candidatePreviewAsset: CandidateAsset | null;
  candidateAssetsCount: number;
  onSetCandidatePreviewIndex: (updater: (prev: number | null) => number | null) => void;
  onOpenCandidateMenu: (event: MouseEvent, asset: CandidateAsset) => void;

  inlineFullscreenAsset: InlineFullscreenAsset | null;
  onCloseInlineFullscreen: () => void;
}

export function ShotsLightboxes({
  previewAsset,
  modeAssetsCount,
  displayMode,
  onSetPreviewIndex,
  onOpenVersionMenu,
  onCopyImageToClipboard,
  onRevealInFileManager,

  poolPreviewAsset,
  poolAssetsCount,
  onSetPoolPreviewIndex,
  onOpenPoolMenu,

  candidatePreviewAsset,
  candidateAssetsCount,
  onSetCandidatePreviewIndex,
  onOpenCandidateMenu,

  inlineFullscreenAsset,
  onCloseInlineFullscreen,
}: ShotsLightboxesProps) {
  return (
    <>
      <MediaLightbox
        open={Boolean(previewAsset)}
        path={previewAsset?.path ?? null}
        isVideo={previewAsset ? inferMediaKind(previewAsset.path) === "video" : false}
        name={previewAsset?.name}
        onClose={() => onSetPreviewIndex(() => null)}
        onNext={() => {
          if (!modeAssetsCount) return;
          onSetPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % modeAssetsCount;
          });
        }}
        onPrev={() => {
          if (!modeAssetsCount) return;
          onSetPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + modeAssetsCount) % modeAssetsCount;
          });
        }}
        onContextMenu={(event) => {
          if (!previewAsset) return;
          onOpenVersionMenu(event, previewAsset);
        }}
        onCopy={() => {
          if (!previewAsset || displayMode === "clip") return;
          onCopyImageToClipboard(previewAsset.path);
        }}
        onReveal={() => {
          if (!previewAsset) return;
          onRevealInFileManager(previewAsset.path);
        }}
      />

      <MediaLightbox
        open={Boolean(poolPreviewAsset)}
        path={poolPreviewAsset?.path ?? null}
        isVideo={poolPreviewAsset ? inferMediaKind(poolPreviewAsset.path) === "video" : false}
        name={poolPreviewAsset?.name}
        meta={poolPreviewAsset?.source}
        onClose={() => onSetPoolPreviewIndex(() => null)}
        onNext={() => {
          if (!poolAssetsCount) return;
          onSetPoolPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % poolAssetsCount;
          });
        }}
        onPrev={() => {
          if (!poolAssetsCount) return;
          onSetPoolPreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + poolAssetsCount) % poolAssetsCount;
          });
        }}
        onCopy={() => {
          if (!poolPreviewAsset || inferMediaKind(poolPreviewAsset.path) === "video") return;
          onCopyImageToClipboard(poolPreviewAsset.path);
        }}
        onReveal={() => {
          if (!poolPreviewAsset) return;
          onRevealInFileManager(poolPreviewAsset.path);
        }}
        onContextMenu={(event) => {
          if (!poolPreviewAsset) return;
          onOpenPoolMenu(event, poolPreviewAsset);
        }}
      />

      <MediaLightbox
        open={Boolean(candidatePreviewAsset)}
        path={candidatePreviewAsset?.path ?? null}
        isVideo={candidatePreviewAsset ? inferMediaKind(candidatePreviewAsset.path) === "video" : false}
        name={candidatePreviewAsset?.name}
        onClose={() => onSetCandidatePreviewIndex(() => null)}
        onNext={() => {
          if (!candidateAssetsCount) return;
          onSetCandidatePreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev + 1) % candidateAssetsCount;
          });
        }}
        onPrev={() => {
          if (!candidateAssetsCount) return;
          onSetCandidatePreviewIndex((prev) => {
            if (prev === null) return prev;
            return (prev - 1 + candidateAssetsCount) % candidateAssetsCount;
          });
        }}
        onCopy={() => {
          if (!candidatePreviewAsset || inferMediaKind(candidatePreviewAsset.path) === "video") return;
          onCopyImageToClipboard(candidatePreviewAsset.path);
        }}
        onReveal={() => {
          if (!candidatePreviewAsset) return;
          onRevealInFileManager(candidatePreviewAsset.path);
        }}
        onContextMenu={(event) => {
          if (!candidatePreviewAsset) return;
          onOpenCandidateMenu(event, candidatePreviewAsset);
        }}
      />

      <MediaLightbox
        open={Boolean(inlineFullscreenAsset)}
        path={inlineFullscreenAsset?.path ?? null}
        isVideo={inlineFullscreenAsset?.isVideo ?? false}
        name={inlineFullscreenAsset?.name}
        onClose={onCloseInlineFullscreen}
        onCopy={() => {
          if (!inlineFullscreenAsset || inlineFullscreenAsset.isVideo) return;
          onCopyImageToClipboard(inlineFullscreenAsset.path);
        }}
        onReveal={() => {
          if (!inlineFullscreenAsset) return;
          onRevealInFileManager(inlineFullscreenAsset.path);
        }}
      />
    </>
  );
}
