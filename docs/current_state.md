# Current State (StoryBuilder)

Updated from current source code on 2026-02-13.

## Stability Snapshot
- Scenes + Shots are functionally solid for core production flow (create/edit/reorder/delete + on-disk persistence).
- Data integrity protections are present:
  - Scene index normalization/repair on load.
  - Serialized scene index writes (queued persistence).
  - Shot media reference cleanup/repair on load.
- Remaining risk areas are mostly around migration edge cases and error surfacing (details in Known Gaps).

## What This App Is
StoryBuilder is an Electron + React desktop app for creating visual story projects. The app is page-based:
- Projects
- Story
- Moodboards
- Character & Props
- Scenes
- Shots
- Preview
- Delivery

## Tech Stack
- Electron (main + preload bridge)
- React + TypeScript
- Vite
- MDXEditor for markdown editing
- Python command bridge exposed through Electron IPC

## Project Structure (on disk)
When creating a project, workspace scaffolding includes:
- `project.json`
- `script/`
- `scenes/`
- `images/`
- `notes/`
- `resources/`
- `todos/`
- `prompts/`
- `moodboards/`
- `characters/`

`project.json` stores core project state (name, settings, thumbnail path, script text, shotlist text, timestamps, etc.).

## Page Status

### Projects
- Grid of projects discovered by scanning the selected root folder.
- Supports create, open, reload, change root.
- Global app settings are managed here (header gear button):
  - `Photoshop location` (single app-wide value, not per project).
- Context menu supports rename and duplicate (archive/backup are present but disabled placeholders).
- Tile image uses `thumbnail` path from project state.

### Story
Sections:
- Project Settings:
  - Project thumbnail drop/browse.
  - Thumbnail copied to `resources/project_main_image.<ext>`.
  - Project settings fields: width, height, framerate.
- Script:
  - MDX editor for `script/script.md`, also mirrored in `project.json` (`script`).
  - Supports pop-out editor window.
- Shotlist:
  - MDX editor for `script/shotlist.md`, also mirrored in `project.json` (`shotlist`).
  - Supports pop-out editor window.
- Notes / Todos / Prompts:
  - Markdown files stored in `notes/`, `todos/`, and `prompts/`.
  - Managed by shared `LibrarySection` (create/search/rename/delete/reveal).

### Moodboards
- Uses shared `FolderImageBoardsPage` with root `moodboards/`.
- Folder-per-board workflow.
- Create board, rename board, reveal board in file manager.
- Drop/browse media import with collision-safe filename dedupe.
- Grid sorted by most recently modified.
- Fullscreen preview with keyboard navigation (left/right), delete confirmation.
- Media support includes images + videos (`.png/.jpg/.jpeg/.webp/.mp4/.mov/.webm/.mkv/.avi/.m4v`).
- Media context menu:
  - images: open in Photoshop, copy to clipboard, reveal in file manager
  - videos: reveal in file manager

### Character & Props
- Uses the same `FolderImageBoardsPage`.
- Stored under `characters/`.
- Same behavior as Moodboards (board folders, media import, preview, context actions).

### Scenes
- Fully implemented (not placeholder).
- Scene index is `scenes/scenes.json`.
- Supports create, select, reorder, rename, active flag toggle, delete.
- Each scene gets its own folder: `scenes/<sceneId>/`.
- Create flow scaffolds per-scene docs immediately:
  - `scene.md`
  - `shotlist.md`
- Scene metadata includes:
  - `name`
  - `active`
  - `image` (filename in scene folder)
  - `timeOfDay`
  - `lighting`
- Per-scene docs:
  - `scene.md`
  - `shotlist.md`
- Per-scene image stored inside the scene folder (`scene_image.<ext>`); index stores filename.
- Includes load-time normalization/repair for malformed scene records (IDs, ordering, missing metadata defaults).
- Duplicate scene ID repair includes directory copy-forward (`fromId -> toId`) when needed.
- Scene editor uses MDX sections for script + shotlist with pop-out editor support.

### Shots
- Fully implemented (not placeholder).
- Scene-specific shots index: `scenes/<sceneId>/shots.json`.
- Scene-specific shot assets: `scenes/<sceneId>/shots/<shotId>/`.
- Supports create, select, reorder, edit, delete.
- Multi-mode media system (per shot): `concept`, `still`, `clip`.
- Each mode stores:
  - asset list (`conceptAssets` / `stillAssets` / `clipAssets`)
  - favorite pointer (`favoriteConcept` / `favoriteStill` / `favoriteClip`)
- New shot creation scaffolds mode folders under shot directory.
- Media ingest supports drag/drop + browse for all modes, plus clipboard paste for image modes.
- Built-in versions browser per mode:
  - list by modified time
  - set favorite
  - delete version file (if not still referenced)
- Scene board export (toolbar):
  - Single `Export` button in main shots toolbar.
  - Export dialog allows settings (currently columns `X`, default 2).
  - Export follows active mode:
    - `Concept` mode exports concept board.
    - `Still` mode exports still board.
    - `Clip` mode is not supported for grid export.
  - Uses project width/height as fixed tile size (center-fit).
  - Includes placeholders for missing shot media so shot order stays intact.
  - Uses Save dialog for explicit output filename/path (`.png`).
  - After successful export, file is revealed in Finder/Explorer automatically.
- Context menu actions:
  - replace current media
  - open in Photoshop (image modes only)
  - copy to clipboard (image modes only)
  - reveal in file manager
- Shot fields:
  - `id`
  - `order`
  - `description`
  - `durationSeconds`
  - `framing`
  - `action`
  - `camera`
  - mode-specific favorites + asset arrays (above)
