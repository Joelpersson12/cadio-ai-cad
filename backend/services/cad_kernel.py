"""Optional CadQuery/OpenCascade geometry backend.

CadQuery gives Cadio real B-rep operations such as shell, fillet, chamfer,
and boolean-safe solids.  The rest of the app still accepts TriMesh payloads,
so this module tessellates CadQuery solids into the existing frontend format.
"""

from __future__ import annotations

import math
from typing import Any

from backend.services.cad_engine import TriMesh


try:
    import cadquery as cq

    CADQUERY_AVAILABLE = True
except Exception:
    cq = None
    CADQUERY_AVAILABLE = False


def is_available() -> bool:
    return CADQUERY_AVAILABLE


def _solid_from(value: Any):
    if not CADQUERY_AVAILABLE:
        return None
    if hasattr(value, "val"):
        return value.val()
    return value


def to_trimesh(value: Any, tolerance: float = 0.25) -> TriMesh | None:
    """Tessellate a CadQuery object into Cadio's TriMesh format."""
    solid = _solid_from(value)
    if solid is None:
        return None

    try:
        vertices, triangles = solid.tessellate(tolerance)
    except Exception:
        return None

    mesh = TriMesh()
    for vertex in vertices:
        if hasattr(vertex, "toTuple"):
            x, y, z = vertex.toTuple()
        else:
            x, y, z = vertex
        mesh.verts.append((float(x), float(y), float(z)))

    for tri in triangles:
        a, b, c = tri
        mesh.tris.append((int(a), int(b), int(c)))

    return mesh


def make_box_body(
    width: float,
    depth: float,
    height: float,
    *,
    fillet: float = 0.0,
    chamfer: float = 0.0,
    shell_wall: float = 0.0,
) -> TriMesh | None:
    """Create a true CAD box with optional shell/fillet/chamfer."""
    if not CADQUERY_AVAILABLE:
        return None

    try:
        body = cq.Workplane("XY").box(width, depth, height, centered=(True, True, False))

        if shell_wall > 0:
            wall = max(0.5, min(shell_wall, width / 3.0, depth / 3.0, height / 2.0))
            body = body.faces(">Z").shell(-wall)

        if fillet > 0:
            radius = max(0.1, min(fillet, width / 2.0 - 0.1, depth / 2.0 - 0.1, height / 2.0 - 0.1))
            body = body.edges().fillet(radius)
        elif chamfer > 0:
            size = max(0.1, min(chamfer, width / 2.0 - 0.1, depth / 2.0 - 0.1, height / 2.0 - 0.1))
            body = body.edges().chamfer(size)

        return to_trimesh(body)
    except Exception:
        return None


def make_cylinder_body(radius: float, height: float) -> TriMesh | None:
    if not CADQUERY_AVAILABLE:
        return None
    try:
        return to_trimesh(cq.Workplane("XY").circle(radius).extrude(height))
    except Exception:
        return None


def _box_solid(width: float, depth: float, height: float, pos: tuple[float, float, float]):
    return cq.Workplane("XY").box(width, depth, height, centered=(True, True, False)).translate(pos)


def _side_rib_solid(
    x: float,
    y0: float,
    y1: float,
    z0: float,
    z1: float,
    thickness: float,
):
    half = thickness / 2.0
    points = [
        (x - half, y0, z0),
        (x - half, y1, z0),
        (x - half, y1, z1),
        (x + half, y0, z0),
        (x + half, y1, z0),
        (x + half, y1, z1),
    ]
    faces = [
        (0, 1, 2),
        (3, 5, 4),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    return cq.Solid.makeShell(
        [
            cq.Face.makeFromWires(cq.Wire.makePolygon([cq.Vector(*points[i]) for i in face] + [cq.Vector(*points[face[0]])]))
            for face in faces
        ]
    ).makeSolid()


def make_phone_stand_body(params: dict[str, float]) -> TriMesh | None:
    """Create a printable phone stand from real CAD solids."""
    if not CADQUERY_AVAILABLE:
        return None

    try:
        width = max(72.0, min(125.0, params.get("width", 88.0)))
        depth = max(65.0, min(120.0, params.get("depth", 82.0)))
        height = max(85.0, min(165.0, params.get("height", 118.0)))
        thickness = max(5.0, min(12.0, params.get("thickness", 7.0)))
        angle = max(58.0, min(75.0, params.get("angle", 68.0)))
        fillet = max(0.0, min(params.get("fillet_radius", 2.0), thickness * 0.45))

        base = _box_solid(width, depth, thickness, (0.0, 0.0, 0.0))
        lip_depth = max(thickness * 1.4, 9.0)
        lip_height = max(thickness * 2.2, 14.0)
        lip = _box_solid(
            width * 0.92,
            lip_depth,
            lip_height,
            (0.0, -depth / 2.0 + lip_depth / 2.0, thickness),
        )

        lean = math.tan(math.radians(90.0 - angle)) * height
        bottom_y = -depth * 0.22
        top_y = min(depth * 0.34, bottom_y + lean)
        support_length = math.hypot(top_y - bottom_y, height - thickness)
        support_angle = math.degrees(math.atan2(height - thickness, top_y - bottom_y)) - 90.0
        support = (
            cq.Workplane("XY")
            .box(width * 0.84, thickness, support_length, centered=(True, True, False))
            .rotate((0, 0, 0), (1, 0, 0), -support_angle)
            .translate((0.0, bottom_y, thickness))
        )

        solid = base.union(lip).union(support)
        for x in (-width * 0.34, width * 0.34):
            solid = solid.union(_side_rib_solid(x, bottom_y, top_y, thickness, height * 0.72, max(thickness * 0.8, 4.5)))

        if fillet > 0:
            solid = solid.edges().fillet(fillet)

        return to_trimesh(solid)
    except Exception:
        return None
