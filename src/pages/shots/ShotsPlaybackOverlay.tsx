import { toFileUrl } from "../../utils/path";
import { formatDurationLabel, playbackModeLabel } from "./utils";
import type { PlaybackMedia } from "./types";

interface PlaybackShot {
  description: string;
  durationSeconds?: number | null;
}

interface ShotsPlaybackOverlayProps {
  open: boolean;
  playbackShot: PlaybackShot | null;
  playbackMedia: PlaybackMedia;
  playbackIndex: number;
  shotsLength: number;
  activeSceneName: string | null;
  onClose: () => void;
  onStep: (direction: -1 | 1) => void;
}

export function ShotsPlaybackOverlay({
  open,
  playbackShot,
  playbackMedia,
  playbackIndex,
  shotsLength,
  activeSceneName,
  onClose,
  onStep,
}: ShotsPlaybackOverlayProps) {
  if (!open || !playbackShot) return null;

  return (
    <div className="shots-playback" onClick={onClose}>
      <div className="shots-playback__inner" onClick={(event) => event.stopPropagation()}>
        <div className="shots-playback__header">
          <div className="shots-playback__title">
            <strong>
              {String(playbackIndex + 1).padStart(2, "0")} / {String(shotsLength).padStart(2, "0")}
            </strong>
            <span>{activeSceneName ? `Scene: ${activeSceneName}` : "Scene preview"}</span>
          </div>
          <div className="shots-playback__actions">
            <button type="button" className="pill-button" onClick={() => onStep(-1)} disabled={playbackIndex <= 0}>
              Prev
            </button>
            <button type="button" className="pill-button" onClick={() => onStep(1)}>
              Next
            </button>
            <button type="button" className="pill-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="shots-playback__media">
          {playbackMedia.kind === "video" ? (
            <video
              key={playbackMedia.path}
              src={toFileUrl(playbackMedia.path)}
              autoPlay
              muted
              playsInline
              onEnded={() => onStep(1)}
              onError={() => onStep(1)}
            />
          ) : playbackMedia.kind === "image" ? (
            <img src={toFileUrl(playbackMedia.path)} alt={playbackShot.description || "Shot preview"} />
          ) : (
            <div className="shots-playback__empty shots-playback__empty--numbered">
              <div className="shots-playback__empty-number">{String(playbackIndex + 1).padStart(2, "0")}</div>
              <div className="shots-playback__empty-label">Shot</div>
            </div>
          )}
        </div>

        <div className="shots-playback__meta">
          <div className="shots-playback__duration">
            Source: {playbackMedia.sourceMode ? playbackModeLabel(playbackMedia.sourceMode) : "Placeholder"}
          </div>
          <div className="shots-playback__duration">Duration: {formatDurationLabel(playbackShot.durationSeconds)}</div>
          <div className="shots-playback__description">{playbackShot.description || "No shot description."}</div>
        </div>
      </div>
    </div>
  );
}
