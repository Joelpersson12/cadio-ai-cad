"""Realistic product templates for CAD generation.

This module provides parametric templates for common printable products.
Each template generates realistic, printable geometry inspired by successful
real-world designs that users actually download.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.services.cad_engine import TriMesh, make_box, make_cylinder, Transform


@dataclass
class ProductTemplate:
    """A parametric product template with realistic defaults."""
    name: str
    category: str
    description: str
    default_params: dict[str, float]
    default_features: list[str]
    geometry_fn: callable  # Function that generates the mesh


# ---------------------------------------------------------------------------
# Phone & Device Stands
# ---------------------------------------------------------------------------

def _add_box(mesh: TriMesh, width: float, depth: float, height: float, pos: list[float]) -> TriMesh:
    return mesh.merge(
        make_box(width, depth, height).transformed(
            Transform(position=pos, rotation=[0.0, 0.0, 0.0], scale=[1.0, 1.0, 1.0])
        )
    )


def _make_slanted_slab(
    width: float,
    y0: float,
    z0: float,
    y1: float,
    z1: float,
    thickness: float,
) -> TriMesh:
    """Create a rectangular slab following a line in the Y/Z plane."""
    import math

    dy = y1 - y0
    dz = z1 - z0
    length = max(math.hypot(dy, dz), 1e-6)
    ny = -dz / length
    nz = dy / length
    oy = ny * thickness / 2.0
    oz = nz * thickness / 2.0
    hw = width / 2.0

    verts = [
        (-hw, y0 + oy, z0 + oz),
        (hw, y0 + oy, z0 + oz),
        (hw, y1 + oy, z1 + oz),
        (-hw, y1 + oy, z1 + oz),
        (-hw, y0 - oy, z0 - oz),
        (hw, y0 - oy, z0 - oz),
        (hw, y1 - oy, z1 - oz),
        (-hw, y1 - oy, z1 - oz),
    ]
    mesh = TriMesh()
    ids = [mesh.add_vertex(v) for v in verts]
    for face in [
        (0, 1, 2, 3),
        (5, 4, 7, 6),
        (4, 5, 1, 0),
        (3, 2, 6, 7),
        (1, 5, 6, 2),
        (4, 0, 3, 7),
    ]:
        mesh.add_quad(*(ids[i] for i in face))
    return mesh


def _make_side_rib(x: float, y0: float, y1: float, z0: float, z1: float, thickness: float) -> TriMesh:
    """Create a triangular side gusset for stand stiffness."""
    half = thickness / 2.0
    verts = [
        (x - half, y0, z0),
        (x - half, y1, z0),
        (x - half, y1, z1),
        (x + half, y0, z0),
        (x + half, y1, z0),
        (x + half, y1, z1),
    ]
    mesh = TriMesh()
    ids = [mesh.add_vertex(v) for v in verts]
    mesh.add_tri(ids[0], ids[1], ids[2])
    mesh.add_tri(ids[3], ids[5], ids[4])
    mesh.add_quad(ids[0], ids[3], ids[4], ids[1])
    mesh.add_quad(ids[1], ids[4], ids[5], ids[2])
    mesh.add_quad(ids[2], ids[5], ids[3], ids[0])
    return mesh

def generate_phone_stand(params: dict[str, float]) -> TriMesh:
    """Generate a realistic phone stand."""
    width = max(72.0, min(125.0, params.get("width", 88.0)))
    depth = max(65.0, min(120.0, params.get("depth", 82.0)))
    height = max(85.0, min(165.0, params.get("height", 118.0)))
    thickness = max(5.0, min(12.0, params.get("thickness", 7.0)))
    angle = max(58.0, min(75.0, params.get("angle", 68.0)))

    import math

    mesh = TriMesh()

    # Stable footprint with a small front retaining lip.
    mesh = _add_box(mesh, width, depth, thickness, [0.0, 0.0, thickness / 2.0])
    lip_height = max(thickness * 2.2, 14.0)
    lip_depth = max(thickness * 1.4, 9.0)
    mesh = _add_box(
        mesh,
        width * 0.92,
        lip_depth,
        lip_height,
        [0.0, -depth / 2.0 + lip_depth / 2.0, thickness + lip_height / 2.0],
    )

    # Angled back support: a real slab from base to top, not a floating box.
    lean = math.tan(math.radians(90.0 - angle)) * height
    bottom_y = -depth * 0.24
    top_y = min(depth * 0.35, bottom_y + lean)
    back = _make_slanted_slab(
        width * 0.86,
        bottom_y,
        thickness,
        top_y,
        height,
        thickness,
    )
    mesh = mesh.merge(back)

    # Two triangular gussets make the stand look and print like a real design.
    rib_offset = width * 0.34
    for x in (-rib_offset, rib_offset):
        mesh = mesh.merge(
            _make_side_rib(
                x,
                bottom_y,
                top_y,
                thickness,
                height * 0.72,
                max(thickness * 0.8, 4.5),
            )
        )

    # Small rear foot improves stability for taller phones.
    mesh = _add_box(
        mesh,
        width * 0.76,
        thickness * 1.4,
        thickness * 1.2,
        [0.0, depth / 2.0 - thickness * 0.7, thickness * 0.6],
    )

    return mesh


def generate_tablet_stand(params: dict[str, float]) -> TriMesh:
    """Generate a realistic tablet stand."""
    width = max(180.0, min(280.0, params.get("width", 220.0)))
    depth = max(80.0, min(150.0, params.get("depth", 100.0)))
    height = max(120.0, min(220.0, params.get("height", 150.0)))
    thickness = max(6.0, min(20.0, params.get("thickness", 10.0)))
    angle = max(40.0, min(75.0, params.get("angle", 55.0)))
    
    mesh = TriMesh()
    
    # Sturdy base
    base = make_box(width, depth, thickness * 1.5)
    mesh = mesh.merge(base)
    
    # Back support - stronger for tablet weight
    support_width = width * 0.7
    support_thickness = thickness * 1.5
    support_height = height * 0.8
    support = make_box(support_width, support_thickness, support_height)
    
    offset_y = -depth * 0.3
    offset_z = support_height * 0.35
    
    support = support.transformed(Transform(
        position=[0, offset_y, offset_z],
        rotation=[angle - 90.0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(support)
    
    return mesh


def generate_headphone_stand(params: dict[str, float]) -> TriMesh:
    """Generate a realistic headphone stand."""
    width = max(80.0, min(150.0, params.get("width", 100.0)))
    depth = max(70.0, min(140.0, params.get("depth", 90.0)))
    height = max(140.0, min(250.0, params.get("height", 180.0)))
    thickness = max(4.0, min(12.0, params.get("thickness", 6.0)))
    
    mesh = TriMesh()
    
    # Base plate
    base = make_box(width, depth, thickness)
    mesh = mesh.merge(base)
    
    # Vertical stand rod (cylinder approximation via box)
    rod_width = max(20.0, thickness * 3)
    rod = make_box(rod_width, thickness, height * 0.8)
    rod = rod.transformed(Transform(
        position=[0, 0, height * 0.4],
        rotation=[0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(rod)
    
    # Top hook area
    hook_width = width * 0.6
    hook = make_box(hook_width, thickness * 2, thickness * 2)
    hook = hook.transformed(Transform(
        position=[0, rod_width * 0.5, height * 0.75],
        rotation=[0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(hook)
    
    return mesh


# ---------------------------------------------------------------------------
# Storage & Organization
# ---------------------------------------------------------------------------

def generate_cable_organizer(params: dict[str, float]) -> TriMesh:
    """Generate a cable organizer."""
    width = max(50.0, min(120.0, params.get("width", 80.0)))
    depth = max(40.0, min(100.0, params.get("depth", 60.0)))
    height = max(30.0, min(80.0, params.get("height", 50.0)))
    thickness = max(3.0, min(10.0, params.get("thickness", 4.0)))
    
    mesh = TriMesh()
    
    # Base
    base = make_box(width, depth, thickness)
    mesh = mesh.merge(base)
    
    # Dividers
    divider_count = max(2, int(params.get("divider_count", 3.0)))
    spacing = width / (divider_count + 1)
    
    for i in range(1, divider_count + 1):
        x = -width / 2.0 + spacing * i
        divider = make_box(thickness, depth * 0.8, height)
        divider = divider.transformed(Transform(
            position=[x, 0, height * 0.5],
            rotation=[0, 0, 0],
            scale=[1.0, 1.0, 1.0],
        ))
        mesh = mesh.merge(divider)
    
    return mesh


def generate_storage_bin(params: dict[str, float]) -> TriMesh:
    """Generate a storage bin."""
    width = max(60.0, min(200.0, params.get("width", 120.0)))
    depth = max(50.0, min(180.0, params.get("depth", 100.0)))
    height = max(40.0, min(200.0, params.get("height", 80.0)))
    thickness = max(3.0, min(10.0, params.get("thickness", 4.0)))
    
    mesh = TriMesh()
    
    # Bottom base
    base = make_box(width, depth, thickness)
    mesh = mesh.merge(base)
    
    # Walls
    hw, hd = width / 2.0, depth / 2.0
    
    # Front wall
    front = make_box(width, thickness, height)
    front = front.transformed(Transform(
        position=[0, -hd + thickness / 2, height / 2],
        rotation=[0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(front)
    
    # Back wall
    back = make_box(width, thickness, height)
    back = back.transformed(Transform(
        position=[0, hd - thickness / 2, height / 2],
        rotation=[0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(back)
    
    # Left wall
    left = make_box(thickness, depth, height)
    left = left.transformed(Transform(
        position=[-hw + thickness / 2, 0, height / 2],
        rotation=[0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(left)
    
    # Right wall
    right = make_box(thickness, depth, height)
    right = right.transformed(Transform(
        position=[hw - thickness / 2, 0, height / 2],
        rotation=[0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(right)
    
    return mesh


# ---------------------------------------------------------------------------
# Wall & Mounting
# ---------------------------------------------------------------------------

def generate_wall_hook(params: dict[str, float]) -> TriMesh:
    """Generate a wall-mounted hook."""
    width = max(30.0, min(100.0, params.get("width", 60.0)))
    depth = max(40.0, min(120.0, params.get("depth", 80.0)))
    thickness = max(4.0, min(15.0, params.get("thickness", 8.0)))
    
    mesh = TriMesh()
    
    # Wall bracket (mounting area)
    bracket = make_box(width, thickness, width)
    mesh = mesh.merge(bracket)
    
    # Horizontal support rod
    rod_height = thickness
    rod_width = depth * 0.6
    rod = make_box(rod_width, thickness, rod_height)
    rod = rod.transformed(Transform(
        position=[0, depth * 0.4, width * 0.3],
        rotation=[0, 0, 0],
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(rod)
    
    return mesh


def generate_shelf_bracket(params: dict[str, float]) -> TriMesh:
    """Generate a shelf bracket."""
    width = max(80.0, min(200.0, params.get("width", 150.0)))
    depth = max(100.0, min(250.0, params.get("depth", 150.0)))
    height = max(30.0, min(100.0, params.get("height", 50.0)))
    thickness = max(6.0, min(15.0, params.get("thickness", 10.0)))
    
    mesh = TriMesh()
    
    # Horizontal shelf platform
    shelf = make_box(width, depth, thickness)
    mesh = mesh.merge(shelf)
    
    # Back support bracket
    support_thickness = thickness * 0.8
    support_height = height * 0.8
    support = make_box(width, support_thickness, support_height)
    support = support.transformed(Transform(
        position=[0, -depth * 0.4, support_height * 0.4],
        rotation=[30.0, 0, 0],  # Slight angle for strength
        scale=[1.0, 1.0, 1.0],
    ))
    mesh = mesh.merge(support)
    
    return mesh


# ---------------------------------------------------------------------------
# Template Registry
# ---------------------------------------------------------------------------

PRODUCT_TEMPLATES: dict[str, ProductTemplate] = {
    "phone_stand": ProductTemplate(
        name="Phone Stand",
        category="Device Stand",
        description="Angled stand for smartphones with adjustable support",
        default_params={
            "width": 85.0,
            "depth": 82.0,
            "height": 118.0,
            "thickness": 7.0,
            "angle": 68.0,
            "fillet_radius": 3.0,
            "hole_count": 0.0,
            "hole_diameter": 5.0,
            "wall_thickness": 3.0,
            "chamfer_size": 0.0,
        },
        default_features=["base_extrude", "back_support", "fillet_edges"],
        geometry_fn=generate_phone_stand,
    ),
    "tablet_stand": ProductTemplate(
        name="Tablet Stand",
        category="Device Stand",
        description="Sturdy stand for tablets with angled back support",
        default_params={
            "width": 220.0,
            "depth": 100.0,
            "height": 150.0,
            "thickness": 10.0,
            "angle": 55.0,
        },
        default_features=["base_extrude", "back_support", "fillet_edges"],
        geometry_fn=generate_tablet_stand,
    ),
    "headphone_stand": ProductTemplate(
        name="Headphone Stand",
        category="Device Stand",
        description="Vertical stand for headphone display",
        default_params={
            "width": 100.0,
            "depth": 90.0,
            "height": 180.0,
            "thickness": 6.0,
        },
        default_features=["base_extrude", "fillet_edges"],
        geometry_fn=generate_headphone_stand,
    ),
    "cable_organizer": ProductTemplate(
        name="Cable Organizer",
        category="Storage",
        description="Desk organizer for managing cables",
        default_params={
            "width": 80.0,
            "depth": 60.0,
            "height": 50.0,
            "thickness": 4.0,
            "divider_count": 3.0,
        },
        default_features=["base_extrude", "fillet_edges"],
        geometry_fn=generate_cable_organizer,
    ),
    "storage_bin": ProductTemplate(
        name="Storage Bin",
        category="Storage",
        description="Stackable storage container",
        default_params={
            "width": 120.0,
            "depth": 100.0,
            "height": 80.0,
            "thickness": 4.0,
        },
        default_features=["base_extrude", "fillet_edges"],
        geometry_fn=generate_storage_bin,
    ),
    "wall_hook": ProductTemplate(
        name="Wall Hook",
        category="Wall Mount",
        description="Wall-mounted hook for hanging items",
        default_params={
            "width": 60.0,
            "depth": 80.0,
            "thickness": 8.0,
        },
        default_features=["base_extrude", "fillet_edges"],
        geometry_fn=generate_wall_hook,
    ),
    "shelf_bracket": ProductTemplate(
        name="Shelf Bracket",
        category="Wall Mount",
        description="Bracket for mounting shelves on walls",
        default_params={
            "width": 150.0,
            "depth": 150.0,
            "height": 50.0,
            "thickness": 10.0,
        },
        default_features=["base_extrude", "fillet_edges"],
        geometry_fn=generate_shelf_bracket,
    ),
}


def get_template_for_prompt(prompt: str) -> ProductTemplate | None:
    """Find the best matching template for a natural language prompt."""
    prompt_lower = prompt.lower()
    
    # Direct template matching
    for key, template in PRODUCT_TEMPLATES.items():
        if template.name.lower() in prompt_lower:
            return template
        if any(word in prompt_lower for word in template.name.lower().split()):
            return template
    
    # Category matching
    for key, template in PRODUCT_TEMPLATES.items():
        if template.category.lower() in prompt_lower:
            return template
    
    # Keyword-based matching
    keyword_map = {
        "phone": "phone_stand",
        "tablet": "tablet_stand",
        "headphone": "headphone_stand",
        "cable": "cable_organizer",
        "storage": "storage_bin",
        "hook": "wall_hook",
        "shelf": "shelf_bracket",
        "stand": "phone_stand",  # Default to phone stand
    }
    
    for keyword, template_key in keyword_map.items():
        if keyword in prompt_lower:
            return PRODUCT_TEMPLATES.get(template_key)
    
    return None
