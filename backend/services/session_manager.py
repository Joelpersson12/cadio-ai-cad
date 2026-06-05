"""Thread-safe session manager for Cadio CAD sessions.

Each session holds a collection of CAD objects, selection state,
edit history, and printer configuration.  All mutations go through
this module so locking is centralized.
"""

from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import datetime, timezone
from threading import RLock
from typing import Any

from backend.models.schema import Feature, Transform
from backend.services.cad_engine import (
    DEFAULT_FEATURE_TREE,
    DEFAULT_PARAMETERS,
    TriMesh,
    auto_adjust_z_position,
    make_box,
    make_cylinder,
    make_rounded_box,
    rebuild_from_features,
    shift_mesh_to_buildplate,
)
from backend.services.cad_kernel import make_box_body, make_cylinder_body

# ---------------------------------------------------------------------------
# Internal types
# ---------------------------------------------------------------------------

CadObject = dict[str, Any]
Session = dict[str, Any]

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_sessions: dict[str, Session] = {}
_lock = RLock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_scene_token() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Object factory
# ---------------------------------------------------------------------------


def create_object(name: str = "part") -> CadObject:
    """Create a new CAD object with default parameters and geometry."""
    params = dict(DEFAULT_PARAMETERS)
    features = [Feature(**f) for f in DEFAULT_FEATURE_TREE]
    shape = rebuild_from_features(params, features)
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "parameters": params,
        "feature_tree": features,
        "transform": Transform(),
        "shape": shape,
        "material": "PLA",
        "color": "#a9aaad",
    }


def create_manual_object(
    name: str,
    shape: TriMesh,
    parameters: dict[str, float] | None = None,
) -> CadObject:
    """Create an object from an explicitly sketched mesh."""
    shape = shift_mesh_to_buildplate(shape)
    params = dict(DEFAULT_PARAMETERS)
    if parameters:
        params.update(parameters)
    features = [Feature(**f) for f in DEFAULT_FEATURE_TREE]
    obj = {
        "id": str(uuid.uuid4()),
        "name": name,
        "parameters": params,
        "feature_tree": features,
        "transform": Transform(),
        "shape": shape,
        "material": "PLA",
        "color": "#a9aaad",
        "template_hint": None,
        "manual": True,
        "primitive": "manual",
        "operation_history": [],
    }
    return obj


def create_primitive_object(
    primitive: str,
    name: str,
    center: list[float],
    size: list[float],
    height: float,
    radius: float | None = None,
) -> CadObject:
    """Create a simple expert-mode primitive on the build plate."""
    cx = float(center[0]) if len(center) > 0 else 0.0
    cy = float(center[1]) if len(center) > 1 else 0.0
    width = max(1.0, abs(float(size[0])) if len(size) > 0 else 40.0)
    depth = max(1.0, abs(float(size[1])) if len(size) > 1 else 30.0)
    h = max(0.5, min(500.0, float(height)))

    kind = primitive.strip().lower()
    if kind in {"circle", "cylinder", "hole"}:
        r = max(0.5, float(radius) if radius is not None else max(width, depth) / 2.0)
        shape = make_cylinder_body(r, h) or make_cylinder(r, h, origin=(0.0, 0.0, 0.0))
        params = {
            "width": r * 2.0,
            "depth": r * 2.0,
            "height": h,
            "thickness": h,
            "fillet_radius": 0.0,
            "chamfer_size": 0.0,
            "hole_diameter": r * 2.0,
        }
        obj_name = name or ("hole_guide" if kind == "hole" else "cylinder")
    else:
        shape = make_box_body(width, depth, h) or make_box(width, depth, h)
        params = {
            "width": width,
            "depth": depth,
            "height": h,
            "thickness": h,
            "fillet_radius": 0.0,
            "chamfer_size": 0.0,
        }
        obj_name = name or "rectangle"

    obj = create_manual_object(obj_name, shape, params)
    obj["primitive"] = "cylinder" if kind in {"circle", "cylinder", "hole"} else "rectangle"
    obj["transform"].position = [cx, cy, 0.0]
    if kind == "hole":
        obj["feature_tree"] = [
            Feature(id="hole_guide", type="hole_guide", enabled=True),
        ]
    return obj


def _create_box_component(
    name: str,
    width: float,
    depth: float,
    height: float,
    position: list[float],
    params: dict[str, float],
    *,
    rotation: list[float] | None = None,
    color: str = "#a9aaad",
    cut_holes: bool = False,
) -> CadObject:
    part_params = dict(DEFAULT_PARAMETERS)
    part_params.update(params)
    part_params.update({
        "width": float(width),
        "depth": float(depth),
        "height": float(height),
        "thickness": float(height),
    })
    fillet = max(0.0, min(float(params.get("fillet_radius", 0.0)), width / 2.0 - 0.1, depth / 2.0 - 0.1, height / 2.0 - 0.1))
    chamfer = max(0.0, min(float(params.get("chamfer_size", 0.0)), width / 2.0 - 0.1, depth / 2.0 - 0.1, height / 2.0 - 0.1))
    shape = make_box_body(
        width,
        depth,
        height,
        fillet=fillet,
        chamfer=chamfer,
        params=part_params if cut_holes else None,
    )
    if shape is None:
        if cut_holes:
            shape = _make_box_with_rect_holes(width, depth, height, part_params)
        elif fillet > 0.0:
            shape = make_rounded_box(width, depth, height, fillet, segments=8)
        elif chamfer > 0.0:
            shape = make_rounded_box(width, depth, height, chamfer, segments=1)
        else:
            shape = make_box(width, depth, height)
    obj = create_manual_object(name, shape, part_params)
    obj["primitive"] = "rectangle"
    obj["template_component"] = True
    obj["color"] = color
    obj["transform"] = Transform(
        position=[float(position[0]), float(position[1]), float(position[2])],
        rotation=rotation or [0.0, 0.0, 0.0],
        scale=[1.0, 1.0, 1.0],
    )
    return obj


