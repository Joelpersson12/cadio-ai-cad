"""Pure-Python CAD geometry engine -- no OCP / OpenCascade / libGL required.

Generates real triangle-mesh geometry (vertices + indices) for parametric
models using only the Python standard library and basic math.  Produces
the same MeshPayload the frontend expects and can export binary STL.
"""

from __future__ import annotations

import math
import struct
from typing import Any

from backend.models.schema import Feature, MeshPayload, Transform

# ---------------------------------------------------------------------------
# Low-level mesh helpers
# ---------------------------------------------------------------------------

Vec3 = tuple[float, float, float]


def _add(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _scale(v: Vec3, s: float) -> Vec3:
    return (v[0] * s, v[1] * s, v[2] * s)


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _norm(v: Vec3) -> float:
    return math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)


def _normalize(v: Vec3) -> Vec3:
    n = _norm(v)
    if n < 1e-12:
        return (0.0, 0.0, 1.0)
    return (v[0] / n, v[1] / n, v[2] / n)


class TriMesh:
    """Simple triangle mesh: list of vertices + triangle index triples."""

    __slots__ = ("verts", "tris")

    def __init__(self) -> None:
        self.verts: list[Vec3] = []
        self.tris: list[tuple[int, int, int]] = []

    def add_vertex(self, v: Vec3) -> int:
        idx = len(self.verts)
        self.verts.append(v)
        return idx

    def add_tri(self, a: int, b: int, c: int) -> None:
        self.tris.append((a, b, c))

    def add_quad(self, a: int, b: int, c: int, d: int) -> None:
        """Add two triangles forming a quad (a-b-c-d CCW)."""
        self.tris.append((a, b, c))
        self.tris.append((a, c, d))

    def merge(self, other: "TriMesh") -> "TriMesh":
        """Return a new mesh combining self and other."""
        result = TriMesh()
        result.verts = list(self.verts) + list(other.verts)
        result.tris = list(self.tris)
        offset = len(self.verts)
        for a, b, c in other.tris:
            result.tris.append((a + offset, b + offset, c + offset))
        return result

    def to_payload(self) -> MeshPayload:
        positions: list[float] = []
        indices: list[int] = []
        for v in self.verts:
            positions.extend(v)
        for a, b, c in self.tris:
            indices.extend([a, b, c])
        return MeshPayload(positions=positions, indices=indices)

    def transformed(self, transform: Transform) -> "TriMesh":
        """Return a copy with position/rotation/scale applied."""
        result = TriMesh()
        sx, sy, sz = (float(v) for v in transform.scale)
        rx, ry, rz = (math.radians(float(v) % 360.0) for v in transform.rotation)
        px, py, pz = (float(v) for v in transform.position)

        for vx, vy, vz in self.verts:
            # Scale
            x, y, z = vx * sx, vy * sy, vz * sz
            # Rotate X
            if abs(rx) > 1e-6:
                cos_a, sin_a = math.cos(rx), math.sin(rx)
                y, z = cos_a * y - sin_a * z, sin_a * y + cos_a * z
            # Rotate Y
            if abs(ry) > 1e-6:
                cos_a, sin_a = math.cos(ry), math.sin(ry)
                x, z = cos_a * x + sin_a * z, -sin_a * x + cos_a * z
            # Rotate Z
            if abs(rz) > 1e-6:
                cos_a, sin_a = math.cos(rz), math.sin(rz)
                x, y = cos_a * x - sin_a * y, sin_a * x + cos_a * y
            # Translate
            result.verts.append((x + px, y + py, z + pz))

        result.tris = list(self.tris)
        return result

    def to_binary_stl(self) -> bytes:
        """Export as binary STL bytes."""
        num_tris = len(self.tris)
        buf = bytearray(80)  # header
        buf += struct.pack("<I", num_tris)
        for a, b, c in self.tris:
            va, vb, vc = self.verts[a], self.verts[b], self.verts[c]
            normal = _normalize(_cross(_sub(vb, va), _sub(vc, va)))
            buf += struct.pack("<fff", *normal)
            buf += struct.pack("<fff", *va)
            buf += struct.pack("<fff", *vb)
            buf += struct.pack("<fff", *vc)
            buf += struct.pack("<H", 0)  # attribute byte count
        return bytes(buf)


