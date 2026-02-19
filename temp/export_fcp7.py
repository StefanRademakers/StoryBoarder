from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple, List
import xml.etree.ElementTree as ET
from .plan_quantizer import ensure_plan_quantized, resolve_rate, validate_quantized_plan
from .path_utils import resolve_project_path, to_project_relative
from .ffmpeg_utils import resolve_ffprobe_path

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional dependency
    Image = None

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"}
MEDIA_BIN_SHOT_KEYS = ("close", "medium", "wide", "close_reaction", "medium_reaction", "wide_reaction")


def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _resolve_path(project_dir: Path, value: str) -> Path:
    resolved = resolve_project_path(project_dir, value)
    if resolved:
        return resolved
    return Path(value).expanduser().resolve()


def _path_to_url(path: Path) -> str:
    uri = path.resolve().as_uri().replace("\\", "/")
    if uri.startswith("file://localhost/"):
        return uri
    if uri.startswith("file:///"):
        return "file://localhost/" + uri[len("file:///") :]
    return uri


def _get_image_dimensions(path: Path) -> Optional[Tuple[int, int]]:
    if Image is None or not path.exists():
        return None
    try:
        with Image.open(path) as img:
            return img.width, img.height
    except Exception:
        return None


def _get_audio_characteristics(path: Path) -> Dict[str, Optional[int]]:
    info: Dict[str, Optional[int]] = {"samplerate": None, "channels": None}
    if path.exists() and path.suffix.lower() in {".wav", ".wave"}:
        import wave

        try:
            with wave.open(str(path), "rb") as wav_file:
                info["samplerate"] = wav_file.getframerate()
                info["channels"] = wav_file.getnchannels()
        except Exception:
            pass
    return info


