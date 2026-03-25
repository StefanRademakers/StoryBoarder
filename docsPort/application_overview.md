# StoryBuilder Application Overview

## 1. Purpose

This document is the complete functional and technical overview of the current StoryBuilder application, rewritten for an AI agent that must port it to a multi-user cloud architecture on Hetzner Linux.

The target system must preserve all existing behavior while moving from:
- local desktop Electron + filesystem persistence

to:
- multi-user web client
- server API
- database-backed state
- login/auth system
- shared file storage
- background workers for exports/media processing

## 2. Scope and Source of Truth

This overview is based on:
- `docs/*.md`
- current implementation in `src/*`, `electron/*`, `python/*`, `shared/*`

Observed status date:
- March 20, 2026

Important:
- Code is the ultimate source of truth.
- Some docs are behind code. The implementation includes `performance` shot mode and HTML export workflow.

## 3. Current App Summary (As-Is)

## 3.1 Product role
StoryBuilder is a pre-production orchestration tool for visual story planning:
- project setup
- script and notes
- scene planning
- shot planning
- reference/media management
- export packages for downstream production/editing

It is not currently a collaborative SaaS application.

## 3.2 Runtime architecture
- Desktop app: Electron main + preload + React renderer.
- Python sidecar process for export/render-related commands.
- No backend server.
- No database.
- No user accounts.
- No permissions model.

## 3.3 Persistence model
- Local filesystem is the source of truth.
- JSON and Markdown files are read/written directly from renderer through IPC.
- Media files are copied into project folders.

## 4. Current Functional Inventory

## 4.1 Navigation/pages
Bottom navigation pages:
- Projects
- Story
- Moodboards
- Character & Props
- Scenes
- Shots
- Preview (placeholder)
- Delivery (placeholder)

Special popout windows:
- Markdown editor popout
- Scene pool popout

## 4.2 Projects page
Capabilities:
- Select/change projects root folder.
- Scan folders for projects containing `project.json`.
- Create project workspace.
- Open project.
- Reload projects scan.
- Context menu: rename, duplicate, copy path.
- Disabled placeholders: archive, backup.
- Global settings modal:
  - Photoshop path
  - OpenAI API key
  - ComfyUI local URL

Important behavior:
- Project index is scan-based, not a central index file.
- Settings are stored in browser `localStorage`, app-wide.

## 4.3 Story page
Sections (SidebarNav):
- Project Settings
- Script
- Shotlist
- Notes
- Todos
- Prompts

Capabilities:
- Project thumbnail upload/copy to `resources/project_main_image.<ext>`.
- Project dimensions and framerate fields.
- Markdown editing for script and shotlist.
- Popout markdown editor.
- File library management for notes/todos/prompts:
  - create
  - search
  - rename
  - delete
  - reveal in file manager

## 4.4 Moodboards and Character & Props
Shared page implementation (`FolderImageBoardsPage`), backed by folders:
- `moodboards/`
- `characters/`

Capabilities:
- Board folders create/rename.
- Media import by drag/drop/browse.
- Supports image and video files.
- Fullscreen lightbox with keyboard navigation.
- Favorites per board saved in `.storybuilder-board.json`.
- Media rename with extension safety checks.
- Context actions:
  - open in Photoshop (images)
  - copy image to clipboard (images)
  - reveal in file manager
  - copy path

## 4.5 Scenes page
Data:
- Index file: `scenes/scenes.json`
- Scene folder: `scenes/<sceneId>/`
- Scene docs:
  - `scene.md`
  - `shotlist.md`

Capabilities:
- Create/select/reorder/delete scene.
- Rename scene with robust folder rename flow:
  - retry on transient lock errors
  - fallback copy if rename fails
  - rollback handling
- Scene metadata:
  - name
  - active flag
  - image filename
  - timeOfDay
  - lighting
  - board references: `characterPropBoards[]`, `moodboards[]`
- Scene image upload.
- Popout editor for scene docs.
- Open active scene folder.

Data integrity behavior:
- Strict scene ID parsing/validation.
- Canonical scene ID format: `scene-<slug>-<token>`.
- Scene index writes serialized via queue.
- Load-time normalization and repair behavior.