def _create_cylinder_component(
    name: str,
    radius: float,
    height: float,
    position: list[float],
    params: dict[str, float],
    *,
    rotation: list[float] | None = None,
    color: str = "#a9aaad",
) -> CadObject:
    part_params = dict(DEFAULT_PARAMETERS)
    part_params.update(params)
    part_params.update({
        "width": radius * 2.0,
        "depth": radius * 2.0,
        "height": float(height),
        "thickness": float(height),
    })
    shape = make_cylinder_body(radius, height) or make_cylinder(radius, height)
    obj = create_manual_object(name, shape, part_params)
    obj["primitive"] = "cylinder"
    obj["template_component"] = True
    obj["color"] = color
    obj["transform"] = Transform(
        position=[float(position[0]), float(position[1]), float(position[2])],
        rotation=rotation or [0.0, 0.0, 0.0],
        scale=[1.0, 1.0, 1.0],
    )
    return obj


def _remove_object_direct(session: Session, object_id: str) -> None:
    if object_id in session["objects"]:
        del session["objects"][object_id]
    session["object_order"] = [oid for oid in session["object_order"] if oid != object_id]


def replace_object_with_template_assembly(
    session: Session,
    obj: CadObject,
    template_name: str | None,
    params: dict[str, float],
) -> list[str]:
    """Replace a generated single mesh with editable component bodies.

    This is an intentionally conservative bridge toward true sub-body editing:
    generated assemblies become separate manual CAD bodies, so transform and
    parameter edits can target useful parts such as base, column, rails, lips.
    """
    name = (template_name or "").strip().lower()
    parts: list[CadObject] = []
    color = obj.get("color", "#a9aaad")

    if name == "headphone stand":
        width = max(90.0, min(170.0, float(params.get("width", 120.0))))
        depth = max(90.0, min(170.0, float(params.get("depth", 120.0))))
        height = max(150.0, min(260.0, float(params.get("height", 205.0))))
        thickness = max(6.0, min(16.0, float(params.get("thickness", 9.0))))
        column_width = max(22.0, thickness * 3.0)
        column_depth = max(18.0, thickness * 2.2)
        column_height = height * 0.78
        top_z = thickness + column_height
        parts = [
            _create_box_component("headphone_base", width, depth, thickness, [0.0, 0.0, 0.0], params, color=color),
            _create_box_component("headphone_column", column_width, column_depth, column_height, [0.0, depth * 0.18, thickness], params, color=color),
            _create_box_component("headphone_top_cradle", width * 0.68, thickness * 2.2, thickness * 2.0, [0.0, depth * 0.20, top_z], params, color=color),
            _create_box_component("headphone_left_stop", thickness * 2.0, thickness * 3.0, thickness * 3.0, [-width * 0.34, depth * 0.18, top_z - thickness * 0.9], params, color=color),
            _create_box_component("headphone_right_stop", thickness * 2.0, thickness * 3.0, thickness * 3.0, [width * 0.34, depth * 0.18, top_z - thickness * 0.9], params, color=color),
            _create_box_component("headphone_cable_notch", width * 0.45, thickness * 1.3, thickness * 1.2, [0.0, -depth / 2.0 + thickness, thickness], params, color=color),
        ]
    elif name == "phone stand":
        width = max(78.0, min(130.0, float(params.get("width", 92.0))))
        depth = max(75.0, min(130.0, float(params.get("depth", 92.0))))
        height = max(92.0, min(170.0, float(params.get("height", 122.0))))
        thickness = max(5.0, min(12.0, float(params.get("thickness", 7.0))))
        angle = max(60.0, min(74.0, float(params.get("angle", 68.0))))
        parts = [
            _create_box_component("phone_base", width, depth, thickness, [0.0, 0.0, 0.0], params, color=color),
            _create_box_component("phone_left_lip", width * 0.36, thickness * 1.45, thickness * 2.0, [-width * 0.26, -depth / 2.0 + thickness, thickness], params, color=color),
            _create_box_component("phone_right_lip", width * 0.36, thickness * 1.45, thickness * 2.0, [width * 0.26, -depth / 2.0 + thickness, thickness], params, color=color),
            _create_box_component("phone_back_support", width * 0.70, thickness, height, [0.0, -depth * 0.05, thickness], params, rotation=[angle - 90.0, 0.0, 0.0], color=color),
            _create_box_component("phone_left_rail", max(thickness * 0.65, 4.5), depth * 0.54, thickness * 1.25, [-width * 0.41, -depth * 0.02, thickness], params, color=color),
            _create_box_component("phone_right_rail", max(thickness * 0.65, 4.5), depth * 0.54, thickness * 1.25, [width * 0.41, -depth * 0.02, thickness], params, color=color),
        ]
    elif name == "battery holder":
        slots = max(1, min(4, int(round(float(params.get("battery_slots", 1.0))))))
        width = max(70.0, min(260.0, float(params.get("width", 104.0)) * (1.0 + (slots - 1) * 0.82)))
        depth = max(55.0, min(150.0, float(params.get("depth", 92.0))))
        height = max(28.0, min(90.0, float(params.get("height", 46.0))))
        thickness = max(4.0, min(14.0, float(params.get("thickness", 7.0))))
        rail_width = max(thickness * 1.15, 7.0)
        rail_height = max(height * 0.52, 18.0)
        parts = [
            _create_box_component("battery_back_plate", width, depth, thickness, [0.0, 0.0, 0.0], params, color=color),
            _create_box_component("battery_front_stop", width * 0.88, thickness * 1.4, height * 0.45, [0.0, -depth / 2.0 + thickness, thickness], params, color=color),
            _create_box_component("battery_rear_register", width * 0.76, thickness, height * 0.32, [0.0, depth * 0.36, thickness], params, color=color),
        ]
        slot_width = width / slots
        for slot in range(slots):
            slot_center = -width / 2.0 + slot_width * (slot + 0.5)
            parts.extend([
                _create_box_component(f"battery_{slot + 1}_left_slide", rail_width, depth * 0.72, rail_height, [slot_center - slot_width * 0.26, -depth * 0.02, thickness], params, color=color),
                _create_box_component(f"battery_{slot + 1}_right_slide", rail_width, depth * 0.72, rail_height, [slot_center + slot_width * 0.26, -depth * 0.02, thickness], params, color=color),
            ])
    elif name == "electronics holder":
        width = max(55.0, min(180.0, float(params.get("width", 86.0))))
        depth = max(45.0, min(150.0, float(params.get("depth", 68.0))))
        height = max(20.0, min(100.0, float(params.get("height", 38.0))))
        thickness = max(3.0, min(12.0, float(params.get("thickness", 5.0))))
        parts = [
            _create_box_component("electronics_base", width * 1.18, depth, thickness, [0.0, 0.0, 0.0], params, color=color),
            _create_box_component("electronics_front_wall", width, thickness, height, [0.0, -depth / 2.0 + thickness / 2.0, thickness], params, color=color),
            _create_box_component("electronics_back_wall", width, thickness, height, [0.0, depth / 2.0 - thickness / 2.0, thickness], params, color=color),
            _create_box_component("electronics_left_wall", thickness, depth, height * 0.72, [-width / 2.0 + thickness / 2.0, 0.0, thickness], params, color=color),
            _create_box_component("electronics_right_wall", thickness, depth, height * 0.72, [width / 2.0 - thickness / 2.0, 0.0, thickness], params, color=color),
            _create_box_component("electronics_strap_bridge", width * 0.72, thickness * 0.8, thickness * 1.2, [0.0, 0.0, thickness + height], params, color=color),
        ]

    if not parts:
        return []

    source_id = obj["id"]
    _remove_object_direct(session, source_id)
    for part in parts:
        part["assembly_source"] = template_name
        add_object(session, part)
    session["selected_object_id"] = parts[0]["id"]
    return [f"created editable {template_name} assembly with {len(parts)} bodies"]


