import { useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { DropOrBrowse } from "../../components/common/DropOrBrowse";
import { extractPathsFromDrop, handleDragOver } from "../../utils/dnd";
import { toFileUrl } from "../../utils/path";
import type { ShotDisplayMode } from "./types";

interface SuggestionItem {
  abbreviation: string;
  name: string;
}

type SuggestionFieldKey = "angle" | "shotSize" | "characterFraming" | "movement";

export interface ShotListItem {
  id: string;
  order: number;
  description: string;
  durationSeconds?: number | null;
  angle?: string;
  shotSize?: string;
  characterFraming?: string;
  movement?: string;
  action?: string;
  notes?: string;
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
  getAssetCacheToken?: (assetPath: string) => number | undefined;
}

const ANGLE_SUGGESTIONS: SuggestionItem[] = [
  { abbreviation: "EL", name: "Eye level neutral angle" },
  { abbreviation: "HA", name: "High angle camera looking down" },
  { abbreviation: "LA", name: "Low angle camera looking up" },
  { abbreviation: "BEV", name: "Bird's eye view top-down" },
  { abbreviation: "OH", name: "Overhead directly above subject" },
  { abbreviation: "WEV", name: "Worm's eye view extreme low angle" },
  { abbreviation: "DA", name: "Dutch angle tilted horizon" },
  { abbreviation: "CA", name: "Canted angle tilted frame" },
];

const SHOT_SIZE_SUGGESTIONS: SuggestionItem[] = [
  { abbreviation: "EWS", name: "Extreme wide shot subject very small or environment dominant" },
  { abbreviation: "VWS", name: "Very wide shot subject small in frame" },
  { abbreviation: "WS", name: "Wide shot full body visible" },
  { abbreviation: "FS", name: "Full shot head to toe tighter than wide" },
  { abbreviation: "MWS", name: "Medium wide shot knees up" },
  { abbreviation: "MS", name: "Medium shot waist up" },
  { abbreviation: "MCU", name: "Medium close-up chest or shoulders up" },
  { abbreviation: "CU", name: "Close-up face fills frame" },
  { abbreviation: "BCU", name: "Big close-up very tight on face" },
  { abbreviation: "ECU", name: "Extreme close-up detail like eyes or mouth" },
];

const CHARACTER_FRAMING_SUGGESTIONS: SuggestionItem[] = [
  { abbreviation: "S", name: "Single one character in frame" },
  { abbreviation: "CS", name: "Clean single isolated character" },
  { abbreviation: "DS", name: "Dirty single character with foreground obstruction" },
  { abbreviation: "OTS", name: "Over the shoulder from behind another character" },
  { abbreviation: "ROTS", name: "Reverse over the shoulder opposite direction" },
  { abbreviation: "2S", name: "Two shot two characters in frame" },
  { abbreviation: "3S", name: "Three shot three characters in frame" },
  { abbreviation: "GS", name: "Group shot multiple characters" },
  { abbreviation: "POV", name: "Point of view what character sees" },
  { abbreviation: "RS", name: "Reaction shot character reacting" },
  { abbreviation: "INS", name: "Insert shot close-up of object" },
  { abbreviation: "CAW", name: "Cutaway shot away from main action" },
];

const MOVEMENT_SUGGESTIONS: SuggestionItem[] = [
  { abbreviation: "ST", name: "Static no camera movement" },
  { abbreviation: "PANL", name: "Pan left horizontal rotation left" },
  { abbreviation: "PANR", name: "Pan right horizontal rotation right" },
  { abbreviation: "TILTUP", name: "Tilt up vertical rotation up" },
  { abbreviation: "TILTDN", name: "Tilt down vertical rotation down" },
  { abbreviation: "WP", name: "Whip pan fast pan with motion blur" },
  { abbreviation: "DI", name: "Dolly in camera moves forward" },
  { abbreviation: "DO", name: "Dolly out camera moves backward" },
  { abbreviation: "TL", name: "Truck left camera moves left" },
  { abbreviation: "TR", name: "Truck right camera moves right" },
  { abbreviation: "PU", name: "Pedestal up camera moves vertically up" },
  { abbreviation: "PD", name: "Pedestal down camera moves vertically down" },
  { abbreviation: "CUU", name: "Crane up large vertical arc up" },
  { abbreviation: "CDN", name: "Crane down large vertical arc down" },
  { abbreviation: "JI", name: "Jib up small crane upward" },
  { abbreviation: "JD", name: "Jib down small crane downward" },
  { abbreviation: "PI", name: "Push in dramatic move toward subject" },
  { abbreviation: "PO", name: "Pull out dramatic move away" },
  { abbreviation: "ZI", name: "Zoom in focal length increases" },
  { abbreviation: "ZO", name: "Zoom out focal length decreases" },
  { abbreviation: "HH", name: "Handheld natural unstable movement" },
  { abbreviation: "SD", name: "Steadicam stabilized walking movement" },
  { abbreviation: "ORB", name: "Orbit camera circles subject" },
  { abbreviation: "ARC", name: "Arc shot partial circular move" },
];

function formatSuggestion(item: SuggestionItem): string {
  return `${item.abbreviation}, ${item.name}`;
}

function matchesSuggestion(item: SuggestionItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return (`${item.abbreviation} ${item.name}`).toLowerCase().includes(normalizedQuery);
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
  getAssetCacheToken,
}: ShotsListProps) {
  const [activeSuggestion, setActiveSuggestion] = useState<{ shotId: string; field: SuggestionFieldKey } | null>(null);

  const autoResizeTextarea = (target: HTMLTextAreaElement) => {
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    shotId: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectShot(shotId);
  };

  const handleSuggestionBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(nextTarget)) {
      setActiveSuggestion(null);
    }
  };

  const renderSuggestionInput = (
    shot: ShotListItem,
    field: SuggestionFieldKey,
    label: string,
    value: string,
    placeholder: string,
    suggestions: SuggestionItem[],
    options?: { alignRight?: boolean; openUp?: boolean },
  ) => {
    const isOpen = activeSuggestion?.shotId === shot.id && activeSuggestion.field === field;
    const filtered = suggestions.filter((item) => matchesSuggestion(item, value));

    return (
      <label className="form-row shot-suggestion-field">
        <span className="section-title">{label}</span>
        <div
          className="shot-suggestion-field__control"
          onFocus={() => setActiveSuggestion({ shotId: shot.id, field })}
          onBlur={handleSuggestionBlur}
        >
          <input
            className="form-input"
            value={value}
            onFocus={() => setActiveSuggestion({ shotId: shot.id, field })}
            onChange={(event) => {
              const nextValue = event.target.value;
              void onUpdateShot(shot.id, (prev) => ({ ...prev, [field]: nextValue }));
            }}
            placeholder={placeholder}
          />
          {isOpen ? (
            <div
              className={`shot-suggestion-field__menu${options?.alignRight ? " shot-suggestion-field__menu--align-right" : ""}${options?.openUp ? " shot-suggestion-field__menu--open-up" : ""}`}
              role="listbox"
              aria-label={`${label} suggestions`}
            >
              {filtered.length ? filtered.map((item) => {
                const entry = formatSuggestion(item);
                return (
                  <button
                    key={`${field}-${item.abbreviation}`}
                    type="button"
                    className="shot-suggestion-field__option"
                    onClick={() => {
                      void onUpdateShot(shot.id, (prev) => ({ ...prev, [field]: entry }));
                      setActiveSuggestion(null);
                    }}
                  >
                    <span className="shot-suggestion-field__abbr">{item.abbreviation}</span>
                    <span className="shot-suggestion-field__name">{item.name}</span>
                  </button>
                );
              }) : <div className="shot-suggestion-field__empty">No matches</div>}
            </div>
          ) : null}
        </div>
      </label>
    );
  };

  return (
    <section className="panel">
      <div className="shots-list">
        {shots.map((shot, idx) => {
          const preview = (shot.description || "").replace(/\s+/g, " ").trim();
          const assetAbsolute = getShotAssetPath(shot);
          const cacheToken = assetAbsolute ? getAssetCacheToken?.(assetAbsolute) : undefined;
          const assetSrc = assetAbsolute
            ? `${toFileUrl(assetAbsolute)}${cacheToken ? `?v=${cacheToken}` : ""}`
            : "";
          const isActive = shot.id === activeShotId;
          const shotNumber = String(idx + 1).padStart(2, "0");
          const descriptionActionValue = shot.description.trim()
            ? shot.description
            : (shot.action ?? "");
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
                      <video src={assetSrc} muted playsInline preload="metadata" />
                    ) : (
                      <img src={assetSrc} alt="" />
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
                              <video src={assetSrc} controls preload="metadata" />
                            ) : (
                              <img src={assetSrc} alt="Shot" />
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
                      <label className="form-row">
                        <span className="section-title">Description/Action</span>
                        <textarea
                          rows={4}
                          className="form-input shot-editor__textarea shot-editor__textarea--autosize"
                          value={descriptionActionValue}
                          ref={(element) => {
                            if (!element) return;
                            autoResizeTextarea(element);
                          }}
                          onChange={(event) => {
                            autoResizeTextarea(event.currentTarget);
                            const value = event.target.value;
                            void onUpdateShot(shot.id, (prev) => ({ ...prev, description: value, action: "" }));
                          }}
                          placeholder="Describe the shot and action..."
                        />
                      </label>

                      <label className="form-row">
                        <span className="section-title">Notes</span>
                        <textarea
                          rows={2}
                          className="form-input shot-editor__textarea shot-editor__textarea--small shot-editor__textarea--autosize"
                          value={shot.notes ?? ""}
                          ref={(element) => {
                            if (!element) return;
                            autoResizeTextarea(element);
                          }}
                          onChange={(event) => {
                            autoResizeTextarea(event.currentTarget);
                            void onUpdateShot(shot.id, (prev) => ({ ...prev, notes: event.target.value }));
                          }}
                          placeholder="Director notes, fixes, remarks..."
                        />
                      </label>

                    </div>
                  </div>
                  <div className="shot-editor__classification-row shot-editor__classification-row--full">
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
                        placeholder="e.g. 1.5"
                      />
                    </label>
                    {renderSuggestionInput(
                      shot,
                      "angle",
                      "Angle",
                      shot.angle ?? "",
                      "e.g. EL",
                      ANGLE_SUGGESTIONS,
                      { openUp: true },
                    )}
                    {renderSuggestionInput(
                      shot,
                      "shotSize",
                      "Shot Size",
                      shot.shotSize ?? "",
                      "e.g. MCU",
                      SHOT_SIZE_SUGGESTIONS,
                      { openUp: true },
                    )}
                    {renderSuggestionInput(
                      shot,
                      "characterFraming",
                      "Character Framing",
                      shot.characterFraming ?? "",
                      "e.g. OTS",
                      CHARACTER_FRAMING_SUGGESTIONS,
                      { openUp: true },
                    )}
                    {renderSuggestionInput(
                      shot,
                      "movement",
                      "Movement",
                      shot.movement ?? "",
                      "e.g. DI",
                      MOVEMENT_SUGGESTIONS,
                      { alignRight: true, openUp: true },
                    )}
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
