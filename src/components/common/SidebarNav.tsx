import type { ReactNode } from "react";
import { useEffect } from "react";

export interface SidebarNavItem<Key extends string = string> {
  key: Key;
  label: ReactNode;
}

interface SidebarNavProps<Key extends string = string> {
  items: readonly SidebarNavItem<Key>[];
  activeKey: Key | null;
  onSelect: (key: Key) => void;
  className?: string;
  ariaLabel?: string;
}

export function SidebarNav<Key extends string = string>({
  items,
  activeKey,
  onSelect,
  className,
  ariaLabel,
}: SidebarNavProps<Key>) {
  const rootClassName = ["sidebar-nav", className].filter(Boolean).join(" ");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (!match) return;

      const index = Number(match[1]) - 1;
      if (index >= 0 && index < items.length) {
        const item = items[index];
        event.preventDefault();
        onSelect(item.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelect, items]);

  return (
    <nav className={rootClassName} aria-label={ariaLabel}>
      <div className="sidebar-nav__items">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              className={`sidebar-nav__button${isActive ? " sidebar-nav__button--active" : ""}`}
              onClick={() => onSelect(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