def replace_object_with_research_assembly(
    session: Session,
    obj: CadObject,
    brief: dict[str, Any] | None,
    params: dict[str, float],
) -> list[str]:
    """Create editable bodies from a source-informed design brief."""
    if not brief:
        return []

    category = str(brief.get("category") or "generic").strip().lower()
    if category == "generic":
        return []

    parts: list[CadObject] = []
    color = obj.get("color", "#a9aaad")
    width = max(10.0, float(params.get("width", 80.0)))
    depth = max(10.0, float(params.get("depth", 60.0)))
    height = max(4.0, float(params.get("height", 35.0)))
    thickness = max(1.0, min(30.0, float(params.get("thickness", 5.0))))
    wall = max(1.0, min(20.0, float(params.get("wall_thickness", 3.0))))

    base_params = dict(params)
    base_params["hole_count"] = max(0.0, float(params.get("hole_count", 0.0)))
    base_params["hole_diameter"] = max(1.0, float(params.get("hole_diameter", 5.0)))

    if category == "battery_holder":
        slots = max(1, min(6, int(round(float(params.get("battery_slots", params.get("slots", 1.0)))))))
        if slots > 1:
            width = max(width, 104.0 * (1.0 + (slots - 1) * 0.82))
        slot_width = width / slots
        rail_width = max(thickness * 1.15, 7.0)
        rail_height = max(height * 0.52, 18.0)
        parts = [
            _create_box_component("battery_mount_plate", width, depth, thickness, [0.0, 0.0, 0.0], base_params, color=color, cut_holes=True),
            _create_box_component("battery_front_stop", width * 0.88, thickness * 1.35, height * 0.42, [0.0, -depth / 2.0 + thickness, thickness], params, color=color),
            _create_box_component("battery_rear_register", width * 0.78, thickness, height * 0.30, [0.0, depth * 0.35, thickness], params, color=color),
        ]
        for slot in range(slots):
            slot_center = -width / 2.0 + slot_width * (slot + 0.5)
            parts.extend([
                _create_box_component(f"battery_{slot + 1}_left_slide", rail_width, depth * 0.72, rail_height, [slot_center - slot_width * 0.26, -depth * 0.02, thickness], params, color=color),
                _create_box_component(f"battery_{slot + 1}_right_slide", rail_width, depth * 0.72, rail_height, [slot_center + slot_width * 0.26, -depth * 0.02, thickness], params, color=color),
                _create_box_component(f"battery_{slot + 1}_center_key", slot_width * 0.28, thickness * 0.8, rail_height * 0.45, [slot_center, depth * 0.02, thickness], params, color=color),
            ])
    elif category == "device_stand":
        angle = max(50.0, min(78.0, float(params.get("angle", 68.0))))
        if any(word in str(brief.get("prompt", "")).lower() for word in ("headset", "headphone")):
            column_width = max(24.0, thickness * 3.0)
            column_depth = max(18.0, thickness * 2.2)
            column_height = max(120.0, height * 0.78)
            top_z = thickness + column_height
            parts = [
                _create_box_component("stand_base", max(width, 120.0), max(depth, 110.0), thickness, [0.0, 0.0, 0.0], params, color=color),
                _create_box_component("stand_column", column_width, column_depth, column_height, [0.0, depth * 0.16, thickness], params, color=color),
                _create_box_component("stand_top_cradle", width * 0.68, thickness * 2.2, thickness * 2.0, [0.0, depth * 0.16, top_z], params, color=color),
                _create_box_component("stand_left_stop", thickness * 2.0, thickness * 3.0, thickness * 3.0, [-width * 0.34, depth * 0.16, top_z - thickness], params, color=color),
                _create_box_component("stand_right_stop", thickness * 2.0, thickness * 3.0, thickness * 3.0, [width * 0.34, depth * 0.16, top_z - thickness], params, color=color),
            ]
        else:
            parts = [
                _create_box_component("stand_base", width, depth, thickness, [0.0, 0.0, 0.0], params, color=color),
                _create_box_component("stand_front_left_lip", width * 0.34, thickness * 1.4, thickness * 2.0, [-width * 0.26, -depth / 2.0 + thickness, thickness], params, color=color),
                _create_box_component("stand_front_right_lip", width * 0.34, thickness * 1.4, thickness * 2.0, [width * 0.26, -depth / 2.0 + thickness, thickness], params, color=color),
                _create_box_component("stand_back_support", width * 0.72, thickness, height, [0.0, -depth * 0.04, thickness], params, rotation=[angle - 90.0, 0.0, 0.0], color=color),
                _create_box_component("stand_left_rail", max(thickness * 0.65, 4.5), depth * 0.55, thickness * 1.2, [-width * 0.42, -depth * 0.02, thickness], params, color=color),
                _create_box_component("stand_right_rail", max(thickness * 0.65, 4.5), depth * 0.55, thickness * 1.2, [width * 0.42, -depth * 0.02, thickness], params, color=color),
            ]
    elif category in {"electronics_holder", "holder"}:
        tray_h = max(height, thickness * 4.0)
        parts = [
            _create_box_component("holder_base", width * 1.12, depth, thickness, [0.0, 0.0, 0.0], base_params, color=color, cut_holes=True),
            _create_box_component("holder_front_lip", width, thickness, tray_h * 0.52, [0.0, -depth / 2.0 + thickness / 2.0, thickness], params, color=color),
            _create_box_component("holder_back_wall", width, thickness, tray_h * 0.78, [0.0, depth / 2.0 - thickness / 2.0, thickness], params, color=color),
            _create_box_component("holder_left_wall", thickness, depth * 0.86, tray_h * 0.66, [-width / 2.0 + thickness / 2.0, 0.0, thickness], params, color=color),
            _create_box_component("holder_right_wall", thickness, depth * 0.86, tray_h * 0.66, [width / 2.0 - thickness / 2.0, 0.0, thickness], params, color=color),
        ]
        if category == "electronics_holder":
            parts.append(
                _create_box_component("holder_strap_bridge", width * 0.72, thickness * 0.8, thickness * 1.2, [0.0, 0.0, thickness + tray_h], params, color=color)
            )
    elif category == "enclosure":
        parts = [
            _create_box_component("enclosure_floor", width, depth, wall, [0.0, 0.0, 0.0], params, color=color),
            _create_box_component("enclosure_front_wall", width, wall, height, [0.0, -depth / 2.0 + wall / 2.0, wall], params, color=color),
            _create_box_component("enclosure_back_wall", width, wall, height, [0.0, depth / 2.0 - wall / 2.0, wall], params, color=color),
            _create_box_component("enclosure_left_wall", wall, depth, height, [-width / 2.0 + wall / 2.0, 0.0, wall], params, color=color),
            _create_box_component("enclosure_right_wall", wall, depth, height, [width / 2.0 - wall / 2.0, 0.0, wall], params, color=color),
            _create_box_component("enclosure_lid_register", width * 0.84, depth * 0.84, wall, [0.0, 0.0, wall + height], params, color=color),
        ]
    elif category == "organizer":
        divider_count = max(1, min(8, int(round(float(params.get("divider_count", 3.0))))))
        parts = [
            _create_box_component("organizer_floor", width, depth, wall, [0.0, 0.0, 0.0], params, color=color),
            _create_box_component("organizer_front_wall", width, wall, height, [0.0, -depth / 2.0 + wall / 2.0, wall], params, color=color),
            _create_box_component("organizer_back_wall", width, wall, height, [0.0, depth / 2.0 - wall / 2.0, wall], params, color=color),
            _create_box_component("organizer_left_wall", wall, depth, height, [-width / 2.0 + wall / 2.0, 0.0, wall], params, color=color),
            _create_box_component("organizer_right_wall", wall, depth, height, [width / 2.0 - wall / 2.0, 0.0, wall], params, color=color),
        ]
        for idx in range(1, divider_count):
            x = -width / 2.0 + width * idx / divider_count
            parts.append(_create_box_component(f"organizer_divider_{idx}", wall, depth * 0.86, height * 0.82, [x, 0.0, wall], params, color=color))
    elif category == "organic":
        radius = min(width, depth) / 2.8
        parts = [
            _create_cylinder_component("organic_body", radius, max(height * 0.72, 18.0), [0.0, 0.0, 0.0], params, color=color),
            _create_cylinder_component("organic_head", radius * 0.78, max(height * 0.36, 14.0), [0.0, 0.0, height * 0.68], params, color=color),
        ]
        appendages = 8 if "octopus" in str(brief.get("prompt", "")).lower() else 4
        import math

        for idx in range(appendages):
            angle = 360.0 * idx / appendages
            rad = math.radians(angle)
            x = math.cos(rad) * radius * 0.9
            y = math.sin(rad) * radius * 0.9
            parts.append(
                _create_cylinder_component(
                    f"organic_appendage_{idx + 1}",
                    max(radius * 0.22, 3.0),
                    radius * 1.45,
                    [x, y, thickness * 0.45],
                    params,
                    rotation=[82.0, 0.0, angle],
                    color=color,
                )
            )
    elif category == "tool":
        parts = [
            _create_box_component("tool_base_plate", width, depth, max(height, thickness), [0.0, 0.0, 0.0], base_params, color=color, cut_holes=True),
            _create_box_component("tool_alignment_rib", width * 0.72, wall, max(height * 0.8, wall), [0.0, 0.0, max(height, thickness)], params, color=color),
        ]

    if not parts:
        return []

    source_id = obj["id"]
    _remove_object_direct(session, source_id)
    for part in parts:
        part["assembly_source"] = f"research:{category}"
        part["research_brief"] = brief
        add_object(session, part)
    session["selected_object_id"] = ""
    return [f"created editable research assembly ({category.replace('_', ' ')}) with {len(parts)} bodies"]


