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


def _hole_specs(params: dict[str, float], width: float, depth: float) -> list[tuple[float, float, float]]:
    specs: list[tuple[float, float, float]] = []
    custom_count = max(0, int(params.get("custom_hole_count", 0.0)))
    for index in range(custom_count):
        x_key = f"custom_hole_{index}_x"
        y_key = f"custom_hole_{index}_y"
        d_key = f"custom_hole_{index}_diameter"
        if x_key in params and y_key in params:
            specs.append((
                float(params[x_key]),
                float(params[y_key]),
                max(1.0, float(params.get(d_key, params.get("hole_diameter", 5.0)))),
            ))

    generated_count = max(0, int(round(params.get("hole_count", 0.0)))) - len(specs)
    if generated_count > 0:
        diameter = max(1.0, float(params.get("hole_diameter", 5.0)))
        spacing = width / (generated_count + 1)
        for index in range(generated_count):
            specs.append((-width / 2.0 + spacing * (index + 1), depth * 0.15, diameter))
    return specs


def _make_box_with_rect_holes(width: float, depth: float, height: float, params: dict[str, float]) -> TriMesh:
    """Mesh fallback for plates with visible through-holes."""
    holes = _hole_specs(params, width, depth)
    if not holes:
        return make_box(width, depth, height)

    xs = [-width / 2.0, width / 2.0]
    ys = [-depth / 2.0, depth / 2.0]
    expanded: list[tuple[float, float, float]] = []
    for x, y, diameter in holes:
        radius = diameter / 2.0
        x0, x1 = max(-width / 2.0, x - radius), min(width / 2.0, x + radius)
        y0, y1 = max(-depth / 2.0, y - radius), min(depth / 2.0, y + radius)
        if x1 <= x0 or y1 <= y0:
            continue
        expanded.append((x, y, radius))
        xs.extend([x0, x1])
        ys.extend([y0, y1])

    xs = sorted(set(round(v, 5) for v in xs))
    ys = sorted(set(round(v, 5) for v in ys))
    mesh = TriMesh()
    for xi in range(len(xs) - 1):
        for yi in range(len(ys) - 1):
            x0, x1 = xs[xi], xs[xi + 1]
            y0, y1 = ys[yi], ys[yi + 1]
            cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
            if any((cx - hx) ** 2 + (cy - hy) ** 2 <= radius ** 2 for hx, hy, radius in expanded):
                continue
            mesh = _add_box(mesh, x1 - x0, y1 - y0, height, [cx, cy, height / 2.0])
    return mesh if mesh.verts else make_box(width, depth, height)


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
    try:
        from backend.services.cad_kernel import make_phone_stand_body

        kernel_mesh = make_phone_stand_body(params)
        if kernel_mesh and kernel_mesh.verts:
            return kernel_mesh
    except Exception:
        pass

    width = max(78.0, min(130.0, params.get("width", 92.0)))
    depth = max(75.0, min(130.0, params.get("depth", 92.0)))
    height = max(92.0, min(170.0, params.get("height", 122.0)))
    thickness = max(5.0, min(12.0, params.get("thickness", 7.0)))
    angle = max(60.0, min(74.0, params.get("angle", 68.0)))

    import math

    mesh = TriMesh()

    # Stable footprint with two side rails and a cable relief.
    mesh = mesh.merge(_make_box_with_rect_holes(width, depth, thickness, params))
    lip_height = max(thickness * 2.0, 13.0)
    lip_depth = max(thickness * 1.45, 10.0)
    mesh = _add_box(
        mesh,
        width * 0.36,
        lip_depth,
        lip_height,
        [-width * 0.26, -depth / 2.0 + lip_depth / 2.0, thickness + lip_height / 2.0],
    )
    mesh = _add_box(
        mesh,
        width * 0.36,
        lip_depth,
        lip_height,
        [width * 0.26, -depth / 2.0 + lip_depth / 2.0, thickness + lip_height / 2.0],
    )

    # Angled back support: a real slab from base to top, not a floating box.
    lean = math.tan(math.radians(90.0 - angle)) * height
    bottom_y = -depth * 0.12
    top_y = min(depth * 0.36, bottom_y + lean)
    back = _make_slanted_slab(
        width * 0.70,
        bottom_y,
        thickness,
        top_y,
        height,
        thickness,
    )
    mesh = mesh.merge(back)

    # Two triangular gussets make the stand look and print like a real design.
    rib_offset = width * 0.41
    for x in (-rib_offset, rib_offset):
        mesh = mesh.merge(
            _make_side_rib(
                x,
                bottom_y,
                top_y,
                thickness,
                height * 0.66,
                max(thickness * 0.75, 4.2),
            )
        )
        mesh = _add_box(mesh, max(thickness * 0.65, 4.5), depth * 0.54, thickness * 1.25, [x, -depth * 0.02, thickness * 1.15])

    # Small rear foot improves stability for taller phones.
    mesh = _add_box(
        mesh,
        width * 0.76,
        thickness * 1.4,
        thickness * 1.2,
        [0.0, depth / 2.0 - thickness * 0.7, thickness * 0.6],
    )

    return mesh


