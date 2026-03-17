import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { MediaSurface } from "./MediaSurface";
import { toFileUrl } from "../../utils/path";

interface MediaLightboxProps {
  open: boolean;
  path: string | null;
  isVideo: boolean;
  name?: string;
  meta?: string;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onCopy?: () => void;
  onReveal?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
}

export function MediaLightbox({
  open,
  path,
  isVideo,
  name,
  meta,
  onClose,
  onNext,
  onPrev,
  onCopy,
  onReveal,
  onContextMenu,
}: MediaLightboxProps) {
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!open || !path) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
        return;
      }
      if (event.key === "ArrowLeft" && onPrev) {
        event.preventDefault();
        onPrev();
        return;
      }
      if (event.key === "Enter" && onReveal) {
        event.preventDefault();
        onReveal();
        return;
      }
      if ((event.key === "c" || event.key === "C") && event.ctrlKey && onCopy) {
        event.preventDefault();
        onCopy();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onCopy, onNext, onPrev, onReveal, open, path]);

  useEffect(() => {
    if (!open || !path) {
      setMediaSize(null);
      return;
    }

    let cancelled = false;
    const src = toFileUrl(path);

    if (isVideo) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        if (cancelled) return;
        setMediaSize({ width: video.videoWidth, height: video.videoHeight });
      };
      video.onerror = () => {
        if (cancelled) return;
        setMediaSize(null);
      };
      video.src = src;
      return () => {
        cancelled = true;
        video.src = "";
      };
    }

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setMediaSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (cancelled) return;
      setMediaSize(null);
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.src = "";
    };
  }, [isVideo, open, path]);

  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (name) {
      parts.push(name);
    }
    if (mediaSize) {
      parts.push(`${mediaSize.width}x${mediaSize.height}`);
    }
    if (meta) {
      parts.push(meta);
    }
    return parts.join(" · ");
  }, [mediaSize, meta, name]);

  if (!open || !path) return null;

  return (
    <div className="moodboard-preview" onClick={onClose} onDoubleClick={onClose}>
      <div
        className="moodboard-preview__inner"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={onContextMenu}
      >
        <div className="moodboard-preview__controls" onClick={(event) => event.stopPropagation()}>
          {onReveal ? (
            <button
              type="button"
              className="moodboard-preview__icon-button"
              onClick={onReveal}
              aria-label="Open folder"
              title="Open folder"
            >
              <img src="icons/folder.png" alt="" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="moodboard-preview__icon-button"
            onClick={onClose}
            aria-label="Close preview"
            title="Close"
          >
            <img src="icons/close.png" alt="" aria-hidden />
          </button>
        </div>
        <div className="moodboard-preview__media">
          <MediaSurface
            path={path}
            kind={isVideo ? "video" : "image"}
            variant="lightbox"
            controls={isVideo}
            autoPlay={isVideo}
          />
        </div>
        {metaLine ? <div className="moodboard-preview__name">{metaLine}</div> : null}
      </div>
    </div>
  );
}
