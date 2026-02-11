import { useEffect } from "react";
import type { PageKey } from "../../state/types";

interface NavItem {
  key: PageKey;
  label: string;
  icon?: string;
  disabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: "projects", label: "Projects" },
  { key: "story", label: "Story" },
  { key: "scenes", label: "Scenes" },
  { key: "shots", label: "Shots" },
  { key: "preview", label: "Preview" },
  { key: "delivery", label: "Delivery" },
];

interface BottomNavProps {
  active: PageKey;
  onSelect: (page: PageKey) => void;
  projectAvailable: boolean;
}

export function BottomNav({ active, onSelect, projectAvailable }: BottomNavProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      if (!event.shiftKey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (!match) return;

      const index = Number(match[1]) - 1;
      if (index >= 0 && index < NAV_ITEMS.length) {
        const item = NAV_ITEMS[index];
        const isDisabled = item.disabled || (!projectAvailable && item.key !== "projects");
        if (!isDisabled) {
          event.preventDefault();
          onSelect(item.key);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelect, projectAvailable]);

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav__cluster">
        {NAV_ITEMS.map((item) => {
          const disabled = item.disabled || (!projectAvailable && item.key !== "projects");
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              aria-label={item.label}
              title={item.label}
              type="button"
              className={`bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`}
              onClick={() => onSelect(item.key)}
              disabled={disabled}
            >
              <span className="bottom-nav__icon">
                <img src={`icons/${item.icon ?? item.key}.png`} width={20} height={20} aria-hidden alt="" />
              </span>
              <span className="sr-only">{item.label}</span>
              {isActive ? <span className="bottom-nav__indicator" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
