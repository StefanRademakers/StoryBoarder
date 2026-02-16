import { useEffect, type MouseEvent } from "react";
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

  if (!open || !path) return null;

  return (
    <div className="moodboard-preview" onClick={onClose} onDoubleClick={onClose}>
      <div
        className="moodboard-preview__inner"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={onContextMenu}
      >
        {isVideo ? (
          <video src={toFileUrl(path)} controls autoPlay playsInline />
        ) : (
          <img src={toFileUrl(path)} alt="" />
        )}
        {(name || meta) ? (
          <div className="moodboard-preview__name">
            {name ?? ""}
            {meta ? ` ${meta}` : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
