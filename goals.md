# StoryBuilder Goals

## Product Direction
StoryBuilder is not an image generator.  
StoryBuilder is the pre-production operating layer between script/story intent and AI generation workflows (ComfyUI + model pipelines).

Core role:
- organize story -> scenes -> shots
- centralize references, prompts, and versions
- launch generation workflows with correct context
- ingest outputs back into the right scene/shot slots

## Primary Outcome
Enable very fast setup of production-ready visual stories:
- from rough story idea
- to structured shot plan
- to generated visual assets
- to exportable boards and delivery packages

## Positioning
AI-first storyboard and shot orchestration tool for:
- solo directors
- small studios
- previs / concept teams

Focus:
- speed
- consistency
- repeatable workflow

## Workflow Vision
StoryBuilder = orchestration  
Comfy workflows = execution

Target loop:
1. User selects scene/shot(s) in StoryBuilder.
2. User chooses a workflow preset.
3. StoryBuilder injects runtime inputs:
   - scene text
   - shot count / shot metadata
   - character/environment refs
   - output paths
4. Comfy runs.
5. Outputs are auto-ingested to the correct shot mode/version.

## Near-Term Build Goals
1. Workflow Runner Layer
- register/select Comfy workflow presets
- map StoryBuilder fields to workflow inputs
- trigger runs from scene/shot context

2. Prompt + Context Packaging
- deterministic payload builder per run
- reusable style blocks (look, grading, lens language)
- per-project and per-scene overrides

3. Output Ingest Pipeline
- watch/resolve generated files
- attach to concept/still/clip slots automatically
- mark versions and favorites safely

4. Shot Variant Management
- fast compare (A/B/C)
- promote-to-favorite
- keep source metadata (workflow, seed, model, prompt)

5. Delivery Exports
- one-click board exports (concept/still)
- client/director export presets
- reveal + handoff ready outputs

## Quality Requirements
- stable editing flow (no regressions in core UX)
- explicit persistence (predictable save behavior)
- low-friction operations (few clicks to run/export)
- transparent status/errors for workflow runs

## Non-Goals (for now)
- becoming a full NLE/editor
- replacing ComfyUI node authoring
- broad generic “creative suite” scope
