from __future__ import annotations

import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import imageio_ffmpeg

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def _sanitize_file_name(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", (value or "").strip())
    return cleaned.strip(" ._")


def _coerce_positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        return fallback
    return parsed if parsed > 0 else fallback


def _coerce_duration_seconds(value: Any) -> float:
    try:
        parsed = float(value)
    except Exception:
        return 2.0
    if parsed <= 0:
        return 2.0
    return max(0.1, parsed)


def _resolve_project_root(payload: Dict[str, Any]) -> Path:
    raw = str(payload.get("projectRoot") or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    output_raw = str(payload.get("outputPath") or "").strip()
    if output_raw:
        output_path = Path(output_raw).expanduser()
        if output_path.is_absolute():
            return output_path.resolve().parent.parent
    raise ValueError("Missing 'projectRoot' for MP4 export.")


def _resolve_output_path(payload: Dict[str, Any], project_root: Path) -> Path:
    output_raw = str(payload.get("outputPath") or "").strip()
    if output_raw:
        output_path = Path(output_raw).expanduser()
        if not output_path.is_absolute():
            output_path = (project_root / output_path).resolve()
    else:
        project_name = _sanitize_file_name(str(payload.get("projectName") or "project").replace(" ", "_")) or "project"
        exports_root = (project_root / "exports").resolve()
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = exports_root / f"{project_name}_preview_{stamp}.mp4"
    if output_path.suffix.lower() != ".mp4":
        output_path = output_path.with_suffix(".mp4")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return output_path


def _resolve_items(raw_items: Any, project_root: Path) -> List[Dict[str, Any]]:
    if not isinstance(raw_items, list):
        raise ValueError("Missing or invalid 'items' for MP4 export.")

    resolved: List[Dict[str, Any]] = []
    for idx, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            continue
        raw_path = str(raw.get("path") or "").strip()
        if not raw_path:
            continue
        source = Path(raw_path).expanduser()
        if not source.is_absolute():
            source = (project_root / source).resolve()
        else:
            source = source.resolve()
        if not source.exists() or not source.is_file():
            continue
        if source.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        resolved.append(
            {
                "shotNumber": _coerce_positive_int(raw.get("shotNumber"), idx + 1),
                "path": source,
                "durationSeconds": _coerce_duration_seconds(raw.get("durationSeconds")),
            }
        )
    return resolved


def _build_filter_graph(item_count: int, width: int, height: int) -> str:
    graph_parts: List[str] = []
    concat_inputs: List[str] = []
    for idx in range(item_count):
        graph_parts.append(
            f"[{idx}:v]"
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
            "setsar=1,format=yuv420p"
            f"[v{idx}]"
        )
        concat_inputs.append(f"[v{idx}]")
    graph_parts.append(f"{''.join(concat_inputs)}concat=n={item_count}:v=1:a=0,format=yuv420p[vout]")
    return ";".join(graph_parts)


def export_mp4_shots(payload: Dict[str, Any]) -> Dict[str, Any]:
    project_root = _resolve_project_root(payload)
    output_path = _resolve_output_path(payload, project_root)
    items = _resolve_items(payload.get("items"), project_root)
    if not items:
        raise ValueError("No valid concept/still images found for MP4 export.")

    fps = _coerce_positive_int(payload.get("fps"), 24)
    width = _coerce_positive_int(payload.get("width"), 1920)
    height = _coerce_positive_int(payload.get("height"), 1080)
    if width % 2 != 0:
        width -= 1
    if height % 2 != 0:
        height -= 1
    width = max(2, width)
    height = max(2, height)

    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    command: List[str] = [
        ffmpeg_path,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
    ]
    for item in items:
        command.extend(
            [
                "-loop",
                "1",
                "-t",
                f"{item['durationSeconds']:.3f}",
                "-i",
                str(item["path"]),
            ]
        )

    filter_graph = _build_filter_graph(len(items), width, height)
    command.extend(
        [
            "-filter_complex",
            filter_graph,
            "-map",
            "[vout]",
            "-r",
            str(fps),
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            str(output_path),
        ]
    )

    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise ValueError(f"Failed to export MP4: {stderr or 'ffmpeg returned a non-zero exit code.'}")

    total_duration_seconds = sum(float(item["durationSeconds"]) for item in items)
    return {
        "outputPath": str(output_path),
        "count": len(items),
        "durationSeconds": total_duration_seconds,
        "fps": fps,
    }
