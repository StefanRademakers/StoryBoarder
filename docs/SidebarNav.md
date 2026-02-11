# Sidebar Nav (AI Agent)

This document specifies how to add a left sidebar navigation component that matches the current app's behavior and styling. It is used to switch between sections within a page (e.g., Project, Transcript, Delivery).

**Goal**
- Provide a reusable SidebarNav component with the same look/feel as the current app.
- Support keyboard shortcuts (1-9) to switch sections.
- Highlight the active section.

**Behavior**
- Renders a vertical list of buttons.
- Active item is styled as selected.
- All items are clickable; no settings menu required.
- Keyboard shortcuts: press `1..9` to select the corresponding item.

## Implementation Steps

1) Add the SidebarNav component.

`src/components/common/SidebarNav.tsx`
```tsx
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
```

2) Add the sidebar styles (copy from the current app).

`src/styles.css`
```css
.project-page--with-sidebar {
  flex-direction: row;
  align-items: stretch;
}

.sidebar-nav {
  width: 184px;
  background: var(--color-bg-02);
  border-radius: 18px;
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.sidebar-nav__items {
  display: flex;
  flex-direction: column;
}

.sidebar-nav__button {
  border: none;
  background: transparent;
  color: rgba(230, 231, 232, 0.7);
  text-align: left;
  font-size: 15px;
  padding: 12px 24px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.sidebar-nav__button:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
}

.sidebar-nav__button--active {
  background: rgba(248, 95, 66, 0.18);
  color: #ffffff;
  font-weight: 600;
  position: relative;
}

.sidebar-nav__button--active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: var(--color-tab-active);
}

.project-page__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
```

3) Use the SidebarNav in `ProjectPage` (example).

`src/pages/ProjectPage.tsx`
```tsx
import { useMemo, useState } from "react";
import type { ProjectState } from "../state/types";
import { SidebarNav } from "../components/common/SidebarNav";

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "media", label: "Media" },
  { key: "shots", label: "Shots" },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

interface ProjectPageProps {
  project: ProjectState;
}

export function ProjectPage({ project }: ProjectPageProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");

  return (
    <div className="page project-page project-page--with-sidebar">
      <SidebarNav
        items={SECTIONS}
        activeKey={activeSection}
        onSelect={setActiveSection}
        ariaLabel="Project sections"
      />

      <div className="project-page__content">
        {activeSection === "overview" ? <div className="panel">Overview content</div> : null}
        {activeSection === "media" ? <div className="panel">Media content</div> : null}
        {activeSection === "shots" ? <div className="panel">Shots content</div> : null}
      </div>
    </div>
  );
}
```

**Checklist**
- Sidebar shows the list of sections.
- Active section is highlighted with the orange left bar.
- Keyboard shortcuts `1..9` switch sections.
- Layout matches the current app styling.
