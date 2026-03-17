import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { MediaSurface } from "./MediaSurface";
import type { MediaItem } from "./mediaTypes";
import { ensureImageThumbnail } from "./mediaThumbnails";

interface MediaTileGridProps<T extends MediaItem> {
  items: T[];
  getKey: (item: T, index: number) => string;
  onOpen: (item: T, index: number) => void;
  onContextMenu?: (event: MouseEvent, item: T, index: number) => void;
  className?: string;
  renderActions?: (item: T, index: number) => ReactNode;
  actionsPlacement?: "below" | "image-bottom-right";
  getTileClassName?: (item: T, index: number) => string;
}

export function MediaTileGrid<T extends MediaItem>({
  items,
  getKey,
  onOpen,
  onContextMenu,
  className = "moodboard-grid",
  renderActions,
  actionsPlacement = "below",
  getTileClassName,
}: MediaTileGridProps<T>) {
  const [thumbnailSources, setThumbnailSources] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;

    const loadThumbnails = async () => {
      for (const item of items) {
        if (item.kind !== "image") continue;
        if (thumbnailSources[item.path] !== undefined) continue;

        const thumbnailPath = await ensureImageThumbnail(item.path);
        if (cancelled) return;

        setThumbnailSources((current) => {
          if (current[item.path] !== undefined) {
            return current;
          }
          return {
            ...current,
            [item.path]: thumbnailPath,
          };
        });
      }
    };

    void loadThumbnails();
    return () => {
      cancelled = true;
    };
  }, [items, thumbnailSources]);

  return (
    <div className={className}>
      {items.map((item, idx) => (
        <button
          key={getKey(item, idx)}
          type="button"
          className={getTileClassName ? getTileClassName(item, idx) : "moodboard-tile"}
          onClick={() => onOpen(item, idx)}
          onContextMenu={onContextMenu ? (event) => onContextMenu(event, item, idx) : undefined}
        >
          <div className="moodboard-tile__img">
            {item.kind === "video" || thumbnailSources[item.path] !== undefined ? (
              <MediaSurface
                path={item.kind === "image" ? thumbnailSources[item.path] ?? item.path : item.path}
                kind={item.kind}
                variant="tile"
                autoPlay={item.kind === "video"}
                muted={item.kind === "video"}
                loop={item.kind === "video"}
                preload="metadata"
                playOnHover={item.kind === "video"}
              />
            ) : (
              <div className="moodboard-tile__img-placeholder" aria-hidden />
            )}
            {renderActions && actionsPlacement === "image-bottom-right" ? (
              <div className="media-tile-grid__actions media-tile-grid__actions--image-corner" onClick={(event) => event.stopPropagation()}>
                {renderActions(item, idx)}
              </div>
            ) : null}
          </div>
          <div className="moodboard-tile__label">{item.name}</div>
          {renderActions && actionsPlacement !== "image-bottom-right" ? renderActions(item, idx) : null}
        </button>
      ))}
    </div>
  );
}
