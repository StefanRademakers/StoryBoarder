from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET
import datetime

from .path_utils import resolve_project_path, to_project_relative
from .ffmpeg_utils import resolve_ffprobe_path
from .plan_quantizer import resolve_rate
import subprocess
import wave


def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _path_to_url(path: Path) -> str:
    uri = path.resolve().as_uri().replace("\\", "/")
    if uri.startswith("file://localhost/"):
        return uri
    if uri.startswith("file:///"):
        return "file://localhost/" + uri[len("file:///") :]
    return uri


def _parse_resolution(value: Any) -> Tuple[Optional[int], Optional[int]]:
    if not isinstance(value, str):
        return None, None
    match = re.match(r"^(\d+)[xX](\d+)$", value.strip())
    if not match:
        return None, None
    try:
        width = int(match.group(1))
        height = int(match.group(2))
    except ValueError:
        return None, None
    if width <= 0 or height <= 0:
        return None, None
    return width, height


def _scale_dimension(value: Optional[int], factor: int) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value) * int(factor)
    except Exception:
        return value


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


def _append_rate_element(parent: ET.Element, rate: Dict[str, Any]) -> None:
    r = ET.SubElement(parent, "rate")
    ET.SubElement(r, "timebase").text = str(int(rate["timebase"]))
    ET.SubElement(r, "ntsc").text = str(rate["ntsc"])  # "TRUE"/"FALSE"


def _append_timecode(parent: ET.Element, rate: Dict[str, Any], frame: int = 0, include_frame: bool = True) -> ET.Element:
    timecode = ET.SubElement(parent, "timecode")
    timebase = int(rate["timebase"])
    ET.SubElement(timecode, "string").text = _frames_to_timecode(frame, timebase)
    if include_frame:
        ET.SubElement(timecode, "frame").text = str(frame)
    ET.SubElement(timecode, "displayformat").text = "DF" if rate["ntsc"] == "TRUE" else "NDF"
    _append_rate_element(timecode, rate)
    return timecode


def _ensure_sequence_structure(sequence: ET.Element, rate: Dict[str, Any]) -> ET.Element:
    # Match structure Resolve expects (align with export_fcp7)
    _append_rate_element(sequence, rate)
    ET.SubElement(sequence, "in").text = "-1"
    ET.SubElement(sequence, "out").text = "-1"
    # Start timecode at 1h like FCP7 convention
    start_frame = int(rate["timebase"]) * 60 * 60
    _append_timecode(sequence, rate, frame=start_frame)

    media = ET.SubElement(sequence, "media")
    ET.SubElement(media, "video")
    ET.SubElement(media, "audio")
    return media


def _append_video_format(video_element: ET.Element, rate: Dict[str, Any], width: Optional[int], height: Optional[int]) -> None:
    fmt = video_element.find("format")  # type: ignore[assignment]
    if fmt is None:
        fmt = ET.SubElement(video_element, "format")
    sample = ET.SubElement(fmt, "samplecharacteristics")
    _append_rate_element(sample, rate)
    if width:
        ET.SubElement(sample, "width").text = str(int(width))
    if height:
        ET.SubElement(sample, "height").text = str(int(height))
    ET.SubElement(sample, "pixelaspectratio").text = "square"
    ET.SubElement(sample, "anamorphic").text = "FALSE"


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


def _build_clipitem(
    parent_track: ET.Element,
    clip_id: str,
    name: str,
    timeline_start: int,
    timeline_end: int,
    duration_frames: int,
    source_in: int,
    source_out: int,
    *,
    mediatype: str,
    track_index: int,
    rate: Dict[str, Any],
) -> ET.Element:
    clip = ET.SubElement(parent_track, "clipitem", id=clip_id)
    # Order to match known-good exports: name, duration, rate, start, end, enabled, in, out, file, sourcetrack, filters, comments
    ET.SubElement(clip, "name").text = name
    ET.SubElement(clip, "duration").text = str(int(duration_frames))
    _append_rate_element(clip, rate)
    ET.SubElement(clip, "start").text = str(int(timeline_start))
    ET.SubElement(clip, "end").text = str(int(timeline_end))
    ET.SubElement(clip, "enabled").text = "TRUE"
    ET.SubElement(clip, "in").text = str(int(source_in))
    ET.SubElement(clip, "out").text = str(int(source_out))
    # Provide sourcetrack metadata like the original exporter
    sourcetrack = ET.SubElement(clip, "sourcetrack")
    ET.SubElement(sourcetrack, "mediatype").text = mediatype
    # For audio items, Resolve expects <trackindex>1</trackindex> regardless of lane
    ET.SubElement(sourcetrack, "trackindex").text = (
        "1" if mediatype == "audio" else str(int(track_index))
    )
    if mediatype == "video":
        ET.SubElement(clip, "alphatype").text = "none"
        ET.SubElement(clip, "masterclipid").text = f"masterclip-{clip_id}"
        # Only add clip-level timecode for video; some NLEs mute audio items with it present
        _append_timecode(clip, rate, frame=timeline_start, include_frame=True)
    else:
        # Add comments node for audio, matching common exports
        ET.SubElement(clip, "comments")
    return clip


