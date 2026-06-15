"""Image/Logo to 3D mesh generation.

The browser sends a compact threshold mask so the backend avoids native image
dependencies while still producing real printable geometry.
"""

from __future__ import annotations

import base64
import json
import math
import re
from dataclasses import dataclass
from typing import Any

from backend.services.cad_engine import TriMesh, shift_mesh_to_buildplate

MAX_MASK_CELLS = 120 * 120


class ImageTo3DError(ValueError):
    """Friendly image-to-3D failure suitable for API responses."""


@dataclass
class ImageModelResult:
    mesh: TriMesh
    parameters: dict[str, float]
    actions: list[str]


def _parse_mm(prompt: str, words: tuple[str, ...], default: float) -> float:
    text = (prompt or "").lower()
    for word in words:
        match = re.search(rf"(\d+(?:[.,]\d+)?)\s*mm\s*(?:{word})", text)
        if match:
            return float(match.group(1).replace(",", "."))
        match = re.search(rf"(?:{word}).{{0,16}}?(\d+(?:[.,]\d+)?)\s*mm", text)
        if match:
            return float(match.group(1).replace(",", "."))
    return default


def _decode_mask(image: str | None) -> dict[str, Any]:
    if not image:
        raise ImageTo3DError("Upload an image first.")
    try:
        payload = image.split(",", 1)[1] if "," in image else image
        raw = base64.b64decode(payload, validate=True)
        data = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise ImageTo3DError("We could not read this image. Try PNG, JPG, WEBP or SVG.") from exc

    width = int(data.get("width", 0))
    height = int(data.get("height", 0))
    pixels = data.get("pixels")
    if width <= 0 or height <= 0 or width * height > MAX_MASK_CELLS or not isinstance(pixels, list):
        raise ImageTo3DError("This image is too large to process safely.")
    if len(pixels) != width * height:
        raise ImageTo3DError("This image mask is invalid. Try uploading it again.")
    return {"width": width, "height": height, "pixels": [1 if v else 0 for v in pixels]}


def _crop_mask(width: int, height: int, pixels: list[int]) -> tuple[int, int, list[int]]:
    active = [(i % width, i // width) for i, v in enumerate(pixels) if v]
    if not active:
        raise ImageTo3DError(
            "We could not detect a clean shape in this image. Try a simpler logo or higher contrast image."
        )
    min_x = min(x for x, _ in active)
    max_x = max(x for x, _ in active)
    min_y = min(y for _, y in active)
    max_y = max(y for _, y in active)
    cropped_w = max_x - min_x + 1
    cropped_h = max_y - min_y + 1
    cropped: list[int] = []
    for y in range(min_y, max_y + 1):
        start = y * width + min_x
        cropped.extend(pixels[start : start + cropped_w])
    return cropped_w, cropped_h, cropped


def _border_active_ratio(width: int, height: int, pixels: list[int]) -> float:
    if width <= 0 or height <= 0:
        return 0.0
    total = 0
    active = 0
    for y in range(height):
        for x in range(width):
            if x not in {0, width - 1} and y not in {0, height - 1}:
                continue
            total += 1
            active += pixels[y * width + x]
    return active / max(total, 1)


def _normalize_foreground_mask(width: int, height: int, pixels: list[int]) -> list[int]:
    active = sum(pixels)
    total = max(width * height, 1)
    border_ratio = _border_active_ratio(width, height, pixels)
    if active / total > 0.42 and border_ratio > 0.62:
        inverted = [0 if value else 1 for value in pixels]
        inverted_active = sum(inverted)
        if 4 <= inverted_active <= total * 0.72:
            return inverted
    return pixels


def _apply_keychain_hole(width: int, height: int, pixels: list[int]) -> None:
    radius = max(2.5, min(width, height) * 0.055)
    cx = width * 0.5
    cy = max(radius + 1.0, height * 0.12)
    for y in range(height):
        for x in range(width):
            if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius:
                pixels[y * width + x] = 0


def _mask_to_mesh(width: int, height: int, pixels: list[int], target_width: float, thickness: float) -> TriMesh:
    active_count = sum(pixels)
    if active_count < 4:
        raise ImageTo3DError(
            "We could not detect enough solid area. Try a higher contrast logo or silhouette."
        )
    if active_count > MAX_MASK_CELLS * 0.72:
        raise ImageTo3DError(
            "This image is too complex. Try a simpler logo, icon or silhouette."
        )

    cell = target_width / max(width, 1)
    total_depth = height * cell
    mesh = TriMesh()

    def is_active(x: int, y: int) -> bool:
        return 0 <= x < width and 0 <= y < height and bool(pixels[y * width + x])

    for y in range(height):
        for x in range(width):
            if not is_active(x, y):
                continue
            x0 = (x * cell) - target_width / 2.0
            x1 = x0 + cell
            y0 = total_depth / 2.0 - ((y + 1) * cell)
            y1 = y0 + cell
            z0 = 0.0
            z1 = thickness

            b0 = mesh.add_vertex((x0, y0, z0))
            b1 = mesh.add_vertex((x1, y0, z0))
            b2 = mesh.add_vertex((x1, y1, z0))
            b3 = mesh.add_vertex((x0, y1, z0))
            t0 = mesh.add_vertex((x0, y0, z1))
            t1 = mesh.add_vertex((x1, y0, z1))
            t2 = mesh.add_vertex((x1, y1, z1))
            t3 = mesh.add_vertex((x0, y1, z1))

            mesh.add_quad(b0, b3, b2, b1)
            mesh.add_quad(t0, t1, t2, t3)
            if not is_active(x, y + 1):
                mesh.add_quad(b0, b1, t1, t0)
            if not is_active(x, y - 1):
                mesh.add_quad(b3, t3, t2, b2)
            if not is_active(x - 1, y):
                mesh.add_quad(b0, t0, t3, b3)
            if not is_active(x + 1, y):
                mesh.add_quad(b1, b2, t2, t1)

    return shift_mesh_to_buildplate(mesh)


def build_image_model(
    image: str | None,
    prompt: str = "",
    image_name: str = "uploaded image",
) -> ImageModelResult:
    mask = _decode_mask(image)
    pixels = _normalize_foreground_mask(mask["width"], mask["height"], mask["pixels"])
    width, height, pixels = _crop_mask(mask["width"], mask["height"], pixels)

    text = (prompt or "").lower()
    target_width = max(20.0, min(220.0, _parse_mm(text, ("wide", "width", "bred", "bredd"), 100.0)))
    thickness = max(1.0, min(20.0, _parse_mm(text, ("thick", "thickness", "tjock", "tjocklek"), 4.0)))
    keychain = any(word in text for word in ("keychain", "nyckelring", "key ring"))
    if keychain:
        _apply_keychain_hole(width, height, pixels)

    mesh = _mask_to_mesh(width, height, pixels, target_width, thickness)
    depth = target_width * (height / max(width, 1))
    actions = [
        f"image-to-3d: extruded {image_name or 'uploaded image'}",
        "best for logos, icons, silhouettes and simple 2D shapes",
    ]
    if keychain:
        actions.append("added keychain hole")

    return ImageModelResult(
        mesh=mesh,
        parameters={
            "width": target_width,
            "depth": depth,
            "height": thickness,
            "thickness": thickness,
            "image_mask_width": float(width),
            "image_mask_height": float(height),
            "hole_count": 1.0 if keychain else 0.0,
        },
        actions=actions,
    )