# ---------------------------------------------------------------------------
# Primitive builders
# ---------------------------------------------------------------------------

_CYL_SEGMENTS = 24


def make_box(width: float, depth: float, height: float) -> TriMesh:
    """Create a centered box mesh."""
    m = TriMesh()
    hw, hd, hh = width / 2, depth / 2, height / 2
    # 8 corners
    corners = [
        (-hw, -hd, -hh),
        (hw, -hd, -hh),
        (hw, hd, -hh),
        (-hw, hd, -hh),
        (-hw, -hd, hh),
        (hw, -hd, hh),
        (hw, hd, hh),
        (-hw, hd, hh),
    ]
    idxs = [m.add_vertex(c) for c in corners]
    # 6 faces (CCW from outside)
    faces = [
        (0, 3, 2, 1),  # bottom
        (4, 5, 6, 7),  # top
        (0, 1, 5, 4),  # front
        (2, 3, 7, 6),  # back
        (1, 2, 6, 5),  # right
        (3, 0, 4, 7),  # left
    ]
    for a, b, c, d in faces:
        m.add_quad(idxs[a], idxs[b], idxs[c], idxs[d])
    return m


def make_cylinder(
    radius: float,
    height: float,
    origin: Vec3 = (0, 0, 0),
    segments: int = _CYL_SEGMENTS,
) -> TriMesh:
    """Create a cylinder mesh centered at origin, extending along Z."""
    m = TriMesh()
    ox, oy, oz = origin
    bottom_center = m.add_vertex((ox, oy, oz))
    top_center = m.add_vertex((ox, oy, oz + height))

    bottom_ring: list[int] = []
    top_ring: list[int] = []
    for i in range(segments):
        angle = 2.0 * math.pi * i / segments
        x = ox + radius * math.cos(angle)
        y = oy + radius * math.sin(angle)
        bottom_ring.append(m.add_vertex((x, y, oz)))
        top_ring.append(m.add_vertex((x, y, oz + height)))

    for i in range(segments):
        j = (i + 1) % segments
        # Bottom fan
        m.add_tri(bottom_center, bottom_ring[j], bottom_ring[i])
        # Top fan
        m.add_tri(top_center, top_ring[i], top_ring[j])
        # Side quad
        m.add_quad(bottom_ring[i], bottom_ring[j], top_ring[j], top_ring[i])

    return m


# ---------------------------------------------------------------------------
# Bounding box
# ---------------------------------------------------------------------------


def bounding_box(mesh: TriMesh) -> dict[str, float]:
    if not mesh.verts:
        return {"x": 0.0, "y": 0.0, "z": 0.0}
    xs = [v[0] for v in mesh.verts]
    ys = [v[1] for v in mesh.verts]
    zs = [v[2] for v in mesh.verts]
    return {
        "x": max(xs) - min(xs),
        "y": max(ys) - min(ys),
        "z": max(zs) - min(zs),
    }


# ---------------------------------------------------------------------------
# Tessellate (identity -- mesh is already tessellated)
# ---------------------------------------------------------------------------


def tessellate(mesh: TriMesh) -> MeshPayload:
    return mesh.to_payload()


def apply_transform(mesh: TriMesh, transform: Transform) -> TriMesh:
    return mesh.transformed(transform)


# ---------------------------------------------------------------------------
# Feature-tree based geometry rebuild
# ---------------------------------------------------------------------------

