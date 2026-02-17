# Shots Restructure Plan (Production-Grade)

Purpose: define a practical, staged path to move `ShotsPage` from a monolithic page into maintainable, testable, production-level code.

## Goals
- Reduce `src/pages/ShotsPage.tsx` to a composition/container page.
- Separate domain logic, side effects, persistence, and rendering.
- Preserve current behavior and keyboard shortcuts.
- Make future features safer and faster to implement.

## Current Problems
- One file owns too many concerns: UI rendering, state orchestration, file I/O, data repair, export orchestration, playback, modals, context menus.
- High regression risk from mixed responsibilities.
- Difficult testing: logic is tied to React and Electron calls.

## Target Architecture

Feature module layout:

```text
src/features/shots/
  domain/
    types.ts
    rules.ts
    selectors.ts
    normalization.ts
  application/
    useShotsController.ts
    useShotPlayback.ts
    useShotExport.ts
    useShotCandidates.ts
  infrastructure/
    shotsRepository.ts
    scenePoolRepository.ts
  ui/
    ShotsPage.tsx
    ShotsToolbar.tsx
    ShotsList.tsx
    ShotRow.tsx
    ShotEditorPanel.tsx
    ShotVersionsModal.tsx
    ScenePoolModal.tsx
    CandidatesModal.tsx
    ShotsContextMenus.tsx
    ShotsLightboxes.tsx
```

Rules:
- `domain/*`: pure functions only (no React/Electron).
- `infrastructure/*`: Electron/FS/Python bridges.
- `application/*`: hooks/use-cases (orchestration).
- `ui/*`: rendering only, typed props + callbacks.

## Non-Goals (For Now)
- No full state-management rewrite (Redux/Zustand) yet.
- No behavior changes unless explicitly required.
- No redesign of visual UX in this pass.

## Phased Execution Plan

## Phase 0: Stabilize Baseline
1. Confirm current behavior with a manual smoke checklist.
2. Keep `shots/utils.ts` as temporary compatibility layer.
3. Add/maintain a quick regression checklist in this file.

Exit criteria:
- App builds and basic shot workflows work before deeper moves.

## Phase 1: Complete UI Extraction
1. Extract remaining major JSX blocks:
   - `ScenePoolModal`
   - `CandidatesModal`
   - `ShotsList`
   - `ShotRow`
   - `ShotsContextMenus`
   - `ShotsLightboxes`
2. Keep existing handler functions in page for now.

Exit criteria:
- `ShotsPage.tsx` mainly wires props and handlers.
- No behavior regressions.

## Phase 2: Domain Consolidation
1. Move shot rules/formatting/normalization from page+utils into:
   - `domain/normalization.ts`
   - `domain/rules.ts`
   - `domain/selectors.ts`
2. Keep functions pure and unit-testable.

Exit criteria:
- No business logic in UI components.
- Pure logic covered by unit tests.

## Phase 3: Repository Layer
1. Create `infrastructure/shotsRepository.ts`:
   - load/persist `shots.json`
   - load/persist/repair media references
   - create/delete shot folders
2. Create `infrastructure/scenePoolRepository.ts`:
   - pool assets
   - candidate assets import/load
3. UI stops directly calling raw `electron.*` for shot persistence.

Exit criteria:
- All shot file-system operations centralized in repositories.

## Phase 4: Application Hooks
1. Create `useShotsController` for primary orchestration.
2. Create specialized hooks:
   - `useShotPlayback`
   - `useShotExport`
   - `useShotCandidates`
3. Keep hooks thin by delegating persistence to repositories.

Exit criteria:
- `ShotsPage` is mostly composition + wiring.

## Phase 5: Testing + Hardening
1. Add unit tests:
   - normalization/rules/selectors
2. Add repository tests (mock electron layer).
3. Add integration-level tests for key user flows.
4. Add error surfaces in UI for load/save/export failures.

Exit criteria:
- Critical behaviors validated by tests.
- Better failure visibility in UI.

## Suggested Extraction Order (Low Risk -> High Impact)
1. `ScenePoolModal`
2. `CandidatesModal`
3. `ShotsList`
4. `ShotRow`
5. `ShotsContextMenus`
6. `ShotsLightboxes`
7. `shotsRepository`
8. `useShotsController`

## Definition of Done (Production Quality)
- `ShotsPage.tsx` <= ~300 lines.
- Domain rules pure and unit-tested.
- All shot persistence through repository layer.
- Side-effect orchestration in application hooks.
- UI components presentational and reusable.
- Keyboard shortcuts and existing behavior unchanged.
- Build + typecheck + smoke checklist pass.

## Smoke Checklist (Keep Updated)
1. Open project -> Shots page loads.
2. Create/reorder/delete shot works.
3. Drag/drop + browse + paste media works per mode.
4. Favorites and version delete behavior works.
5. Scene pool + candidates workflows work.
6. Export grid works and reveals output file.
7. Playback shortcuts/navigation still work.

## Risks and Controls
- Risk: behavior regression during extraction.
  - Control: one extraction per PR-sized step + smoke checks.
- Risk: hidden coupling to page state.
  - Control: introduce typed props/contracts before moving logic.
- Risk: Windows FS transient lock issues.
  - Control: keep retry/fallback behavior in repository layer.

## Notes for Future Sessions
- Prefer small, incremental refactors with build checks after each step.
- Keep temporary adapters if needed; remove only after each phase is stable.
- Do not mix architecture moves with UI redesign in the same pass.