def _probe_media_duration(path: Path) -> Optional[float]:
    if not path.exists():
        return None
    try:
        result = subprocess.run(
            [
                resolve_ffprobe_path(),
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
    except FileNotFoundError:
        return None
    if result.returncode != 0:
        return None
    try:
        value = float(result.stdout.strip())
        return value if value > 0 else None
    except (TypeError, ValueError):
        return None


def _frames_to_timecode(frames: int, timebase: int) -> str:
    if timebase <= 0:
        return "00:00:00:00"
    total_frames = max(0, int(frames))
    fps = timebase
    hours = total_frames // (fps * 3600)
    minutes = (total_frames // (fps * 60)) % 60
    secs = (total_frames // fps) % 60
    frame = total_frames % fps
    return f"{hours:02}:{minutes:02}:{secs:02}:{frame:02}"


def _append_timecode(parent: ET.Element, rate: Dict[str, Any], frame: int = 0, include_frame: bool = True) -> ET.Element:
    timecode = ET.SubElement(parent, "timecode")
    timebase = int(rate["timebase"])
    ET.SubElement(timecode, "string").text = _frames_to_timecode(frame, timebase)
    if include_frame:
        ET.SubElement(timecode, "frame").text = str(frame)
    ET.SubElement(timecode, "displayformat").text = "DF" if rate["ntsc"] == "TRUE" else "NDF"
    _append_rate_element(timecode, rate)
    return timecode


def _project_resolution(project: Dict[str, Any]) -> Tuple[Optional[int], Optional[int]]:
    resolution = project.get("video", {}).get("resolution")
    if isinstance(resolution, str) and "x" in resolution:
        try:
            width_str, height_str = resolution.lower().split("x", 1)
            width = int(width_str.strip())
            height = int(height_str.strip())
            return width, height
        except (ValueError, AttributeError):
            return None, None
    width = project.get("video", {}).get("width")
    height = project.get("video", {}).get("height")
    if isinstance(width, int) and isinstance(height, int):
        return width, height
    return None, None


def _seconds_to_frames(seconds: float, fps: float) -> int:
    return max(0, int(round(seconds * fps)))


def _is_image(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTENSIONS


def _collect_media_bin_stills(project: Dict[str, Any], project_dir: Path) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    dedupe: set[str] = set()

    speakers = project.get("speakers") or []
    for speaker in speakers:
        speaker_id = speaker.get("id") or ""
        shots = speaker.get("shots") or {}
        for key in MEDIA_BIN_SHOT_KEYS:
            for path_value in shots.get(key) or []:
                if not isinstance(path_value, str) or not path_value.strip():
                    continue
                resolved = _resolve_path(project_dir, path_value)
                if not resolved.exists():
                    continue
                dedupe_key = f"{speaker_id}::{resolved}"
                if dedupe_key in dedupe:
                    continue
                dedupe.add(dedupe_key)
                if not _is_image(resolved):
                    continue
                width = height = None
                dims = _get_image_dimensions(resolved)
                if dims:
                    width, height = dims
                items.append(
                    {
                        "path": resolved,
                        "name": resolved.name,
                        "width": width,
                        "height": height,
                    }
                )

    for shot in project.get("multiSpeakerWide") or []:
        path_value = shot.get("path") if isinstance(shot, dict) else None
        if not isinstance(path_value, str) or not path_value.strip():
            continue
        resolved = _resolve_path(project_dir, path_value)
        if not resolved.exists():
            continue
        dedupe_key = f"multi::{resolved}"
        if dedupe_key in dedupe:
            continue
        dedupe.add(dedupe_key)
        if not _is_image(resolved):
            continue
        width = height = None
        dims = _get_image_dimensions(resolved)
        if dims:
            width, height = dims
        items.append(
            {
                "path": resolved,
                "name": resolved.name,
                "width": width,
                "height": height,
            }
        )

    for path_value in project.get("mediaExtras") or []:
        if not isinstance(path_value, str) or not path_value.strip():
            continue
        resolved = _resolve_path(project_dir, path_value)
        if not resolved.exists():
            continue
        dedupe_key = f"additional::{resolved}"
        if dedupe_key in dedupe:
            continue
        dedupe.add(dedupe_key)
        if not _is_image(resolved):
            continue
        width = height = None
        dims = _get_image_dimensions(resolved)
        if dims:
            width, height = dims
        items.append(
            {
                "path": resolved,
                "name": resolved.name,
                "width": width,
                "height": height,
            }
        )

    return items


def _normalize_shots(project: Dict[str, Any], project_dir: Path) -> Iterable[Dict[str, Any]]:
    speech = project.get("speechActivity") or {}
    shot_plan = speech.get("shotPlan") or {}
    plan_blocks = shot_plan.get("planBlocks") or []
    for index, block in enumerate(plan_blocks, start=1):
        q_meta = block.get("_q")
        if not isinstance(q_meta, dict):
            continue
        start_frame = int(q_meta.get("startFrame", 0))
        end_frame = int(q_meta.get("endFrame", start_frame))
        frames = int(q_meta.get("frames", max(end_frame - start_frame, 1)))
        start_sec = float(block.get("startSec", start_frame))
        end_sec = float(block.get("endSec", start_sec))
        path_value = block.get("variantPath")
        if not path_value or end_frame <= start_frame:
            continue
        path = _resolve_path(project_dir, path_value)
        is_image = _is_image(path)
        width = height = None
        if is_image:
            dims = _get_image_dimensions(path)
            if dims:
                width, height = dims
        source_duration = frames if is_image else None
        yield {
            "index": index,
            "startFrame": start_frame,
            "endFrame": end_frame,
            "frames": frames,
            "startSec": start_sec,
            "endSec": end_sec,
            "path": path,
            "name": os.path.basename(path),
            "isImage": is_image,
            "width": width,
            "height": height,
            "sourceDuration": source_duration,
            "reasons": block.get("reasons") or [],
            "_q": q_meta,
        }


def _normalize_audio(project: Dict[str, Any], payload: Dict[str, Any], project_dir: Path) -> Optional[Path]:
    explicit = payload.get("mixdownPath")
    if isinstance(explicit, str) and explicit.strip():
        return _resolve_path(project_dir, explicit)

    project_mix = project.get("allSpeakersMix")
    if isinstance(project_mix, str) and project_mix.strip():
        candidate = resolve_project_path(project_dir, project_mix)
        return candidate if candidate.exists() else None

    shot_plan = project.get("shotPlan") or {}
    audio_tracks = shot_plan.get("audioTracks") or {}
    mix_path = audio_tracks.get("mixdown")
    if isinstance(mix_path, str) and mix_path.strip():
        candidate = resolve_project_path(project_dir, mix_path)
        return candidate if candidate and candidate.exists() else None

    renders_dir = resolve_project_path(project_dir, project.get("paths", {}).get("renders")) or (project_dir / "Renders")
    candidate = renders_dir / "dialogue_mix.wav"
    return candidate if candidate.exists() else None


def _collect_speaker_tracks(project: Dict[str, Any], project_dir: Path) -> List[Dict[str, Any]]:
    tracks: List[Dict[str, Any]] = []
    for index, speaker in enumerate(project.get("speakers") or [], start=1):
        path_value = speaker.get("audioTrack")
        if not isinstance(path_value, str) or not path_value.strip():
            continue
        path = _resolve_path(project_dir, path_value)
        if not path.exists():
            continue
        display_name = speaker.get("displayName") or speaker.get("id") or f"Speaker {index}"
        tracks.append(
            {
                "index": index,
                "name": display_name,
                "path": path,
            }
        )
    return tracks


def _append_rate_element(parent: ET.Element, rate: Dict[str, Any]) -> ET.Element:
    rate_el = ET.SubElement(parent, "rate")
    ET.SubElement(rate_el, "timebase").text = str(rate["timebase"])
    ET.SubElement(rate_el, "ntsc").text = str(rate["ntsc"])
    return rate_el


def _build_clipitem(
    parent: ET.Element,
    clip_id: str,
    name: str,
    start: int,
    end: int,
    duration: int,
    source_in: int,
    source_out: int,
    mediatype: str,
    track_index: int,
    rate: Dict[str, Any],
) -> ET.Element:
    clip = ET.SubElement(parent, "clipitem", id=clip_id)
    ET.SubElement(clip, "name").text = name
    _append_rate_element(clip, rate)
    ET.SubElement(clip, "start").text = str(start)
    ET.SubElement(clip, "end").text = str(end)
    ET.SubElement(clip, "in").text = str(source_in)
    ET.SubElement(clip, "out").text = str(source_out)
    ET.SubElement(clip, "enabled").text = "TRUE"
    ET.SubElement(clip, "locked").text = "FALSE"
    ET.SubElement(clip, "duration").text = str(duration)
    sourcetrack = ET.SubElement(clip, "sourcetrack")
    ET.SubElement(sourcetrack, "mediatype").text = mediatype
    # Audio files are single-source per clip; keep source track index at 1.
    source_track_index = 1 if mediatype == "audio" else track_index
    ET.SubElement(sourcetrack, "trackindex").text = str(source_track_index)
    if mediatype == "video":
        ET.SubElement(clip, "compositemode").text = "normal"
    ET.SubElement(clip, "comments")
    return clip


def _append_file(
    parent: ET.Element,
    file_id: str,
    name: str,
    path: Path,
    duration: int,
    rate: Dict[str, Any],
    media_info: Dict[str, Any],
) -> ET.Element:
    file_el = ET.Element("file", id=file_id)
    is_audio = media_info.get("type") == "audio"
    duration_value = str(media_info.get("duration", duration))
    if is_audio:
        ET.SubElement(file_el, "duration").text = duration_value
        _append_rate_element(file_el, rate)
        ET.SubElement(file_el, "name").text = name
        ET.SubElement(file_el, "pathurl").text = _path_to_url(path)
    else:
        ET.SubElement(file_el, "name").text = name
        ET.SubElement(file_el, "pathurl").text = _path_to_url(path)
        _append_rate_element(file_el, rate)
        ET.SubElement(file_el, "duration").text = duration_value
        _append_timecode(file_el, rate, frame=0, include_frame=False)

    media = ET.SubElement(file_el, "media")
    media_type = media_info.get("type", "video")
    duration_value = str(media_info.get("duration", duration))

    if media_type == "audio":
        audio_el = ET.SubElement(media, "audio")
        ET.SubElement(audio_el, "duration").text = duration_value
        channels = media_info.get("channels") or 1
        ET.SubElement(audio_el, "channelcount").text = str(int(channels))
    else:
        video_el = ET.SubElement(media, "video")
        ET.SubElement(video_el, "duration").text = duration_value
        width = media_info.get("width")
        height = media_info.get("height")
        if width and height:
            sample_char = ET.SubElement(video_el, "samplecharacteristics")
            ET.SubElement(sample_char, "width").text = str(width)
            ET.SubElement(sample_char, "height").text = str(height)

    children = list(parent)
    insert_idx = None
    for idx, child in enumerate(children):
        if child.tag == "out":
            insert_idx = idx + 1
            break
    if insert_idx is None:
        parent.append(file_el)
    else:
        parent.insert(insert_idx, file_el)

    return file_el


def _ensure_sequence_structure(sequence: ET.Element, rate: Dict[str, Any]) -> ET.Element:
    _append_rate_element(sequence, rate)
    ET.SubElement(sequence, "in").text = "-1"
    ET.SubElement(sequence, "out").text = "-1"
    start_frame = int(rate["timebase"]) * 60 * 60
    _append_timecode(sequence, rate, frame=start_frame)
    media = ET.SubElement(sequence, "media")
    ET.SubElement(media, "video")
    ET.SubElement(media, "audio")
    return media


def _append_video_format(video_element: ET.Element, rate: Dict[str, Any], width: Optional[int], height: Optional[int]) -> None:
    format_el = ET.SubElement(video_element, "format")
    sample_char = ET.SubElement(format_el, "samplecharacteristics")
    if width:
        ET.SubElement(sample_char, "width").text = str(width)
    if height:
        ET.SubElement(sample_char, "height").text = str(height)
    ET.SubElement(sample_char, "pixelaspectratio").text = "square"
    _append_rate_element(sample_char, rate)
    codec = ET.SubElement(sample_char, "codec")
    app_data = ET.SubElement(codec, "appspecificdata")
    ET.SubElement(app_data, "appname").text = "Final Cut Pro"
    ET.SubElement(app_data, "appmanufacturer").text = "Apple Inc."
    data = ET.SubElement(app_data, "data")
    ET.SubElement(data, "qtcodec")


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


def handle_export_fcp7(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Export the current shot plan as a Final Cut Pro 7 XML timeline.
    Args payload:
      - projectPath: required path to project.json
      - outputPath: optional XML destination (defaults to Renders/<project>_timeline.xml)
      - mixdownPath: optional override for audio mixdown file
    """
    project_path_value = payload.get("projectPath")
    if not isinstance(project_path_value, str) or not project_path_value.strip():
        raise ValueError("'projectPath' is vereist")

    project_path = Path(project_path_value).resolve()
    with open(project_path, "r", encoding="utf-8") as f:
        project = json.load(f)

    project_dir = project_path.parent
    fps_hint = float(project.get("speechActivity", {}).get("fps") or project.get("video", {}).get("fps") or 30.0)
    ensure_plan_quantized(project, fps_hint)

    shot_plan = (project.get("speechActivity") or {}).get("shotPlan") or {}
    validate_quantized_plan(shot_plan)

    shots = list(_normalize_shots(project, project_dir))
    if not shots:
        raise ValueError("Shot plan blocks not found; run build_speech_activity first")

    quant_meta = shot_plan.get("quantization") or {}
    fallback_rate = resolve_rate(fps_hint)
    fps_actual = float(quant_meta.get("fps") or fallback_rate["fps"])
    rate = {
        "timebase": int(quant_meta.get("timebase") or fallback_rate["timebase"]),
        "ntsc": str(quant_meta.get("ntsc") or fallback_rate["ntsc"]),
    }
    timebase = rate["timebase"]
    still_source_start = timebase * 60 * 60

    speaker_tracks = _collect_speaker_tracks(project, project_dir)
    audio_mix = _normalize_audio(project, payload, project_dir)
    project_width, project_height = _project_resolution(project)

    intro_path: Optional[Path] = None
    intro_duration_frames = 0
    outro_path: Optional[Path] = None
    outro_duration_frames = 0
    library_assets: List[Dict[str, Any]] = []

    intro_media = project.get("media") or {}
    intro_path_value = intro_media.get("intro")
    if isinstance(intro_path_value, str) and intro_path_value.strip():
        candidate = _resolve_path(project_dir, intro_path_value)
        if candidate.exists():
            intro_path = candidate
            intro_duration_sec = _probe_media_duration(candidate) or 0.0
            if intro_duration_sec > 0:
                intro_duration_frames = max(1, _seconds_to_frames(intro_duration_sec, fps_actual))
            library_assets.append(
                {
                    "clip_id": "library-intro",
                    "file_id": "library-file-intro",
                    "path": intro_path,
                    "name": intro_path.name,
                    "duration": intro_duration_frames or 1,
                    "type": "video",
                    "width": project_width,
                    "height": project_height,
                }
            )

    outro_path_value = intro_media.get("outro")
    if isinstance(outro_path_value, str) and outro_path_value.strip():
        candidate = _resolve_path(project_dir, outro_path_value)
        if candidate.exists():
            outro_path = candidate
            outro_duration_sec = _probe_media_duration(candidate) or 0.0
            if outro_duration_sec > 0:
                outro_duration_frames = max(1, _seconds_to_frames(outro_duration_sec, fps_actual))
            library_assets.append(
                {
                    "clip_id": "library-outro",
                    "file_id": "library-file-outro",
                    "path": outro_path,
                    "name": outro_path.name,
                    "duration": outro_duration_frames or 1,
                    "type": "video",
                    "width": project_width,
                    "height": project_height,
                }
            )

    base_offset_frames = 0

    renders_dir = resolve_project_path(project_dir, project.get("paths", {}).get("renders")) or (project_dir / "Renders")
    sequence_name = project.get("name") or project_path.stem
    if isinstance(payload.get("outputPath"), str) and payload["outputPath"].strip():
        output_path = Path(payload["outputPath"])
        if not output_path.is_absolute():
            output_path = project_dir / output_path
    else:
        filename = f"{sequence_name}_timeline.xml".replace(" ", "_")
        output_path = renders_dir / filename
    output_path = output_path.resolve()
    _ensure_dir(output_path)

    xmeml = ET.Element("xmeml", version="5")
    sequence = ET.SubElement(xmeml, "sequence", id="sequence-1")
    ET.SubElement(sequence, "name").text = sequence_name
    duration_el = ET.SubElement(sequence, "duration")
    media = _ensure_sequence_structure(sequence, rate)

    video_element = media.find("video")  # type: ignore[assignment]
    audio_element = media.find("audio")  # type: ignore[assignment]

    video_tracks: List[ET.Element] = []
    track_end_frames: List[int] = []

    def ensure_video_track(idx: int) -> ET.Element:
        while len(video_tracks) <= idx:
            track_el = ET.SubElement(video_element, "track")  # type: ignore[arg-type]
            video_tracks.append(track_el)
            track_end_frames.append(0)
        return video_tracks[idx]

    last_end_frame = 0

    sorted_shots = sorted(shots, key=lambda item: (item.get("startFrame", 0), item["index"]))
    for shot in sorted_shots:
        start_frames = shot.get("startFrame", 0)
        duration_frames = max(shot.get("frames", 0), 1)
        timeline_start = base_offset_frames + start_frames
        timeline_end = timeline_start + duration_frames
        last_end_frame = max(last_end_frame, timeline_end)
        source_in = still_source_start if shot["isImage"] else 0
        source_out = source_in + duration_frames

        track_idx = None
        for idx, end_frame in enumerate(track_end_frames):
            if timeline_start >= end_frame:
                track_idx = idx
                break
        if track_idx is None:
            track_idx = len(track_end_frames)

        track_element = ensure_video_track(track_idx)
        track_end_frames[track_idx] = timeline_end

        clip_id = f"clipitem-{shot['index']}"
        file_id = f"file-{shot['index']}"
        clip = _build_clipitem(
            track_element,
            clip_id,
            shot["name"],
            timeline_start,
            timeline_end,
            duration_frames,
            source_in,
            source_out,
            mediatype="video",
            track_index=track_idx + 1,
            rate=rate,
        )
        source_duration = 1 if shot.get("isImage") else (shot.get("sourceDuration") or duration_frames)
        media_info = {
            "type": "video",
            "duration": source_duration,
            "width": shot.get("width") or project_width,
            "height": shot.get("height") or project_height,
        }
        _append_file(clip, file_id, shot["name"], shot["path"], source_duration, rate, media_info)

    appended_stills = _collect_media_bin_stills(project, project_dir)
    if appended_stills:
        pause_frames = max(0, _seconds_to_frames(4.0, fps_actual))
        still_duration_frames = max(1, _seconds_to_frames(3.0, fps_actual))
        current_start = last_end_frame + pause_frames
        for idx, item in enumerate(appended_stills, start=1):
            timeline_start = current_start
            timeline_end = timeline_start + still_duration_frames

            track_idx = None
            for track_idx_candidate, end_frame in enumerate(track_end_frames):
                if timeline_start >= end_frame:
                    track_idx = track_idx_candidate
                    break
            if track_idx is None:
                track_idx = len(track_end_frames)

            track_element = ensure_video_track(track_idx)
            track_end_frames[track_idx] = timeline_end
            last_end_frame = max(last_end_frame, timeline_end)

            clip_id = f"clipitem-mediabin-{idx}"
            file_id = f"file-mediabin-{idx}"
            source_in = still_source_start
            source_out = source_in + still_duration_frames
            clip = _build_clipitem(
                track_element,
                clip_id,
                item["name"],
                timeline_start,
                timeline_end,
                still_duration_frames,
                source_in,
                source_out,
                mediatype="video",
                track_index=track_idx + 1,
                rate=rate,
            )
            media_info = {
                "type": "video",
                "duration": 1,
                "width": item.get("width") or project_width,
                "height": item.get("height") or project_height,
            }
            _append_file(clip, file_id, item["name"], item["path"], 1, rate, media_info)
            current_start = timeline_end

    audio_sources: List[Dict[str, Any]] = []
    if audio_mix and audio_mix.exists():
        audio_sources.append(
            {
                "path": audio_mix,
                "clip_id": "clipitem-audio-1",
                "file_id": "file-audio-1",
                "name": audio_mix.name,
            }
        )
    for idx, speaker in enumerate(speaker_tracks, start=1):
        path = speaker["path"]
        if not path.exists():
            continue
        audio_sources.append(
            {
                "path": path,
                "clip_id": f"clipitem-audio-speaker-{idx}",
                "file_id": f"file-audio-speaker-{idx}",
                "name": speaker["name"],
            }
        )

    if audio_sources:
        audio_start = 0
        audio_track_count = 0
        for source in audio_sources:
            audio_track_count += 1
            track_element = ET.SubElement(audio_element, "track")  # type: ignore[arg-type]
            actual_duration_sec = _probe_media_duration(source["path"])
            if actual_duration_sec is None:
                actual_duration_sec = max(last_end_frame - audio_start, 1) / max(timebase, 1)
            actual_frames = max(1, _seconds_to_frames(actual_duration_sec, fps_actual))
            clip_duration_frames = actual_frames
            audio_end = audio_start + clip_duration_frames
            clip = _build_clipitem(
                track_element,
                source["clip_id"],
                source["name"],
                audio_start,
                audio_end,
                clip_duration_frames,
                0,
                clip_duration_frames,
                mediatype="audio",
                track_index=audio_track_count,
                rate=rate,
            )
            audio_media_info = {"type": "audio", "duration": actual_frames}
            audio_media_info.update(_get_audio_characteristics(source["path"]))
            _append_file(clip, source["file_id"], source["path"].name, source["path"], actual_frames, rate, audio_media_info)
            ET.SubElement(track_element, "enabled").text = "TRUE"
            ET.SubElement(track_element, "locked").text = "FALSE"
            last_end_frame = max(last_end_frame, audio_end)

    for track_el in video_tracks:
        ET.SubElement(track_el, "enabled").text = "TRUE"
        ET.SubElement(track_el, "locked").text = "FALSE"

    if library_assets:
        library_bin = ET.SubElement(xmeml, "bin", id="library-bin")
        ET.SubElement(library_bin, "name").text = "Additional Media"
        for asset in library_assets:
            clip = ET.SubElement(library_bin, "clip", id=asset["clip_id"])
            ET.SubElement(clip, "name").text = asset["name"]
            _append_rate_element(clip, rate)
            ET.SubElement(clip, "in").text = "0"
            ET.SubElement(clip, "out").text = str(asset["duration"])
            ET.SubElement(clip, "start").text = "0"
            ET.SubElement(clip, "end").text = str(asset["duration"])
            ET.SubElement(clip, "duration").text = str(asset["duration"])
            media_info = {
                "type": asset["type"],
                "duration": asset["duration"],
                "width": asset.get("width"),
                "height": asset.get("height"),
            }
            _append_file(clip, asset["file_id"], asset["name"], asset["path"], asset["duration"], rate, media_info)
            ET.SubElement(clip, "ismasterclip").text = "TRUE"

    _append_video_format(video_element, rate, project_width, project_height)

    sequence_duration = max(last_end_frame, 1)
    duration_el.text = str(sequence_duration)
    _prettify(xmeml)

    ET.ElementTree(xmeml).write(output_path, encoding="utf-8", xml_declaration=True)
    return {
        "outputPath": to_project_relative(project_dir, output_path) or str(output_path),
        "allSpeakersMix": project.get("allSpeakersMix"),
    }

