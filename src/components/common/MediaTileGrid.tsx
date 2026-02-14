import type { MouseEvent, ReactNode } from "react";
import { toFileUrl } from "../../utils/path";
import type { MediaItem } from "./mediaTypes";

interface MediaTileGridProps<T extends MediaItem> {
  items: T[];
  getKey: (item: T, index: number) => string;
  onOpen: (item: T, index: number) => void;
  onContextMenu?: (event: MouseEvent, item: T, index: number) => void;
  className?: string;
  renderActions?: (item: T, index: number) => ReactNode;
  getTileClassName?: (item: T, index: number) => string;
}

export function MediaTileGrid<T extends MediaItem>({
  items,
  getKey,
  onOpen,
  onContextMenu,
  className = "moodboard-grid",
  renderActions,
  getTileClassName,
}: MediaTileGridProps<T>) {
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
            {item.kind === "video" ? (
              <video src={toFileUrl(item.path)} muted playsInline autoPlay loop preload="metadata" />
            ) : (
              <img src={toFileUrl(item.path)} alt="" />
            )}
          </div>
          <div className="moodboard-tile__label">{item.name}</div>
          {renderActions ? renderActions(item, idx) : null}
        </button>
      ))}
    </div>
  );
}