def generate_battery_holder(params: dict[str, float]) -> TriMesh:
    """Generate a wall/bench battery holder with slide rails and screw holes."""
    slots = max(1, min(4, int(round(params.get("battery_slots", 1.0)))))
    width = max(70.0, min(260.0, params.get("width", 104.0) * (1.0 + (slots - 1) * 0.82)))
    depth = max(55.0, min(150.0, params.get("depth", 92.0)))
    height = max(28.0, min(90.0, params.get("height", 46.0)))
    thickness = max(4.0, min(14.0, params.get("thickness", 7.0)))

    params = dict(params)
    params["hole_count"] = max(2.0, float(params.get("hole_count", 2.0)))
    params["hole_diameter"] = max(4.0, float(params.get("hole_diameter", 5.0)))

    mesh = TriMesh()
    back_plate = _make_box_with_rect_holes(width, depth, thickness, params)
    mesh = mesh.merge(back_plate)

    slot_width = width / slots
    rail_width = max(thickness * 1.15, 7.0)
    rail_height = max(height * 0.52, 18.0)
    rail_depth = depth * 0.72
    for slot in range(slots):
        slot_center = -width / 2.0 + slot_width * (slot + 0.5)
        for x in (slot_center - slot_width * 0.26, slot_center + slot_width * 0.26):
            mesh = _add_box(mesh, rail_width, rail_depth, rail_height, [x, -depth * 0.02, thickness + rail_height / 2.0])
            mesh = _add_box(mesh, rail_width * 1.8, rail_depth * 0.78, thickness * 0.8, [x, -depth * 0.02, thickness + rail_height + thickness * 0.4])

    # Front stop and rear registration wall for battery tabs.
    mesh = _add_box(mesh, width * 0.88, thickness * 1.4, height * 0.45, [0.0, -depth / 2.0 + thickness * 0.7, thickness + height * 0.22])
    mesh = _add_box(mesh, width * 0.76, thickness, height * 0.32, [0.0, depth * 0.36, thickness + height * 0.16])

    # Side gussets for wall-mounted strength.
    for x in (-width * 0.44, width * 0.44):
        mesh = mesh.merge(_make_side_rib(x, -depth * 0.42, depth * 0.22, thickness, thickness + height * 0.58, thickness * 0.9))

    return mesh


