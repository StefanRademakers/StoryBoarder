from __future__ import annotations

import html
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List

from PIL import Image, ImageOps

VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}
ALLOWED_MODES = {"concept", "still", "clip", "performance", "reference"}
SUPPORTED_SCHEMA_VERSION = 1
MODE_LABELS = {
    "concept": "Concept",
    "still": "Still",
    "clip": "Clip",
    "performance": "Performance",
    "reference": "Reference",
}
DETAIL_LABELS = [
    ("durationSeconds", "Duration"),
    ("angle", "Angle"),
    ("shotSize", "Shot Size"),
    ("characterFraming", "Character Framing"),
    ("movement", "Movement"),
    ("action", "Action"),
    ("notes", "Notes"),
]


def _safe_utf8_text(value: Any) -> str:
    """
    Normalize text so it can always be encoded as UTF-8.
    Replaces isolated surrogate code points and other invalid data.
    """
    text = str(value or "")
    return text.encode("utf-8", "replace").decode("utf-8")


def _sanitize_file_name(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", _safe_utf8_text(value).strip())
    return cleaned.strip(" ._")


def _resolve_mode_list(raw_modes: Any) -> List[str]:
    if not isinstance(raw_modes, list):
        return []
    selected: List[str] = []
    for item in raw_modes:
        mode = str(item or "").strip().lower()
        if mode in ALLOWED_MODES and mode not in selected:
            selected.append(mode)
    return selected


def _coerce_positive_int(value: Any, default: int) -> int:
    try:
        number = int(value)
    except Exception:
        return default
    return number if number > 0 else default


def _resolve_project_root(payload: Dict[str, Any]) -> Path:
    raw = str(payload.get("projectRoot") or "").strip()
    if not raw:
        raise ValueError("Missing 'projectRoot'.")
    return Path(raw).expanduser().resolve()


def _resolve_input_path(raw_path: str, project_root: Path) -> Path:
    candidate = Path(raw_path).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    return (project_root / candidate).resolve()


def _normalize_media_by_mode(raw_media: Any, selected_modes: List[str]) -> Dict[str, str]:
    if not isinstance(raw_media, dict):
        return {}
    normalized: Dict[str, str] = {}
    for mode in selected_modes:
        value = str(raw_media.get(mode) or "").strip()
        if value:
            normalized[mode] = value
    return normalized


def _normalize_media_candidates(raw_media_candidates: Any, selected_modes: List[str]) -> Dict[str, List[str]]:
    if not isinstance(raw_media_candidates, dict):
        return {}
    normalized: Dict[str, List[str]] = {}
    for mode in selected_modes:
        raw_values = raw_media_candidates.get(mode)
        if not isinstance(raw_values, list):
            continue
        values: List[str] = []
        seen = set()
        for raw in raw_values:
            value = str(raw or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            values.append(value)
        if values:
            normalized[mode] = values
    return normalized


def _resolve_scene_inputs(payload: Dict[str, Any], selected_modes: List[str]) -> List[Dict[str, Any]]:
    scene_inputs: List[Dict[str, Any]] = []
    raw_scenes = payload.get("scenes")
    if isinstance(raw_scenes, list):
        for raw_scene in raw_scenes:
            if not isinstance(raw_scene, dict):
                continue
            scene_id = _safe_utf8_text(raw_scene.get("sceneId") or raw_scene.get("id") or "scene").strip() or "scene"
            scene_name = _safe_utf8_text(raw_scene.get("sceneName") or raw_scene.get("name") or "Scene").strip() or "Scene"
            raw_shots = raw_scene.get("shots")
            if not isinstance(raw_shots, list):
                continue
            shots: List[Dict[str, Any]] = []
            for idx, raw_shot in enumerate(raw_shots):
                if not isinstance(raw_shot, dict):
                    continue
                shot_number = _coerce_positive_int(raw_shot.get("shotNumber"), idx + 1)
                description = _safe_utf8_text(raw_shot.get("description") or "")
                details = raw_shot.get("details") if isinstance(raw_shot.get("details"), dict) else {}
                media_by_mode = _normalize_media_by_mode(raw_shot.get("mediaByMode"), selected_modes)
                media_candidates_by_mode = _normalize_media_candidates(raw_shot.get("mediaCandidatesByMode"), selected_modes)
                shots.append(
                    {
                        "shotNumber": shot_number,
                        "description": description,
                        "details": details,
                        "mediaByMode": media_by_mode,
                        "mediaCandidatesByMode": media_candidates_by_mode,
                    }
                )
            if shots:
                scene_inputs.append({"sceneId": scene_id, "sceneName": scene_name, "shots": shots})

    if scene_inputs:
        return scene_inputs

    # Backward compatibility for single-scene payload shape.
    scene_id = _safe_utf8_text(payload.get("sceneId") or "scene").strip() or "scene"
    scene_name = _safe_utf8_text(payload.get("sceneName") or "Scene").strip() or "Scene"
    raw_shots = payload.get("shots")
    if not isinstance(raw_shots, list):
        raise ValueError("Missing or invalid 'scenes' / 'shots' payload.")

    shots: List[Dict[str, Any]] = []
    for idx, raw_shot in enumerate(raw_shots):
        if not isinstance(raw_shot, dict):
            continue
        shot_number = _coerce_positive_int(raw_shot.get("shotNumber"), idx + 1)
        description = _safe_utf8_text(raw_shot.get("description") or "")
        details = raw_shot.get("details") if isinstance(raw_shot.get("details"), dict) else {}
        media_by_mode = _normalize_media_by_mode(raw_shot.get("mediaByMode"), selected_modes)
        media_candidates_by_mode = _normalize_media_candidates(raw_shot.get("mediaCandidatesByMode"), selected_modes)
        shots.append(
            {
                "shotNumber": shot_number,
                "description": description,
                "details": details,
                "mediaByMode": media_by_mode,
                "mediaCandidatesByMode": media_candidates_by_mode,
            }
        )

    if not shots:
        raise ValueError("No valid shots found in payload.")
    return [{"sceneId": scene_id, "sceneName": scene_name, "shots": shots}]


def _iter_mode_paths(shot_payload: Dict[str, Any], mode: str) -> Iterable[str]:
    # mediaCandidatesByMode is future-facing for version-aware exports.
    media_candidates_by_mode = shot_payload.get("mediaCandidatesByMode")
    if isinstance(media_candidates_by_mode, dict):
        raw_candidates = media_candidates_by_mode.get(mode)
        if isinstance(raw_candidates, list):
            for raw in raw_candidates:
                value = str(raw or "").strip()
                if value:
                    yield value

    media_by_mode = shot_payload.get("mediaByMode")
    if isinstance(media_by_mode, dict):
        fallback = str(media_by_mode.get(mode) or "").strip()
        if fallback:
            yield fallback


def _collect_existing_sources(shot_payload: Dict[str, Any], mode: str, project_root: Path) -> List[Path]:
    out: List[Path] = []
    seen_raw = set()
    seen_resolved = set()
    for raw_path in _iter_mode_paths(shot_payload, mode):
        if raw_path in seen_raw:
            continue
        seen_raw.add(raw_path)
        try:
            source = _resolve_input_path(raw_path, project_root)
        except Exception:
            continue
        if not source.exists() or not source.is_file():
            continue
        resolved_key = str(source)
        if resolved_key in seen_resolved:
            continue
        seen_resolved.add(resolved_key)
        out.append(source)
    return out


def _convert_image(source: Path, target: Path, image_format: str) -> None:
    with Image.open(source) as image:
        normalized = ImageOps.exif_transpose(image)
        if image_format == "png":
            normalized.save(target, format="PNG")
            return
        rgb = normalized.convert("RGB")
        rgb.save(target, format="JPEG", quality=80, optimize=True)


def _unique_export_dir(exports_root: Path, prefix: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = exports_root / f"{prefix}_{stamp}"
    if not base.exists():
        return base
    seq = 2
    while True:
        candidate = exports_root / f"{prefix}_{stamp}_{seq}"
        if not candidate.exists():
            return candidate
        seq += 1


def _unique_target_path(directory: Path, file_name: str) -> Path:
    safe_name = _sanitize_file_name(file_name) or "asset"
    base = directory / safe_name
    if not base.exists():
        return base
    stem = base.stem
    suffix = base.suffix
    seq = 2
    while True:
        candidate = directory / f"{stem}_{seq}{suffix}"
        if not candidate.exists():
            return candidate
        seq += 1


def _format_detail_value(key: str, value: Any) -> str:
    if value is None:
        return ""
    if key == "durationSeconds":
        try:
            number = float(value)
        except Exception:
            return ""
        if number <= 0:
            return ""
        return f"{number:.2f}s"
    text = _safe_utf8_text(value).strip()
    return text


def _build_details_markup(details: Dict[str, Any], description: str) -> str:
    detail_rows: List[str] = []
    for key, label in DETAIL_LABELS:
        formatted = _format_detail_value(key, details.get(key))
        if not formatted:
            continue
        detail_rows.append(
            f"""
            <div class="shot-detail-row">
              <span class="shot-detail-label">{html.escape(label)}</span>
              <span class="shot-detail-value">{html.escape(formatted)}</span>
            </div>"""
        )

    rows = "".join(detail_rows)
    return f"""
          <div class="shot-block">
            <h3 class="shot-block-title">Description</h3>
            <p class="shot-description">{html.escape(_safe_utf8_text(description)) if description else " "}</p>
          </div>
          <div class="shot-block">
            <h3 class="shot-block-title">Details</h3>
            <div class="shot-details">{rows if rows else '<p class="shot-empty">No additional metadata.</p>'}</div>
          </div>"""


def _build_html(scene_name: str, cards: List[Dict[str, Any]], image_format: str, selected_modes: List[str]) -> str:
    available_by_mode = {mode: False for mode in selected_modes}
    for card in cards:
        for media in card.get("media", []):
            mode = str(media.get("mode") or "")
            versions = media.get("versions")
            has_real_media = False
            if isinstance(versions, list):
                for version in versions:
                    if not isinstance(version, dict):
                        continue
                    version_kind = str(version.get("kind") or "")
                    if version_kind in ("image", "video"):
                        has_real_media = True
                        break
            if mode in available_by_mode and has_real_media:
                available_by_mode[mode] = True

    first_mode = ""
    for preferred in ("clip", "still", "concept", "performance", "reference"):
        if preferred in selected_modes and available_by_mode.get(preferred):
            first_mode = preferred
            break
    if not first_mode:
        for mode in selected_modes:
            if available_by_mode.get(mode):
                first_mode = mode
                break
    if not first_mode:
        first_mode = selected_modes[0] if selected_modes else "still"
    mode_buttons_markup = "".join(
        [
            (
                f'<button type="button" class="mode-button{" mode-button--active" if mode == first_mode else ""}" '
                f'data-mode-button="{html.escape(mode)}">{html.escape(MODE_LABELS.get(mode, mode.title()))}</button>'
            )
            for mode in selected_modes
        ]
    )

    shot_rows_markup: List[str] = []
    browse_count = 0
    scene_names: List[str] = []
    current_scene_marker = ""
    for card in cards:
        card_scene_name = _safe_utf8_text(card.get("sceneName") or "").strip()
        if card_scene_name and card_scene_name not in scene_names:
            scene_names.append(card_scene_name)
        if card_scene_name and card_scene_name != current_scene_marker:
            current_scene_marker = card_scene_name
            shot_rows_markup.append(
                f"""
        <div class="scene-divider">
          <h2 class="scene-divider__title">{html.escape(card_scene_name)}</h2>
        </div>"""
            )
        shot_number = int(card.get("shotNumber") or 0)
        shot_label = f"SHOT {shot_number:03d}" if shot_number > 0 else "SHOT"
        description = _safe_utf8_text(card.get("description") or "")
        details = card.get("details") if isinstance(card.get("details"), dict) else {}

        media_markup: List[str] = []
        for media in card.get("media", []):
            mode = str(media.get("mode") or "")
            mode_label = MODE_LABELS.get(mode, mode.title())
            is_active = mode == first_mode
            visibility_class = " shot-media-shell--active" if is_active else ""

            versions = media.get("versions")
            version_rows: List[str] = []
            if isinstance(versions, list):
                for version_idx, version in enumerate(versions):
                    if not isinstance(version, dict):
                        continue
                    kind = str(version.get("kind") or "")
                    asset_rel = str(version.get("assetRel") or "")
                    if kind not in ("image", "video") or not asset_rel:
                        continue
                    browse_count += 1
                    title = f"{shot_label} - {mode_label} v{version_idx + 1}"
                    if kind == "video":
                        media_item = (
                            f'<video class="shot-media js-browse-item" src="{html.escape(asset_rel, quote=True)}" '
                            f'controls preload="metadata" data-mode="{html.escape(mode, quote=True)}" '
                            f'data-kind="video" data-title="{html.escape(title, quote=True)}"></video>'
                        )
                    else:
                        media_item = (
                            f'<img class="shot-media js-browse-item" src="{html.escape(asset_rel, quote=True)}" '
                            f'alt="{html.escape(title, quote=True)}" data-mode="{html.escape(mode, quote=True)}" '
                            f'data-kind="image" data-title="{html.escape(title, quote=True)}" />'
                        )
                    version_rows.append(
                        f"""
                  <div class="shot-version-media{' shot-version-media--active' if version_idx == 0 else ''}" data-shot-version-index="{version_idx}">
                    {media_item}
                  </div>"""
                    )

            if version_rows:
                buttons_markup = ""
                if len(version_rows) > 1:
                    buttons = []
                    for version_idx in range(len(version_rows)):
                        button_label = version_idx + 1
                        buttons.append(
                            f'<button type="button" class="shot-version-button{" shot-version-button--active" if version_idx == 0 else ""}" '
                            f'data-shot-version-button="{version_idx}">{button_label}</button>'
                        )
                    buttons_markup = f'<div class="shot-version-controls">{"".join(buttons)}</div>'
                media_body = f"""
                {buttons_markup}
                <div class="shot-version-viewport">
                  {''.join(version_rows)}
                </div>"""
                shell_kind = "media"
            else:
                media_body = (
                    f'<div class="shot-media shot-media--missing" data-mode="{html.escape(mode, quote=True)}">'
                    f'No {html.escape(mode_label)}</div>'
                )
                shell_kind = "missing"

            media_markup.append(
                f"""
              <div class="shot-media-shell{visibility_class}" data-shot-media-mode="{html.escape(mode, quote=True)}" data-shot-media-kind="{html.escape(shell_kind, quote=True)}">
                {media_body}
              </div>"""
            )

        shot_rows_markup.append(
            f"""
        <article class="shot-row" tabindex="0">
          <div class="shot-left">
            <div class="shot-title">{html.escape(shot_label)}</div>
            <div class="shot-media-stack">
              {''.join(media_markup)}
            </div>
          </div>
          <div class="shot-right">
            {_build_details_markup(details, description)}
          </div>
        </article>"""
        )

    scene_title = html.escape(_safe_utf8_text(scene_name))
    format_label = "JPG 80%" if image_format == "jpg80" else "PNG"
    shots_markup = "".join(shot_rows_markup)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{scene_title} - Html Export</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #0f1114;
      --panel: #1a1c1f;
      --panel-border: rgba(255, 255, 255, 0.12);
      --text: #e6e7e8;
      --muted: #aeb2b7;
      --accent: #1d4593;
    }}
    * {{
      box-sizing: border-box;
    }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", Tahoma, sans-serif;
      padding: 0;
      --shot-media-height: 80vh;
    }}
    body.view-large {{
      --shot-media-height: 80vh;
    }}
    body.view-medium {{
      --shot-media-height: 60vh;
    }}
    body.view-small {{
      --shot-media-height: 30vh;
    }}
    body.view-medium .shot-row,
    body.view-small .shot-row {{
      grid-template-columns: auto minmax(280px, 420px);
      align-items: center;
      justify-content: center;
      width: fit-content;
      max-width: calc(100vw - 32px);
      margin-inline: auto;
    }}
    body.view-medium .shot-left,
    body.view-small .shot-left {{
      align-items: flex-start;
    }}
    body.view-medium .shot-media-stack,
    body.view-small .shot-media-stack {{
      width: fit-content;
      max-width: min(72vw, 1400px);
    }}
    body.view-medium .shot-media,
    body.view-small .shot-media {{
      width: auto;
      max-width: min(72vw, 1400px);
      background: transparent;
    }}
    body.view-medium .shot-right,
    body.view-small .shot-right {{
      width: clamp(280px, 24vw, 420px);
      align-self: center;
    }}
    .page-header {{
      padding: 16px 16px 8px;
      margin: 0;
    }}
    .page-title {{
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }}
    .page-meta {{
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 13px;
    }}
    .mode-bar {{
      position: sticky;
      top: 0;
      z-index: 220;
      min-height: 68px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      background: #000000;
      border-bottom: 1px solid rgba(255, 255, 255, 0.14);
    }}
    .mode-bar__inner {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }}
    .mode-cluster {{
      display: inline-flex;
      gap: 0;
      border: 1px solid rgba(226, 231, 232, 0.24);
      border-radius: 999px;
      background: rgba(18, 19, 20, 0.92);
      overflow: hidden;
    }}
    .mode-button {{
      border: none;
      border-radius: 0;
      background: transparent;
      color: rgba(226, 231, 232, 0.86);
      font-size: 14px;
      line-height: 1;
      padding: 10px 16px;
      cursor: pointer;
      border-right: 1px solid rgba(226, 231, 232, 0.2);
    }}
    .mode-button:last-child {{
      border-right: none;
    }}
    .mode-button:hover {{
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
    }}
    .mode-button--active {{
      background: var(--accent);
      color: #ffffff;
    }}
    .view-button--active {{
      background: var(--accent);
      color: #ffffff;
    }}
    .shots-list {{
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 8px;
      padding: 0 16px 80px;
    }}
    .scene-divider {{
      padding: 8px 2px 2px;
    }}
    .scene-divider__title {{
      margin: 0;
      color: #ffffff;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }}
    .shot-row {{
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      background: var(--panel);
      display: grid;
      grid-template-columns: minmax(0, 4fr) minmax(0, 1fr);
      gap: 14px;
      padding: 12px;
    }}
    .shot-row--active {{
      border-color: rgba(98, 153, 255, 0.55);
      box-shadow: inset 0 0 0 1px rgba(98, 153, 255, 0.2);
    }}
    .shot-left {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .shot-title {{
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #ffffff;
      font-weight: 600;
    }}
    .shot-media-stack {{
      position: relative;
      min-height: 0;
    }}
    .shot-media-shell {{
      display: none;
    }}
    .shot-media-shell--active {{
      display: block;
    }}
    .shot-media {{
      width: 100%;
      height: min(var(--shot-media-height), calc(100vh - 140px));
      min-height: 180px;
      max-height: 90vh;
      aspect-ratio: auto;
      border-radius: 10px;
      background: #0a0c0e;
      border: 1px solid rgba(255, 255, 255, 0.08);
      object-fit: contain;
      display: block;
    }}
    .shot-version-controls {{
      display: inline-flex;
      gap: 6px;
      padding: 0 0 8px;
      flex-wrap: wrap;
    }}
    .shot-version-button {{
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(18, 19, 20, 0.9);
      color: rgba(226, 231, 232, 0.9);
      border-radius: 999px;
      font-size: 12px;
      line-height: 1;
      padding: 4px 8px;
      cursor: pointer;
      min-width: 28px;
    }}
    .shot-version-button:hover {{
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }}
    .shot-version-button--active {{
      background: var(--accent);
      color: #ffffff;
      border-color: rgba(98, 153, 255, 0.8);
    }}
    .shot-version-media {{
      display: none;
    }}
    .shot-version-media--active {{
      display: block;
    }}
    .js-browse-item {{
      cursor: zoom-in;
    }}
    .shot-media--missing {{
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 13px;
      border: 1px dashed rgba(255, 255, 255, 0.18);
    }}
    .shot-right {{
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}
    .shot-block {{
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.02);
      padding: 10px;
    }}
    .shot-block-title {{
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }}
    .shot-description {{
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      color: #d7d9dc;
      white-space: pre-wrap;
      min-height: 1.5em;
    }}
    .shot-details {{
      display: grid;
      gap: 6px;
    }}
    .shot-detail-row {{
      display: grid;
      grid-template-columns: minmax(110px, 180px) minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      font-size: 13px;
    }}
    .shot-detail-label {{
      color: var(--muted);
    }}
    .shot-detail-value {{
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
    }}
    .shot-empty {{
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }}
    .viewer {{
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.82);
      display: grid;
      place-items: center;
      z-index: 300;
      padding: 28px;
    }}
    .viewer[hidden] {{
      display: none;
    }}
    .viewer-panel {{
      width: min(1320px, 100%);
      height: min(92vh, 900px);
      background: #0d0f11;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }}
    .viewer-head {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--muted);
      font-size: 13px;
    }}
    .viewer-actions {{
      display: inline-flex;
      gap: 8px;
    }}
    .viewer-btn {{
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: rgba(18, 19, 20, 0.9);
      color: var(--text);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
    }}
    .viewer-btn:hover {{
      background: #242628;
    }}
    .viewer-body {{
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 16px;
    }}
    .viewer-media {{
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }}
    @media (max-width: 980px) {{
      .shot-row {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>
  <header class="page-header">
    <h1 class="page-title">{scene_title} - Html Export</h1>
    <p class="page-meta">{len(scene_names) if scene_names else 1} scene(s) | {len(cards)} shots | {format_label} assets | {browse_count} browse items</p>
  </header>
  <div class="mode-bar">
    <div class="mode-bar__inner">
      <div class="mode-cluster">
        {mode_buttons_markup}
      </div>
      <div class="mode-cluster view-cluster">
        <button type="button" class="mode-button view-button" data-view-size="small">Small</button>
        <button type="button" class="mode-button view-button" data-view-size="medium">Medium</button>
        <button type="button" class="mode-button view-button view-button--active" data-view-size="large">Large</button>
      </div>
    </div>
  </div>
  <main class="shots-list">
    {shots_markup}
  </main>
  <div id="viewer" class="viewer" hidden>
    <div class="viewer-panel">
      <div class="viewer-head">
        <strong id="viewerTitle">Preview</strong>
        <div class="viewer-actions">
          <button id="viewerPrev" class="viewer-btn" type="button">Prev</button>
          <button id="viewerNext" class="viewer-btn" type="button">Next</button>
          <button id="viewerClose" class="viewer-btn" type="button">Close</button>
        </div>
      </div>
      <div class="viewer-body">
        <img id="viewerImage" class="viewer-media" alt="" />
        <video id="viewerVideo" class="viewer-media" controls preload="metadata"></video>
      </div>
    </div>
  </div>
  <script>
    (() => {{
      const modeButtons = Array.from(document.querySelectorAll("[data-mode-button]"));
      const viewButtons = Array.from(document.querySelectorAll("[data-view-size]"));
      const shotRows = Array.from(document.querySelectorAll(".shot-row"));
      const pageBody = document.body;
      const viewer = document.getElementById("viewer");
      const viewerTitle = document.getElementById("viewerTitle");
      const viewerImage = document.getElementById("viewerImage");
      const viewerVideo = document.getElementById("viewerVideo");
      const viewerClose = document.getElementById("viewerClose");
      const viewerPrev = document.getElementById("viewerPrev");
      const viewerNext = document.getElementById("viewerNext");

      let activeMode = "still";
      if (modeButtons.length) {{
        const activeButton = modeButtons.find((button) => button.classList.contains("mode-button--active"));
        if (activeButton && activeButton.dataset.modeButton) {{
          activeMode = activeButton.dataset.modeButton;
        }} else if (modeButtons[0].dataset.modeButton) {{
          activeMode = modeButtons[0].dataset.modeButton;
        }}
      }}
      let browseItems = [];
      let currentBrowseIndex = -1;
      let currentShotIndex = 0;
      let currentViewSize = "large";

      const closeViewer = () => {{
        viewer.hidden = true;
        viewerVideo.pause();
        viewerVideo.removeAttribute("src");
      }};

      const refreshBrowseItems = () => {{
        browseItems = Array.from(document.querySelectorAll(".shot-media-shell--active .shot-version-media--active .js-browse-item"));
      }};

      const getModeShell = (row, mode) => row.querySelector(`[data-shot-media-mode="${{mode}}"]`);
      const hasRealMedia = (shell) => {{
        if (!shell) return false;
        const kind = shell.dataset.shotMediaKind || "missing";
        return kind !== "missing";
      }};
      const setShellVersion = (shell, requestedIndex, closeOpenViewer = true) => {{
        const versionItems = Array.from(shell.querySelectorAll("[data-shot-version-index]"));
        if (!versionItems.length) return;
        const maxIndex = versionItems.length - 1;
        const normalized = Math.max(0, Math.min(maxIndex, requestedIndex));
        versionItems.forEach((item, idx) => {{
          item.classList.toggle("shot-version-media--active", idx === normalized);
        }});
        const versionButtons = Array.from(shell.querySelectorAll("[data-shot-version-button]"));
        versionButtons.forEach((button, idx) => {{
          button.classList.toggle("shot-version-button--active", idx === normalized);
        }});
        refreshBrowseItems();
        if (closeOpenViewer && !viewer.hidden) {{
          closeViewer();
        }}
      }};
      const pickVisibleShellForMode = (row, mode) => {{
        const primary = getModeShell(row, mode);
        if (hasRealMedia(primary)) return primary;

        if (mode === "clip" || mode === "performance") {{
          const still = getModeShell(row, "still");
          if (hasRealMedia(still)) return still;
          const concept = getModeShell(row, "concept");
          if (hasRealMedia(concept)) return concept;
        }}

        if (primary) return primary;
        const allShells = Array.from(row.querySelectorAll("[data-shot-media-mode]"));
        const firstReal = allShells.find((shell) => hasRealMedia(shell));
        return firstReal || allShells[0] || null;
      }};

      const showBrowseIndex = (index) => {{
        if (!browseItems.length) return;
        currentBrowseIndex = (index + browseItems.length) % browseItems.length;
        const item = browseItems[currentBrowseIndex];
        const kind = item.dataset.kind || "image";
        const src = item.getAttribute("src") || "";
        const title = item.dataset.title || `Item ${{currentBrowseIndex + 1}}`;
        viewerTitle.textContent = title;

        if (kind === "video") {{
          viewerImage.style.display = "none";
          viewerImage.removeAttribute("src");
          viewerVideo.style.display = "block";
          viewerVideo.src = src;
        }} else {{
          viewerVideo.pause();
          viewerVideo.style.display = "none";
          viewerVideo.removeAttribute("src");
          viewerImage.style.display = "block";
          viewerImage.src = src;
        }}
        viewer.hidden = false;
      }};

      const setActiveShot = (index, scrollIntoView = true) => {{
        if (!shotRows.length) return;
        currentShotIndex = (index + shotRows.length) % shotRows.length;
        shotRows.forEach((row, rowIndex) => {{
          const active = rowIndex === currentShotIndex;
          row.classList.toggle("shot-row--active", active);
        }});
        const row = shotRows[currentShotIndex];
        if (scrollIntoView) {{
          row.scrollIntoView({{ block: "center", behavior: "smooth" }});
        }}
      }};

      const setMode = (mode) => {{
        activeMode = mode;
        modeButtons.forEach((button) => {{
          const isActive = button.dataset.modeButton === mode;
          button.classList.toggle("mode-button--active", isActive);
        }});
        shotRows.forEach((row) => {{
          const rowShells = Array.from(row.querySelectorAll("[data-shot-media-mode]"));
          rowShells.forEach((shell) => shell.classList.remove("shot-media-shell--active"));
          const chosen = pickVisibleShellForMode(row, mode);
          if (chosen) {{
            chosen.classList.add("shot-media-shell--active");
            if (!chosen.querySelector(".shot-version-media--active")) {{
              setShellVersion(chosen, 0, false);
            }}
          }}
        }});
        refreshBrowseItems();
        closeViewer();
      }};

      const setViewSize = (size) => {{
        const normalized = size === "small" || size === "medium" || size === "large" ? size : "large";
        currentViewSize = normalized;
        pageBody.classList.remove("view-small", "view-medium", "view-large");
        pageBody.classList.add(`view-${{normalized}}`);
        viewButtons.forEach((button) => {{
          const isActive = button.dataset.viewSize === normalized;
          button.classList.toggle("view-button--active", isActive);
        }});
      }};

      modeButtons.forEach((button) => {{
        button.addEventListener("click", () => {{
          const nextMode = button.dataset.modeButton;
          if (!nextMode || nextMode === activeMode) return;
          setMode(nextMode);
        }});
      }});
      viewButtons.forEach((button) => {{
        button.addEventListener("click", () => {{
          const nextSize = button.dataset.viewSize || "large";
          if (nextSize === currentViewSize) return;
          setViewSize(nextSize);
        }});
      }});

      document.addEventListener("click", (event) => {{
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const clickedRow = target.closest(".shot-row");
        if (clickedRow instanceof HTMLElement) {{
          const rowIdx = shotRows.indexOf(clickedRow);
          if (rowIdx >= 0) {{
            setActiveShot(rowIdx, false);
          }}
        }}
        const versionButton = target.closest("[data-shot-version-button]");
        if (versionButton instanceof HTMLElement) {{
          const shell = versionButton.closest(".shot-media-shell");
          if (!(shell instanceof HTMLElement)) return;
          const versionIndex = Number.parseInt(versionButton.dataset.shotVersionButton || "0", 10);
          setShellVersion(shell, Number.isFinite(versionIndex) ? versionIndex : 0);
          event.preventDefault();
          return;
        }}
        const media = target.closest(".js-browse-item");
        if (!(media instanceof HTMLElement)) return;
        refreshBrowseItems();
        const idx = browseItems.indexOf(media);
        if (idx < 0) return;
        event.preventDefault();
        showBrowseIndex(idx);
      }});

      viewerClose.addEventListener("click", closeViewer);
      viewerPrev.addEventListener("click", () => showBrowseIndex(currentBrowseIndex - 1));
      viewerNext.addEventListener("click", () => showBrowseIndex(currentBrowseIndex + 1));

      viewer.addEventListener("click", (event) => {{
        if (event.target === viewer) {{
          closeViewer();
        }}
      }});

      document.addEventListener("keydown", (event) => {{
        const key = event.key;
        const isPrev = key === "ArrowLeft" || key === "ArrowUp";
        const isNext = key === "ArrowRight" || key === "ArrowDown";
        if (viewer.hidden) {{
          if (isPrev) {{
            event.preventDefault();
            setActiveShot(currentShotIndex - 1, true);
            return;
          }}
          if (isNext) {{
            event.preventDefault();
            setActiveShot(currentShotIndex + 1, true);
          }}
          return;
        }}
        if (key === "Escape") {{
          event.preventDefault();
          closeViewer();
          return;
        }}
        if (isPrev) {{
          event.preventDefault();
          showBrowseIndex(currentBrowseIndex - 1);
          return;
        }}
        if (isNext) {{
          event.preventDefault();
          showBrowseIndex(currentBrowseIndex + 1);
        }}
      }});

      setMode(activeMode || "still");
      setViewSize(currentViewSize);
      setActiveShot(0, false);
    }})();
  </script>
</body>
</html>
"""


def export_html_shots(payload: Dict[str, Any]) -> Dict[str, Any]:
    project_root = _resolve_project_root(payload)
    schema_version = _coerce_positive_int(payload.get("schemaVersion"), SUPPORTED_SCHEMA_VERSION)
    if schema_version > SUPPORTED_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported 'schemaVersion': {schema_version}. "
            f"Max supported is {SUPPORTED_SCHEMA_VERSION}."
        )
    selected_modes = _resolve_mode_list(payload.get("selectedModes"))
    if not selected_modes:
        raise ValueError("Missing or invalid 'selectedModes'.")

    image_format = str(payload.get("imageFormat") or "jpg80").strip().lower()
    if image_format not in {"jpg80", "png"}:
        image_format = "jpg80"

    scene_inputs = _resolve_scene_inputs(payload, selected_modes)

    exports_root = project_root / "exports"
    output_dir = _unique_export_dir(exports_root, "html")
    assets_dir = output_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    cards: List[Dict[str, Any]] = []
    media_count = 0

    for scene_input in scene_inputs:
        scene_id = _safe_utf8_text(scene_input.get("sceneId") or "scene")
        scene_name = _safe_utf8_text(scene_input.get("sceneName") or "Scene")
        raw_shots = scene_input.get("shots")
        if not isinstance(raw_shots, list):
            continue

        for raw_shot in raw_shots:
            if not isinstance(raw_shot, dict):
                continue
            shot_number = _coerce_positive_int(raw_shot.get("shotNumber"), 1)

            description = _safe_utf8_text(raw_shot.get("description") or "")
            details = raw_shot.get("details")
            if not isinstance(details, dict):
                details = {}

            card_media: List[Dict[str, Any]] = []
            for mode in selected_modes:
                sources = _collect_existing_sources(raw_shot, mode, project_root)
                if not sources:
                    card_media.append({"mode": mode, "kind": "missing"})
                    continue

                safe_scene_id = _sanitize_file_name(scene_id) or "scene"
                safe_scene_name = _sanitize_file_name(scene_name) or "scene"
                versions: List[Dict[str, Any]] = []

                for version_index, source in enumerate(sources):
                    version_tag = f"_v{version_index + 1:02d}"
                    if source.suffix.lower() in VIDEO_EXTENSIONS:
                        target_name = (
                            f"{safe_scene_id}_{safe_scene_name}_shot_{shot_number:03d}_{mode}"
                            f"{version_tag}{source.suffix.lower()}"
                        )
                        target = _unique_target_path(assets_dir, target_name)
                        shutil.copy2(source, target)
                        media_count += 1
                        versions.append({"kind": "video", "assetRel": f"assets/{target.name}"})
                        continue

                    target_ext = ".png" if image_format == "png" else ".jpg"
                    target_name = f"{safe_scene_id}_{safe_scene_name}_shot_{shot_number:03d}_{mode}{version_tag}{target_ext}"
                    target = _unique_target_path(assets_dir, target_name)
                    try:
                        _convert_image(source, target, image_format)
                    except Exception:
                        continue
                    media_count += 1
                    versions.append({"kind": "image", "assetRel": f"assets/{target.name}"})

                if versions:
                    card_media.append({"mode": mode, "kind": "media", "versions": versions})
                else:
                    card_media.append({"mode": mode, "kind": "missing"})

            cards.append(
                {
                    "sceneName": scene_name,
                    "shotNumber": shot_number,
                    "description": description,
                    "details": details,
                    "media": card_media,
                }
            )

    if not cards:
        raise ValueError("No valid shots found for HTML export.")

    page_scene_name = scene_inputs[0]["sceneName"] if len(scene_inputs) == 1 else "All Scenes"
    html_text = _safe_utf8_text(_build_html(str(page_scene_name), cards, image_format, selected_modes))
    index_path = output_dir / "index.html"
    index_path.write_text(html_text, encoding="utf-8")

    return {
        "outputDir": str(output_dir),
        "indexPath": str(index_path),
        "count": len(cards),
        "sceneCount": len(scene_inputs),
        "mediaCount": media_count,
        "schemaVersion": SUPPORTED_SCHEMA_VERSION,
    }