def _make_open_shell_box(width: float, depth: float, height: float, wall: float) -> TriMesh:
    """Create a simple open-top shell from box primitives."""
    wall = max(0.5, min(wall, width / 3.0, depth / 3.0, height / 2.0))
    mesh = TriMesh()

    parts = [
        (width, depth, wall, [0.0, 0.0, wall / 2.0]),
        (width, wall, height, [0.0, -depth / 2.0 + wall / 2.0, height / 2.0]),
        (width, wall, height, [0.0, depth / 2.0 - wall / 2.0, height / 2.0]),
        (wall, max(wall, depth - wall * 2.0), height, [-width / 2.0 + wall / 2.0, 0.0, height / 2.0]),
        (wall, max(wall, depth - wall * 2.0), height, [width / 2.0 - wall / 2.0, 0.0, height / 2.0]),
    ]

    for part_width, part_depth, part_height, position in parts:
        mesh = mesh.merge(
            make_box(part_width, part_depth, part_height).transformed(
                Transform(position=position, rotation=[0.0, 0.0, 0.0], scale=[1.0, 1.0, 1.0])
            )
        )

    return mesh


def _hole_specs(params: dict[str, float]) -> list[tuple[float, float, float]]:
    specs: list[tuple[float, float, float]] = []
    count = max(0, int(params.get("custom_hole_count", 0.0)))
    for index in range(count):
        x_key = f"custom_hole_{index}_x"
        y_key = f"custom_hole_{index}_y"
        d_key = f"custom_hole_{index}_diameter"
        if x_key in params and y_key in params:
            specs.append((
                float(params[x_key]),
                float(params[y_key]),
                max(0.5, float(params.get(d_key, params.get("hole_diameter", 5.0)))),
            ))

    generated_count = max(0, int(round(params.get("hole_count", 0.0)))) - len(specs)
    if generated_count > 0:
        width = max(1.0, float(params.get("width", 80.0)))
        depth = max(1.0, float(params.get("depth", 70.0)))
        diameter = max(1.0, float(params.get("hole_diameter", 5.0)))
        spacing = width / (generated_count + 1)
        for i in range(generated_count):
            specs.append((-width / 2.0 + spacing * (i + 1), depth * 0.15, diameter))
    return specs


