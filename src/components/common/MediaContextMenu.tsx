interface MediaContextMenuAction {
  key: string;
  label: string;
  onSelect: () => void | Promise<void>;
  visible?: boolean;
}

interface MediaContextMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  actions: MediaContextMenuAction[];
}

export function MediaContextMenu({
  open,
  position,
  onClose,
  actions,
}: MediaContextMenuProps) {
  if (!open || !position) return null;

  const visibleActions = actions.filter((action) => action.visible !== false);
  if (!visibleActions.length) return null;

  return (
    <div className="context-menu-backdrop" onClick={onClose}>
      <div
        className="context-menu"
        style={{ top: position.y, left: position.x }}
        onClick={(event) => event.stopPropagation()}
      >
        {visibleActions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="context-menu__item"
            onClick={() => {
              void action.onSelect();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

