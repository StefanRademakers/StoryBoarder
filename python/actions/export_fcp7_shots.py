from __future__ import annotations

import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional

VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}


def _sanitize_file_name(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", (value or "").strip())
    return cleaned.strip(" ._")


def _path_to_url(path: Path) -> str:
    uri = path.resolve().as_uri().replace("\\", "/")
    if uri.startswith("file://localhost/"):
        return uri
    if uri.startswith("file:///"):
        return "file://localhost/" + uri[len("file:///") :]
    return uri


def _resolve_rate(fps_value: Any) -> Dict[str, Any]:
    try:
        fps = float(fps_value)
    except Exception:
        fps = 24.0
    if fps <= 0:
        fps = 24.0
    timebase = max(1, int(round(fps)))
    return {"fps": fps, "timebase": timebase, "ntsc": "FALSE"}


def _frames_to_timecode(frames: int, timebase: int) -> str:
    if timebase <= 0:
        return "00:00:00:00"
    total = max(0, int(frames))
    hours = total // (timebase * 3600)
    minutes = (total // (timebase * 60)) % 60
    seconds = (total // timebase) % 60
    frame = total % timebase
    return f"{hours:02}:{minutes:02}:{seconds:02}:{frame:02}"


def _append_rate(parent: ET.Element, rate: Dict[str, Any]) -> None:
    rate_el = ET.SubElement(parent, "rate")
    ET.SubElement(rate_el, "timebase").text = str(int(rate["timebase"]))
    ET.SubElement(rate_el, "ntsc").text = str(rate["ntsc"])


def _append_sequence_timecode(parent: ET.Element, rate: Dict[str, Any]) -> None:
    timecode = ET.SubElement(parent, "timecode")
    start_frame = int(rate["timebase"]) * 60 * 60
    ET.SubElement(timecode, "string").text = _frames_to_timecode(start_frame, int(rate["timebase"]))
    ET.SubElement(timecode, "frame").text = str(start_frame)
    ET.SubElement(timecode, "displayformat").text = "NDF"
    _append_rate(timecode, rate)


def _probe_duration_seconds(path: Path) -> Optional[float]:
    if not path.exists():
        return None
    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        return None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    try:
        value = float(result.stdout.strip())
    except Exception:
        return None
    if value <= 0:
        return None
    return value


def _seconds_to_frames(seconds: float, fps: float) -> int:
    return max(1, int(round(max(0.01, seconds) * fps)))


def _duration_frames(item: Dict[str, Any], path: Path, rate: Dict[str, Any]) -> int:
    if str(item.get("mediaType") or "").lower() == "video":
        actual = _probe_duration_seconds(path)
        if actual is not None:
            return _seconds_to_frames(actual, float(rate["fps"]))
    try:
        duration_seconds = float(item.get("durationSeconds"))
    except Exception:
        duration_seconds = 2.0
    if duration_seconds <= 0:
        duration_seconds = 2.0
    return _seconds_to_frames(duration_seconds, float(rate["fps"]))


def _prettify(element: ET.Element, level: int = 0) -> None:
    indent = "  "
    children = list(element)
    if children:
        element.text = "\n" + indent * (level + 1)
        for child in children:
            _prettify(child, level + 1)
        children[-1].tail = "\n" + indent * level  # type: ignore[assignment]
    if level and not element.tail:
        element.tail = "\n" + indent * level
    elif not element.tail:
        element.tail = "\n"


def _resolve_item_path(scene_dir: Optional[Path], raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    if scene_dir:
        return (scene_dir / candidate).resolve()
    return candidate.resolve()


def export_fcp7_shots(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("Missing or invalid 'items'.")

    scene_name = str(payload.get("sceneName") or "Scene").strip() or "Scene"
    scene_dir_raw = payload.get("sceneDir")
    scene_dir = None
    if isinstance(scene_dir_raw, str) and scene_dir_raw.strip():
        scene_dir = Path(scene_dir_raw).expanduser().resolve()

    resolved_items: List[Dict[str, Any]] = []
    for idx, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            continue
        raw_path = str(raw.get("path") or "").strip()
        if not raw_path:
            continue
        path = _resolve_item_path(scene_dir, raw_path)
        if not path.exists():
            continue
        resolved_items.append(
            {
                "index": idx + 1,
                "path": path,
                "mediaType": str(raw.get("mediaType") or "image").lower(),
                "durationSeconds": raw.get("durationSeconds"),
                "shotNumber": raw.get("shotNumber"),
            }
        )

    if not resolved_items:
        raise ValueError("No valid media files found for FCP7 export.")

    rate = _resolve_rate(payload.get("fps"))

    output_raw = payload.get("outputPath")
    if isinstance(output_raw, str) and output_raw.strip():
        output_path = Path(output_raw).expanduser()
        if not output_path.is_absolute() and scene_dir:
            output_path = scene_dir / output_path
    else:
        base_dir = (scene_dir / "export") if scene_dir else Path.cwd()
        filename = f"{_sanitize_file_name(scene_name) or 'scene'}_shots_fcp7.xml"
        output_path = base_dir / filename
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    xmeml = ET.Element("xmeml", version="5")
    sequence = ET.SubElement(xmeml, "sequence", id="sequence-1")
    ET.SubElement(sequence, "name").text = f"{scene_name} Shots"
    duration_el = ET.SubElement(sequence, "duration")
    _append_rate(sequence, rate)
    ET.SubElement(sequence, "in").text = "-1"
    ET.SubElement(sequence, "out").text = "-1"
    _append_sequence_timecode(sequence, rate)

    media = ET.SubElement(sequence, "media")
    video = ET.SubElement(media, "video")
    audio = ET.SubElement(media, "audio")
    track = ET.SubElement(video, "track")

    timeline_cursor = 0
    for idx, item in enumerate(resolved_items, start=1):
        path: Path = item["path"]
        duration_frames = _duration_frames(item, path, rate)
        start = timeline_cursor
        end = start + duration_frames
        timeline_cursor = end

        shot_number = item.get("shotNumber")
        label_number = int(shot_number) if isinstance(shot_number, int) else idx
        clip_name = f"SHOT {label_number:03d} - {path.name}"
        clip = ET.SubElement(track, "clipitem", id=f"clipitem-{idx}")
        ET.SubElement(clip, "name").text = clip_name
        ET.SubElement(clip, "duration").text = str(duration_frames)
        _append_rate(clip, rate)
        ET.SubElement(clip, "start").text = str(start)
        ET.SubElement(clip, "end").text = str(end)
        ET.SubElement(clip, "enabled").text = "TRUE"
        ET.SubElement(clip, "in").text = "0"
        ET.SubElement(clip, "out").text = str(duration_frames)

        file_el = ET.SubElement(clip, "file", id=f"file-{idx}")
        ET.SubElement(file_el, "name").text = path.name
        ET.SubElement(file_el, "pathurl").text = _path_to_url(path)
        _append_rate(file_el, rate)
        ET.SubElement(file_el, "duration").text = str(duration_frames)
        file_media = ET.SubElement(file_el, "media")
        ET.SubElement(file_media, "video")

        source_track = ET.SubElement(clip, "sourcetrack")
        ET.SubElement(source_track, "mediatype").text = "video"
        ET.SubElement(source_track, "trackindex").text = "1"

    ET.SubElement(track, "enabled").text = "TRUE"
    ET.SubElement(track, "locked").text = "FALSE"
    ET.SubElement(audio, "track")

    duration_el.text = str(max(1, timeline_cursor))
    _prettify(xmeml)
    ET.ElementTree(xmeml).write(output_path, encoding="utf-8", xml_declaration=True)

    return {"outputPath": str(output_path), "count": len(resolved_items)}