def _make_box_with_rect_holes(width: float, depth: float, height: float, params: dict[str, float]) -> TriMesh:
    """Approximate through-holes in mesh fallback by subdividing the box."""
    holes = _hole_specs(params)
    if not holes:
        return make_box(width, depth, height)

    xs = [-width / 2.0, width / 2.0]
    ys = [-depth / 2.0, depth / 2.0]
    expanded: list[tuple[float, float, float]] = []
    for x, y, diameter in holes:
        r = diameter / 2.0
        x0, x1 = max(-width / 2.0, x - r), min(width / 2.0, x + r)
        y0, y1 = max(-depth / 2.0, y - r), min(depth / 2.0, y + r)
        if x1 <= x0 or y1 <= y0:
            continue
        expanded.append((x, y, r))
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
            inside_hole = any((cx - hx) ** 2 + (cy - hy) ** 2 <= hr ** 2 for hx, hy, hr in expanded)
            if inside_hole:
                continue
            part = make_box(max(0.01, x1 - x0), max(0.01, y1 - y0), height).transformed(
                Transform(position=[cx, cy, height / 2.0], rotation=[0.0, 0.0, 0.0], scale=[1.0, 1.0, 1.0])
            )
            mesh = mesh.merge(part)
    return mesh if mesh.verts else make_box(width, depth, height)


