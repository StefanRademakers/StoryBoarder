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

    if columns < 1:
        columns = 1
    if max_longest_edge < 1:
        max_longest_edge = 1
    if padding < 0:
        padding = 0

    tile_prefix = tile_prefix.strip() or "SHOT"

    return columns, max_longest_edge, background_color, padding, add_labels, text_color, tile_prefix


def _load_font(size: int):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except Exception:
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size)
        except Exception:
            return ImageFont.load_default()


def create_image_grid(paths, report_progress=None, data=None):
    """
    Creates a grid of images with a fixed total width, configurable background, and padding.
    - Images are scaled down proportionally to fit in their cell.
    - The height of the output image is dynamic based on the number of rows.
    - The output PNG is saved in the same folder as the input images.
    """
    if not paths:
        return "No images provided."

    columns, max_longest_edge, background_color, padding, add_labels, text_color, tile_prefix = _parse_settings(data)
    total_width = max_longest_edge
    bg_rgba = _parse_hex_color(background_color, fallback=(255, 255, 255, 255))
    text_rgba = _parse_hex_color(text_color, fallback=(0, 0, 0, 255))

    sorted_paths = sorted(paths, key=lambda p: _natural_key(os.path.basename(p)))

    images = []
    for path in sorted_paths:
        try:
            img = Image.open(path).convert("RGBA")
            images.append(img)
        except Exception as e:
            print(f"Failed to open image {path}: {e}")

    if not images:
        return "No valid images to process."

    cell_width = (total_width - (columns + 1) * padding) // columns
    if cell_width < 1:
        return "Grid settings too small for the selected padding/columns."

    resized_images = []
    row_images = []
    max_heights_per_row = []

    for i, img in enumerate(images):
        ratio = img.width / img.height
        new_width = cell_width
        new_height = max(1, int(cell_width / ratio))
        resized = img.resize((new_width, new_height), Image.LANCZOS)
        if add_labels:
            draw = ImageDraw.Draw(resized)
            font_size = max(12, int(min(resized.width, resized.height) * 0.06))
            font = _load_font(font_size)
            label = f"{tile_prefix} {i + 1}"
            try:
                bbox = draw.textbbox((0, 0), label, font=font)
                text_w = bbox[2] - bbox[0]
                text_h = bbox[3] - bbox[1]
            except Exception:
                text_w, text_h = draw.textsize(label, font=font)
            margin = max(6, int(font_size * 0.3))
            x = margin
            y = max(0, resized.height - text_h - margin)
            draw.text((x, y), label, font=font, fill=text_rgba)
        row_images.append(resized)

        if (i + 1) % columns == 0 or i == len(images) - 1:
            max_height = max(im.height for im in row_images)
            max_heights_per_row.append(max_height)
            resized_images.extend(row_images)
            row_images = []

    total_height = padding * (len(max_heights_per_row) + 1) + sum(max_heights_per_row)

    grid_img = Image.new("RGBA", (total_width, total_height), bg_rgba)

    x = padding
    y = padding
    current_row = 0
    for i, img in enumerate(resized_images):
        grid_img.paste(img, (x, y), img)
        x += img.width + padding
        if (i + 1) % columns == 0:
            y += max_heights_per_row[current_row] + padding
            x = padding
            current_row += 1

    base_folder = os.path.dirname(sorted_paths[0])
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"grid_overview_{timestamp}.png"
    output_path = os.path.join(base_folder, output_filename)
    grid_img.save(output_path)

    return f"Grid image saved to: {output_path}"
