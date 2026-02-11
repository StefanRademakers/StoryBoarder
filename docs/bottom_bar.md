# Bottom Bar (AI Agent)

This document specifies how to add a bottom navigation bar to the new app so it behaves like the current app. It must support page switching, use the same visual style, and show disabled/gray items when pages are not available.

**Goal**
- Provide a persistent bottom bar that switches pages.
- Active page is highlighted; inactive pages are muted/gray.
- When no project is open, all non-project pages are disabled (gray + not clickable), same as the current app.
- Include a second implemented page called `Demo Page`.
- Keep additional nav items (Transcript/Edit/Delivery) present but disabled as placeholders for later.

**Behavior**
- The bottom bar is always visible.
- `Projects` is always available.
- `Project` and `Demo` become available when a project is open.
- Placeholder items remain disabled until implemented.
- Inactive items appear gray; disabled items appear gray and are not clickable.

## Implementation Steps

1) Update page keys and add a `DemoPage`.

`src/state/types.ts`
```ts
export type PageKey = "projects" | "project" | "demo" | "transcript" | "edit" | "delivery";
```

`src/pages/DemoPage.tsx`
```tsx
export function DemoPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Demo Page</h1>
          <p className="page-subtitle">Placeholder page for now.</p>
        </div>
      </header>
      <section className="panel">
        <p className="muted">Demo content goes here.</p>
      </section>
    </div>
  );
}
```

2) Add a bottom nav component (same pattern as the current app).

`src/components/layout/BottomNav.tsx`
```tsx
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
  { key: "project", label: "Project" },
  { key: "demo", label: "Demo" },
  { key: "transcript", label: "Transcript", disabled: true },
  { key: "edit", label: "Edit", icon: "control", disabled: true },
  { key: "delivery", label: "Delivery", disabled: true },
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
```

Notes:
- This uses `public/icons/*.png`. For `demo`, add `public/icons/demo.png` or temporarily reuse `project.png` by setting `icon: "project"`.
- Placeholder items are always disabled.

3) Wire the bottom nav into `App.tsx` and switch pages.

`src/App.tsx`
```tsx
import { useCallback, useMemo, useState, useEffect } from "react";
import { ProjectsOverview } from "./pages/ProjectsOverview";
import { ProjectPage } from "./pages/ProjectPage";
import { DemoPage } from "./pages/DemoPage";
import { BottomNav } from "./components/layout/BottomNav";
import { useAppState } from "./state/appState";
import { createProjectState } from "./state/projectTemplates";
import type { PageKey, ProjectsIndexEntry } from "./state/types";
import { createProjectWorkspace, normalizePathForCompare, resolveProjectFilePath } from "./services/projectService";
import { electron } from "./services/electron";

export default function App() {
  const {
    projectsIndex,
    projectsRootPath,
    project,
    loading,
    lastError,
    setProjectsRootPath,
    loadProject,
    updateProjectsIndex,
    closeProject,
  } = useAppState();

  const [activePage, setActivePage] = useState<PageKey>("projects");
  const projectAvailable = Boolean(project);

  useEffect(() => {
    if (!projectAvailable && activePage !== "projects") {
      setActivePage("projects");
    }
  }, [projectAvailable, activePage]);

  const handleChangeRootPath = useCallback(async () => {
    const picked = await electron.pickDir({
      title: "Select projects root",
      defaultPath: projectsRootPath ?? undefined,
    });
    if (!picked) return undefined;
    return await setProjectsRootPath(picked);
  }, [projectsRootPath, setProjectsRootPath]);

  const handleOpenProject = useCallback(async (entry: ProjectsIndexEntry) => {
    const projectPath = resolveProjectFilePath(entry);
    await loadProject(projectPath);
    setActivePage("project");
  }, [loadProject]);

  const handleCreateProject = useCallback(async (nameFromUI?: string) => {
    const ensureRoot = async (): Promise<string | undefined> => {
      if (projectsRootPath) return projectsRootPath;
      const picked = await handleChangeRootPath();
      return picked ?? undefined;
    };

    const root = await ensureRoot();
    if (!root) return;

    const name = nameFromUI?.trim();
    if (!name) return;

    try {
      const { projectDir, projectFile, indexEntry } = await createProjectWorkspace({
        name,
        rootPath: root,
        createState: createProjectState,
      });

      await updateProjectsIndex((current): typeof projectsIndex => {
        const index = current ?? { projects: [] };
        const normalizedDir = normalizePathForCompare(projectDir);
        const filtered = index.projects.filter((item) => normalizePathForCompare(item.location) !== normalizedDir);
        return { projects: [indexEntry, ...filtered] };
      });

      await loadProject(projectFile);
      setActivePage("project");
    } catch (error) {
      console.error("Failed to create project", error);
      alert(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectsRootPath, handleChangeRootPath, updateProjectsIndex, loadProject, projectsIndex]);

  const content = useMemo(() => {
    if (activePage === "projects") {
      return (
        <ProjectsOverview
          projectsIndex={projectsIndex}
          rootPath={projectsRootPath}
          loading={loading}
          lastError={lastError}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onChangeRootPath={handleChangeRootPath}
          onReload={async () => {
            await updateProjectsIndex((current) => current);
          }}
        />
      );
    }

    if (activePage === "demo") {
      return <DemoPage />;
    }

    if (activePage === "project" && project) {
      return <ProjectPage project={project} />;
    }

    return null;
  }, [activePage, projectsIndex, projectsRootPath, loading, lastError, handleOpenProject, handleCreateProject, handleChangeRootPath, updateProjectsIndex, project]);

  return (
    <div className="app-root">
      <main className="app-content">{content}</main>
      <footer className="app-footer">
        <div className="footer-left">
          {loading ? <span className="badge badge--queued">Loading...</span> : null}
        </div>
        <BottomNav
          active={activePage}
          onSelect={(page) => {
            if (page === "projects") {
              closeProject();
            }
            setActivePage(page);
          }}
          projectAvailable={projectAvailable}
        />
        <div className="footer-right" />
      </footer>
    </div>
  );
}
```

4) Add the bottom bar styles (copy from the current app).

`src/styles.css`
```css
.app-footer {
  position: sticky;
  bottom: 0;
  background-color: var(--color-bg-02);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 10px 0;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.5);
}

.footer-left, .footer-right {
  display: flex;
  align-items: center;
  gap: 0px;
  padding: 0 16px;
}

.footer-left { justify-content: flex-start; }
.footer-right { justify-content: flex-end; }

.bottom-nav {
  display: flex;
  justify-content: center;
  z-index: 100;
}

.bottom-nav__cluster {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
}

.bottom-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px 8px;
  min-width: 44px;
  border: none;
  background: transparent;
  color: rgba(226, 231, 232, 0.5);
  transition: color 0.2s ease, transform 0.2s ease;
}

.bottom-nav__item:hover:not(:disabled) {
  color: rgba(226, 231, 232, 0.85);
  transform: translateY(-2px);
}

.bottom-nav__item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.bottom-nav__item--active {
  color: var(--color-tab-active);
}

.bottom-nav__icon img, .bottom-nav__icon svg {
  display: block;
  width: 20px;
  height: 20px;
}

.bottom-nav__indicator {
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 3px;
  border-radius: 999px;
  background: var(--color-tab-active);
  box-shadow: 0 0 8px rgba(248, 95, 66, 0.6);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

**Checklist**
- Bottom bar shows and switches between `Projects`, `Project`, and `Demo`.
- When no project is open, only `Projects` is enabled; others are gray/disabled.
- Placeholder items are always disabled.
- Demo page renders as a real page.

