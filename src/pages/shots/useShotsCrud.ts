import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { deleteShotDirectory, ensureShotModeDirectories, persistShotsIndex } from "./shotsRepository";
import type { ShotDisplayMode } from "./types";

interface ShotItemLike {
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
  favoriteConcept?: string;
  favoriteReference?: string;
  favoriteStill?: string;
  favoriteClip?: string;
  favoritePerformance?: string;
  conceptAssets?: string[];
  referenceAssets?: string[];
  stillAssets?: string[];
  clipAssets?: string[];
  performanceAssets?: string[];
}

interface ShotsIndexLike<TShot extends ShotItemLike> {
  shots: TShot[];
}

interface UseShotsCrudParams<TShot extends ShotItemLike> {
  scenesRoot: string;
  shots: TShot[];
  shotsIndex: ShotsIndexLike<TShot>;
  activeSceneId: string | null;
  activeSceneIdRef: MutableRefObject<string | null>;
  activeShotIdRef: MutableRefObject<string | null>;
  shotsRef: MutableRefObject<TShot[]>;
  persistTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  modeFolders: ReadonlyArray<ShotDisplayMode>;
  saveShotsState: (next: ShotsIndexLike<TShot>, options?: { immediate?: boolean }) => Promise<void>;
  setShotsIndex: Dispatch<SetStateAction<ShotsIndexLike<TShot>>>;
  setActiveShotId: Dispatch<SetStateAction<string | null>>;
}

interface UseShotsCrudResult<TShot extends ShotItemLike> {
  createShot: (factory: () => TShot, options?: { afterSelected?: boolean }) => Promise<void>;
  moveShot: (shotId: string, direction: -1 | 1) => Promise<void>;
  deleteShot: (shotId: string) => Promise<void>;
  updateDescription: (shotId: string, description: string) => Promise<void>;
  updateShot: (shotId: string, updater: (shot: TShot) => TShot) => Promise<void>;
}

export function useShotsCrud<TShot extends ShotItemLike>({
  scenesRoot,
  shots,
  shotsIndex,
  activeSceneId,
  activeSceneIdRef,
  activeShotIdRef,
  shotsRef,
  persistTimerRef,
  modeFolders,
  saveShotsState,
  setShotsIndex,
  setActiveShotId,
}: UseShotsCrudParams<TShot>): UseShotsCrudResult<TShot> {
  const createShot = useCallback(async (factory: () => TShot, options?: { afterSelected?: boolean }) => {
    const sceneId = activeSceneIdRef.current;
    if (!sceneId) return;

    const shot = factory();
    const id = shot.id;

    const ordered = [...shotsRef.current];
    let insertAt = ordered.length;
    if (options?.afterSelected) {
      const selectedId = activeShotIdRef.current;
      if (selectedId) {
        const selectedIdx = ordered.findIndex((item) => item.id === selectedId);
        if (selectedIdx >= 0) {
          insertAt = selectedIdx + 1;
        }
      }
    }
    ordered.splice(insertAt, 0, shot);

    const next: ShotsIndexLike<TShot> = {
      shots: ordered.map((item, order) => ({ ...item, order })),
    };

    await ensureShotModeDirectories(scenesRoot, sceneId, id, modeFolders);

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    shotsRef.current = next.shots;
    setShotsIndex(next);
    activeShotIdRef.current = id;
    setActiveShotId(id);
    await persistShotsIndex(scenesRoot, sceneId, next);
  }, [activeSceneIdRef, activeShotIdRef, modeFolders, persistTimerRef, scenesRoot, setActiveShotId, setShotsIndex, shotsRef]);

  const moveShot = useCallback(async (shotId: string, direction: -1 | 1) => {
    const sorted = [...shots];
    const idx = sorted.findIndex((shot) => shot.id === shotId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const temp = sorted[idx];
    sorted[idx] = sorted[targetIdx];
    sorted[targetIdx] = temp;
    const reordered: ShotsIndexLike<TShot> = {
      shots: sorted.map((shot, order) => ({ ...shot, order })),
    };
    await saveShotsState(reordered, { immediate: true });
  }, [saveShotsState, shots]);

  const deleteShot = useCallback(async (shotId: string) => {
    if (!activeSceneId) return;
    const next: ShotsIndexLike<TShot> = {
      shots: shotsIndex.shots.filter((shot) => shot.id !== shotId),
    };
    await deleteShotDirectory(scenesRoot, activeSceneId, shotId);
    await saveShotsState(next, { immediate: true });
    setActiveShotId((prev) => (prev === shotId ? next.shots[0]?.id ?? null : prev));
  }, [activeSceneId, saveShotsState, scenesRoot, setActiveShotId, shotsIndex.shots]);

  const updateDescription = useCallback(async (shotId: string, description: string) => {
    const next: ShotsIndexLike<TShot> = {
      shots: shotsIndex.shots.map((shot) => (shot.id === shotId ? { ...shot, description } : shot)),
    };
    await saveShotsState(next);
  }, [saveShotsState, shotsIndex.shots]);

  const updateShot = useCallback(async (shotId: string, updater: (shot: TShot) => TShot) => {
    const next: ShotsIndexLike<TShot> = {
      shots: shotsIndex.shots.map((shot) => (shot.id === shotId ? updater(shot) : shot)),
    };
    await saveShotsState(next);
  }, [saveShotsState, shotsIndex.shots]);

  return {
    createShot,
    moveShot,
    deleteShot,
    updateDescription,
    updateShot,
  };
}
