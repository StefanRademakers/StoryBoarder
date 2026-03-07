import { SegmentedControl, type SegmentedControlOption } from "../../components/common/SegmentedControl";
import type { ShotDisplayMode } from "./types";

interface ShotsToolbarProps {
  hasShots: boolean;
  poolDisabled: boolean;
  gridExportBusy: boolean;
  gridExportMessage: string | null;
  modeOptions: Array<SegmentedControlOption<ShotDisplayMode>>;
  displayMode: ShotDisplayMode;
  onCreateShot: () => void;
  onPlay: () => void;
  onPool: (openPopout: boolean) => void;
  onOpenCandidates: () => void;
  onOpenExport: () => void;
  onExportFcp7: () => void;
  onExportClips: () => void;
  onDisplayModeChange: (mode: ShotDisplayMode) => void;
}

export function ShotsToolbar({
  hasShots,
  poolDisabled,
  gridExportBusy,
  gridExportMessage,
  modeOptions,
  displayMode,
  onCreateShot,
  onPlay,
  onPool,
  onOpenCandidates,
  onOpenExport,
  onExportFcp7,
  onExportClips,
  onDisplayModeChange,
}: ShotsToolbarProps) {
  return (
    <section className="panel shots-toolbar">
      <div className="shots-toolbar__row">
        <div className="shots-toolbar__actions">
          <button type="button" className="pill-button" onClick={onCreateShot}>New shot</button>
          <button type="button" className="pill-button" onClick={onPlay} disabled={!hasShots}>Play</button>
          <button
            type="button"
            className="pill-button"
            onClick={(event) => onPool(event.ctrlKey)}
            disabled={poolDisabled}
          >
            Pool
          </button>
          <button
            type="button"
            className="pill-button"
            onClick={onOpenCandidates}
            disabled={poolDisabled}
          >
            Candidates
          </button>
          <button
            type="button"
            className="pill-button"
            disabled={!hasShots || gridExportBusy}
            onClick={onOpenExport}
          >
            Export
          </button>
          <button
            type="button"
            className="pill-button"
            disabled={!hasShots || gridExportBusy}
            onClick={onExportFcp7}
          >
            Export FCP7
          </button>
          <button
            type="button"
            className="pill-button"
            disabled={!hasShots || gridExportBusy}
            onClick={onExportClips}
          >
            Export Clips
          </button>
        </div>
        <SegmentedControl
          className="shots-toolbar__modes"
          ariaLabel="Shot mode"
          options={modeOptions}
          value={displayMode}
          onChange={onDisplayModeChange}
        />
      </div>
      {gridExportMessage ? <p className="muted">{gridExportMessage}</p> : null}
    </section>
  );
}
