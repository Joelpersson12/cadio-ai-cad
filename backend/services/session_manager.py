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
    rebuild_from_features,
)

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
    }
    auto_adjust_z_position(obj["transform"], shape)
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
        shape = make_cylinder(r, h, origin=(0.0, 0.0, 0.0))
        params = {
            "width": r * 2.0,
            "depth": r * 2.0,
            "height": h,
            "thickness": h,
            "hole_diameter": r * 2.0,
        }
        obj_name = name or ("hole_guide" if kind == "hole" else "cylinder")
    else:
        shape = make_box(width, depth, h)
        params = {
            "width": width,
            "depth": depth,
            "height": h,
            "thickness": h,
        }
        obj_name = name or "rectangle"

    obj = create_manual_object(obj_name, shape, params)
    obj["transform"].position = [cx, cy, 0.0]
    if kind == "hole":
        obj["feature_tree"] = [
            Feature(id="hole_guide", type="hole_guide", enabled=True),
        ]
    return obj


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
