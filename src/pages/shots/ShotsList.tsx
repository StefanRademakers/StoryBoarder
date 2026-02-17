import type { KeyboardEvent, ReactNode } from "react";
import { DropOrBrowse } from "../../components/common/DropOrBrowse";
import { extractPathsFromDrop, handleDragOver } from "../../utils/dnd";
import { toFileUrl } from "../../utils/path";
import type { ShotDisplayMode } from "./types";

export interface ShotListItem {
  id: string;
  order: number;
  description: string;
  durationSeconds?: number | null;
  framing?: string;
  action?: string;
  camera?: string;
}

interface ShotsListProps {
  shots: ShotListItem[];
  activeShotId: string | null;
  displayMode: ShotDisplayMode;
  versionsIcon: ReactNode;
  setShotItemRef: (shotId: string, element: HTMLDivElement | null) => void;
  getShotAssetPath: (shot: ShotListItem) => string;
  onSelectShot: (shotId: string) => void;
  onMoveShot: (shotId: string, direction: -1 | 1) => void;
  onRequestDeleteShot: (shot: ShotListItem) => void;
  onOpenInlineFullscreen: (shot: ShotListItem) => void;
  onOpenImageMenu: (event: React.MouseEvent, shotId: string) => void;
  onUpdateShotMedia: (paths: string[], options?: { shotId?: string; mode?: ShotDisplayMode }) => Promise<void>;
  onBrowseShotMedia: (options?: { shotId?: string; mode?: ShotDisplayMode }) => Promise<void>;
  onOpenVersionsBrowser: (shotId: string) => void;
  onUpdateShot: (shotId: string, updater: (shot: ShotListItem) => ShotListItem) => Promise<void>;
  onUpdateDescription: (shotId: string, description: string) => Promise<void>;
}