def rebuild_manual_object(obj: CadObject) -> None:
    """Rebuild an expert-mode primitive from its parameters and operations."""
    params = obj["parameters"]
    primitive = obj.get("primitive", "rectangle")
    width = max(1.0, float(params.get("width", 40.0)))
    depth = max(1.0, float(params.get("depth", 30.0)))
    height = max(0.5, float(params.get("height", params.get("thickness", 8.0))))

    if primitive in {"circle", "cylinder"}:
        radius = max(width, depth) / 2.0
        obj["shape"] = make_cylinder_body(radius, height) or make_cylinder(radius, height)
    elif primitive == "hole":
        radius = max(float(params.get("hole_diameter", max(width, depth))) / 2.0, 0.5)
        obj["shape"] = make_cylinder_body(radius, height) or make_cylinder(radius, height)
    else:
        fillet = max(0.0, float(params.get("fillet_radius", 0.0)))
        chamfer = max(0.0, float(params.get("chamfer_size", 0.0)))
        shell = bool(float(params.get("shell_enabled", 0.0)))
        kernel_shape = make_box_body(
            width,
            depth,
            height,
            fillet=fillet,
            chamfer=chamfer,
            shell_wall=max(0.0, float(params.get("wall_thickness", 0.0))) if shell else 0.0,
            params=params,
        )
        if kernel_shape:
            obj["shape"] = kernel_shape
        elif shell:
            obj["shape"] = _make_open_shell_box(
                width,
                depth,
                height,
                max(0.5, float(params.get("wall_thickness", 2.0))),
            )
        elif fillet > 0.0:
            obj["shape"] = make_rounded_box(width, depth, height, fillet, segments=8)
        elif chamfer > 0.0:
            obj["shape"] = make_rounded_box(width, depth, height, chamfer, segments=1)
        else:
            obj["shape"] = _make_box_with_rect_holes(width, depth, height, params)

    obj["shape"] = shift_mesh_to_buildplate(obj["shape"])


def _set_feature_enabled(features: list[Feature], feature_type: str, enabled: bool) -> None:
    for feature in features:
        if feature.type == feature_type:
            feature.enabled = enabled
            return
    features.append(Feature(id=feature_type, type=feature_type, enabled=enabled))


def _is_base_like(obj: CadObject) -> bool:
    name = str(obj.get("name", "")).lower()
    primitive = str(obj.get("primitive", "")).lower()
    params = obj.get("parameters", {})
    width = float(params.get("width", 0.0))
    depth = float(params.get("depth", 0.0))
    height = float(params.get("height", params.get("thickness", 0.0)))
    explicit = any(
        token in name
        for token in (
            "base",
            "plate",
            "floor",
            "mount",
            "back_plate",
            "holder_base",
            "battery_mount",
            "electronics_base",
        )
    )
    flat = primitive == "rectangle" and width >= 25.0 and depth >= 20.0 and height <= max(18.0, min(width, depth) * 0.35)
    return explicit or flat


def _mounting_hole_positions(width: float, depth: float, count: int) -> list[tuple[float, float]]:
    count = max(2, min(4, int(count)))
    if count >= 4 and width >= 55.0 and depth >= 45.0:
        return [
            (-width * 0.32, -depth * 0.26),
            (width * 0.32, -depth * 0.26),
            (-width * 0.32, depth * 0.26),
            (width * 0.32, depth * 0.26),
        ]
    if count == 3:
        return [
            (-width * 0.30, 0.0),
            (0.0, 0.0),
            (width * 0.30, 0.0),
        ]
    return [
        (-width * 0.28, 0.0),
        (width * 0.28, 0.0),
    ]


def _apply_mounting_holes_to_object(
    obj: CadObject,
    *,
    count: int,
    diameter: float,
    counterbore_diameter: float,
) -> None:
    params = obj["parameters"]
    width = max(1.0, float(params.get("width", 80.0)))
    depth = max(1.0, float(params.get("depth", 70.0)))
    height = max(0.5, float(params.get("height", params.get("thickness", 8.0))))
    safe_diameter = max(1.0, min(float(diameter), min(width, depth) * 0.45))
    safe_counterbore = max(safe_diameter + 1.0, min(float(counterbore_diameter), min(width, depth) * 0.7))
    safe_depth = max(0.6, min(height * 0.45, safe_diameter * 0.45, 3.0))
    positions = _mounting_hole_positions(width, depth, count)

    # Replace generated holes with explicit holes so future parameter changes
    # keep the same layout instead of drifting.
    for key in list(params.keys()):
        if key.startswith("custom_hole_"):
            del params[key]

    for index, (x, y) in enumerate(positions):
        params[f"custom_hole_{index}_x"] = x
        params[f"custom_hole_{index}_y"] = y
        params[f"custom_hole_{index}_diameter"] = safe_diameter

    params["custom_hole_count"] = float(len(positions))
    params["hole_count"] = float(len(positions))
    params["hole_diameter"] = safe_diameter
    params["counterbore_diameter"] = safe_counterbore
    params["counterbore_depth"] = safe_depth
    _set_feature_enabled(obj["feature_tree"], "mount_holes", True)

    if obj.get("manual"):
        rebuild_manual_object(obj)
    else:
        rebuild_object(obj)


def add_mounting_holes_to_session(
    session: Session,
    selected: CadObject | None,
    *,
    count: int = 2,
    diameter: float = 5.0,
    counterbore_diameter: float = 9.0,
) -> list[str]:
    """Add predictable mounting holes to base-like bodies without regenerating."""
    candidates: list[CadObject] = []
    if selected and _is_base_like(selected):
        candidates = [selected]
    else:
        candidates = [
            session["objects"][oid]
            for oid in session["object_order"]
            if _is_base_like(session["objects"][oid])
        ]
        if not candidates and selected:
            candidates = [selected]

    if not candidates:
        return ["mounting holes skipped: no editable base body found"]

    for target in candidates:
        target_count = 4 if count >= 4 or float(target["parameters"].get("width", 0.0)) >= 150.0 else max(2, count)
        _apply_mounting_holes_to_object(
            target,
            count=target_count,
            diameter=diameter,
            counterbore_diameter=counterbore_diameter,
        )

    names = ", ".join(str(target.get("name", "part")) for target in candidates[:4])
    return [f"added mounting holes with counterbore to {names}"]


