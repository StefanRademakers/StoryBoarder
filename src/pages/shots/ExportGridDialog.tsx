import type { ShotDisplayMode } from "./types";

interface ExportGridDialogProps {
  open: boolean;
  displayMode: ShotDisplayMode;
  exportColumnsText: string;
  exportStartIndexText: string;
  exportEndIndexText: string;
  exportResizeEnabled: boolean;
  exportMaxLongestEdgeText: string;
  tileWidth: number;
  tileHeight: number;
  gridExportBusy: boolean;
  onChangeColumns: (value: string) => void;
  onChangeStartIndex: (value: string) => void;
  onChangeEndIndex: (value: string) => void;
  onChangeResizeEnabled: (value: boolean) => void;
  onChangeMaxLongestEdge: (value: string) => void;
  onCancel: () => void;
  onExport: () => void;
}

function modeLabel(displayMode: ShotDisplayMode): string {
  if (displayMode === "concept") return "Concept";
  if (displayMode === "reference") return "Reference";
  if (displayMode === "still") return "Still";
  return "Clip (not supported)";
}

export function ExportGridDialog({
  open,
  displayMode,
  exportColumnsText,
  exportStartIndexText,
  exportEndIndexText,
  exportResizeEnabled,
  exportMaxLongestEdgeText,
  tileWidth,
  tileHeight,
  gridExportBusy,
  onChangeColumns,
  onChangeStartIndex,
  onChangeEndIndex,
  onChangeResizeEnabled,
  onChangeMaxLongestEdge,
  onCancel,
  onExport,
}: ExportGridDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Export Grid</h3>
        </div>
        <div className="form-section">
          <p className="muted">
            Mode: <strong>{modeLabel(displayMode)}</strong>
          </p>
          <div className="export-grid-fields">
            <label className="form-row">
              <span className="section-title">Columns (X)</span>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                value={exportColumnsText}
                onChange={(event) => onChangeColumns(event.target.value)}
              />
            </label>
            <label className="form-row">
              <span className="section-title">Start index:</span>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                value={exportStartIndexText}
                onChange={(event) => onChangeStartIndex(event.target.value)}
              />
            </label>
            <label className="form-row">
              <span className="section-title">End index:</span>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                value={exportEndIndexText}
                onChange={(event) => onChangeEndIndex(event.target.value)}
              />
            </label>
          </div>
          <label className="export-grid-resize-row">
            <input
              type="checkbox"
              checked={exportResizeEnabled}
              onChange={(event) => onChangeResizeEnabled(event.target.checked)}
            />
            <span>Resize to max:</span>
            <input
              className="form-input export-grid-resize-input"
              type="text"
              inputMode="numeric"
              value={exportMaxLongestEdgeText}
              onChange={(event) => onChangeMaxLongestEdge(event.target.value)}
              disabled={!exportResizeEnabled}
            />
            <span>(longest edge)</span>
          </label>
          <p className="muted">
            Tile size: {tileWidth} x {tileHeight}
          </p>
        </div>
        <div className="modal__footer">
          <button type="button" className="pill-button" onClick={onCancel} disabled={gridExportBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="pill-button"
            disabled={gridExportBusy}
            onClick={onExport}
          >
            {gridExportBusy ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
