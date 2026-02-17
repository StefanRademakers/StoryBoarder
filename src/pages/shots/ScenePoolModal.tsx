import type { MouseEvent } from "react";
import { MediaTileGrid } from "../../components/common/MediaTileGrid";
import type { MediaItem } from "../../components/common/mediaTypes";
import type { ScenePoolAsset } from "./types";

interface ScenePoolModalProps {
  open: boolean;
  loading: boolean;
  assets: ScenePoolAsset[];
  mediaItems: Array<MediaItem & ScenePoolAsset>;
  onClose: () => void;
  onOpenPreview: (index: number) => void;
  onContextMenu: (event: MouseEvent, asset: ScenePoolAsset) => void;
}

export function ScenePoolModal({
  open,
  loading,
  assets,
  mediaItems,
  onClose,
  onOpenPreview,
  onContextMenu,
}: ScenePoolModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shot-pool-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Scene Pool</h3>
          <button type="button" className="pill-button" onClick={onClose}>
            Close
          </button>
        </div>
        {loading ? <p className="muted">Loading pool images...</p> : null}
        {!loading && !assets.length ? (
          <p className="muted">No images found in this scene&apos;s referenced Character/Props and Moodboards.</p>
        ) : null}
        {!loading && assets.length ? (
          <MediaTileGrid
            items={mediaItems}
            className="moodboard-grid shot-pool-grid"
            getKey={(item) => item.path}
            onOpen={(_item, idx) => onOpenPreview(idx)}
            onContextMenu={(event, item) => onContextMenu(event, item)}
            renderActions={(asset) => (
              <div className="shot-pool-grid__meta">{asset.source}</div>
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
