# StoryBuilder Quick Start

Purpose: get a new reboot/session productive in minutes without re-reading the whole codebase.

## 1) What This App Is
- Desktop app: Electron + React + TypeScript.
- Primary workflow: Projects -> Story -> Moodboards/Characters -> Scenes -> Shots.
- Heavy media/file-system app with local folders as source of truth.
- Python sidecar is used for commands like shot grid export.

## 2) Fast Boot Checklist
1. Read `docs/current_state.md` for latest product/status snapshot.
2. Open these first:
   - `src/App.tsx`
   - `src/state/appState.tsx`
   - `src/pages/ScenesPage.tsx`
   - `src/pages/ShotsPage.tsx`
   - `electron/main.ts`
   - `electron/pythonService.ts`
3. Run app in dev and sanity-click:
   - open/create project
   - switch bottom nav pages
   - open Scenes, create/rename/delete one scene
   - open Shots and create shot

## 3) Run Commands
```powershell
npm install
npm run dev
```

Production package:
```powershell
.\build.bat
```

## 4) Architecture Map
- Renderer app entry: `src/main.tsx`
- Root routing/composition: `src/App.tsx`
- Global app/project state + autosave: `src/state/appState.tsx`
- Project FS operations: `src/services/projectService.ts`
- Renderer -> preload API wrapper: `src/services/electron.ts`
- Preload contract types: `shared/preload.ts`
- Python IPC types: `shared/ipc.ts`
- Preload implementation: `electron/preload.ts`
- Main process IPC + windows: `electron/main.ts`
- Python runtime lifecycle: `electron/pythonService.ts`

## 5) Main Feature Files
- Projects page: `src/pages/ProjectsOverview.tsx`
- Story page + markdown sections: `src/pages/StoryPage.tsx`
- Scenes system (index + scene docs): `src/pages/ScenesPage.tsx`
- Shots system (largest/most complex page): `src/pages/ShotsPage.tsx`
- Bottom navigation: `src/components/layout/BottomNav.tsx`
- Shared media primitives:
  - `src/components/common/MediaContextMenu.tsx`
  - `src/components/common/MediaLightbox.tsx`
  - `src/components/common/MediaTileGrid.tsx`

## 6) Data on Disk (Per Project)
- `project.json`
- `script/script.md`, `script/shotlist.md`
- `scenes/scenes.json`
- `scenes/<sceneId>/scene.md`
- `scenes/<sceneId>/shotlist.md`
- `scenes/<sceneId>/shots.json`
- `scenes/<sceneId>/shots/<shotId>/{concept,reference,still,clip}/...`
- `moodboards/`, `characters/`, `resources/`, etc.

## 7) Behavior Notes That Matter
- Projects index is scan-based (not a single central db file).
- App settings (`photoshopPath`, OpenAI key, ComfyUI URL) are app-level localStorage.
- Scenes index writes are queued; rename has retry/fallback/rollback logic.
- Shots state is debounced persisted per scene (`shots.json`).
- Shots export uses Python command `create_image_grid`.
- Popouts are real windows opened from main process:
  - editor popout
  - scene pool popout

## 8) Keyboard Shortcuts to Remember
- Bottom nav: `Shift` or `Alt` + `1..9`
- SidebarNav sections: `1..9`
- Shots:
  - `F1/F2/F3/F4` mode switch
  - `Ctrl + Arrow` timeline navigation across shots/scenes
  - `Ctrl + N` create shot

## 9) Known Hotspots / Risk Areas
- `src/pages/ShotsPage.tsx` is very large and has many responsibilities.
- Scene/shots file writes can be sensitive to transient Windows file locks.
- Some pages are placeholders (`Preview`, `Delivery`).
- Metadata refresh on Projects can require reload/rescan.

## 10) Suggested First Task on Reboot
1. Confirm app launches and Python service responds (open app + run export dialog once).
2. If touching Shots, isolate one concern first (state, UI, media, export) before broad edits.
3. Keep filesystem behavior consistent with existing helpers (`projectService`, `electron` service).