export function ShotsList({
  shots,
  activeShotId,
  displayMode,
  versionsIcon,
  setShotItemRef,
  getShotAssetPath,
  onSelectShot,
  onMoveShot,
  onRequestDeleteShot,
  onOpenInlineFullscreen,
  onOpenImageMenu,
  onUpdateShotMedia,
  onBrowseShotMedia,
  onOpenVersionsBrowser,
  onUpdateShot,
  onUpdateDescription,
}: ShotsListProps) {
  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    shotId: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectShot(shotId);
  };

  return (
    <section className="panel">
      <div className="shots-list">
        {shots.map((shot, idx) => {
          const preview = (shot.description || "").replace(/\s+/g, " ").trim();
          const assetAbsolute = getShotAssetPath(shot);
          const isActive = shot.id === activeShotId;
          const shotNumber = String(idx + 1).padStart(2, "0");
          return (
            <div
              key={shot.id}
              className="shots-item"
              ref={(element) => {
                setShotItemRef(shot.id, element);
              }}
            >
              <div
                role="button"
                tabIndex={0}
                className={`shots-row${isActive ? " shots-row--active" : ""}`}
                onClick={() => onSelectShot(shot.id)}
                onKeyDown={(event) => handleRowKeyDown(event, shot.id)}
              >
                <div className="shots-row__number">
                  <button
                    type="button"
                    className="shots-row__move-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoveShot(shot.id, -1);
                    }}
                    aria-label="Move shot up"
                    title="Move up"
                  >
                    <img src="icons/up.png" alt="" aria-hidden="true" />
                  </button>
                  <span className="shots-row__number-label">{shotNumber}</span>
                  <button
                    type="button"
                    className="shots-row__move-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoveShot(shot.id, 1);
                    }}
                    aria-label="Move shot down"
                    title="Move down"
                  >
                    <img src="icons/down.png" alt="" aria-hidden="true" />
                  </button>
                </div>
                <div className="shots-row__image">
                  {assetAbsolute ? (
                    displayMode === "clip" ? (
                      <video src={toFileUrl(assetAbsolute)} muted playsInline preload="metadata" />
                    ) : (
                      <img src={toFileUrl(assetAbsolute)} alt="" />
                    )
                  ) : (
                    <span className="muted">{displayMode === "clip" ? "Clip" : "Image"}</span>
                  )}
                </div>
                <div className="shots-row__text">
                  {preview || <span className="muted">Start of the description text...</span>}
                </div>
                <div className="shots-row__delete" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="shots-row__delete-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDeleteShot(shot);
                    }}
                    aria-label="Delete shot"
                    title="Delete shot"
                  >
                    <img src="icons/delete.png" alt="" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {isActive ? (
                <div className="shots-inline-editor">
                  <div className="shot-editor">
                    <div className="shot-editor__image">
                      <div className="shot-editor__media-shell">
                        {assetAbsolute ? (
                          <div
                            className="shot-editor__image-preview"
                            onDoubleClick={() => onOpenInlineFullscreen(shot)}
                            onContextMenu={(event) => onOpenImageMenu(event, shot.id)}
                            onDragOver={handleDragOver}
                            onDrop={async (event) => {
                              const paths = await extractPathsFromDrop(event);
                              if (!paths.length) return;
                              onSelectShot(shot.id);
                              await onUpdateShotMedia(paths, { shotId: shot.id });
                            }}
                          >
                            {displayMode === "clip" ? (
                              <video src={toFileUrl(assetAbsolute)} controls preload="metadata" />
                            ) : (
                              <img src={toFileUrl(assetAbsolute)} alt="Shot" />
                            )}
                          </div>
                        ) : (
                          <DropOrBrowse
                            label={displayMode === "clip" ? "Drop clip here or click to browse" : "Drop image here or click to browse"}
                            className="moodboard-dropzone"
                            onContextMenu={(event) => onOpenImageMenu(event, shot.id)}
                            enablePasteContextMenu={false}
                            onPathsSelected={(paths) => void onUpdateShotMedia(paths, { shotId: shot.id })}
                            browse={async () => {
                              await onBrowseShotMedia({ shotId: shot.id });
                              return null;
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className="shot-editor__versions-button"
                          title={`Browse ${displayMode} versions`}
                          onClick={() => onOpenVersionsBrowser(shot.id)}
                        >
                          {versionsIcon}
                          <span className="sr-only">Browse versions</span>
                        </button>
                      </div>
                    </div>

                    <div className="shot-editor__properties">
                      <div className="shot-editor__meta">
                        <label className="form-row">
                          <span className="section-title">Duration (seconds)</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="form-input"
                            value={shot.durationSeconds ?? ""}
                            onChange={(event) => {
                              const raw = event.target.value.trim();
                              const parsed = raw === "" ? null : Number.parseFloat(raw);
                              if (raw !== "" && Number.isNaN(parsed)) {
                                return;
                              }
                              void onUpdateShot(shot.id, (prev) => ({ ...prev, durationSeconds: parsed }));
                            }}
                            placeholder="e.g. 2.50"
                          />
                        </label>
                        <label className="form-row">
                          <span className="section-title">Framing</span>
                          <input
                            className="form-input"
                            value={shot.framing ?? ""}
                            onChange={(event) => {
                              void onUpdateShot(shot.id, (prev) => ({ ...prev, framing: event.target.value }));
                            }}
                            placeholder="e.g. CU / MS / WS"
                          />
                        </label>
                      </div>

                      <label className="form-row">
                        <span className="section-title">Description</span>
                        <textarea
                          rows={4}
                          className="form-input shot-editor__textarea"
                          value={shot.description}
                          onChange={(event) => {
                            void onUpdateDescription(shot.id, event.target.value);
                          }}
                          placeholder="Describe the shot..."
                        />
                      </label>

                      <label className="form-row">
                        <span className="section-title">Action</span>
                        <textarea
                          rows={2}
                          className="form-input shot-editor__textarea shot-editor__textarea--small"
                          value={shot.action ?? ""}
                          onChange={(event) => {
                            void onUpdateShot(shot.id, (prev) => ({ ...prev, action: event.target.value }));
                          }}
                          placeholder="Action in the shot..."
                        />
                      </label>

                      <label className="form-row">
                        <span className="section-title">Camera</span>
                        <textarea
                          rows={2}
                          className="form-input shot-editor__textarea shot-editor__textarea--small"
                          value={shot.camera ?? ""}
                          onChange={(event) => {
                            void onUpdateShot(shot.id, (prev) => ({ ...prev, camera: event.target.value }));
                          }}
                          placeholder="Camera movement/behavior..."
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {shots.length ? <div className="shots-list__tail-space" aria-hidden /> : null}
        {!shots.length ? <p className="muted">No shots yet.</p> : null}
      </div>
    </section>
  );
}