## 4.6 Shots page
This is the most complex area.

Data:
- Per-scene shots index: `scenes/<sceneId>/shots.json`
- Per-shot media folders:
  - `shots/<shotId>/concept/`
  - `shots/<shotId>/reference/`
  - `shots/<shotId>/still/`
  - `shots/<shotId>/clip/`
  - `shots/<shotId>/performance/`

Shot fields:
- id/order/description
- durationSeconds
- angle
- shotSize
- characterFraming
- movement
- action
- notes
- per-mode asset arrays + favorite pointers

Capabilities:
- Create/select/reorder/delete shot.
- Inline shot editor with media slot and structured metadata.
- Mode switching:
  - concept
  - still
  - clip
  - performance
  - reference
- Versions browser per mode:
  - list versions
  - favorite version
  - delete version
  - open mode folder
- Media ingestion:
  - drag/drop
  - file browse
  - clipboard paste (image modes)
  - URL drop support via temp download handling
- Empty concept image generator (white PNG scaffold).
- Scene pool modal and scene pool popout:
  - merges assets from scene-referenced character/mood boards
- Candidates modal:
  - `CandidateStills`, `CandidateClips` folders per scene
  - import and preview
  - clipboard paste to candidate stills when modal is open
- Playback overlay:
  - sequential playback
  - mode-aware fallback media resolution
- Keyboard controls:
  - `F1..F5` mode switch
  - `Ctrl + Arrow` timeline navigation across scenes/shots
  - `Ctrl + N` create shot after selected
  - `Ctrl + R` refresh active media cache token

Load-time repair behavior:
- Cleans invalid/missing asset references.
- Repairs favorite pointers if favorite target missing.

## 4.7 Export features (Shots)
Export menu includes:
- Export Grid (Python `create_image_grid`)
- Export FCP7 XML (Python `export_fcp7_shots`)
- Export Clips (copy favorite clips into scene `render/` folder)
- Export MP4 (Python `export_mp4_shots`)
- HTML Export (Python `export_html_shots`)

Export behavior details:
- Scene-scoped and mode-dependent.
- Uses project dimensions/framerate.
- Reveals output path after completion.
- Long-running export uses Python sidecar command timeout windows.

## 4.8 Preview and Delivery
- Placeholder pages only.

## 5. Current Data and File Model (As-Is)

## 5.1 Project folder scaffold
On create:
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

## 5.2 Core files
- Project state: `project.json`
- Script docs: `script/script.md`, `script/shotlist.md`
- Scene index: `scenes/scenes.json`
- Scene docs: `scenes/<sceneId>/scene.md`, `scenes/<sceneId>/shotlist.md`
- Scene shots: `scenes/<sceneId>/shots.json`

## 5.3 Board metadata
- Per board: `.storybuilder-board.json`
- Stores favorites list.

## 5.4 App settings
Stored in local storage keys:
- `storybuilder.projectsRootPath`
- `storybuilder.appSettings`

Settings fields:
- `photoshopPath`
- `openaiApiKey`
- `comfyUiLocalUrl`

## 6. Technical Components in Code

Main renderer composition:
- `src/App.tsx`

Global state:
- `src/state/appState.tsx`

Project filesystem operations:
- `src/services/projectService.ts`

Electron IPC bridge:
- `electron/main.ts`
- `electron/preload.ts`
- `shared/preload.ts`
- `src/services/electron.ts`

Python runtime manager:
- `electron/pythonService.ts`
- `python/service.py`

Shots modularized components/hooks:
- `src/pages/shots/*`
- with orchestration still centralized in `src/pages/ShotsPage.tsx`

## 7. Non-Functional Behavior to Preserve

These are part of expected behavior and must be preserved in the cloud port:
- Autosave/debounced editing UX in markdown and shot editing.
- Scene and shots ordering semantics.
- Data repair behavior on load (invalid asset refs, invalid favorites).
- Version/favorite semantics per shot mode.
- Deterministic export output naming and location metadata.
- Keyboard shortcuts where feasible in web context.
- No silent destructive behavior.

