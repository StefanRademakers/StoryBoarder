import { SegmentedControl, type SegmentedControlOption } from "../../components/common/SegmentedControl";
import { ToggleButtonGroup, type ToggleButtonOption } from "../../components/common/ToggleButtonGroup";
import type { ShotDisplayMode } from "./types";
import {
  HTML_EXPORT_FORMAT_OPTIONS,
  HTML_EXPORT_MODE_DEFINITIONS,
  HTML_EXPORT_SCENE_SCOPE_OPTIONS,
  type HtmlExportImageFormat,
  type HtmlExportSceneScope,
} from "./htmlExportConfig";

interface HtmlExportDialogProps {
  open: boolean;
  startIndexText: string;
  endIndexText: string;
  selectedModes: ShotDisplayMode[];
  imageFormat: HtmlExportImageFormat;
  sceneScope: HtmlExportSceneScope;
  exportBusy: boolean;
  onChangeStartIndex: (value: string) => void;
  onChangeEndIndex: (value: string) => void;
  onChangeSelectedModes: (values: ShotDisplayMode[]) => void;
  onChangeImageFormat: (value: HtmlExportImageFormat) => void;
  onChangeSceneScope: (value: HtmlExportSceneScope) => void;
  onCancel: () => void;
  onExport: () => void;
}

const MODE_OPTIONS: Array<ToggleButtonOption<ShotDisplayMode>> = HTML_EXPORT_MODE_DEFINITIONS.map((item) => ({
  value: item.value,
  label: item.label,
  icon: <img src={item.iconPath} width={16} height={16} alt="" aria-hidden />,
}));

const FORMAT_OPTIONS: Array<SegmentedControlOption<HtmlExportImageFormat>> = [...HTML_EXPORT_FORMAT_OPTIONS];
const SCENE_SCOPE_OPTIONS: Array<SegmentedControlOption<HtmlExportSceneScope>> = [...HTML_EXPORT_SCENE_SCOPE_OPTIONS];

export function HtmlExportDialog({
  open,
  startIndexText,
  endIndexText,
  selectedModes,
  imageFormat,
  sceneScope,
  exportBusy,
  onChangeStartIndex,
  onChangeEndIndex,
  onChangeSelectedModes,
  onChangeImageFormat,
  onChangeSceneScope,
  onCancel,
  onExport,
}: HtmlExportDialogProps) {
  if (!open) return null;

  const canExport = selectedModes.length > 0 && !exportBusy;

  return (
    <div className="modal-backdrop">
      <div className="modal html-export-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Html Export</h3>
        </div>
        <div className="form-section">
          <p className="muted">
            Export selected shots to a dark themed HTML page with media browser and shot descriptions.
          </p>
          <div className="export-grid-fields">
            <label className="form-row">
              <span className="section-title">Start index:</span>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                value={startIndexText}
                onChange={(event) => onChangeStartIndex(event.target.value)}
              />
            </label>
            <label className="form-row">
              <span className="section-title">End index:</span>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                value={endIndexText}
                onChange={(event) => onChangeEndIndex(event.target.value)}
              />
            </label>
          </div>
          <label className="form-row">
            <span className="section-title">Modes:</span>
            <ToggleButtonGroup
              className="html-export-dialog__modes"
              ariaLabel="HTML export modes"
              options={MODE_OPTIONS}
              values={selectedModes}
              onChange={onChangeSelectedModes}
            />
          </label>
          <label className="form-row">
            <span className="section-title">Image file type:</span>
            <SegmentedControl
              ariaLabel="HTML export image format"
              options={FORMAT_OPTIONS}
              value={imageFormat}
              onChange={onChangeImageFormat}
            />
          </label>
          <label className="form-row">
            <span className="section-title">Scene scope:</span>
            <SegmentedControl
              ariaLabel="HTML export scene scope"
              options={SCENE_SCOPE_OPTIONS}
              value={sceneScope}
              onChange={onChangeSceneScope}
            />
          </label>
          {!selectedModes.length ? <p className="muted">Select at least one mode.</p> : null}
        </div>
        <div className="modal__footer">
          <button type="button" className="pill-button" onClick={onCancel} disabled={exportBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="pill-button"
            disabled={!canExport}
            onClick={onExport}
          >
            {exportBusy ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