def apply_expert_operation(
    obj: CadObject,
    operation: str,
    amount: float,
    target: str = "body",
) -> list[str]:
    """Apply an expert-mode operation and rebuild the selected object."""
    op = operation.strip().lower()
    amt = max(0.0, float(amount))
    params = obj["parameters"]
    features = obj["feature_tree"]
    actions: list[str] = []

    if op == "fillet":
        params["fillet_radius"] = amt
        params["chamfer_size"] = 0.0
        _set_feature_enabled(features, "fillet_edges", True)
        _set_feature_enabled(features, "chamfer_edges", False)
        actions.append(f"fillet {target} radius {amt}mm")
    elif op == "chamfer":
        params["chamfer_size"] = amt
        params["fillet_radius"] = 0.0
        _set_feature_enabled(features, "chamfer_edges", True)
        _set_feature_enabled(features, "fillet_edges", False)
        actions.append(f"chamfer {target} size {amt}mm")
    elif op == "extrude":
        params["height"] = max(0.5, float(params.get("height", 8.0)) + amount)
        params["thickness"] = params["height"]
        actions.append(f"extruded {target} by {amount}mm")
    elif op == "shell":
        params["wall_thickness"] = max(0.5, amt)
        params["shell_enabled"] = 1.0
        actions.append(f"set shell wall thickness to {amt}mm")
    else:
        actions.append(f"unsupported expert operation: {operation}")
        return actions

    obj.setdefault("operation_history", []).append(
        {"operation": op, "target": target, "amount": amount}
    )
    if obj.get("manual"):
        rebuild_manual_object(obj)
    else:
        rebuild_object(obj)
    return actions


def add_hole_to_object(obj: CadObject, center: list[float], diameter: float) -> list[str]:
    """Add a vertical hole at a sketch-plane location and rebuild the object."""
    if len(center) < 2:
        return ["hole skipped: missing center"]

    transform: Transform = obj["transform"]
    sx = max(0.001, float(transform.scale[0]))
    sy = max(0.001, float(transform.scale[1]))
    local_x = (float(center[0]) - float(transform.position[0])) / sx
    local_y = (float(center[1]) - float(transform.position[1])) / sy

    params = obj["parameters"]
    index = max(0, int(params.get("custom_hole_count", 0.0)))
    params[f"custom_hole_{index}_x"] = local_x
    params[f"custom_hole_{index}_y"] = local_y
    params[f"custom_hole_{index}_diameter"] = max(0.5, float(diameter))
    params["custom_hole_count"] = float(index + 1)
    params["hole_count"] = max(float(params.get("hole_count", 0.0)), float(index + 1))
    params["hole_diameter"] = max(0.5, float(diameter))
    _set_feature_enabled(obj["feature_tree"], "mount_holes", True)

    if obj.get("manual"):
        rebuild_manual_object(obj)
    else:
        rebuild_object(obj)
    return [f"cut hole diameter {diameter}mm"]


def split_object_by_line(session: Session, obj: CadObject, center: list[float], delta: list[float]) -> list[str]:
    """Split a manual rectangular primitive into two movable bodies."""
    if not obj.get("manual") or obj.get("primitive") != "rectangle":
        return ["split skipped: selected object is not a sketched rectangle"]
    if len(center) < 2 or len(delta) < 2:
        return ["split skipped: missing line"]

    params = obj["parameters"]
    width = max(1.0, float(params.get("width", 40.0)))
    depth = max(1.0, float(params.get("depth", 30.0)))
    height = max(0.5, float(params.get("height", params.get("thickness", 8.0))))
    transform: Transform = obj["transform"]
    local_x = float(center[0]) - float(transform.position[0])
    local_y = float(center[1]) - float(transform.position[1])

    vertical_split = abs(float(delta[1])) >= abs(float(delta[0]))
    new_objects: list[CadObject] = []
    if vertical_split:
        split_x = max(-width / 2.0 + 1.0, min(width / 2.0 - 1.0, local_x))
        left_w = split_x + width / 2.0
        right_w = width / 2.0 - split_x
        specs = [
            (left_w, depth, [transform.position[0] - (width - left_w) / 2.0, transform.position[1], transform.position[2]]),
            (right_w, depth, [transform.position[0] + (width - right_w) / 2.0, transform.position[1], transform.position[2]]),
        ]
    else:
        split_y = max(-depth / 2.0 + 1.0, min(depth / 2.0 - 1.0, local_y))
        front_d = split_y + depth / 2.0
        back_d = depth / 2.0 - split_y
        specs = [
            (width, front_d, [transform.position[0], transform.position[1] - (depth - front_d) / 2.0, transform.position[2]]),
            (width, back_d, [transform.position[0], transform.position[1] + (depth - back_d) / 2.0, transform.position[2]]),
        ]

    for idx, (part_w, part_d, position) in enumerate(specs, start=1):
        part_params = dict(params)
        part_params["width"] = part_w
        part_params["depth"] = part_d
        part_params["height"] = height
        part = create_manual_object(f"{obj['name']}_part_{idx}", make_box(part_w, part_d, height), part_params)
        part["primitive"] = "rectangle"
        part["transform"] = Transform(
            position=list(position),
            rotation=list(transform.rotation),
            scale=list(transform.scale),
        )
        part["material"] = obj.get("material", "PLA")
        part["color"] = obj.get("color", "#b8babd")
        rebuild_manual_object(part)
        new_objects.append(part)

    object_id = obj["id"]
    del session["objects"][object_id]
    session["object_order"] = [oid for oid in session["object_order"] if oid != object_id]
    for part in new_objects:
        add_object(session, part)
    session["selected_object_id"] = new_objects[-1]["id"]
    return ["split rectangle into 2 editable bodies"]


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------


