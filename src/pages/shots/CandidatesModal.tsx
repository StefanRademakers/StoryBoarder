import type { MouseEvent } from "react";
import { DropOrBrowse } from "../../components/common/DropOrBrowse";
import { MediaTileGrid } from "../../components/common/MediaTileGrid";
import type { MediaItem } from "../../components/common/mediaTypes";
import { SegmentedControl, type SegmentedControlOption } from "../../components/common/SegmentedControl";
import type { CandidateAsset, CandidateTab } from "./types";

interface CandidatesModalProps {
  open: boolean;
  candidateTab: CandidateTab;
  candidateTabOptions: Array<SegmentedControlOption<CandidateTab>>;
  loading: boolean;
  assets: CandidateAsset[];
  mediaItems: Array<MediaItem & CandidateAsset>;
  onClose: () => void;
  onTabChange: (tab: CandidateTab) => void;
  onImportPaths: (paths: string[]) => void;
  onBrowse: () => Promise<string | string[] | null | undefined>;
  onOpenPreview: (index: number) => void;
  onContextMenu: (event: MouseEvent, asset: CandidateAsset) => void;
}

export function CandidatesModal({
  open,
  candidateTab,
  candidateTabOptions,
  loading,
  assets,
  mediaItems,
  onClose,
  onTabChange,
  onImportPaths,
  onBrowse,
  onOpenPreview,
  onContextMenu,
}: CandidatesModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shot-pool-modal" onClick={(event) => event.stopPropagation()}>
        <div className="shot-candidates__topbar">
          <SegmentedControl
            className="shot-candidates__tabs"
            ariaLabel="Candidates tab"
            options={candidateTabOptions}
            value={candidateTab}
            onChange={onTabChange}
          />
          <button type="button" className="pill-button" onClick={onClose}>
            Close
          </button>
        </div>

        <DropOrBrowse
          className="moodboard-dropzone"
          label="Drop media here or click to browse"
          enablePasteContextMenu={false}
          onPathsSelected={(paths) => {
            onImportPaths(paths);
          }}
          browse={onBrowse}
        />

        {loading ? <p className="muted">Loading candidates...</p> : null}
        {!loading && !assets.length ? (
          <p className="muted">No assets in this folder yet.</p>
        ) : null}
        {!loading && assets.length ? (
          <MediaTileGrid
            items={mediaItems}
            className="moodboard-grid shot-pool-grid"
            getKey={(item) => item.path}
            onOpen={(_item, idx) => onOpenPreview(idx)}
            onContextMenu={(event, item) => onContextMenu(event, item)}
          />
        ) : null}
      </div>
    </div>
  );
}
