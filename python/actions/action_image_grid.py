import os
import re
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont


def _natural_key(name: str):
    parts = re.split(r"(\d+)", name)
    key = []
    for part in parts:
        if part.isdigit():
            key.append(int(part))
        else:
            key.append(part.lower())
    return key


def _parse_hex_color(value: str, fallback=(255, 255, 255, 255)):
    if not isinstance(value, str):
        return fallback
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return fallback
    try:
        r = int(text[0:2], 16)
        g = int(text[2:4], 16)
        b = int(text[4:6], 16)
    except Exception:
        return fallback
    return (r, g, b, 255)


def _parse_settings(data):
    columns = 3
    max_longest_edge = 4096
    background_color = "#ffffff"
    padding = 32
    add_labels = True
    text_color = "#000000"
    tile_prefix = "SHOT"
    tile_width = None
    tile_height = None
    fit_mode = "contain"
    output_dir = ""
    output_name_prefix = "grid_overview"
    output_path = ""
    tile_outline_color = "#5079a5"
    tile_outline_width = 2

    if isinstance(data, dict):
        if "xTiles" in data:
            try:
                columns = int(data.get("xTiles", columns))
            except Exception:
                pass
        elif "columns" in data:
            try:
                columns = int(data.get("columns", columns))
            except Exception:
                pass
        elif "x" in data:
            try:
                columns = int(data.get("x", columns))
            except Exception:
                pass
        try:
            max_longest_edge = int(data.get("maxLongestEdge", max_longest_edge))
        except Exception:
            pass
        if "backgroundColor" in data:
            background_color = str(data.get("backgroundColor") or background_color)
        try:
            padding = int(data.get("padding", padding))
        except Exception:
            pass
        add_labels = bool(data.get("addLabels", add_labels))
        if "textColor" in data:
            text_color = str(data.get("textColor") or text_color)
        if "tilePrefix" in data:
            tile_prefix = str(data.get("tilePrefix") or tile_prefix)
        if "tileWidth" in data:
            try:
                tile_width = int(data.get("tileWidth"))
            except Exception:
                pass
        if "tileHeight" in data:
            try:
                tile_height = int(data.get("tileHeight"))
            except Exception:
                pass
        if "fitMode" in data:
            fit_mode = str(data.get("fitMode") or fit_mode).strip().lower()
        if "outputDir" in data:
            output_dir = str(data.get("outputDir") or output_dir).strip()
        if "outputNamePrefix" in data:
            output_name_prefix = str(data.get("outputNamePrefix") or output_name_prefix).strip()
        if "outputPath" in data:
            output_path = str(data.get("outputPath") or output_path).strip()
        if "tileOutlineColor" in data:
            tile_outline_color = str(data.get("tileOutlineColor") or tile_outline_color).strip()
        if "tileOutlineWidth" in data:
            try:
                tile_outline_width = int(data.get("tileOutlineWidth"))
            except Exception:
                pass

    if columns < 1:
        columns = 1
    if max_longest_edge < 1:
        max_longest_edge = 1
    if padding < 0:
        padding = 0

    tile_prefix = tile_prefix.strip() or "SHOT"
    if tile_width is not None and tile_width < 1:
        tile_width = None
    if tile_height is not None and tile_height < 1:
        tile_height = None
    if fit_mode not in ("contain", "cover"):
        fit_mode = "contain"
    output_name_prefix = output_name_prefix or "grid_overview"
    output_path = output_path.strip()
    if tile_outline_width < 0:
        tile_outline_width = 0

    return (
        columns,
        max_longest_edge,
        background_color,
        padding,
        add_labels,
        text_color,
        tile_prefix,
        tile_width,
        tile_height,
        fit_mode,
        output_dir,
        output_name_prefix,
        output_path,
        tile_outline_color,
        tile_outline_width,
    )


def _load_font(size: int):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except Exception:
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size)
        except Exception:
            return ImageFont.load_default()


def _normalize_items(paths, data):
    items = []
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        source = data.get("items")
        for idx, item in enumerate(source):
            if isinstance(item, dict):
                path = str(item.get("path") or "").strip()
                label = str(item.get("label") or f"SHOT {idx + 1}")
            else:
                path = str(item or "").strip()
                label = f"SHOT {idx + 1}"
            items.append({"path": path, "label": label})
    else:
        source = paths if isinstance(paths, list) else []
        for idx, item in enumerate(source):
            path = str(item or "").strip()
            items.append({"path": path, "label": f"SHOT {idx + 1}"})
    return items


def _fit_to_tile(src, tile_w, tile_h, fit_mode):
    if fit_mode == "cover":
        scale = max(tile_w / src.width, tile_h / src.height)
    else:
        scale = min(tile_w / src.width, tile_h / src.height)
    new_w = max(1, int(round(src.width * scale)))
    new_h = max(1, int(round(src.height * scale)))
    resized = src.resize((new_w, new_h), Image.LANCZOS)
    out = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    x = (tile_w - new_w) // 2
    y = (tile_h - new_h) // 2
    out.paste(resized, (x, y), resized)
    return out