def generate_electronics_holder(params: dict[str, float]) -> TriMesh:
    """Generate a generic electronics/CDI/ECU holder with tabs and strap rails."""
    width = max(55.0, min(180.0, params.get("width", 86.0)))
    depth = max(45.0, min(150.0, params.get("depth", 68.0)))
    height = max(20.0, min(100.0, params.get("height", 38.0)))
    thickness = max(3.0, min(12.0, params.get("thickness", 5.0)))

    params = dict(params)
    params["hole_count"] = max(2.0, float(params.get("hole_count", 2.0)))
    params["hole_diameter"] = max(4.0, float(params.get("hole_diameter", 5.0)))

    mesh = TriMesh()
    mesh = mesh.merge(_make_box_with_rect_holes(width * 1.18, depth, thickness, params))
    mesh = _add_box(mesh, width, thickness, height, [0.0, -depth / 2.0 + thickness / 2.0, thickness + height / 2.0])
    mesh = _add_box(mesh, width, thickness, height, [0.0, depth / 2.0 - thickness / 2.0, thickness + height / 2.0])
    mesh = _add_box(mesh, thickness, depth, height * 0.72, [-width / 2.0 + thickness / 2.0, 0.0, thickness + height * 0.36])
    mesh = _add_box(mesh, thickness, depth, height * 0.72, [width / 2.0 - thickness / 2.0, 0.0, thickness + height * 0.36])
    mesh = _add_box(mesh, width * 0.72, thickness * 0.8, thickness * 1.2, [0.0, 0.0, thickness + height + thickness * 0.6])
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
    width = max(90.0, min(170.0, params.get("width", 120.0)))
    depth = max(90.0, min(170.0, params.get("depth", 120.0)))
    height = max(150.0, min(260.0, params.get("height", 205.0)))
    thickness = max(6.0, min(16.0, params.get("thickness", 9.0)))
    
    mesh = TriMesh()
    
    # Wide stable base.
    mesh = mesh.merge(_make_box_with_rect_holes(width, depth, thickness, params))

    # Upright rear column.
    column_width = max(22.0, thickness * 3.0)
    column_depth = max(18.0, thickness * 2.2)
    mesh = _add_box(
        mesh,
        column_width,
        column_depth,
        height * 0.78,
        [0.0, depth * 0.18, thickness + height * 0.39],
    )

    # Curved-looking top cradle approximated by three print-friendly blocks.
    top_z = thickness + height * 0.78
    mesh = _add_box(mesh, width * 0.68, thickness * 2.2, thickness * 2.0, [0.0, depth * 0.20, top_z])
    mesh = _add_box(mesh, thickness * 2.0, thickness * 3.0, thickness * 3.0, [-width * 0.34, depth * 0.18, top_z - thickness * 0.4])
    mesh = _add_box(mesh, thickness * 2.0, thickness * 3.0, thickness * 3.0, [width * 0.34, depth * 0.18, top_z - thickness * 0.4])

    # Front cable notch / anti-slip foot.
    mesh = _add_box(mesh, width * 0.45, thickness * 1.3, thickness * 1.2, [0.0, -depth / 2.0 + thickness, thickness * 1.1])
    
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
            "width": 120.0,
            "depth": 120.0,
            "height": 205.0,
            "thickness": 9.0,
            "fillet_radius": 3.0,
            "hole_count": 0.0,
            "hole_diameter": 5.0,
            "wall_thickness": 3.0,
            "chamfer_size": 0.0,
        },
        default_features=["base_extrude", "fillet_edges"],
        geometry_fn=generate_headphone_stand,
    ),
    "battery_holder": ProductTemplate(
        name="Battery Holder",
        category="Tool Storage",
        description="Wall or bench mount battery holder with slide rails and screw holes",
        default_params={
            "width": 104.0,
            "depth": 92.0,
            "height": 46.0,
            "thickness": 7.0,
            "fillet_radius": 2.5,
            "hole_count": 2.0,
            "hole_diameter": 5.0,
            "wall_thickness": 3.0,
            "chamfer_size": 0.0,
        },
        default_features=["base_extrude", "mount_holes", "fillet_edges"],
        geometry_fn=generate_battery_holder,
    ),
    "electronics_holder": ProductTemplate(
        name="Electronics Holder",
        category="Mounting",
        description="Generic CDI/ECU/electronics bracket with tray walls and mounting holes",
        default_params={
            "width": 86.0,
            "depth": 68.0,
            "height": 38.0,
            "thickness": 5.0,
            "fillet_radius": 2.0,
            "hole_count": 2.0,
            "hole_diameter": 5.0,
            "wall_thickness": 3.0,
            "chamfer_size": 0.0,
        },
        default_features=["base_extrude", "mount_holes", "fillet_edges"],
        geometry_fn=generate_electronics_holder,
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
    import re

    prompt_lower = prompt.lower()
    words = set(re.findall(r"[a-z0-9]+", prompt_lower))
    aliases = {
        "phone_stand": {"phone", "smartphone", "mobile", "iphone", "android", "dock"},
        "tablet_stand": {"tablet", "ipad", "kindle"},
        "headphone_stand": {"headphone", "headphones", "headset", "headsets", "gaming", "earphone"},
        "battery_holder": {"battery", "batteries", "dewalt", "makita", "milwaukee", "ryobi", "bosch", "holder", "charger"},
        "electronics_holder": {"cdi", "ecu", "ecm", "electronics", "module", "ignition", "honda", "cr250r", "crf"},
        "cable_organizer": {"cable", "cord", "wire", "organizer", "organiser"},
        "storage_bin": {"storage", "bin", "box", "container", "drawer"},
        "wall_hook": {"hook", "hanger", "wall"},
        "shelf_bracket": {"shelf", "bracket", "support"},
    }

    best_key: str | None = None
    best_score = 0
    for key, template in PRODUCT_TEMPLATES.items():
        name_words = set(re.findall(r"[a-z0-9]+", template.name.lower()))
        score = len(words & aliases.get(key, set())) * 4
        score += len(words & name_words) * 2
        if template.name.lower() in prompt_lower:
            score += 8
        if "stand" in words and key.endswith("_stand") and score > 0:
            score += 1
        if score > best_score:
            best_key = key
            best_score = score

    if best_key:
        return PRODUCT_TEMPLATES[best_key]

    return None
