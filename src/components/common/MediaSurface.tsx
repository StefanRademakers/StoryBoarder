import { toFileUrl } from "../../utils/path";
import { useRef } from "react";
import type { MediaKind } from "./mediaTypes";

export type MediaSurfaceVariant = "tile" | "lightbox" | "playback" | "row" | "inline";

interface MediaSurfaceProps {
  path: string;
  kind: MediaKind;
  variant: MediaSurfaceVariant;
  src?: string;
  alt?: string;
  className?: string;
  autoPlay?: boolean;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  preload?: "none" | "metadata" | "auto";
  onEnded?: () => void;
  onError?: () => void;
  playOnHover?: boolean;
}

export function MediaSurface({
  path,
  kind,
  variant,
  src,
  alt = "",
  className,
  autoPlay = false,
  controls = false,
  muted = false,
  loop = false,
  preload = "metadata",
  onEnded,
  onError,
  playOnHover = false,
}: MediaSurfaceProps) {
  const resolvedSrc = src ?? toFileUrl(path);
  const mediaClassName = ["media-surface", `media-surface--${variant}`, className].filter(Boolean).join(" ");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  if (kind === "video") {
    return (
      <video
        ref={videoRef}
        className={mediaClassName}
        src={resolvedSrc}
        controls={controls}
        autoPlay={playOnHover ? false : autoPlay}
        muted={muted}
        loop={loop}
        playsInline
        preload={preload}
        onEnded={onEnded}
        onError={onError}
        onMouseEnter={() => {
          if (!playOnHover) return;
          const video = videoRef.current;
          if (!video) return;
          void video.play().catch(() => undefined);
        }}
        onMouseLeave={() => {
          if (!playOnHover) return;
          const video = videoRef.current;
          if (!video) return;
          video.pause();
          try {
            video.currentTime = 0;
          } catch {
            // Some codecs/streams can reject seeking while metadata is incomplete.
          }
        }}
      />
    );
  }

  return <img className={mediaClassName} src={resolvedSrc} alt={alt} />;
}