## 8. Cloud Port Target (Multi-User, Hetzner Linux)

## 8.1 Mandatory target components
- Web client (React).
- API server app.
- Relational database.
- Login/auth system.
- Shared file/object storage.
- Background workers for media/export tasks.

## 8.2 Recommended deployment layout
Minimum production topology on Hetzner:
- `web` container/service: React app static hosting + reverse proxy.
- `api` container/service: Node API.
- `worker` container/service: async jobs + Python tooling.
- `postgres` managed/self-hosted DB.
- `redis` for queue + cache.
- object storage:
  - Hetzner Object Storage (S3-compatible) preferred
  - fallback self-hosted MinIO if required

Ingress:
- Caddy or Nginx with TLS.

## 8.3 Multi-user domain model
Add first-class entities:
- User
- Organization/Workspace
- Membership (role)
- Project
- Scene
- Shot
- Board (moodboard/character board)
- BoardAsset
- ShotAsset
- ExportJob
- AuditEvent

Roles (minimum):
- Owner
- Editor
- Viewer

## 8.4 Data ownership model
Recommended:
- Project belongs to an organization.
- Users access projects only via membership.
- Every mutable record stores:
  - `created_by`
  - `updated_by`
  - timestamps

## 9. Relational Data Mapping (Filesystem -> DB)

Suggested table mapping:
- `projects` maps `project.json` core fields.
- `project_settings` maps dimensions/framerate.
- `project_docs` stores script/shotlist markdown content.
- `boards` and `board_assets` map moodboards/characters and files.
- `scenes` maps `scenes/scenes.json` scene array.
- `scene_docs` maps per-scene markdown files.
- `shots` maps `shots.json` rows.
- `shot_assets` maps per-mode assets.
- `shot_favorites` or favorite FK columns map favorite pointers.
- `candidate_assets` maps `CandidateStills/CandidateClips`.
- `exports` maps export history/output metadata.

Design note:
- Keep stable IDs from legacy where possible to ease migration.

## 10. File Storage Design (Cloud)

## 10.1 Storage backend
Use S3-compatible object storage.

Suggested logical key layout:
- `org/<orgId>/project/<projectId>/resources/...`
- `org/<orgId>/project/<projectId>/boards/<boardId>/...`
- `org/<orgId>/project/<projectId>/scenes/<sceneId>/shots/<shotId>/<mode>/...`
- `org/<orgId>/project/<projectId>/scenes/<sceneId>/candidates/<tab>/...`
- `org/<orgId>/project/<projectId>/exports/<exportJobId>/...`

## 10.2 Required media services
- Upload endpoint (multipart or signed URL flow).
- File dedupe strategy optional but recommended.
- Thumbnail generation pipeline (replace local canvas thumbnail cache).
- Signed URL generation for private assets.

## 10.3 Desktop-specific behavior replacements
Replace these local-only actions:
- “Open in Photoshop”
- “Reveal in Explorer/Finder”
- local clipboard image copy APIs

Web equivalents:
- download/open file link
- copy URL
- upload/edit integrations via external callbacks

## 11. API Surface (High-Level)

Required API domains:
- Auth
- Users/Organizations/Memberships
- Projects
- Project settings/docs
- Boards and board assets
- Scenes and scene docs
- Shots and shot assets
- Candidates
- Exports/jobs
- Search/filter endpoints for notes/todos/prompts content

API behavior requirements:
- optimistic concurrency control (version fields or `updated_at` checks)
- transactional operations for reorder/rename/move semantics
- server-side validation for canonical IDs and allowed transitions

## 12. Authentication and Security

Minimum auth stack:
- Email/password or OAuth provider.
- JWT or secure session cookie.
- Refresh strategy.
- Password reset flow.

Mandatory controls:
- RBAC authorization on every project-scoped endpoint.
- Rate limiting.
- Audit logging for destructive actions.
- Secret management for API keys (do not store plaintext in client local storage).

Settings migration:
- `openaiApiKey` should move to secure server-managed secret store per org/project scope.
- `comfyUiLocalUrl` becomes integration config in DB, not local storage.

## 13. Background Jobs and Workers

