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
- Context menu supports rename and duplicate (archive/backup are present but disabled placeholders).
- Tile image uses `thumbnail` path from project state.

### Story
Sections:
- Project Settings:
  - Project thumbnail drop/browse.
  - Thumbnail copied to `resources/project_main_image.<ext>`.
  - Project settings fields: Photoshop path, width, height, framerate.
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
- Drop/browse image import with collision-safe filename dedupe.
- Grid sorted by most recently modified.
- Fullscreen preview with keyboard navigation (left/right), delete confirmation.
- Image context menu: open in Photoshop, copy to clipboard, reveal in file manager.

### Character & Props
- Uses the same `FolderImageBoardsPage`.
- Stored under `characters/`.
- Same behavior as Moodboards (board folders, image import, preview, context actions, settings modal for Photoshop path).

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
- Preserves intentional blank lines with `<!-- -->` markers on save/load transforms.
- Supports image upload into sibling `images/` folder next to the markdown file.
- Cleans up removed local markdown-managed images if no sibling markdown file still references them.
- Supports pop-out editor windows (`EditorPopoutPage`).

## Key Electron Bridge Capabilities Used
- File system: read/write text, write binary, ensure dir, exists, list, stat, rename, copy file/dir, delete file/dir.
- System/file manager actions: open folder, reveal file, open file with app, copy image to clipboard.
- Pickers: file/dir selection.
- App-level: set window title, open editor popout window.
- Python command execution bridge.

## Known Gaps / Follow-ups
- `Preview` and `Delivery` are still placeholders.
- `PropsPage.tsx` exists but is not currently wired into app navigation.
- Projects index refresh is scan-based; some metadata updates (for example thumbnail changes) may not show in Projects until reload/rescan.
- `ShotsPage.tsx` does not expose explicit load/save error UI like `ScenesPage.tsx` does.
- Legacy shot schema compatibility (`image`-only shot entries) is not explicitly migrated in `ShotsPage.tsx`; media may need manual reassignment for old projects.