def create_image_grid(paths, report_progress=None, data=None):
    """
    Creates a grid of images with a fixed total width, configurable background, and padding.
    - Images are scaled down proportionally to fit in their cell.
    - The height of the output image is dynamic based on the number of rows.
    - The output PNG is saved in the same folder as the input images.
    """
    columns, max_longest_edge, background_color, padding, add_labels, text_color, tile_prefix, tile_width, tile_height, fit_mode, output_dir, output_name_prefix, output_path, tile_outline_color, tile_outline_width = _parse_settings(data)
    items = _normalize_items(paths, data)
    if not items:
        return "No images provided."

    total_width = max_longest_edge
    bg_rgba = _parse_hex_color(background_color, fallback=(255, 255, 255, 255))
    text_rgba = _parse_hex_color(text_color, fallback=(0, 0, 0, 255))
    outline_rgba = _parse_hex_color(tile_outline_color, fallback=(80, 121, 165, 255))

    if tile_width and tile_height:
        cell_width = tile_width
        row_heights = []
        tiles = []
        row_count = (len(items) + columns - 1) // columns
        row_heights = [tile_height] * row_count
        total_width = padding + columns * (cell_width + padding)
        total_height = padding + row_count * (tile_height + padding)
    else:
        sorted_items = sorted(items, key=lambda p: _natural_key(os.path.basename(p.get("path", ""))))
        items = sorted_items
        cell_width = (total_width - (columns + 1) * padding) // columns
        if cell_width < 1:
            return "Grid settings too small for the selected padding/columns."
        row_heights = []
        tiles = []

    for i, item in enumerate(items):
        path = item["path"]
        label_text = item["label"] if item["label"] else f"{tile_prefix} {i + 1}"
        tile = None
        if path:
            try:
                img = Image.open(path).convert("RGBA")
                if tile_width and tile_height:
                    tile = _fit_to_tile(img, tile_width, tile_height, fit_mode)
                else:
                    ratio = img.width / img.height
                    new_width = cell_width
                    new_height = max(1, int(cell_width / ratio))
                    tile = img.resize((new_width, new_height), Image.LANCZOS)
            except Exception as e:
                print(f"Failed to open image {path}: {e}")
                tile = None

        if tile is None:
            fallback_h = tile_height if tile_height else cell_width
            tile = Image.new("RGBA", (cell_width, fallback_h), (0, 0, 0, 0))

        if add_labels:
            draw = ImageDraw.Draw(tile)
            font_size = max(12, int(min(tile.width, tile.height) * 0.06))
            font = _load_font(font_size)
            try:
                bbox = draw.textbbox((0, 0), label_text, font=font)
                text_w = bbox[2] - bbox[0]
                text_h = bbox[3] - bbox[1]
            except Exception:
                text_w, text_h = draw.textsize(label_text, font=font)
            margin = max(6, int(font_size * 0.3))
            x = margin
            y = max(0, tile.height - text_h - margin)
            # subtle backdrop for readability on bright images
            draw.rectangle((x - 4, y - 2, x + text_w + 4, y + text_h + 2), fill=(0, 0, 0, 80))
            draw.text((x, y), label_text, font=font, fill=text_rgba)

        if tile_outline_width > 0:
            draw = ImageDraw.Draw(tile)
            inset = max(0, tile_outline_width // 2)
            draw.rectangle(
                (inset, inset, max(inset, tile.width - 1 - inset), max(inset, tile.height - 1 - inset)),
                outline=outline_rgba,
                width=tile_outline_width,
            )

        tiles.append(tile)

    if not tiles:
        return "No valid images to process."

    if not (tile_width and tile_height):
        row_tiles = []
        for idx, tile in enumerate(tiles):
            row_tiles.append(tile)
            if (idx + 1) % columns == 0 or idx == len(tiles) - 1:
                row_heights.append(max(im.height for im in row_tiles))
                row_tiles = []
        total_height = padding * (len(row_heights) + 1) + sum(row_heights)

    grid_img = Image.new("RGBA", (total_width, total_height), bg_rgba)

    x = padding
    y = padding
    current_row = 0
    for i, tile in enumerate(tiles):
        row_height = row_heights[current_row]
        y_offset = (row_height - tile.height) // 2
        grid_img.paste(tile, (x, y + y_offset), tile)
        x += cell_width + padding
        if (i + 1) % columns == 0:
            y += row_height + padding
            x = padding
            current_row += 1

    if output_path:
        final_output_path = output_path
        if not final_output_path.lower().endswith(".png"):
            final_output_path = f"{final_output_path}.png"
        os.makedirs(os.path.dirname(final_output_path) or ".", exist_ok=True)
    else:
        first_path = next((it["path"] for it in items if it.get("path")), "")
        base_folder = output_dir or (os.path.dirname(first_path) if first_path else os.getcwd())
        os.makedirs(base_folder, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_prefix = re.sub(r"[^a-zA-Z0-9._-]+", "_", output_name_prefix).strip("_") or "grid_overview"
        output_filename = f"{safe_prefix}_{timestamp}.png"
        final_output_path = os.path.join(base_folder, output_filename)

    grid_img.save(final_output_path)

    return f"Grid image saved to: {final_output_path}"