DEFAULT_PARAMETERS: dict[str, float] = {
    "width": 80.0,
    "depth": 70.0,
    "height": 120.0,
    "thickness": 8.0,
    "angle": 70.0,
    "fillet_radius": 2.0,
    "hole_count": 0.0,
    "hole_diameter": 5.0,
    "wall_thickness": 3.0,
    "chamfer_size": 0.0,
}

DEFAULT_FEATURE_TREE: list[dict[str, Any]] = [
    {"id": "base_extrude", "type": "base_extrude", "enabled": True},
    {"id": "back_support", "type": "back_support", "enabled": True},
    {"id": "fillet_edges", "type": "fillet_edges", "enabled": False},
    {"id": "chamfer_edges", "type": "chamfer_edges", "enabled": False},
    {"id": "mount_holes", "type": "mount_holes", "enabled": False},
    {"id": "mirror", "type": "mirror", "enabled": False},
]


def rebuild_from_features(
    params: dict[str, float],
    feature_tree: list[Feature],
) -> TriMesh:
    """Rebuild a parametric phone-stand model from parameters + feature tree."""
    width = max(10.0, params.get("width", 80.0))
    depth = max(10.0, params.get("depth", 70.0))
    height = max(20.0, params.get("height", 120.0))
    thickness = max(2.0, params.get("thickness", 8.0))
    angle = min(85.0, max(25.0, params.get("angle", 70.0)))
    hole_count = max(0, int(round(params.get("hole_count", 0.0))))
    hole_diameter = max(1.0, params.get("hole_diameter", 5.0))

    enabled_set: set[str] = set()
    for f in feature_tree:
        if f.enabled:
            enabled_set.add(f.type)

    mesh = TriMesh()

    # Base extrude
    if "base_extrude" in enabled_set:
        mesh = make_box(width, depth, thickness)

    # Back support
    if "back_support" in enabled_set:
        support_height = max(thickness * 2.0, height)
        support = make_box(width, thickness, support_height)
        # Apply rotation and translation via a Transform
        rot_deg = angle - 90.0
        support = support.transformed(
            Transform(
                position=[0.0, -depth * 0.3, support_height * 0.45],
                rotation=[rot_deg, 0.0, 0.0],
                scale=[1.0, 1.0, 1.0],
            )
        )
        mesh = mesh.merge(support)

    # Mount holes (approximated as cylinders subtracted visually)
    if "mount_holes" in enabled_set and hole_count > 0:
        spacing = width / (hole_count + 1)
        for i in range(hole_count):
            x = -width / 2.0 + spacing * (i + 1)
            hole = make_cylinder(
                hole_diameter / 2.0,
                thickness * 1.5,
                origin=(x, depth * 0.15, -thickness),
            )
            mesh = mesh.merge(hole)

    # Mirror across YZ plane (duplicate geometry mirrored on X)
    if "mirror" in enabled_set and mesh.verts:
        mirrored = TriMesh()
        for vx, vy, vz in mesh.verts:
            mirrored.verts.append((-vx, vy, vz))
        # Reverse winding for mirrored faces
        for a, b, c in mesh.tris:
            mirrored.tris.append((a, c, b))
        mesh = mesh.merge(mirrored)

        # Fallback
    if not mesh.verts:
        mesh = make_box(width, depth, thickness)

     return mesh


def fit_to_build_volume(mesh: TriMesh, max_x=150.0, max_y=150.0, max_z=150.0) -> TriMesh:
    bbox = bounding_box(mesh)

    sx = max_x / max(bbox["x"], 1e-6)
    sy = max_y / max(bbox["y"], 1e-6)
    sz = max_z / max(bbox["z"], 1e-6)

    scale = min(sx, sy, sz, 1.0)

    if scale >= 1.0:
        return mesh

    return mesh.transformed(
        Transform(
            position=[0.0, 0.0, 0.0],
            rotation=[0.0, 0.0, 0.0],
            scale=[scale, scale, scale],
        )
    )
