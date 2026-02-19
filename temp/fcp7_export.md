# FCP7 XML Export Spec (Agent Implementation Guide)

This document describes how to implement an exporter that writes Final Cut Pro 7 XML (`xmeml` v5) in a way that imports cleanly into modern NLEs (including DaVinci Resolve).

It is based on the working exporters in this repository:
- `python/actions/export_fcp7.py` (plan/image-based timeline)
- `python/actions/export_fcp7_rendered.py` (rendered-clips timeline)

## Goal

Given a project/timeline model, generate an `xmeml` file that preserves:
- timeline timing in frames
- media file references (`pathurl`)
- per-track clip placement
- audio track structure and basic audio filter metadata

## Export Modes

Implement two modes.

1. `plan` mode
- Build clips from timeline blocks (`speechActivity.shotPlan.planBlocks`).
- Use still/image variant paths for video clip sources.
- Optionally append extra stills after the main timeline.

2. `rendered` mode
- Build clips from rendered clip manifests (`Renders/Clips/clip_*_manifest.json`).
- Prefer this mode for production delivery since it uses actual rendered outputs.

## Input Contract

Minimum payload:
- `projectPath` (required): absolute or relative path to `project.json`
- `outputPath` (optional): destination XML path

Rendered mode additionally assumes:
- `Renders/Clips/clip_*_manifest.json` exists

## Output Contract

Return:
- `outputPath`: generated XML path (prefer project-relative if your app supports it)

Optionally return:
- manifest count, clips dir, selected audio mix path

## XML Root and Sequence

Create:
- `<xmeml version="5">`
- one `<sequence id="sequence-1">`

Inside `<sequence>` include (in this order):
1. `<name>`
2. `<duration>` (set at end after computing max end frame)
3. `<rate><timebase>..</timebase><ntsc>TRUE|FALSE</ntsc></rate>`
4. `<in>-1</in>`
5. `<out>-1</out>`
6. `<timecode>` starting at 1 hour (`timebase * 3600` frames)
7. `<media><video>...</video><audio>...</audio></media>`

## Frame Rate and Timecode Rules

- Represent timeline in integer frames.
- Resolve `rate` as:
  - `timebase` (integer fps base, e.g. `24`, `25`, `30`, `60`)
  - `ntsc` (`TRUE` or `FALSE`)
- Timecode string format: `HH:MM:SS:FF`.
- Sequence display format:
  - `DF` if `ntsc == "TRUE"`
  - `NDF` otherwise

## Clipitem Structure

For each timeline item, create `<clipitem id="...">`.

Required children:
- `name`
- `duration`
- `rate`
- `start`
- `end`
- `enabled` (`TRUE`)
- `in`
- `out`
- `file` (insert immediately after `out`)
- `sourcetrack`

`sourcetrack`:
- `mediatype` = `video` or `audio`
- `trackindex`:
  - for video: actual timeline track index (1-based)
  - for audio: use `1` for source track metadata compatibility

Video-specific extras:
- `alphatype` = `none` (rendered mode)
- `masterclipid` = `masterclip-<clipitem-id>` (rendered mode)
- clip-level `timecode` is safe for video clips

Audio-specific extras:
- include `<comments/>`
- avoid clip-level `timecode` on audio clips

## File Element Structure

Each clipitem references a `<file id="...">`:
- `name`
- `pathurl` as `file://localhost/...`
- `rate`
- `duration`
- `media`

Ordering used by working exporter:
- video file: `name`, `pathurl`, `rate`, `duration`
- audio file: `duration`, `rate`, `name`, `pathurl`

Media sub-structure:
- video: `<media><video><samplecharacteristics>...`
  - `width`, `height`, `pixelaspectratio=square`, `anamorphic=FALSE`
- audio: `<media><audio>`
  - `channelcount` (default 1 if unknown)

## Track Construction

Video tracks:
- place each clip on the first non-overlapping track
- create additional tracks if overlap exists

Rendered mode variant stacking:
- one manifest can map to multiple render versions
- place version 0 on V1, version 1 on V2, etc. when possible
- if overlap prevents preferred track, fall back to next free track

Audio tracks:
- optional per-clip audio on A1
- reserve additional tracks for mixdown/speaker stems
- place long-form audio from t=0 to at least sequence duration

Track flags:
- append `enabled=TRUE`, `locked=FALSE` on all tracks

## Audio Filters (Recommended)

For audio clipitems, add two filter blocks:

1. Audio Levels
- `effectid=audiolevels`
- parameter `level=1`

2. Audio Pan
- `effectid=audiopan`
- parameter `pan=0`

This improves compatibility with imports that expect explicit audio defaults.

## Audio Source Priority

Use this priority for timeline-wide mix:
1. `project.allSpeakersMix`
2. `speechActivity.shotPlan.audioTracks.mixdown`
3. fallback file like `Renders/dialogue_mix.wav`

Then append per-speaker tracks when available.

## Path Handling

- Resolve project-relative paths against project directory.
- Write XML `pathurl` as URI with `file://localhost/` prefix.
- Preserve absolute paths for NLE reliability.

## Sequence Duration Finalization

Compute `last_end_frame` while adding video and audio clips.
Set:
- `<sequence><duration>` = `max(last_end_frame, 1)`

## Validation Checklist

Before writing XML:
- at least one video clip exists
- all referenced media paths exist (or explicitly skip missing clips)
- `start < end` for all clipitems
- sequence has both `<video>` and `<audio>` sections
- rate/timebase is valid (`> 0`)

After writing XML:
- import test in target NLE
- verify:
  - timing alignment
  - expected track count
  - no muted/empty audio clips
  - correct sequence dimensions

## Minimal Pseudocode

```text
load project
resolve mode (plan or rendered)
collect timeline items (start/end/in/out/path/type/track hints)
resolve rate (timebase, ntsc)
create xmeml/sequence/media skeleton
for each video item: place on track, build clipitem + file
for each audio item: place on track, build clipitem + file + filters
set video format (width/height/pixel aspect)
set sequence duration to max end frame
pretty-print and write XML
return output path
```

## Reference Implementation Files

- `python/actions/export_fcp7.py`
- `python/actions/export_fcp7_rendered.py`
- `python/service.py` command routing:
  - `export_fcp7_xml`
  - `export_fcp7_rendered`
  - `export_fcp7_rendered_2x`

