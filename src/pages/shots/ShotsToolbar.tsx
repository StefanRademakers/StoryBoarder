import { useEffect, useRef, useState } from "react";
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
  onExportMp4: () => void;
  onExportHtml: () => void;
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
  onExportMp4,
  onExportHtml,
  onDisplayModeChange,
}: ShotsToolbarProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportDisabled = !hasShots || gridExportBusy;

  useEffect(() => {
    if (!exportMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const root = exportMenuRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setExportMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExportMenuOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [exportMenuOpen]);

  const runExportAction = (action: () => void) => {
    setExportMenuOpen(false);
    action();
  };

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
          <div className="shots-toolbar__export-menu" ref={exportMenuRef}>
            <button
              type="button"
              className="pill-button shots-toolbar__export-button"
              disabled={exportDisabled}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              onClick={() => setExportMenuOpen((current) => !current)}
            >
              Export
              <span className="shots-toolbar__export-caret" aria-hidden>
                <img
                  src={exportMenuOpen ? "icons/up.png" : "icons/down.png"}
                  width={10}
                  height={10}
                  alt=""
                />
              </span>
            </button>
            {exportMenuOpen ? (
              <div className="shots-toolbar__export-dropdown" role="menu" aria-label="Export options">
                <button
                  type="button"
                  className="shots-toolbar__export-dropdown-item"
                  role="menuitem"
                  onClick={() => runExportAction(onOpenExport)}
                >
                  Export Grid
                </button>
                <button
                  type="button"
                  className="shots-toolbar__export-dropdown-item"
                  role="menuitem"
                  onClick={() => runExportAction(onExportFcp7)}
                >
                  Export FCP7
                </button>
                <button
                  type="button"
                  className="shots-toolbar__export-dropdown-item"
                  role="menuitem"
                  onClick={() => runExportAction(onExportClips)}
                >
                  Export Clips
                </button>
                <button
                  type="button"
                  className="shots-toolbar__export-dropdown-item"
                  role="menuitem"
                  onClick={() => runExportAction(onExportMp4)}
                >
                  Export MP4
                </button>
                <button
                  type="button"
                  className="shots-toolbar__export-dropdown-item"
                  role="menuitem"
                  onClick={() => runExportAction(onExportHtml)}
                >
                  Html Export
                </button>
              </div>
            ) : null}
          </div>
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
