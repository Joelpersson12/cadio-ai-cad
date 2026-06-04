"""Thread-safe session manager for Cadio CAD sessions.

Each session holds a collection of CAD objects, selection state,
edit history, and printer configuration.  All mutations go through
this module so locking is centralized.
"""

from __future__ import annotations

import uuid
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
            obj["shape"] = make_box(width, depth, height)

    obj["shape"] = shift_mesh_to_buildplate(obj["shape"])


def _set_feature_enabled(features: list[Feature], feature_type: str, enabled: bool) -> None:
    for feature in features:
        if feature.type == feature_type:
            feature.enabled = enabled
            return
    features.append(Feature(id=feature_type, type=feature_type, enabled=enabled))


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
            "selected_object_id": base["id"],
            "edit_history": [],
            "version": 0,
            "printer": "adventurer_3",
            "fit": True,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "scene_token": _new_scene_token(),
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
    """Remove an object.  Returns False if it's the last one."""
    if len(session["object_order"]) <= 1:
        return False
    if object_id not in session["objects"]:
        return False
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