def _append_file(
    clip: ET.Element,
    file_id: str,
    display_name: str,
    file_path: Path,
    source_duration: int,
    rate: Dict[str, Any],
    media_info: Dict[str, Any],
) -> None:
    # Insert <file> immediately after <out>, before <sourcetrack>, to mirror known-good exports
    file_el = ET.Element("file", id=file_id)
    # For audio, some NLEs prefer duration then rate then name/pathurl ordering
    is_audio = media_info.get("type") != "video"
    if is_audio:
        ET.SubElement(file_el, "duration").text = str(int(source_duration))
        _append_rate_element(file_el, rate)
        ET.SubElement(file_el, "name").text = display_name
        ET.SubElement(file_el, "pathurl").text = _path_to_url(file_path)
    else:
        ET.SubElement(file_el, "name").text = display_name
        ET.SubElement(file_el, "pathurl").text = _path_to_url(file_path)
        _append_rate_element(file_el, rate)
        ET.SubElement(file_el, "duration").text = str(int(source_duration))
    # Avoid adding file-level timecode for audio (keep minimal like working reference)

    media_el = ET.SubElement(file_el, "media")
    if not is_audio:
        video_el = ET.SubElement(media_el, "video")
        sample = ET.SubElement(video_el, "samplecharacteristics")
        _append_rate_element(sample, rate)
        if media_info.get("width"):
            ET.SubElement(sample, "width").text = str(int(media_info["width"]))
        if media_info.get("height"):
            ET.SubElement(sample, "height").text = str(int(media_info["height"]))
        ET.SubElement(sample, "pixelaspectratio").text = "square"
        ET.SubElement(sample, "anamorphic").text = "FALSE"
    else:
        audio_el = ET.SubElement(media_el, "audio")
        # Be explicit to avoid NLEs treating it as muted/undefined
        channels = media_info.get("channels") or 1
        ET.SubElement(audio_el, "channelcount").text = str(int(channels))
        # Omit samplerate to mirror working Resolve export more closely

        # Match common FCP7 defaults: pan center, level 1
        # Added at the clip level in _append_audio_filters

    # Insert the file element before <sourcetrack>
    children = list(clip)
    insert_idx = 0
    for idx, child in enumerate(children):
        if child.tag == "out":
            insert_idx = idx + 1
            break
    clip.insert(insert_idx, file_el)


def _resolve_path(project_dir: Path, value: str) -> Path:
    resolved = resolve_project_path(project_dir, value)
    if resolved:
        return resolved
    return Path(value).expanduser().resolve()


def _get_audio_characteristics(path: Path) -> Dict[str, Optional[int]]:
    info: Dict[str, Optional[int]] = {"samplerate": None, "channels": None}
    if path.exists() and path.suffix.lower() in {".wav", ".wave"}:
        try:
            with wave.open(str(path), "rb") as wav_file:
                info["samplerate"] = wav_file.getframerate()
                info["channels"] = wav_file.getnchannels()
        except Exception:
            pass
    return info


