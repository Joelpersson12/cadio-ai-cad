"""STL import helpers for source-first model generation."""

from __future__ import annotations

import re
import struct
from urllib.request import Request, urlopen

from backend.services.cad_engine import TriMesh, shift_mesh_to_buildplate


MAX_STL_BYTES = 16 * 1024 * 1024


def _fetch_bytes(url: str, timeout: float = 12.0) -> bytes:
    req = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; CadioBot/1.0; "
                "+https://cadio-ai-cad-production.up.railway.app)"
            )
        },
    )
    with urlopen(req, timeout=timeout) as res:
        content_length = res.headers.get("content-length")
        if content_length and int(content_length) > MAX_STL_BYTES:
            raise ValueError("STL is too large for interactive import")
        data = res.read(MAX_STL_BYTES + 1)
    if len(data) > MAX_STL_BYTES:
        raise ValueError("STL is too large for interactive import")
    return data


def _add_deduped_vertex(mesh: TriMesh, index: dict[tuple[int, int, int], int], vertex: tuple[float, float, float]) -> int:
    key = (round(vertex[0] * 10000), round(vertex[1] * 10000), round(vertex[2] * 10000))
    existing = index.get(key)
    if existing is not None:
        return existing
    idx = mesh.add_vertex(vertex)
    index[key] = idx
    return idx


def _parse_binary_stl(data: bytes) -> TriMesh | None:
    if len(data) < 84:
        return None
    tri_count = struct.unpack_from("<I", data, 80)[0]
    expected = 84 + tri_count * 50
    if expected > len(data) or tri_count <= 0:
        return None

    mesh = TriMesh()
    vertex_index: dict[tuple[int, int, int], int] = {}
    offset = 84
    for _ in range(tri_count):
        offset += 12  # normal
        vertices = []
        for _vertex in range(3):
            x, y, z = struct.unpack_from("<fff", data, offset)
            offset += 12
            vertices.append(_add_deduped_vertex(mesh, vertex_index, (float(x), float(y), float(z))))
        offset += 2
        mesh.add_tri(vertices[0], vertices[1], vertices[2])
    return mesh


def _parse_ascii_stl(data: bytes) -> TriMesh | None:
    try:
        text = data.decode("utf-8", errors="ignore")
    except Exception:
        return None
    matches = re.findall(
        r"vertex\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)",
        text,
        re.I,
    )
    if len(matches) < 3:
        return None

    mesh = TriMesh()
    vertex_index: dict[tuple[int, int, int], int] = {}
    tri_vertices: list[int] = []
    for x, y, z in matches:
        tri_vertices.append(_add_deduped_vertex(mesh, vertex_index, (float(x), float(y), float(z))))
        if len(tri_vertices) == 3:
            mesh.add_tri(tri_vertices[0], tri_vertices[1], tri_vertices[2])
            tri_vertices = []
    return mesh


def _center_xy(mesh: TriMesh) -> TriMesh:
    if not mesh.verts:
        return mesh
    xs = [vertex[0] for vertex in mesh.verts]
    ys = [vertex[1] for vertex in mesh.verts]
    cx = (min(xs) + max(xs)) / 2.0
    cy = (min(ys) + max(ys)) / 2.0
    centered = TriMesh()
    centered.verts = [(x - cx, y - cy, z) for x, y, z in mesh.verts]
    centered.tris = list(mesh.tris)
    return centered


def _bounds(mesh: TriMesh) -> tuple[float, float, float]:
    if not mesh.verts:
        return (0.0, 0.0, 0.0)
    xs = [vertex[0] for vertex in mesh.verts]
    ys = [vertex[1] for vertex in mesh.verts]
    zs = [vertex[2] for vertex in mesh.verts]
    return (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))


def _orient_smallest_axis_to_z(mesh: TriMesh) -> TriMesh:
    sx, sy, sz = _bounds(mesh)
    smallest = min((sx, "x"), (sy, "y"), (sz, "z"))[1]
    if smallest == "z" or sz <= min(sx, sy) * 1.35:
        return mesh

    oriented = TriMesh()
    if smallest == "y":
        oriented.verts = [(x, z, y) for x, y, z in mesh.verts]
    else:
        oriented.verts = [(y, z, x) for x, y, z in mesh.verts]
    oriented.tris = list(mesh.tris)
    return oriented


def import_stl_from_url(url: str, *, prefer_flat: bool = False) -> TriMesh | None:
    """Fetch and parse an STL URL into Cadio's TriMesh format."""
    if not url.lower().endswith(".stl"):
        return None
    try:
        data = _fetch_bytes(url)
        mesh = _parse_binary_stl(data) or _parse_ascii_stl(data)
        if mesh is None or not mesh.verts or not mesh.tris:
            return None
        if prefer_flat:
            mesh = _orient_smallest_axis_to_z(mesh)
        return shift_mesh_to_buildplate(_center_xy(mesh))
    except Exception:
        return None
