import type { MouseEvent } from "react";
import { MediaTileGrid } from "../../components/common/MediaTileGrid";
import type { MediaItem } from "../../components/common/mediaTypes";
import { capitalizeMode } from "./utils";
import type { ShotDisplayMode, ShotModeAsset } from "./types";

interface ShotVersionsModalProps {
  open: boolean;
  displayMode: ShotDisplayMode;
  modeAssetsLoading: boolean;
  modeAssets: ShotModeAsset[];
  versionMediaItems: Array<MediaItem & ShotModeAsset>;
  onClose: () => void;
  onOpenPreview: (index: number) => void;
  onOpenVersionMenu: (event: MouseEvent, asset: ShotModeAsset) => void;
  onSetFavorite: (asset: ShotModeAsset) => void;
  onRequestDeleteAsset: (asset: ShotModeAsset) => void;
}

export function ShotVersionsModal({
  open,
  displayMode,
  modeAssetsLoading,
  modeAssets,
  versionMediaItems,
  onClose,
  onOpenPreview,
  onOpenVersionMenu,
  onSetFavorite,
  onRequestDeleteAsset,
}: ShotVersionsModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shot-versions-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">
            {capitalizeMode(displayMode)} Versions
          </h3>
          <button type="button" className="pill-button" onClick={onClose}>
            Close
          </button>
        </div>
        {modeAssetsLoading ? <p className="muted">Loading versions...</p> : null}
        {!modeAssetsLoading && !modeAssets.length ? <p className="muted">No versions yet in this mode.</p> : null}
        {!modeAssetsLoading && modeAssets.length ? (
          <MediaTileGrid
            items={versionMediaItems}
            className="moodboard-grid shot-versions-grid"
            getKey={(item) => item.path}
            getTileClassName={(item) => `moodboard-tile${item.isFavorite ? " moodboard-tile--favorite" : ""}`}
            onOpen={(_item, idx) => onOpenPreview(idx)}
            onContextMenu={(event, item) => onOpenVersionMenu(event, item)}
            renderActions={(asset) => (
              <div className="shot-versions-grid__actions" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className={`shot-versions-grid__icon-button${asset.isFavorite ? " shot-versions-grid__icon-button--active" : ""}`}
                  disabled={asset.isFavorite}
                  onClick={() => onSetFavorite(asset)}
                  aria-label={asset.isFavorite ? "Favorite (active)" : "Set favorite"}
                  title={asset.isFavorite ? "Favorite" : "Set favorite"}
                >
                  <img
                    src={asset.isFavorite ? "icons/favorite_active.png" : "icons/favorite_not_active.png"}
                    alt=""
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  className="shot-versions-grid__icon-button"
                  onClick={() => onRequestDeleteAsset(asset)}
                  aria-label="Delete version"
                  title="Delete version"
                >
                  <img src="icons/delete.png" alt="" aria-hidden />
                </button>
              </div>
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