def _append_audio_filters(clip_el: ET.Element, start: int, end: int) -> None:
    # Audio Levels
    filt1 = ET.SubElement(clip_el, "filter")
    ET.SubElement(filt1, "enabled").text = "TRUE"
    ET.SubElement(filt1, "start").text = str(int(start))
    ET.SubElement(filt1, "end").text = str(int(end))
    eff1 = ET.SubElement(filt1, "effect")
    ET.SubElement(eff1, "name").text = "Audio Levels"
    ET.SubElement(eff1, "effectid").text = "audiolevels"
    ET.SubElement(eff1, "effecttype").text = "audiolevels"
    ET.SubElement(eff1, "mediatype").text = "audio"
    ET.SubElement(eff1, "effectcategory").text = "audiolevels"
    p1 = ET.SubElement(eff1, "parameter")
    ET.SubElement(p1, "name").text = "Level"
    ET.SubElement(p1, "parameterid").text = "level"
    ET.SubElement(p1, "value").text = "1"
    ET.SubElement(p1, "valuemin").text = "1e-05"
    ET.SubElement(p1, "valuemax").text = "31.6228"

    # Audio Pan (center)
    filt2 = ET.SubElement(clip_el, "filter")
    ET.SubElement(filt2, "enabled").text = "TRUE"
    ET.SubElement(filt2, "start").text = str(int(start))
    ET.SubElement(filt2, "end").text = str(int(end))
    eff2 = ET.SubElement(filt2, "effect")
    ET.SubElement(eff2, "name").text = "Audio Pan"
    ET.SubElement(eff2, "effectid").text = "audiopan"
    ET.SubElement(eff2, "effecttype").text = "audiopan"
    ET.SubElement(eff2, "mediatype").text = "audio"
    ET.SubElement(eff2, "effectcategory").text = "audiopan"
    p2 = ET.SubElement(eff2, "parameter")
    ET.SubElement(p2, "name").text = "Pan"
    ET.SubElement(p2, "parameterid").text = "pan"
    ET.SubElement(p2, "value").text = "0"
    ET.SubElement(p2, "valuemin").text = "-1"
    ET.SubElement(p2, "valuemax").text = "1"


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


def _seconds_to_frames(seconds: float, fps: float) -> int:
    try:
        return max(1, int(round(float(seconds) * float(fps))))
    except Exception:
        return 1