- Keyboard timeline navigation across shots and scenes via `Ctrl + Arrow` keys.
- `Ctrl + N` creates a new shot after the current selection.
- Load-time media repair removes invalid/missing asset refs and reassigns favorites safely.

### Preview
- Placeholder page.

### Delivery
- Placeholder page.

## Data Model Notes

### `scenes/scenes.json`
`scenes` array items contain:
- `id: string`
- `name: string`
- `order: number`
- `active: boolean`
- `image?: string` (filename in scene folder)
- `timeOfDay?: string`
- `lighting?: string`

### `scenes/<sceneId>/shots.json`
`shots` array items contain:
- `id: string`
- `order: number`
- `description: string`
- `durationSeconds?: number | null`
- `framing?: string`
- `action?: string`
- `camera?: string`
- `favoriteConcept?: string` (relative path like `shots/<shotId>/concept/<file>`)
- `favoriteStill?: string` (relative path like `shots/<shotId>/still/<file>`)
- `favoriteClip?: string` (relative path like `shots/<shotId>/clip/<file>`)
- `conceptAssets?: string[]`
- `stillAssets?: string[]`
- `clipAssets?: string[]`

## Editor Behavior (MDX)
- Debounced autosave plus hard save on blur.
- Keeps stable markdown save/load flow without marker transforms.
- Supports image upload into sibling `images/` folder next to the markdown file.
- Cleans up removed local markdown-managed images if no sibling markdown file still references them.
- Supports pop-out editor windows (`EditorPopoutPage`).
- Link insertion is handled by inline toolbar UI (custom mini form), not `linkDialogPlugin`.
- `Shift+Enter` inserts a spacer (`---`) for intentional visual separation.

## Key Electron Bridge Capabilities Used
- File system: read/write text, write binary, ensure dir, exists, list, stat, rename, copy file/dir, delete file/dir.
- System/file manager actions: open folder, reveal file, open file with app, copy image to clipboard.
- Pickers: file/dir selection + save-file selection.
- App-level: set window title, open editor popout window.
- Python command execution bridge.

## Python Runtime
- Python runs from an app-local `.venv` managed by `electron/pythonService.ts`.
- Startup behavior:
  - Creates `.venv` automatically if missing.
  - Installs dependencies from `python/requirements.txt` into that `.venv`.
  - Uses a requirements lock-stamp in `.venv` to avoid reinstalling unchanged dependencies.
- In packaged app:
  - service code is loaded from bundled resources (`resources/python`),
  - runtime `.venv` is created/used under user data (`<userData>/python-runtime/.venv`).

## Known Gaps / Follow-ups
- `Preview` and `Delivery` are still placeholders.
- `PropsPage.tsx` exists but is not currently wired into app navigation.
- Projects index refresh is scan-based; some metadata updates (for example thumbnail changes) may not show in Projects until reload/rescan.
- `ShotsPage.tsx` does not expose explicit load/save error UI like `ScenesPage.tsx` does.
- Legacy shot schema compatibility (`image`-only shot entries) is not explicitly migrated in `ShotsPage.tsx`; media may need manual reassignment for old projects.
- Media UI consolidation is partially implemented (shared context menu + shared lightbox now in use).

## Media Widget Audit (Current)

### 1) `ImageAssetField` (`src/components/common/ImageAssetField.tsx`)
- Used in:
  - Story project thumbnail
  - Scene image
- Right-click menu:
  - Replace image
  - Open in Photoshop
  - Copy to Clipboard
  - Reveal in Finder/Explorer
- Scope:
  - Single-image field component.
  - Uses shared `MediaContextMenu`.

### 2) `FolderImageBoardsPage` (`src/pages/FolderImageBoardsPage.tsx`)
- Used by:
  - Moodboards page
  - Character & Props page
- Tile and preview:
  - Supports image + video media rendering.
- Right-click on board item:
  - Reveal in Finder/Explorer
  - Rename
- Right-click on media item or fullscreen preview:
  - Images:
    - Open in Photoshop
    - Copy to Clipboard
    - Reveal in Finder/Explorer
  - Videos:
    - Reveal in Finder/Explorer
- Fullscreen uses shared `MediaLightbox`.
- Context menus use shared `MediaContextMenu`.

### 3) Shots media UI (`src/pages/ShotsPage.tsx`)
- Multiple media surfaces:
  - Inline shot media slot
  - Versions browser tiles
  - Fullscreen preview modal
- Right-click menu for active shot media:
  - Add/Replace media
  - Create empty image (concept mode when missing)
  - Open in Photoshop (image modes)
  - Copy to Clipboard (image modes)
  - Reveal in Finder/Explorer
- Right-click menu is also available in:
  - Concept/Still/Clip versions grid tiles
  - Fullscreen versions preview
- Version context menu actions:
  - Set favorite
  - Delete version
  - Open in Photoshop (image modes)
  - Copy to Clipboard (image modes)
  - Reveal in Finder/Explorer
- Uses shared `MediaContextMenu` and shared `MediaLightbox` for versions preview.

## Consolidation Status
- Implemented:
  - Shared `MediaContextMenu` component (`src/components/common/MediaContextMenu.tsx`)
  - Shared `MediaLightbox` component (`src/components/common/MediaLightbox.tsx`)
  - Shared `MediaTileGrid` component (`src/components/common/MediaTileGrid.tsx`)
  - Shared media model helpers (`src/components/common/mediaTypes.ts`)
  - Reused in:
    - `ImageAssetField`
    - `FolderImageBoardsPage` (media tiles + preview + menus)
    - `ShotsPage` (version tiles + preview + menus)
- `MediaLightbox` now handles core keyboard behavior (`Escape`, `ArrowLeft`, `ArrowRight`) centrally.
- Remaining optional follow-up:
  - Add action-slot support inside `MediaLightbox` to reduce page-specific key/action glue code further.
