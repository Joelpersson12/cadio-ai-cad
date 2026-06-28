"""STL import helpers for source-first model generation."""

from __future__ import annotations

import io
import re
import struct
import zipfile
from urllib.request import Request, urlopen

from backend.services.cad_engine import TriMesh, shift_mesh_to_buildplate


MAX_STL_BYTES = 32 * 1024 * 1024
# A zip can hold several meshes compressed small; allow a larger download but
# still bound extracted-member size to MAX_STL_BYTES.
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024


def _fetch_bytes(url: str, timeout: float = 25.0, retries: int = 2, max_bytes: int = MAX_STL_BYTES) -> bytes:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.printables.com/",
    }
    last_exc: Exception = RuntimeError("no attempts")
    for attempt in range(max(1, retries)):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=timeout) as res:
                content_length = res.headers.get("content-length")
                if content_length and int(content_length) > max_bytes:
                    raise ValueError("file is too large for interactive import")
                data = res.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ValueError("file is too large for interactive import")
            return data
        except ValueError:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                import time as _time
                _time.sleep(1.5)
    raise last_exc


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


def _parse_obj(data: bytes) -> TriMesh | None:
    """Parse a Wavefront OBJ mesh (vertices + faces, triangulated as fans)."""
    try:
        text = data.decode("utf-8", errors="ignore")
    except Exception:
        return None
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for line in text.splitlines():
        if not line or line[0] not in "vf":
            continue
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v" and len(parts) >= 4:
            try:
                verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
            except ValueError:
                continue
        elif parts[0] == "f" and len(parts) >= 4:
            idxs: list[int] = []
            for token in parts[1:]:
                raw = token.split("/", 1)[0]
                if not raw:
                    continue
                try:
                    vi = int(raw)
                except ValueError:
                    continue
                # OBJ indices are 1-based; negatives count from the end.
                idxs.append(vi - 1 if vi > 0 else len(verts) + vi)
            if len(idxs) >= 3:
                faces.append(idxs)
    if len(verts) < 3 or not faces:
        return None

    mesh = TriMesh()
    index_map: dict[int, int] = {}

    def _local(obj_index: int) -> int | None:
        if obj_index < 0 or obj_index >= len(verts):
            return None
        existing = index_map.get(obj_index)
        if existing is not None:
            return existing
        new_index = mesh.add_vertex(verts[obj_index])
        index_map[obj_index] = new_index
        return new_index

    for face in faces:
        local = [_local(i) for i in face]
        local = [i for i in local if i is not None]
        if len(local) < 3:
            continue
        for k in range(1, len(local) - 1):
            mesh.add_tri(local[0], local[k], local[k + 1])
    if not mesh.verts or not mesh.tris:
        return None
    return mesh


def _parse_mesh_bytes(data: bytes, name: str = "") -> TriMesh | None:
    """Parse raw bytes into a TriMesh, sniffing STL (binary/ascii) and OBJ."""
    lower = name.lower()
    if lower.endswith(".obj"):
        return _parse_obj(data)
    # STL first (covers the common case and binary sniffing), then OBJ fallback.
    return _parse_binary_stl(data) or _parse_ascii_stl(data) or _parse_obj(data)