def create_session(session_id: str | None = None) -> str:
    """Create a new session with one default object.  Returns session id."""
    sid = (session_id or "").strip() or str(uuid.uuid4())
    base = create_object("part_1")
    with _lock:
        _sessions[sid] = {
            "session_id": sid,
            "objects": {base["id"]: base},
            "object_order": [base["id"]],
            "selected_object_id": "",
            "edit_history": [],
            "version": 0,
            "printer": "adventurer_3",
            "fit": True,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "scene_token": _new_scene_token(),
            "undo_stack": [],
            "redo_stack": [],
        }
    return sid


def get_session(session_id: str) -> Session | None:
    """Return session dict or None."""
    with _lock:
        return _sessions.get(session_id)


def get_or_create_session(session_id: str | None) -> Session:
    """Return existing session or create a new one."""
    sid = (session_id or "").strip()
    with _lock:
        if sid and sid in _sessions:
            return _sessions[sid]
    # Create outside lock (rebuild_from_features is CPU-bound)
    new_sid = create_session(sid if sid else None)
    with _lock:
        return _sessions[new_sid]


def bump_version(session: Session) -> None:
    """Increment version and refresh scene token."""
    session["version"] += 1
    session["updated_at"] = _now_iso()
    session["scene_token"] = _new_scene_token()


def _snapshot(session: Session) -> dict[str, Any]:
    return {
        "objects": deepcopy(session["objects"]),
        "object_order": list(session["object_order"]),
        "selected_object_id": session.get("selected_object_id", ""),
        "printer": session.get("printer"),
        "fit": session.get("fit"),
    }


def _restore_snapshot(session: Session, snapshot: dict[str, Any]) -> None:
    session["objects"] = deepcopy(snapshot["objects"])
    session["object_order"] = list(snapshot["object_order"])
    session["selected_object_id"] = snapshot.get("selected_object_id", "")
    if snapshot.get("printer"):
        session["printer"] = snapshot["printer"]
    if snapshot.get("fit") is not None:
        session["fit"] = snapshot["fit"]


def save_undo_snapshot(session: Session) -> None:
    session.setdefault("undo_stack", []).append(_snapshot(session))
    session["undo_stack"] = session["undo_stack"][-50:]
    session["redo_stack"] = []


def undo_session(session: Session) -> bool:
    undo_stack = session.setdefault("undo_stack", [])
    if not undo_stack:
        return False
    session.setdefault("redo_stack", []).append(_snapshot(session))
    _restore_snapshot(session, undo_stack.pop())
    bump_version(session)
    return True


def redo_session(session: Session) -> bool:
    redo_stack = session.setdefault("redo_stack", [])
    if not redo_stack:
        return False
    session.setdefault("undo_stack", []).append(_snapshot(session))
    _restore_snapshot(session, redo_stack.pop())
    bump_version(session)
    return True


def add_history(
    session: Session,
    prompt: str,
    actions: list[str],
) -> None:
    session["edit_history"].append(
        {
            "time": session["updated_at"],
            "prompt": prompt,
            "actions": actions,
            "version": session["version"],
        }
    )


# ---------------------------------------------------------------------------
# Object helpers
# ---------------------------------------------------------------------------


def get_selected_object(session: Session) -> CadObject:
    oid = session["selected_object_id"]
    return session["objects"][oid]


def get_object(session: Session, object_id: str | None) -> CadObject | None:
    oid = object_id or session["selected_object_id"]
    return session["objects"].get(oid)


def add_object(session: Session, obj: CadObject) -> None:
    session["objects"][obj["id"]] = obj
    session["object_order"].append(obj["id"])


def remove_object(session: Session, object_id: str) -> bool:
    """Remove an object.

    If it is the last object, replace it with a fresh empty part so users can
    clear generated models without losing the session.
    """
    if object_id not in session["objects"]:
        return False
    if len(session["object_order"]) <= 1:
        del session["objects"][object_id]
        session["object_order"] = []
        session["selected_object_id"] = ""
        return True
    del session["objects"][object_id]
    session["object_order"] = [
        oid for oid in session["object_order"] if oid != object_id
    ]
    if session["selected_object_id"] == object_id:
        session["selected_object_id"] = session["object_order"][-1]
    return True


def rebuild_object(obj: CadObject) -> None:
    """Rebuild the mesh from current parameters + feature tree."""
    if obj.get("manual"):
        rebuild_manual_object(obj)
        return

    template_hint = obj.get("template_hint")
    obj["shape"] = rebuild_from_features(
        obj["parameters"], 
        obj["feature_tree"],
        template_hint=template_hint,
    )
    # Auto-adjust Z position so the model sits on the build plate
    auto_adjust_z_position(obj["transform"], obj["shape"])


def acquire_lock() -> RLock:
    """Return the module lock for external callers that need atomicity."""
    return _lock
