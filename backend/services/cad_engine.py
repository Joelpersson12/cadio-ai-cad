"""CAD engine built directly on OCP (OpenCascade Python bindings).

Provides real parametric geometry generation, tessellation, transforms,
and boolean operations without relying on CadQuery's broken dependency
chain.  Every shape returned is a genuine B-Rep solid.
"""

from __future__ import annotations

import math
from typing import Any

from OCP.BRep import BRep_Tool
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepFilletAPI import BRepFilletAPI_MakeChamfer, BRepFilletAPI_MakeFillet
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Shape

from backend.models.schema import Feature, MeshPayload, Transform

# ---------------------------------------------------------------------------
# Tessellation helpers
# ---------------------------------------------------------------------------

_MESH_DEFLECTION = 0.5
_MESH_ANGLE = 0.3


def tessellate(shape: TopoDS_Shape) -> MeshPayload:
    """Tessellate a B-Rep shape and return flat vertex/index arrays."""
    mesh = BRepMesh_IncrementalMesh(shape, _MESH_DEFLECTION, False, _MESH_ANGLE)
    mesh.Perform()

    positions: list[float] = []
    indices: list[int] = []
    vertex_offset = 0

    explorer = TopExp_Explorer(shape, TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face_s(explorer.Current())
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        if tri is None:
            explorer.Next()
            continue

        trsf = loc.Transformation()
        nb_nodes = tri.NbNodes()
        nb_tris = tri.NbTriangles()

        for i in range(1, nb_nodes + 1):
            node = tri.Node(i)
            node.Transform(trsf)
            positions.extend([float(node.X()), float(node.Y()), float(node.Z())])

        for i in range(1, nb_tris + 1):
            t = tri.Triangle(i)
            n1, n2, n3 = t.Get()
            # OCP triangles are 1-indexed; convert to 0-indexed + offset
            indices.extend(
                [
                    n1 - 1 + vertex_offset,
                    n2 - 1 + vertex_offset,
                    n3 - 1 + vertex_offset,
                ]
            )

        vertex_offset += nb_nodes
        explorer.Next()

    return MeshPayload(positions=positions, indices=indices)


# ---------------------------------------------------------------------------
# Primitive builders
# ---------------------------------------------------------------------------


def make_box(width: float, depth: float, height: float) -> TopoDS_Shape:
    """Create a centered box (origin at geometric center)."""
    box = BRepPrimAPI_MakeBox(
        gp_Pnt(-width / 2, -depth / 2, -height / 2),
        width,
        depth,
        height,
    ).Shape()
    return box


def make_cylinder(
    radius: float,
    height: float,
    origin: tuple[float, float, float] = (0, 0, 0),
    direction: tuple[float, float, float] = (0, 0, 1),
) -> TopoDS_Shape:
    """Create a cylinder at the given origin along the given direction."""
    ax = gp_Ax2(
        gp_Pnt(*origin),
        gp_Dir(*direction),
    )
    return BRepPrimAPI_MakeCylinder(ax, radius, height).Shape()


# ---------------------------------------------------------------------------
# Boolean operations
# ---------------------------------------------------------------------------


def fuse(a: TopoDS_Shape, b: TopoDS_Shape) -> TopoDS_Shape:
    return BRepAlgoAPI_Fuse(a, b).Shape()


def cut(a: TopoDS_Shape, b: TopoDS_Shape) -> TopoDS_Shape:
    return BRepAlgoAPI_Cut(a, b).Shape()


# ---------------------------------------------------------------------------
# Fillet / Chamfer (apply to all edges matching a filter)
# ---------------------------------------------------------------------------


def fillet_all_edges(shape: TopoDS_Shape, radius: float) -> TopoDS_Shape:
    """Apply a fillet to every edge of the shape."""
    if radius <= 0:
        return shape
    try:
        mk = BRepFilletAPI_MakeFillet(shape)
        explorer = TopExp_Explorer(shape, TopAbs_EDGE)
        count = 0
        while explorer.More():
            edge = TopoDS.Edge_s(explorer.Current())
            mk.Add(radius, edge)
            count += 1
            explorer.Next()
        if count == 0:
            return shape
        return mk.Shape()
    except Exception:
        return shape


def chamfer_all_edges(shape: TopoDS_Shape, dist: float) -> TopoDS_Shape:
    """Apply a chamfer to every edge of the shape."""
    if dist <= 0:
        return shape
    try:
        mk = BRepFilletAPI_MakeChamfer(shape)
        explorer = TopExp_Explorer(shape, TopAbs_EDGE)
        count = 0
        while explorer.More():
            edge = TopoDS.Edge_s(explorer.Current())
            mk.Add(dist, edge)
            count += 1
            explorer.Next()
        if count == 0:
            return shape
        return mk.Shape()
    except Exception:
        return shape


# ---------------------------------------------------------------------------
# Transforms
# ---------------------------------------------------------------------------


def apply_transform(
    shape: TopoDS_Shape,
    transform: Transform,
) -> TopoDS_Shape:
    """Apply position / rotation / scale to a shape, returning a new copy."""
    trsf = gp_Trsf()

    # Scale (uniform, average of xyz)
    sx, sy, sz = (float(v) for v in transform.scale)
    scale = max(0.001, (sx + sy + sz) / 3.0)
    if abs(scale - 1.0) > 1e-6:
        trsf.SetScaleFactor(scale)
        shape = BRepBuilderAPI_Transform(shape, trsf, True).Shape()
        trsf = gp_Trsf()

    # Rotation (degrees -> radians, applied X then Y then Z)
    rx, ry, rz = (math.radians(float(v) % 360.0) for v in transform.rotation)
    origin = gp_Pnt(0, 0, 0)
    if abs(rx) > 1e-6:
        t = gp_Trsf()
        t.SetRotation(gp_Ax1(origin, gp_Dir(1, 0, 0)), rx)
        shape = BRepBuilderAPI_Transform(shape, t, True).Shape()
    if abs(ry) > 1e-6:
        t = gp_Trsf()
        t.SetRotation(gp_Ax1(origin, gp_Dir(0, 1, 0)), ry)
        shape = BRepBuilderAPI_Transform(shape, t, True).Shape()
    if abs(rz) > 1e-6:
        t = gp_Trsf()
        t.SetRotation(gp_Ax1(origin, gp_Dir(0, 0, 1)), rz)
        shape = BRepBuilderAPI_Transform(shape, t, True).Shape()

    # Translation
    px, py, pz = (float(v) for v in transform.position)
    if abs(px) > 1e-6 or abs(py) > 1e-6 or abs(pz) > 1e-6:
        t = gp_Trsf()
        t.SetTranslation(gp_Vec(px, py, pz))
        shape = BRepBuilderAPI_Transform(shape, t, True).Shape()

    return shape


# ---------------------------------------------------------------------------
# Bounding box
# ---------------------------------------------------------------------------


def bounding_box(shape: TopoDS_Shape) -> dict[str, float]:
    """Return axis-aligned bounding box dimensions."""
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib

    bbox = Bnd_Box()
    BRepBndLib.Add_s(shape, bbox)
    xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()
    return {
        "x": xmax - xmin,
        "y": ymax - ymin,
        "z": zmax - zmin,
    }


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
) -> TopoDS_Shape:
    """Rebuild a parametric phone-stand model from parameters + feature tree."""
    width = max(10.0, params.get("width", 80.0))
    depth = max(10.0, params.get("depth", 70.0))
    height = max(20.0, params.get("height", 120.0))
    thickness = max(2.0, params.get("thickness", 8.0))
    angle = min(85.0, max(25.0, params.get("angle", 70.0)))
    fillet_radius = max(0.0, params.get("fillet_radius", 2.0))
    hole_count = max(0, int(round(params.get("hole_count", 0.0))))
    hole_diameter = max(1.0, params.get("hole_diameter", 5.0))
    chamfer_size = max(0.0, params.get("chamfer_size", 0.0))

    enabled_set: set[str] = set()
    for f in feature_tree:
        if f.enabled:
            enabled_set.add(f.type)

    # Start with nothing
    shape: TopoDS_Shape | None = None

    # Base extrude
    if "base_extrude" in enabled_set:
        shape = make_box(width, depth, thickness)

    # Back support
    if "back_support" in enabled_set:
        support_height = max(thickness * 2.0, height)
        # Create support angled backward
        support = make_box(width, thickness, support_height)
        # Rotate by (angle - 90) around X axis
        rot_angle = math.radians(angle - 90.0)
        t = gp_Trsf()
        t.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)), rot_angle)
        support = BRepBuilderAPI_Transform(support, t, True).Shape()
        # Translate to back of base
        t2 = gp_Trsf()
        t2.SetTranslation(gp_Vec(0, -depth * 0.3, support_height * 0.45))
        support = BRepBuilderAPI_Transform(support, t2, True).Shape()
        if shape is not None:
            shape = fuse(shape, support)
        else:
            shape = support

    # Mount holes
    if "mount_holes" in enabled_set and hole_count > 0 and shape is not None:
        spacing = width / (hole_count + 1)
        for i in range(hole_count):
            x = -width / 2.0 + spacing * (i + 1)
            hole = make_cylinder(
                hole_diameter / 2.0,
                thickness * 1.5,
                origin=(x, depth * 0.15, -thickness),
                direction=(0, 0, 1),
            )
            shape = cut(shape, hole)

    # Fillet edges
    if "fillet_edges" in enabled_set and fillet_radius > 0 and shape is not None:
        safe_radius = min(fillet_radius, thickness * 0.45)
        shape = fillet_all_edges(shape, safe_radius)

    # Chamfer edges
    if "chamfer_edges" in enabled_set and chamfer_size > 0 and shape is not None:
        safe_dist = min(chamfer_size, thickness * 0.45)
        shape = chamfer_all_edges(shape, safe_dist)

    # Mirror across YZ plane
    if "mirror" in enabled_set and shape is not None:
        t = gp_Trsf()
        # Mirror = scale -1 on X
        t.SetMirror(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)))
        mirrored = BRepBuilderAPI_Transform(shape, t, True).Shape()
        shape = fuse(shape, mirrored)

    # Fallback: if nothing was built, create a simple box
    if shape is None:
        shape = make_box(width, depth, thickness)

    return shape
