import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveShotDurationMs } from "./utils";
import type { PlaybackMedia, ShotDisplayMode } from "./types";

interface PlaybackShot {
  id: string;
  description: string;
  durationSeconds?: number | null;
}

interface UseShotPlaybackParams<TShot extends PlaybackShot> {
  shots: TShot[];
  displayMode: ShotDisplayMode;
  resolvePath: (shot: TShot, mode: ShotDisplayMode) => string;
  onActivateShot: (shotId: string) => void;
}

interface UseShotPlaybackResult<TShot extends PlaybackShot> {
  playbackOpen: boolean;
  playbackIndex: number;
  playbackShot: TShot | null;
  playbackMedia: PlaybackMedia;
  startPlayback: () => void;
  closePlayback: () => void;
  stepPlayback: (direction: -1 | 1) => void;
}

export function useShotPlayback<TShot extends PlaybackShot>({
  shots,
  displayMode,
  resolvePath,
  onActivateShot,
}: UseShotPlaybackParams<TShot>): UseShotPlaybackResult<TShot> {
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvePathRef = useRef(resolvePath);
  const onActivateShotRef = useRef(onActivateShot);

  useEffect(() => {
    resolvePathRef.current = resolvePath;
  }, [resolvePath]);

  useEffect(() => {
    onActivateShotRef.current = onActivateShot;
  }, [onActivateShot]);

  const playbackShot = playbackOpen ? shots[playbackIndex] ?? null : null;

  const closePlayback = useCallback(() => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setPlaybackOpen(false);
    setPlaybackIndex(0);
  }, []);

  const startPlayback = useCallback(() => {
    setPlaybackIndex(0);
    setPlaybackOpen(true);
  }, []);

  const stepPlayback = useCallback((direction: -1 | 1) => {
    setPlaybackIndex((current) => {
      if (direction > 0) {
        if (current >= shots.length - 1) {
          closePlayback();
          return current;
        }
        return current + 1;
      }
      return Math.max(0, current - 1);
    });
  }, [closePlayback, shots.length]);

  useEffect(() => {
    if (!playbackOpen) {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }

    if (!shots.length) {
      closePlayback();
      return;
    }

    if (playbackIndex >= shots.length) {
      setPlaybackIndex(shots.length - 1);
      return;
    }

    const currentShot = shots[playbackIndex];
    if (!currentShot) return;

    onActivateShotRef.current(currentShot.id);
    const useVideoEnded = displayMode === "clip" && Boolean(resolvePathRef.current(currentShot, "clip"));
    if (!useVideoEnded) {
      const durationMs = resolveShotDurationMs(currentShot.durationSeconds);
      playbackTimerRef.current = setTimeout(() => {
        if (playbackIndex >= shots.length - 1) {
          closePlayback();
          return;
        }
        setPlaybackIndex((current) => current + 1);
      }, durationMs);
    }

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [closePlayback, displayMode, playbackIndex, playbackOpen, shots]);

  useEffect(() => {
    if (!playbackOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePlayback();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepPlayback(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepPlayback(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePlayback, playbackOpen, stepPlayback]);

  const playbackMedia: PlaybackMedia = useMemo(() => {
    if (!playbackShot) {
      return { kind: "placeholder", path: "", sourceMode: null };
    }

    const modeOrder = displayMode === "clip"
      ? (["clip", "still", "reference", "concept"] as ShotDisplayMode[])
      : displayMode === "still"
        ? (["still", "reference", "concept"] as ShotDisplayMode[])
        : displayMode === "reference"
          ? (["reference", "concept"] as ShotDisplayMode[])
          : (["concept"] as ShotDisplayMode[]);

    for (const mode of modeOrder) {
      const path = resolvePathRef.current(playbackShot, mode);
      if (!path) continue;
      return {
        kind: mode === "clip" ? "video" : "image",
        path,
        sourceMode: mode,
      };
    }

    return { kind: "placeholder", path: "", sourceMode: null };
  }, [displayMode, playbackShot]);

  return {
    playbackOpen,
    playbackIndex,
    playbackShot,
    playbackMedia,
    startPlayback,
    closePlayback,
    stepPlayback,
  };
}
