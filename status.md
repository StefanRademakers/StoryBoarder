# StoryBuilder Status

Last updated: 2026-03-05

## Latest Changes

### Shots: New `Export Clips` action
- Added a new **Export Clips** button in the Shots toolbar.
- Export behavior:
  - Uses only each shot's `favoriteClip`.
  - Writes output into a new scene-level folder: `scenes/<sceneId>/render/`.
  - Names files by shot index: `clip_001.<ext>`, `clip_002.<ext>`, etc.
  - Skips shots with missing or invalid favorite clip paths.
  - Reveals the `render` folder after completion.

### Implementation Notes
- Toolbar wiring updated:
  - `src/pages/shots/ShotsToolbar.tsx`
- Export hook extended with clip export use case:
  - `src/pages/shots/useShotsExport.ts`
- Shots page now passes a dedicated favorite-clip resolver to export:
  - `src/pages/ShotsPage.tsx`

### Validation
- Typecheck passed: `npx tsc --noEmit`

## FCP7 Export Check (Current)
- FCP7 export is functional but still has a known behavior:
  - If a resolved media path does not exist, that shot is skipped.
  - This can cause missing items in the resulting timeline.
- Current recommendation:
  - Keep favorites clean/valid before export.
  - Optional follow-up: add robust per-shot fallback and skipped-shot reporting in the export result.

## Next Suggested Follow-up
1. Improve FCP7 media resolution fallback (clip -> performance -> still -> concept with existence checks).
2. Add detailed export summary (exported/skipped shot numbers + reasons).