def _extract_mesh_from_zip(data: bytes) -> TriMesh | None:
    """Pick the largest STL/OBJ member of a zip archive and parse it.

    Thingiverse (and others) frequently deliver a model's files as a single
    ``.zip``. We import the biggest mesh member as the representative body.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except Exception:
        return None
    candidates = [
        info
        for info in archive.infolist()
        if not info.is_dir()
        and info.filename.lower().rsplit(".", 1)[-1] in ("stl", "obj")
        and info.file_size <= MAX_STL_BYTES
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda info: info.file_size, reverse=True)
    for info in candidates:
        try:
            member = archive.read(info)
        except Exception:
            continue
        mesh = _parse_mesh_bytes(member, info.filename)
        if mesh is not None and mesh.verts and mesh.tris:
            return mesh
    return None


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


def _flip_depth_axis(mesh: TriMesh) -> TriMesh:
    """Negate the depth (Y) axis of a mesh.

    The viewport converts Z-up backend coordinates to Three.js' Y-up frame by
    swapping the Y and Z axes.  Swapping two axes is a *reflection* (it mirrors
    the model front-to-back), which is invisible on roughly symmetric parts but
    makes embossed / engraved text on imported models render backwards.

    Pre-negating depth here turns the net viewport transform from a reflection
    into a proper -90° rotation about X, so imported geometry — including text —
    is shown the right way round without flipping the model upside down.
    """
    flipped = TriMesh()
    flipped.verts = [(x, -y, z) for x, y, z in mesh.verts]
    flipped.tris = list(mesh.tris)
    return flipped


def _finalize_mesh(
    mesh: TriMesh | None,
    *,
    prefer_flat: bool,
    center_xy: bool,
    shift_to_plate: bool,
) -> TriMesh | None:
    if mesh is None or not mesh.verts or not mesh.tris:
        return None
    if prefer_flat:
        # The reorientation here is itself a reflection, which already
        # cancels the viewport's Y/Z swap — leave it as the single flip.
        mesh = _orient_smallest_axis_to_z(mesh)
    else:
        # Cancel the viewport's reflective Y/Z swap so imported text and
        # asymmetric detail render the right way round (not mirrored).
        mesh = _flip_depth_axis(mesh)
    if center_xy:
        mesh = _center_xy(mesh)
    if shift_to_plate:
        mesh = shift_mesh_to_buildplate(mesh)
    return mesh


def _looks_like_zip(url: str, data: bytes) -> bool:
    return url.lower().split("?", 1)[0].endswith(".zip") or data[:4] == b"PK\x03\x04"


def import_mesh_from_bytes(
    data: bytes,
    *,
    file_name: str = "",
    prefer_flat: bool = False,
    center_xy: bool = True,
    shift_to_plate: bool = True,
) -> TriMesh | None:
    """Parse already-downloaded mesh bytes (STL, OBJ, or a ZIP of them) into a
    TriMesh. Used for local files the user drags into the workspace."""
    if not data:
        return None
    name = file_name or ""
    try:
        if _looks_like_zip(name, data) or name.lower().endswith(".zip"):
            mesh = _extract_mesh_from_zip(data)
        else:
            mesh = _parse_mesh_bytes(data, name)
        return _finalize_mesh(
            mesh,
            prefer_flat=prefer_flat,
            center_xy=center_xy,
            shift_to_plate=shift_to_plate,
        )
    except Exception:
        return None


def import_mesh_from_url(
    url: str,
    *,
    file_name: str = "",
    prefer_flat: bool = False,
    center_xy: bool = True,
    shift_to_plate: bool = True,
) -> TriMesh | None:
    """Fetch and parse a mesh URL (STL, OBJ, or a ZIP of them) into a TriMesh.

    Generalizes the original STL-only importer so models from sources that
    deliver OBJ files or zipped archives (e.g. Thingiverse) import as real
    geometry rather than failing.
    """
    if not url:
        return None
    name = file_name or url.split("?", 1)[0]
    try:
        is_zip_name = name.lower().rsplit(".", 1)[-1] == "zip" or url.lower().split("?", 1)[0].endswith(".zip")
        data = _fetch_bytes(url, max_bytes=MAX_ARCHIVE_BYTES if is_zip_name else MAX_STL_BYTES)
        if _looks_like_zip(url, data) or (name.lower().endswith(".zip")):
            mesh = _extract_mesh_from_zip(data)
        else:
            mesh = _parse_mesh_bytes(data, name)
        return _finalize_mesh(
            mesh,
            prefer_flat=prefer_flat,
            center_xy=center_xy,
            shift_to_plate=shift_to_plate,
        )
    except Exception:
        return None


def import_stl_from_url(
    url: str,
    *,
    prefer_flat: bool = False,
    center_xy: bool = True,
    shift_to_plate: bool = True,
) -> TriMesh | None:
    """Backwards-compatible STL importer (delegates to import_mesh_from_url)."""
    return import_mesh_from_url(
        url,
        prefer_flat=prefer_flat,
        center_xy=center_xy,
        shift_to_plate=shift_to_plate,
    )