Move all long-running tasks out of request cycle:
- Grid export
- FCP7 export
- MP4 export
- HTML export asset processing
- Thumbnail generation

Execution model:
- API enqueues `ExportJob`.
- Worker processes with job status updates.
- Output files saved to object storage.
- Client polls or subscribes for status.

Python compatibility:
- Reuse current Python actions where possible.
- Wrap as worker task handlers.
- Ensure ffmpeg availability in worker runtime.

## 14. Concurrency and Integrity Requirements

For multi-user correctness, implement:
- Row-level optimistic locking for scene/shot edits.
- Transactional reorder operations.
- Conflict detection for simultaneous edits.
- Idempotent media attach operations.
- Referential integrity from shots to assets and favorites.

Must preserve repair behavior:
- If favorite asset removed, fallback to latest valid asset.
- Filter invalid asset refs at load or mutation boundary.

## 15. Migration Strategy from Existing Local Projects

## 15.1 Ingestion pipeline
- Upload/attach legacy project directory.
- Parse project files:
  - `project.json`
  - markdown docs
  - `scenes/scenes.json`
  - all per-scene `shots.json`
  - board metadata files
- Upload media files to object storage.
- Write normalized DB records.

## 15.2 Compatibility principles
- Preserve scene IDs and shot IDs where possible.
- Preserve order indexes exactly.
- Preserve favorite pointers.
- Preserve markdown content raw.

## 15.3 Validation after import
- Count parity:
  - scenes
  - shots
  - board assets
  - shot assets by mode
- Detect and report orphan references.
- Generate import report with warnings/errors.

## 16. Frontend Port Requirements (React Web Client)

Must retain UX structure:
- Projects overview workflow.
- Bottom nav page switching and disabled states.
- Sidebar section navigation in Story/Scenes/Shots contexts.
- Modals for create/rename/delete/export.
- Lightbox behavior with keyboard support.
- Versions browser and favorites UI.

Web adaptation:
- Replace local file dialogs with upload/select UI.
- Replace file manager actions with browser-safe alternatives.
- Preserve keyboard shortcuts where browser-safe.

## 17. Gaps and Known Placeholders to Keep as Placeholders

Keep parity with current behavior:
- `Preview` page remains placeholder.
- `Delivery` page remains placeholder.
- Archive/backup project actions remain disabled placeholders.

Optional in first port phase:
- Keep Props page unwired to nav unless intentionally added.

## 18. Testing and Acceptance Criteria for Port

## 18.1 Minimum automated coverage
- API unit tests for scene/shot mutation rules.
- Repository/service tests for asset/favorite repair logic.
- Integration tests for:
  - create/open project
  - scene CRUD + rename semantics
  - shot CRUD + mode asset behavior
  - export job lifecycle

## 18.2 End-to-end parity checklist
- User can login and access authorized projects only.
- Full project lifecycle works in browser.
- All current scene and shot workflows functionally match desktop behavior.
- Exports complete via background jobs and output is downloadable.
- Data survives server restart and concurrent usage.
- No local filesystem dependency leaks in client.

## 19. Implementation Priorities (Recommended)

Phase 1:
- Auth + org/project model
- Project/Scene/Shot core APIs
- DB schema
- object storage integration

Phase 2:
- Boards/media workflows
- markdown docs and libraries
- versions/favorites logic

Phase 3:
- export worker pipeline (grid/fcp7/mp4/html)
- scene pool/candidates parity

Phase 4:
- hardening, observability, migration tooling, full parity QA

## 20. Critical Porting Risks

- Treating this as a simple UI port. It is a data/architecture migration.
- Missing concurrency controls for reorder/favorite/asset operations.
- Keeping secrets in client-side storage.
- Re-implementing exports without job queue semantics.
- Breaking scene/shot identity and legacy import compatibility.

## 21. Final Directive for AI Porting Agent

When porting:
- prioritize behavioral parity over visual redesign.
- preserve data semantics exactly.
- convert filesystem assumptions into DB + object storage contracts.
- enforce multi-user auth and authorization from day one.
- ship with migration/import tooling for existing local projects.