def _load_manifests(clips_dir: Path) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    if not clips_dir.exists():
        return results
    for path in sorted(clips_dir.glob("clip_*_manifest.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            data["__manifest_path__"] = str(path)
            results.append(data)
        except Exception:
            continue
    return results


def _enumerate_render_versions(src_path: Path) -> List[Tuple[int, Path]]:
    """
    Return available render versions for a clip, ordered by version index.
    Version 0 = the manifest's original render (clip_X_render.mp4).
    Subsequent versions follow the naming pattern clip_X_render_<NNNNN>_.mp4.
    """
    versions: Dict[int, Path] = {}
    base_stem = src_path.stem
    suffix = src_path.suffix

    if src_path.exists():
        versions[0] = src_path

    # Match numbered re-renders with a trailing underscore (e.g., _00001_)
    pattern = re.compile("^" + re.escape(base_stem) + r"_(\d+)_" + re.escape(suffix) + "$")
    parent = src_path.parent
    if parent.exists():
        for candidate in parent.glob(f"{base_stem}_*{suffix}"):
            m = pattern.match(candidate.name)
            if not m:
                continue
            try:
                version_idx = int(m.group(1))
            except ValueError:
                continue
            versions[version_idx] = candidate

    return [(idx, path) for idx, path in sorted(versions.items(), key=lambda item: item[0])]


def _resolve_upscaled_path(src_path: Path, *, suffix: str = "_2x") -> Optional[Path]:
    if not src_path:
        return None
    candidate = src_path.with_name(f"{src_path.stem}{suffix}{src_path.suffix}")
    if candidate.exists():
        return candidate
    if src_path.stem.endswith("_"):
        trimmed = src_path.stem.rstrip("_")
        if trimmed:
            candidate = src_path.with_name(f"{trimmed}{suffix}{src_path.suffix}")
            if candidate.exists():
                return candidate
    return None


def _handle_export_fcp7_rendered(
    payload: Dict[str, Any],
    *,
    scale: int = 1,
    use_upscaled: bool = False,
    sequence_suffix: str = "_rendered",
) -> Dict[str, Any]:
    """
    Build an FCP7 XML from rendered clip manifests in Renders/Clips.

    Payload:
      - projectPath: required path to project.json
      - outputPath: optional override. Defaults to Renders/<project>_rendered_timeline.xml
    """
    scale_factor = max(1, int(scale))
    project_path_value = payload.get("projectPath")
    if not isinstance(project_path_value, str) or not project_path_value.strip():
        raise ValueError("'projectPath' is vereist")

    project_path = Path(project_path_value).resolve()
    with open(project_path, "r", encoding="utf-8") as f:
        project = json.load(f)

    project_dir = project_path.parent
    renders_dir = resolve_project_path(project_dir, project.get("paths", {}).get("renders")) or (project_dir / "Renders")
    clips_dir = renders_dir / "Clips"

    manifests = _load_manifests(clips_dir)
    if not manifests:
        raise ValueError(f"Geen clip manifests gevonden in {clips_dir}")

    # Sort by original timeline order
    manifests.sort(key=lambda m: (int(m.get("start", 0)), int(m.get("clipIndex", 0))))

    # Rate from first manifest
    rate_info = resolve_rate(float(manifests[0].get("fps") or 30.0))
    rate = {"timebase": int(rate_info["timebase"]), "ntsc": rate_info["ntsc"]}
    fps_actual = float(rate_info["fps"])  # for converting seconds to frames
    timebase = rate["timebase"]

    # Project dimensions from first manifest as fallback
    width = int(manifests[0].get("width") or 0) or None
    height = int(manifests[0].get("height") or 0) or None
    if not width or not height:
        project_res = _parse_resolution((project.get("video") or {}).get("resolution"))
        width = width or project_res[0]
        height = height or project_res[1]
    width_scaled = _scale_dimension(width, scale_factor) if width else None
    height_scaled = _scale_dimension(height, scale_factor) if height else None

    sequence_name = (project.get("name") or project_path.stem) + sequence_suffix
    if isinstance(payload.get("outputPath"), str) and payload["outputPath"].strip():
        output_path = Path(payload["outputPath"])
        if not output_path.is_absolute():
            output_path = project_dir / output_path
    else:
        filename = f"{sequence_name}_timeline.xml".replace(" ", "_")
        output_path = renders_dir / filename
    output_path = output_path.resolve()
    _ensure_dir(output_path)

    # Build XML
    xmeml = ET.Element("xmeml", version="5")
    sequence = ET.SubElement(xmeml, "sequence", id="sequence-1")
    ET.SubElement(sequence, "name").text = sequence_name
    duration_el = ET.SubElement(sequence, "duration")
    media = _ensure_sequence_structure(sequence, rate)
    video_element = media.find("video")  # type: ignore[assignment]
    audio_element = media.find("audio")  # type: ignore[assignment]
    # Enrich audio parent with basic characteristics to help NLEs
    _append_rate_element(audio_element, rate)
    ET.SubElement(audio_element, "in").text = "0"
    ET.SubElement(audio_element, "out").text = "0"
    ET.SubElement(audio_element, "audiochannelcount").text = "2"

    # ensure first track exists (we will stack if overlaps appear, but expect not)
    video_tracks: List[ET.Element] = []
    track_end_frames: List[int] = []
    audio_tracks: List[ET.Element] = []

    def ensure_video_track(idx: int) -> ET.Element:
        while len(video_tracks) <= idx:
            track_el = ET.SubElement(video_element, "track")  # type: ignore[arg-type]
            video_tracks.append(track_el)
            track_end_frames.append(0)
        return video_tracks[idx]

    def ensure_audio_track(idx: int) -> ET.Element:
        while len(audio_tracks) <= idx:
            track_el = ET.SubElement(audio_element, "track")  # type: ignore[arg-type]
            audio_tracks.append(track_el)
        return audio_tracks[idx]

    def pick_video_track(timeline_start: int, preferred_idx: int) -> int:
        """
        Prefer to place alternate renders on stable, version-based tracks
        (V1 for original, V2 for _00001_, etc.) but avoid overlaps by falling
        back to the next available track when needed.
        """
        ensure_video_track(preferred_idx)
        if timeline_start >= track_end_frames[preferred_idx]:
            return preferred_idx
        for idx, t_end in enumerate(track_end_frames):
            if timeline_start >= t_end:
                return idx
        return len(track_end_frames)

    last_end_frame = 0  # track max of any placed item (video or audio)
    video_item_counter = 0  # unique IDs across base + alternate renders

    for i, m in enumerate(manifests):
        src_path_val = m.get("clip_out_abs") or m.get("clip_out")
        if not isinstance(src_path_val, str) or not src_path_val:
            # Skip if missing render path
            continue
        src_path = Path(src_path_val)

        # Timeline placement and source in/out
        start = int(m.get("start", 0))
        end = int(m.get("end", start))
        in_point = int(m.get("in", 0))
        out_point = int(m.get("out", in_point))
        duration = max(end - start, 1)

        # One manifest can have multiple renders: base (track 1) + numbered re-renders on higher tracks.
        for version_idx, version_path in _enumerate_render_versions(src_path):
            actual_path = version_path
            is_upscaled = False
            if use_upscaled and scale_factor > 1:
                upscaled = _resolve_upscaled_path(version_path)
                if upscaled:
                    actual_path = upscaled
                    is_upscaled = True
            name = actual_path.name
            track_idx = pick_video_track(start, preferred_idx=version_idx)
            track_el = ensure_video_track(track_idx)
            track_end_frames[track_idx] = max(track_end_frames[track_idx], end)
            last_end_frame = max(last_end_frame, end)

            video_item_counter += 1
            clip_id = f"clipitem-{video_item_counter}"
            file_id = f"file-{video_item_counter}"
            clip = _build_clipitem(
                track_el,
                clip_id,
                name,
                start,
                end,
                duration,
                in_point,
                out_point,
                mediatype="video",
                track_index=track_idx + 1,
                rate=rate,
            )

            clip_width = int(m.get("width") or (width or 0)) or None
            clip_height = int(m.get("height") or (height or 0)) or None
            if is_upscaled:
                clip_width = _scale_dimension(clip_width, scale_factor)
                clip_height = _scale_dimension(clip_height, scale_factor)
            media_info = {
                "type": "video",
                "duration": int(m.get("duration") or (out_point - in_point) or duration),
                "width": clip_width,
                "height": clip_height,
            }
            _append_file(clip, file_id, name, actual_path, media_info["duration"] or duration, rate, media_info)

        # If available, add per-clip audio on audio track 1 (index 0) once per manifest
        audio_seg_val = m.get("audio_1_abs") or m.get("audio_1")
        if isinstance(audio_seg_val, str) and audio_seg_val:
            audio_path = _resolve_path(project_dir, audio_seg_val)
            if audio_path.exists():
                a_track_el = ensure_audio_track(0)  # reserve track 0 and 1 for clip audio; we place on 0
                # Ensure track flags present for this audio track
                if a_track_el.find("enabled") is None:
                    ET.SubElement(a_track_el, "enabled").text = "TRUE"
                if a_track_el.find("locked") is None:
                    ET.SubElement(a_track_el, "locked").text = "FALSE"
                a_clip = _build_clipitem(
                    a_track_el,
                    clip_id=f"clipitem-audio-perclip-{i+1}",
                    name=os.path.basename(audio_path),
                    timeline_start=start,
                    timeline_end=end,
                    duration_frames=duration,
                    # Match video in/out so preroll/postroll line up
                    source_in=in_point,
                    source_out=out_point,
                    mediatype="audio",
                    track_index=1,  # FCP track index is 1-based
                    rate=rate,
                )
                audio_media_info: Dict[str, Any] = {"type": "audio", "duration": duration}
                audio_media_info.update(_get_audio_characteristics(audio_path))
                _append_file(
                    a_clip,
                    file_id=f"file-audio-perclip-{i+1}",
                    display_name=os.path.basename(audio_path),
                    file_path=audio_path,
                    source_duration=duration,
                    rate=rate,
                    media_info=audio_media_info,
                )
                _append_audio_filters(a_clip, start, end)
                last_end_frame = max(last_end_frame, end)

    # Add audio: mixdown and per-speaker tracks if available
    # (Placed after video and per-clip audio so we can include them in duration.)
    # Ensure video track flags present
    for track_el in video_tracks:
        ET.SubElement(track_el, "enabled").text = "TRUE"
        ET.SubElement(track_el, "locked").text = "FALSE"

    audio_sources: List[Dict[str, Any]] = []
    # 1) Mixdown: prefer project.allSpeakersMix, then shotPlan.audioTracks.mixdown, then Renders/dialogue_mix.wav
    project_mix = project.get("allSpeakersMix")
    if isinstance(project_mix, str) and project_mix.strip():
        candidate = resolve_project_path(project_dir, project_mix)
        if candidate and candidate.exists():
            audio_sources.append({"path": candidate, "name": candidate.name})
    else:
        shot_plan = (project.get("speechActivity") or {}).get("shotPlan") or {}
        audio_tracks = shot_plan.get("audioTracks") or {}
        mix_path = audio_tracks.get("mixdown")
        if isinstance(mix_path, str) and mix_path.strip():
            candidate = resolve_project_path(project_dir, mix_path)
            if candidate and candidate.exists():
                audio_sources.append({"path": candidate, "name": candidate.name})
        else:
            renders_dir2 = resolve_project_path(project_dir, project.get("paths", {}).get("renders")) or (project_dir / "Renders")
            candidate = renders_dir2 / "dialogue_mix.wav"
            if candidate.exists():
                audio_sources.append({"path": candidate, "name": candidate.name})

    # 2) Per-speaker tracks
    for idx, speaker in enumerate(project.get("speakers") or [], start=1):
        path_value = speaker.get("audioTrack")
        if not isinstance(path_value, str) or not path_value.strip():
            continue
        path = _resolve_path(project_dir, path_value)
        if not path.exists():
            continue
        display_name = speaker.get("displayName") or speaker.get("id") or f"Speaker {idx}"
        audio_sources.append({"path": path, "name": str(display_name)})

    # Place audio clips starting at t=0 and spanning the sequence
    if audio_sources:
        # Reserve audio tracks 1 and 2 for per-clip audio, so start from 3
        reserved_clip_tracks = 2
        for offset, source in enumerate(audio_sources, start=1):
            track_index_1based = reserved_clip_tracks + offset
            track_el = ensure_audio_track(track_index_1based - 1)
            if track_el.find("enabled") is None:
                ET.SubElement(track_el, "enabled").text = "TRUE"
            if track_el.find("locked") is None:
                ET.SubElement(track_el, "locked").text = "FALSE"
            # Try probing actual duration; fall back to sequence duration
            actual_duration_sec = _probe_media_duration(source["path"]) or (last_end_frame / max(fps_actual, 1.0))
            actual_frames = max(1, _seconds_to_frames(actual_duration_sec, fps_actual))
            clip_duration_frames = max(last_end_frame, actual_frames)
            audio_end = clip_duration_frames

            clip = _build_clipitem(
                track_el,
                clip_id=f"clipitem-audio-{track_index_1based}",
                name=source["name"],
                timeline_start=0,
                timeline_end=audio_end,
                duration_frames=clip_duration_frames,
                source_in=0,
                source_out=clip_duration_frames,
                mediatype="audio",
                track_index=track_index_1based,
                rate=rate,
            )
            audio_media_info: Dict[str, Any] = {"type": "audio", "duration": actual_frames}
            audio_media_info.update(_get_audio_characteristics(source["path"]))
            _append_file(clip, file_id=f"file-audio-{track_index_1based}", display_name=source["name"], file_path=source["path"], source_duration=clip_duration_frames, rate=rate, media_info=audio_media_info)
            ET.SubElement(track_el, "enabled").text = "TRUE"
            ET.SubElement(track_el, "locked").text = "FALSE"
            _append_audio_filters(clip, 0, audio_end)
            last_end_frame = max(last_end_frame, audio_end)

    # finalize sequence (after computing max end across video and audio)
    _append_video_format(video_element, rate, width_scaled, height_scaled)
    sequence_duration_frames = max(last_end_frame, 1)
    duration_el.text = str(sequence_duration_frames)
    _prettify(xmeml)

    ET.ElementTree(xmeml).write(output_path, encoding="utf-8", xml_declaration=True)
    return {
        "outputPath": to_project_relative(project_dir, output_path) or str(output_path),
        "clipsDir": to_project_relative(project_dir, clips_dir) or str(clips_dir),
        "count": len(manifests),
    }


def handle_export_fcp7_rendered(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _handle_export_fcp7_rendered(payload, scale=1, use_upscaled=False, sequence_suffix="_rendered")


def handle_export_fcp7_rendered_2x(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _handle_export_fcp7_rendered(payload, scale=2, use_upscaled=True, sequence_suffix="_rendered_2x")
