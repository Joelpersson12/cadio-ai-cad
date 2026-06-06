"""Thread-safe session manager for Cadio CAD sessions.

Each session holds a collection of CAD objects, selection state,
edit history, and printer configuration.  All mutations go through
this module so locking is centralized.
"""

from __future__ import annotations

import uuid
import math
import re
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
from backend.services.cad_kernel import make_battery_holder_body, make_box_body, make_cylinder_body
from backend.services.prompt_translation import normalize_source_query, translated_query_action

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


def _prompt_match_text(prompt: str) -> str:
    translated = normalize_source_query(prompt)
    return f"{prompt or ''} {translated}".strip().lower()


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


def _make_triangular_prism(width: float, depth: float, height: float) -> TriMesh:
    """Create a right-triangle side gusset extruded along X."""
    mesh = TriMesh()
    hw = width / 2.0
    hd = depth / 2.0
    points = [
        (-hw, -hd, 0.0),
        (-hw, hd, 0.0),
        (-hw, hd, height),
        (hw, -hd, 0.0),
        (hw, hd, 0.0),
        (hw, hd, height),
    ]
    ids = [mesh.add_vertex(point) for point in points]
    mesh.add_tri(ids[0], ids[2], ids[1])
    mesh.add_tri(ids[3], ids[4], ids[5])
    mesh.add_quad(ids[0], ids[3], ids[5], ids[2])
    mesh.add_quad(ids[1], ids[2], ids[5], ids[4])
    mesh.add_quad(ids[0], ids[1], ids[4], ids[3])
    return mesh


def _create_gusset_component(
    name: str,
    width: float,
    depth: float,
    height: float,
    position: list[float],
    params: dict[str, float],
    *,
    color: str = "#a9aaad",
) -> CadObject:
    part_params = dict(DEFAULT_PARAMETERS)
    part_params.update(params)
    part_params.update({
        "width": float(width),
        "depth": float(depth),
        "height": float(height),
        "thickness": float(width),
    })
    obj = create_manual_object(name, _make_triangular_prism(width, depth, height), part_params)
    obj["primitive"] = "gusset"
    obj["template_component"] = True
    obj["color"] = color
    obj["transform"] = Transform(
        position=[float(position[0]), float(position[1]), float(position[2])],
        rotation=[0.0, 0.0, 0.0],
        scale=[1.0, 1.0, 1.0],
    )
    return obj


def _remove_object_direct(session: Session, object_id: str) -> None:
    if object_id in session["objects"]:
        del session["objects"][object_id]
    session["object_order"] = [oid for oid in session["object_order"] if oid != object_id]
    if session.get("selected_object_id") == object_id:
        session["selected_object_id"] = ""


def _is_generated_object(obj: CadObject) -> bool:
    """Return true for AI/template bodies that may be replaced as a set."""
    return bool(
        obj.get("template_component")
        or obj.get("assembly_source")
        or obj.get("research_brief")
        or obj.get("template_hint")
        or not obj.get("manual")
    )


def prepare_generation_target(session: Session, name: str = "part_1") -> CadObject:
    """Clear previous generated geometry and return a fresh seed object.

    Product prompts should behave like "replace generated model", not "swap one
    selected part inside the old assembly". Manual sketch bodies are preserved.
    """
    generated_ids = [
        oid
        for oid in list(session["object_order"])
        if _is_generated_object(session["objects"][oid])
    ]
    for oid in generated_ids:
        _remove_object_direct(session, oid)

    obj = create_object(name)
    obj["generated_seed"] = True
    add_object(session, obj)
    session["selected_object_id"] = obj["id"]
    return obj


SOURCE_PHONE_STAND_META: dict[str, Any] = {
    "id": "source-phone-tablet-flat-fold-stand",
    "title": "Phone/Tablet Stand - Flat fold - Print in place!",
    "author": "jonnig",
    "source": "printables/thingiverse",
    "printables_url": "https://www.printables.com/model/1161-phonetablet-stand-flat-fold-print-in-place",
    "thingiverse_url": "https://www.thingiverse.com/thing:3146835",
    "license": "CC BY-NC 4.0",
    "dimensions": {
        "small": "52x83x3mm",
        "medium": "60x100x4mm",
        "large": "120x80x5mm",
    },
    "notes": [
        "popular flat-fold print-in-place stand",
        "reconstructed parametrically from public dimensions and source geometry signals",
    ],
}


SOURCE_BATTERY_HOLDER_META: dict[str, Any] = {
    "id": "generative-power-tool-battery-wall-mount",
    "title": "Power-tool battery wall mount recipe",
    "source": "generative recipe from prompt and source signals",
    "reference_queries": [
        "power tool battery holder wall mount popular 3d print",
        "battery holder flat bottom printable",
        "dual battery holder printable slide rail",
    ],
    "notes": [
        "multi-slot wall mount layout",
        "slide rails, rear stops, hidden screw pattern, and latch pads",
    ],
}


def _source_prompt_kind(prompt: str) -> str | None:
    text = _prompt_match_text(prompt)
    if not text:
        return None
    battery_terms = ("battery", "batteri", "batteries")
    battery_brands = ("dewalt", "makita", "milwaukee", "ryobi", "bosch")
    mount_terms = ("holder", "mount", "wall", "rack", "hållare", "hallare", "vägg", "vagg")
    if any(word in text for word in battery_terms) and any(word in text for word in mount_terms):
        return "dewalt_battery_holder" if "dewalt" in text else "battery_holder"
    if any(word in text for word in battery_brands) and any(word in text for word in mount_terms):
        return "dewalt_battery_holder"
    if any(word in text for word in ("headphone", "headset", "hörlur", "horlur")):
        return None
    device_terms = ("phone", "iphone", "smartphone", "mobile", "mobil", "tablet", "ipad")
    stand_terms = ("stand", "holder", "dock", "ställ", "stall", "hållare", "hallare", "stativ")
    if any(word in text for word in device_terms) and any(word in text for word in stand_terms):
        return "phone_stand"
    return None


def _source_signal_summary(prompt: str) -> str:
    """Return a short source-search summary without making generation depend on it."""
    translation = translated_query_action(prompt)
    try:
        from backend.services.design_providers import get_provider_registry

        examples = get_provider_registry().search_all(prompt, limit=4)
    except Exception:
        examples = []

    if not examples:
        fallback = "source-search: no live provider hits; used curated popular source model"
        return f"{translation}; {fallback}" if translation else fallback
    top = "; ".join(f"{ex.source}:{ex.title}" for ex in examples[:3])
    summary = f"source-search: {top}"
    return f"{translation}; {summary}" if translation else summary


def _source_file_value(source_file: Any, key: str, default: Any = None) -> Any:
    if isinstance(source_file, dict):
        return source_file.get(key, default)
    return getattr(source_file, key, default)


def _source_file_score(source_file: Any, prompt: str, preferred_slots: int = 0) -> float:
    text = _prompt_match_text(prompt)
    prompt_words = {word for word in re.findall(r"[a-z0-9]+", text) if len(word) > 2}
    name = str(_source_file_value(source_file, "name", "") or "").lower()
    file_type = str(_source_file_value(source_file, "file_type", "") or "").lower()
    size = max(0, int(_source_file_value(source_file, "file_size", 0) or 0))
    name_words = {word for word in re.findall(r"[a-z0-9]+", name) if len(word) > 2}
    value = 0.0
    if file_type == "stl":
        value += 90.0
    elif file_type == "3mf":
        value += 45.0
    elif file_type in {"step", "stp"}:
        value += 28.0
    else:
        value -= 30.0
    if prompt_words:
        value += 26.0 * (len(prompt_words & name_words) / len(prompt_words))
    if size:
        value += min(28.0, size / 120000.0)
    if preferred_slots >= 3 and any(token in name for token in ("x3", "3x", "triple", "three")):
        value += 60.0
    if preferred_slots == 1 and any(token in name for token in ("x1", "single", "one")):
        value += 60.0
    if "bestfit" in name or "best-fit" in name:
        value += 22.0
    if "holder" in name:
        value += 8.0
    if "dewalt" in text and ("dw" in name or "dewalt" in name):
        value += 8.0
    if any(token in name for token in ("support", "raft", "gcode", "profile", "test", "old")):
        value -= 24.0
    if any(token in name for token in ("front", "left", "right", "rear", "back", "bolt", "screw", "insert", "topper", "pad", "knob")):
        value -= 48.0
    if "small" in name and "small" not in text:
        value -= 14.0
    if file_type == "step":
        value += 6.0
    return value


def _source_title_score(title: str, prompt: str) -> float:
    stop_words = {"with", "and", "the", "for", "from", "that", "this", "into", "onto", "under", "over"}
    core_words = [word for word in re.findall(r"[a-z0-9]+", _prompt_match_text(prompt)) if len(word) > 2 and word not in stop_words]
    if not core_words:
        return 0.0
    cleaned = " ".join(core_words)
    lower_title = (title or "").lower()
    if cleaned and cleaned in lower_title:
        return 90.0
    hits = sum(1 for word in core_words if word in lower_title)
    return 34.0 * (hits / len(core_words))

def _rank_source_files(files: list[Any], prompt: str, preferred_slots: int = 0) -> list[Any]:
    return sorted(files, key=lambda source_file: _source_file_score(source_file, prompt, preferred_slots), reverse=True)


def _select_source_file(files: list[Any], prompt: str, preferred_slots: int = 0) -> Any | None:
    ranked = _rank_source_files(files, prompt, preferred_slots)
    return ranked[0] if ranked else None


def _source_file_evidence(prompt: str, preferred_slots: int = 0) -> tuple[dict[str, Any] | None, list[dict[str, Any]], dict[str, Any] | None]:
    try:
        from backend.services.design_providers import get_provider_registry, resolve_printables_model_files

        examples = get_provider_registry().search_all(prompt, limit=5)
    except Exception:
        return None, [], None

    printables = next((example for example in examples if example.source == "printables"), None)
    top = printables or (examples[0] if examples else None)
    if top is None:
        return None, [], None

    files = resolve_printables_model_files(top.url, limit=20) if top.source == "printables" else []
    files = _rank_source_files(files, prompt, preferred_slots)
    selected = files[0] if files else None
    return (
        top.to_dict(),
        [source_file.to_dict() for source_file in files],
        selected.to_dict() if selected else None,
    )


def _source_print_settings(source_example: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(source_example, dict):
        return {}
    if source_example.get("source") != "printables":
        return {}
    url = str(source_example.get("url") or "")
    if not url:
        return {}
    try:
        from backend.services.design_providers import resolve_printables_model_metadata

        return resolve_printables_model_metadata(url)
    except Exception:
        return {}


def _slot_count_from_source_file(source_file: dict[str, Any] | None, fallback: int) -> int:
    name = str((source_file or {}).get("name") or "").lower()
    if any(token in name for token in ("x3", "3x", "triple", "three")):
        return 3
    if any(token in name for token in ("x2", "2x", "dual", "double", "two")):
        return 2
    if any(token in name for token in ("x1", "single", "one")):
        return 1
    return fallback


def _try_import_source_stl(
    source_file: dict[str, Any] | None,
    *,
    prefer_flat: bool = False,
    center_xy: bool = True,
    shift_to_plate: bool = True,
) -> TriMesh | None:
    if not source_file:
        return None
    url = str(source_file.get("download_url") or "")
    file_type = str(source_file.get("file_type") or "").lower()
    if file_type != "stl" or not url:
        return None
    try:
        from backend.services.stl_importer import import_stl_from_url

        return import_stl_from_url(
            url,
            prefer_flat=prefer_flat,
            center_xy=center_xy,
            shift_to_plate=shift_to_plate,
        )
    except Exception:
        return None


def _translate_mesh(mesh: TriMesh, dx: float, dy: float, dz: float) -> TriMesh:
    translated = TriMesh()
    translated.verts = [(x + dx, y + dy, z + dz) for x, y, z in mesh.verts]
    translated.tris = list(mesh.tris)
    return translated


def _mesh_extents(mesh: TriMesh) -> tuple[list[float], list[float]]:
    if not mesh.verts:
        return [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]
    mins = [min(vertex[index] for vertex in mesh.verts) for index in range(3)]
    maxs = [max(vertex[index] for vertex in mesh.verts) for index in range(3)]
    return mins, maxs


def _normalize_mesh_group(meshes: list[TriMesh]) -> list[TriMesh]:
    """Center an imported source assembly while preserving part offsets."""
    non_empty = [mesh for mesh in meshes if mesh.verts]
    if not non_empty:
        return meshes
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for mesh in non_empty:
        mesh_mins, mesh_maxs = _mesh_extents(mesh)
        for index in range(3):
            mins[index] = min(mins[index], mesh_mins[index])
            maxs[index] = max(maxs[index], mesh_maxs[index])
    cx = (mins[0] + maxs[0]) / 2.0
    cy = (mins[1] + maxs[1]) / 2.0
    min_z = mins[2]
    return [_translate_mesh(mesh, -cx, -cy, -min_z) for mesh in meshes]


def _localize_mesh_part(mesh: TriMesh) -> tuple[TriMesh, list[float], dict[str, float]]:
    """Convert a group-positioned mesh into local geometry plus transform."""
    mins, maxs = _mesh_extents(mesh)
    cx = (mins[0] + maxs[0]) / 2.0
    cy = (mins[1] + maxs[1]) / 2.0
    min_z = mins[2]
    local = _translate_mesh(mesh, -cx, -cy, -min_z)
    dimensions = {
        "width": max(0.001, maxs[0] - mins[0]),
        "depth": max(0.001, maxs[1] - mins[1]),
        "height": max(0.001, maxs[2] - mins[2]),
    }
    return local, [cx, cy, min_z], dimensions


def _stable_source_shape(obj: CadObject) -> TriMesh:
    source_shape = obj.get("source_original_shape")
    if isinstance(source_shape, TriMesh):
        return deepcopy(source_shape)
    shape = deepcopy(obj["shape"])
    obj["source_original_shape"] = deepcopy(shape)
    return shape


def _source_file_name(source_file: dict[str, Any]) -> str:
    return str(source_file.get("name") or "").strip()


def _source_part_roles(source_file: dict[str, Any]) -> set[str]:
    name = _source_file_name(source_file).lower()
    roles: set[str] = set()
    role_tokens = {
        "base": ("base", "plate", "floor", "bottom"),
        "body": ("body", "main", "holder", "mount", "bracket", "cup", "mug"),
        "clamp": ("clamp", "desk", "table", "clip"),
        "arm": ("arm", "link", "hinge", "joint", "support"),
        "side": ("left", "right", "front", "rear", "back", "side"),
        "rail": ("rail", "slide", "track", "guide"),
        "cover": ("top", "cover", "cap", "lid"),
    }
    for role, tokens in role_tokens.items():
        if any(token in name for token in tokens):
            roles.add(role)
    return roles


def _source_file_is_bad_component(source_file: dict[str, Any]) -> bool:
    name = _source_file_name(source_file).lower()
    return any(
        token in name
        for token in (
            "supported",
            "supports",
            "support_material",
            "support material",
            "tree_support",
            "raft",
            "gcode",
            "profile",
            "settings",
            "test",
            "calibration",
            "old",
            "backup",
            "deprecated",
            "preview",
            "render",
        )
    )


def _source_file_component_score(source_file: dict[str, Any], prompt: str, preferred_slots: int = 0) -> float:
    if str(source_file.get("file_type") or "").lower() != "stl" or not source_file.get("download_url"):
        return -9999.0
    if _source_file_is_bad_component(source_file):
        return -9999.0

    name = _source_file_name(source_file).lower()
    size = max(0, int(source_file.get("file_size") or 0))
    prompt_words = {word for word in re.findall(r"[a-z0-9]+", _prompt_match_text(prompt)) if len(word) > 2}
    name_words = {word for word in re.findall(r"[a-z0-9]+", name) if len(word) > 2}
    roles = _source_part_roles(source_file)
    score = 40.0 + len(roles) * 16.0
    if prompt_words:
        score += 22.0 * (len(prompt_words & name_words) / len(prompt_words))
    if size:
        score += min(26.0, size / 160000.0)
    if any(token in name for token in ("complete", "assembly", "all", "main", "body")):
        score += 20.0
    if preferred_slots >= 3 and any(token in name for token in ("x3", "3x", "triple", "three")):
        score += 28.0
    if any(token in name for token in ("screw", "bolt", "nut", "washer", "spacer", "pin")):
        score -= 34.0
    if "small" in name and "small" not in _prompt_match_text(prompt):
        score -= 10.0
    return score


def _select_source_assembly_files(
    files: list[dict[str, Any]],
    prompt: str,
    preferred_slots: int = 0,
    *,
    max_parts: int = 6,
) -> list[dict[str, Any]]:
    """Pick a likely multi-part model file set without importing variants."""
    candidates = [
        source_file
        for source_file in files
        if _source_file_component_score(source_file, prompt, preferred_slots) > 0
    ]
    if len(candidates) < 2:
        return []

    candidates.sort(
        key=lambda source_file: _source_file_component_score(source_file, prompt, preferred_slots),
        reverse=True,
    )

    selected: list[dict[str, Any]] = []
    selected_names: set[str] = set()
    selected_roles: set[str] = set()
    total_size = 0
    for candidate in candidates:
        name = _source_file_name(candidate).lower()
        stem = re.sub(r"\.[a-z0-9]+$", "", name)
        normalized_stem = re.sub(
            r"\b(v\d+|rev\d+|small|medium|large|xl|left|right|front|rear|back|top|bottom)\b",
            "",
            stem,
        )
        normalized_stem = re.sub(r"[^a-z0-9]+", " ", normalized_stem).strip()
        roles = _source_part_roles(candidate)
        size = max(0, int(candidate.get("file_size") or 0))
        if size and total_size + size > 46 * 1024 * 1024:
            continue
        if normalized_stem in selected_names and not roles:
            continue
        selected.append(candidate)
        selected_names.add(normalized_stem)
        selected_roles |= roles
        total_size += size
        if len(selected) >= max_parts:
            break

    complementary_pairs = (
        {"base", "body"},
        {"base", "clamp"},
        {"body", "clamp"},
        {"body", "side"},
        {"base", "arm"},
        {"base", "rail"},
    )
    has_complement = any(pair <= selected_roles for pair in complementary_pairs)
    has_left_right = any("left" in _source_file_name(item).lower() for item in selected) and any(
        "right" in _source_file_name(item).lower() for item in selected
    )
    if len(selected) >= 2 and (has_complement or has_left_right or len(selected_roles) >= 3):
        return selected
    return []


def _try_import_source_stl_assembly(
    source_files: list[dict[str, Any]],
    *,
    prefer_flat: bool = False,
) -> list[tuple[dict[str, Any], TriMesh]]:
    imported: list[tuple[dict[str, Any], TriMesh]] = []
    for source_file in source_files:
        shape = _try_import_source_stl(
            source_file,
            prefer_flat=prefer_flat,
            center_xy=False,
            shift_to_plate=False,
        )
        if shape is None:
            return []
        imported.append((source_file, shape))
    normalized = _normalize_mesh_group([shape for _source_file, shape in imported])
    return [(source_file, normalized[index]) for index, (source_file, _shape) in enumerate(imported)]


def _mesh_dimensions(mesh: TriMesh) -> dict[str, float]:
    if not mesh.verts:
        return {"width": 1.0, "depth": 1.0, "height": 1.0}
    xs = [vertex[0] for vertex in mesh.verts]
    ys = [vertex[1] for vertex in mesh.verts]
    zs = [vertex[2] for vertex in mesh.verts]
    return {
        "width": max(xs) - min(xs),
        "depth": max(ys) - min(ys),
        "height": max(zs) - min(zs),
    }


def _prefer_flat_for_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    return any(word in text for word in ("battery", "batteri", "wall mount", "vägg", "vagg")) and any(
        word in text for word in ("holder", "mount", "hållare", "hallare")
    )


def _title_to_object_name(prompt: str, source_example: dict[str, Any] | None) -> str:
    title = str((source_example or {}).get("title") or prompt or "source model").strip()
    title = re.sub(r"[^a-zA-Z0-9]+", "_", title).strip("_").lower()
    return title[:64] or "source_model"


def _create_imported_source_object(
    prompt: str,
    shape: TriMesh,
    source_example: dict[str, Any] | None,
    source_files: list[dict[str, Any]],
    selected_source_file: dict[str, Any] | None,
) -> CadObject:
    dimensions = _mesh_dimensions(shape)
    params = dict(DEFAULT_PARAMETERS)
    params.update(
        {
            "width": max(1.0, dimensions["width"]),
            "depth": max(1.0, dimensions["depth"]),
            "height": max(0.5, dimensions["height"]),
            "thickness": max(0.5, min(12.0, dimensions["height"])),
            "fillet_radius": 0.0,
            "chamfer_size": 0.0,
            "hole_count": 0.0,
            "wall_thickness": 2.0,
        }
    )
    source_obj = create_manual_object(_title_to_object_name(prompt, source_example), shape, params)
    source_obj["primitive"] = "imported_source_mesh"
    source_obj["template_hint"] = None
    source_obj["assembly_source"] = f"imported-stl:{(source_example or {}).get('source') or 'source'}"
    source_obj["imported_source_mesh"] = True
    source_obj["source_dimensions"] = dimensions
    source_obj["source_original_shape"] = deepcopy(shape)
    source_obj["source_model"] = {
        "prompt": prompt,
        "matched_example": source_example,
        "files": source_files,
        "selected_file": selected_source_file,
        "print_settings": _source_print_settings(source_example),
    }
    source_obj["operation_history"] = [
        {
            "operation": "source_import",
            "source": (source_example or {}).get("title"),
            "selected_file": (selected_source_file or {}).get("name"),
        }
    ]
    prompt_text = _prompt_match_text(prompt)
    source_obj["color"] = _battery_brand_color(prompt) if any(
        brand in prompt_text for brand in ("dewalt", "makita", "milwaukee", "ryobi", "bosch")
    ) else "#a9aaad"
    return source_obj


def _source_group_id() -> str:
    return f"source-{uuid.uuid4().hex[:10]}"


def _source_part_name(source_example: dict[str, Any] | None, source_file: dict[str, Any], index: int) -> str:
    file_name = _source_file_name(source_file)
    title = file_name.rsplit(".", 1)[0] if file_name else ""
    if not title:
        title = str((source_example or {}).get("title") or "source_part")
    title = re.sub(r"[^a-zA-Z0-9]+", "_", title).strip("_").lower()
    return (title[:58] or "source_part") + f"_{index + 1}"


def _create_imported_source_objects(
    prompt: str,
    imported_parts: list[tuple[dict[str, Any], TriMesh]],
    source_example: dict[str, Any] | None,
    source_files: list[dict[str, Any]],
    *,
    variant_index: int | None = None,
    variant_count: int | None = None,
) -> list[CadObject]:
    group_id = _source_group_id()
    selected_files = [source_file for source_file, _shape in imported_parts]
    objects: list[CadObject] = []
    prompt_text = _prompt_match_text(prompt)
    color = _battery_brand_color(prompt) if any(
        brand in prompt_text for brand in ("dewalt", "makita", "milwaukee", "ryobi", "bosch")
    ) else "#a9aaad"

    for index, (source_file, mesh) in enumerate(imported_parts):
        local_mesh, position, dimensions = _localize_mesh_part(mesh)
        params = dict(DEFAULT_PARAMETERS)
        params.update(
            {
                "width": max(1.0, dimensions["width"]),
                "depth": max(1.0, dimensions["depth"]),
                "height": max(0.5, dimensions["height"]),
                "thickness": max(0.5, min(12.0, dimensions["height"])),
                "fillet_radius": 0.0,
                "chamfer_size": 0.0,
                "hole_count": 0.0,
                "wall_thickness": 2.0,
            }
        )
        source_obj = create_manual_object(
            _source_part_name(source_example, source_file, index),
            local_mesh,
            params,
        )
        source_obj["transform"].position = position
        source_obj["primitive"] = "imported_source_mesh"
        source_obj["template_hint"] = None
        source_obj["assembly_source"] = f"imported-stl-assembly:{(source_example or {}).get('source') or 'source'}"
        source_obj["imported_source_mesh"] = True
        source_obj["source_dimensions"] = dimensions
        source_obj["source_original_shape"] = deepcopy(local_mesh)
        source_obj["source_group_id"] = group_id
        source_obj["source_part_index"] = index
        source_obj["source_part_count"] = len(imported_parts)
        source_obj["source_model"] = {
            "prompt": prompt,
            "matched_example": source_example,
            "files": source_files,
            "selected_file": source_file,
            "selected_files": selected_files,
            "group_id": group_id,
            "part_index": index,
            "part_count": len(imported_parts),
            "print_settings": _source_print_settings(source_example),
        }
        if variant_index is not None:
            source_obj["source_model"]["variant_index"] = variant_index
        if variant_count is not None:
            source_obj["source_model"]["variant_count"] = variant_count
        source_obj["operation_history"] = [
            {
                "operation": "source_assembly_import",
                "source": (source_example or {}).get("title"),
                "selected_file": source_file.get("name"),
                "part_index": index,
                "part_count": len(imported_parts),
            }
        ]
        source_obj["color"] = color
        objects.append(source_obj)

    return objects


def _source_group_object_ids(session: Session, obj: CadObject | None) -> list[str]:
    if not obj:
        return []
    group_id = obj.get("source_group_id")
    if not group_id:
        return [obj["id"]]
    return [
        oid
        for oid in session.get("object_order", [])
        if session["objects"].get(oid, {}).get("source_group_id") == group_id
    ]


def _source_group_objects(session: Session, obj: CadObject | None) -> list[CadObject]:
    return [session["objects"][oid] for oid in _source_group_object_ids(session, obj) if oid in session["objects"]]


def _remove_source_group_direct(session: Session, obj: CadObject | None) -> None:
    for oid in list(_source_group_object_ids(session, obj)):
        _remove_object_direct(session, oid)


def _world_extents_for_objects(objects: list[CadObject]) -> tuple[list[float], list[float]]:
    if not objects:
        return [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for obj in objects:
        obj_mins, obj_maxs = _world_extents(obj)
        for index in range(3):
            mins[index] = min(mins[index], obj_mins[index])
            maxs[index] = max(maxs[index], obj_maxs[index])
    return mins, maxs


def _try_replace_with_imported_source_model(
    session: Session,
    obj: CadObject,
    prompt: str,
    *,
    preferred_slots: int = 0,
    prefer_flat: bool = False,
) -> tuple[list[str], CadObject | None]:
    try:
        from backend.services.design_providers import get_provider_registry, resolve_printables_model_files

        examples = [
            example
            for example in get_provider_registry().search_all(prompt, limit=12)
            if example.source == "printables"
        ]
    except Exception:
        examples = []

    ranked_assemblies: list[tuple[float, Any, list[dict[str, Any]], list[dict[str, Any]]]] = []
    ranked_candidates: list[tuple[float, Any, list[dict[str, Any]], dict[str, Any]]] = []
    for example_index, source_example_obj in enumerate(examples[:8]):
        source_files_obj = _rank_source_files(
            resolve_printables_model_files(source_example_obj.url, limit=24),
            prompt,
            preferred_slots,
        )
        source_files = [source_file.to_dict() for source_file in source_files_obj]
        model_rank_bonus = max(0, len(examples) - example_index) * 34.0
        title_score = _source_title_score(source_example_obj.title, prompt)
        assembly_files = _select_source_assembly_files(
            source_files,
            prompt,
            preferred_slots,
            max_parts=6,
        )
        if len(assembly_files) >= 2:
            assembly_score = (
                model_rank_bonus
                + title_score
                + 90.0
                + sum(_source_file_component_score(item, prompt, preferred_slots) for item in assembly_files[:4]) / 4.0
                + min(40.0, len(assembly_files) * 8.0)
            )
            ranked_assemblies.append(
                (assembly_score, source_example_obj, source_files, assembly_files)
            )

        seen_ids: set[Any] = set()
        for candidate in source_files:
            if candidate.get("id") in seen_ids:
                continue
            seen_ids.add(candidate.get("id"))
            if str(candidate.get("file_type") or "").lower() != "stl" or not candidate.get("download_url"):
                continue
            ranked_candidates.append(
                (
                    model_rank_bonus
                    + title_score
                    + _source_file_score(candidate, prompt, preferred_slots),
                    source_example_obj,
                    source_files,
                    candidate,
                )
            )

    ranked_assemblies.sort(key=lambda item: item[0], reverse=True)
    for _score, source_example_obj, source_files, assembly_files in ranked_assemblies:
        imported_parts = _try_import_source_stl_assembly(
            assembly_files,
            prefer_flat=False,
        )
        if len(imported_parts) < 2:
            continue
        source_example = source_example_obj.to_dict()
        source_objects = _create_imported_source_objects(
            prompt,
            imported_parts,
            source_example,
            source_files,
        )
        _remove_object_direct(session, obj["id"])
        for source_obj in source_objects:
            add_object(session, source_obj)
        session["selected_object_id"] = ""
        file_names = ", ".join(_source_file_name(file) for file in assembly_files[:4])
        if len(assembly_files) > 4:
            file_names += f", +{len(assembly_files) - 4} more"
        return [
            _source_signal_summary(prompt),
            f"source-match: {source_example_obj.title}",
            f"source-files: imported {len(source_objects)} separate STL parts",
            f"source-parts: {file_names}",
            "imported real multi-part Printables assembly as editable parts",
        ], source_objects[0]

    ranked_candidates.sort(key=lambda item: item[0], reverse=True)
    for _score, source_example_obj, source_files, candidate in ranked_candidates:
        imported_shape = _try_import_source_stl(candidate, prefer_flat=prefer_flat)
        if imported_shape is None:
            continue

        source_example = source_example_obj.to_dict()
        source_obj = _create_imported_source_object(
            prompt,
            imported_shape,
            source_example,
            source_files,
            candidate,
        )
        _remove_object_direct(session, obj["id"])
        add_object(session, source_obj)
        session["selected_object_id"] = ""
        selected_file_name = candidate.get("name")
        return [
            _source_signal_summary(prompt),
            f"source-match: {source_example_obj.title}",
            f"source-files: selected {selected_file_name}" if selected_file_name else "source-files: selected public STL",
            "imported real Printables STL mesh as starting geometry",
        ], source_obj

    return [], None


def _active_source_object(session: Session) -> CadObject | None:
    selected = get_object(session, session.get("selected_object_id"))
    if selected and selected.get("source_model"):
        return selected
    for oid in reversed(session.get("object_order", [])):
        obj = session["objects"].get(oid)
        if obj and obj.get("source_model"):
            return obj
    return None


def _source_model_prompt(obj: CadObject | None) -> str:
    if not obj:
        return ""
    source_model = obj.get("source_model") if isinstance(obj.get("source_model"), dict) else {}
    prompt = str(source_model.get("prompt") or "").strip()
    if prompt:
        return prompt
    matched = source_model.get("matched_example")
    if isinstance(matched, dict):
        return str(matched.get("title") or obj.get("name") or "").strip()
    return str(obj.get("name") or "").replace("_", " ").strip()


def switch_source_model_variant(session: Session, direction: str = "next") -> list[str]:
    """Swap the active source model to another ranked Printables result."""
    current = _active_source_object(session)
    prompt = _source_model_prompt(current)
    if current is None or not prompt:
        return ["no source model to switch"]

    try:
        from backend.services.design_providers import get_provider_registry, resolve_printables_model_files
    except Exception:
        return ["source providers unavailable"]

    examples = [
        example
        for example in get_provider_registry().search_all(prompt, limit=12)
        if example.source == "printables"
    ]
    if not examples:
        return ["no Printables variants found"]

    current_url = ""
    source_model = current.get("source_model") if isinstance(current.get("source_model"), dict) else {}
    matched = source_model.get("matched_example")
    if isinstance(matched, dict):
        current_url = str(matched.get("url") or "")

    current_index = next((idx for idx, example in enumerate(examples) if example.url == current_url), -1)
    step = -1 if direction.strip().lower().startswith("prev") else 1
    start = current_index if current_index >= 0 else (-1 if step > 0 else 0)
    order = [((start + step * offset) % len(examples)) for offset in range(1, len(examples) + 1)]

    for index in order:
        example = examples[index]
        files = _rank_source_files(resolve_printables_model_files(example.url, limit=24), prompt, 0)
        files_dicts = [source_file.to_dict() for source_file in files]
        assembly_files = _select_source_assembly_files(files_dicts, prompt, 0, max_parts=6)
        if len(assembly_files) >= 2:
            imported_parts = _try_import_source_stl_assembly(
                assembly_files,
                prefer_flat=False,
            )
            if len(imported_parts) >= 2:
                source_objects = _create_imported_source_objects(
                    prompt,
                    imported_parts,
                    example.to_dict(),
                    files_dicts,
                    variant_index=index,
                    variant_count=len(examples),
                )
                color = current.get("color")
                _remove_source_group_direct(session, current)
                for source_obj in source_objects:
                    if color:
                        source_obj["color"] = color
                    add_object(session, source_obj)
                session["selected_object_id"] = ""
                file_names = ", ".join(_source_file_name(file) for file in assembly_files[:4])
                if len(assembly_files) > 4:
                    file_names += f", +{len(assembly_files) - 4} more"
                return [
                    f"{'previous' if step < 0 else 'next'} source model",
                    f"source-match: {example.title}",
                    f"source-files: imported {len(source_objects)} separate STL parts",
                    f"source-parts: {file_names}",
                ]

        candidates: list[dict[str, Any]] = []
        for candidate in files_dicts:
            if candidate.get("id") not in {item.get("id") for item in candidates}:
                candidates.append(candidate)
        for candidate in candidates:
            shape = _try_import_source_stl(candidate, prefer_flat=_prefer_flat_for_prompt(prompt))
            if shape is None:
                continue
            source_obj = _create_imported_source_object(
                prompt,
                shape,
                example.to_dict(),
                files_dicts,
                candidate,
            )
            source_obj["color"] = current.get("color", source_obj.get("color", "#a9aaad"))
            source_obj["source_model"]["variant_index"] = index
            source_obj["source_model"]["variant_count"] = len(examples)
            _remove_source_group_direct(session, current)
            add_object(session, source_obj)
            session["selected_object_id"] = ""
            return [
                f"{'previous' if step < 0 else 'next'} source model",
                f"source-match: {example.title}",
                f"source-files: selected {candidate.get('name')}",
            ]

    return ["no importable STL found for adjacent variants"]


def _battery_brand(prompt: str) -> str:
    text = _prompt_match_text(prompt)
    for brand in ("dewalt", "makita", "milwaukee", "ryobi", "bosch"):
        if brand in text:
            return brand
    return "power_tool"


def _battery_brand_color(prompt: str) -> str:
    brand = _battery_brand(prompt)
    return {
        "dewalt": "#ffd700",
        "makita": "#19b7b5",
        "milwaukee": "#c62828",
        "ryobi": "#b7d31f",
        "bosch": "#d12b2b",
    }.get(brand, "#a9aaad")


def is_bottom_plate_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    plate_terms = ("bottom plate", "base plate", "bottenplatta", "botten platta")
    relation_terms = ("outside", "around", "under", "below", "utanför", "utanfor", "runt", "under")
    return any(term in text for term in plate_terms) and any(term in text for term in relation_terms)


def _plate_margin_from_prompt(prompt: str) -> float:
    text = _prompt_match_text(prompt)
    match = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:outside|around|extra|larger|bigger|utanför|utanfor|runt)", text)
    if not match:
        match = re.search(r"(?:outside|around|extra|larger|bigger|utanför|utanfor|runt)\D{0,12}(\d+(?:\.\d+)?)\s*mm", text)
    return max(1.0, min(200.0, float(match.group(1)))) if match else 20.0


def _plate_thickness_from_prompt(prompt: str) -> float:
    text = _prompt_match_text(prompt)
    match = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:thick|thickness|tjock)", text)
    return max(1.0, min(30.0, float(match.group(1)))) if match else 4.0


def add_bottom_plate_from_prompt(session: Session, prompt: str) -> list[str]:
    target = _active_source_object(session) or get_object(session, session.get("selected_object_id"))
    if target is None:
        return ["bottom plate skipped: no target model"]
    targets = _source_group_objects(session, target) or [target]

    margin = _plate_margin_from_prompt(prompt)
    plate_h = _plate_thickness_from_prompt(prompt)
    mins, maxs = _world_extents_for_objects(targets)
    width = max(1.0, maxs[0] - mins[0] + margin * 2.0)
    depth = max(1.0, maxs[1] - mins[1] + margin * 2.0)
    cx = (mins[0] + maxs[0]) / 2.0
    cy = (mins[1] + maxs[1]) / 2.0

    shape = make_box_body(width, depth, plate_h, fillet=1.2) or make_rounded_box(width, depth, plate_h, 1.2, segments=8)
    params = dict(DEFAULT_PARAMETERS)
    params.update(
        {
            "width": width,
            "depth": depth,
            "height": plate_h,
            "thickness": plate_h,
            "fillet_radius": 1.2,
            "chamfer_size": 0.0,
            "hole_count": 0.0,
            "wall_thickness": plate_h,
        }
    )
    plate = create_manual_object("bottom_plate", shape, params)
    plate["primitive"] = "rectangle"
    plate["template_component"] = True
    plate["assembly_source"] = "chat-edit:bottom-plate"
    plate["color"] = "#b8babd"
    plate["transform"].position = [cx, cy, 0.0]

    target_min_z = mins[2]
    for target_obj in targets:
        target_obj["transform"].position[2] += plate_h - target_min_z
    add_object(session, plate)
    session["selected_object_id"] = plate["id"]
    return [
        f"added bottom plate {margin:g}mm outside target",
        f"plate size {width:.1f} x {depth:.1f} x {plate_h:.1f}mm",
        f"lifted {len(targets)} source part{'s' if len(targets) != 1 else ''} onto the new plate",
    ]


def _recent_generation_context(session: Session) -> str:
    history = session.get("edit_history", [])
    recent: list[str] = []
    for item in history[-6:]:
        if isinstance(item, dict):
            prompt = item.get("prompt") or item.get("command") or item.get("input")
            if prompt:
                recent.append(str(prompt))
    joined = " ".join(recent)
    return _prompt_match_text(joined)


def _merge_rounded_box(
    mesh: TriMesh,
    width: float,
    depth: float,
    height: float,
    position: list[float],
    radius: float,
) -> TriMesh:
    shape = make_rounded_box(width, depth, height, radius, segments=8)
    return mesh.merge(
        shape.transformed(
            Transform(position=position, rotation=[0.0, 0.0, 0.0], scale=[1.0, 1.0, 1.0])
        )
    )


def _merge_box(
    mesh: TriMesh,
    width: float,
    depth: float,
    height: float,
    center: list[float],
    *,
    rotation: list[float] | None = None,
) -> TriMesh:
    return mesh.merge(
        make_box(width, depth, height).transformed(
            Transform(position=center, rotation=rotation or [0.0, 0.0, 0.0], scale=[1.0, 1.0, 1.0])
        )
    )


def _merge_cylinder_x(
    mesh: TriMesh,
    radius: float,
    length: float,
    center_x: float,
    y: float,
    z: float,
    *,
    segments: int = 40,
) -> TriMesh:
    cylinder = make_cylinder(radius, length, segments=segments).transformed(
        Transform(
            position=[center_x - length / 2.0, y, z],
            rotation=[0.0, 90.0, 0.0],
            scale=[1.0, 1.0, 1.0],
        )
    )
    return mesh.merge(cylinder)


def _make_source_slanted_slab(
    width: float,
    y0: float,
    z0: float,
    y1: float,
    z1: float,
    thickness: float,
) -> TriMesh:
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
    for face in (
        (0, 1, 2, 3),
        (5, 4, 7, 6),
        (4, 5, 1, 0),
        (3, 2, 6, 7),
        (1, 5, 6, 2),
        (4, 0, 3, 7),
    ):
        mesh.add_quad(*(ids[i] for i in face))
    return mesh


def _make_source_side_link(
    x: float,
    y0: float,
    y1: float,
    z0: float,
    z1: float,
    thickness: float,
) -> TriMesh:
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


def _make_source_battery_holder_mesh(params: dict[str, float]) -> TriMesh:
    """Build a Dewalt-style multi-slot battery wall mount."""
    slots = max(1, min(6, int(round(float(params.get("num_batteries", params.get("battery_slots", 3.0)))))))
    spacing = max(62.0, min(110.0, float(params.get("battery_spacing", 85.0))))
    holder_length = max(58.0, min(120.0, float(params.get("holder_length", 85.0))))
    margin = max(6.0, min(24.0, float(params.get("margin_width", 10.0))))
    base_t = max(3.0, min(12.0, float(params.get("base_thickness", params.get("thickness", 6.0)))))
    core_w = max(28.0, min(54.0, float(params.get("core_width", 40.0))))
    core_h = max(7.0, min(22.0, float(params.get("core_height", 11.5))))
    rail_w = max(core_w + 8.0, min(76.0, float(params.get("rail_width", 52.0))))
    rail_t = max(2.5, min(9.0, float(params.get("rail_thickness", 4.5))))
    stop_t = max(3.0, min(12.0, float(params.get("stop_thickness", 5.0))))
    screw_d = max(3.0, min(8.0, float(params.get("screw_diameter", 4.5))))
    screw_head_d = max(screw_d + 2.0, min(16.0, float(params.get("screw_head_diameter", 9.0))))
    latch_y = max(8.0, min(holder_length * 0.45, float(params.get("latch_y_pos", 18.0))))
    latch_w = max(8.0, min(core_w, float(params.get("latch_width", 16.0))))

    base_w = spacing * (slots - 1) + rail_w + margin * 2.0
    base_d = holder_length + margin * 2.0
    total_h = base_t + rail_t + core_h + stop_t
    params["num_batteries"] = float(slots)
    params["battery_slots"] = float(slots)
    params["width"] = base_w
    params["depth"] = base_d
    params["height"] = total_h
    params["thickness"] = base_t
    params["counterbore_depth"] = max(1.0, min(base_t + rail_t - 0.5, float(params.get("counterbore_depth", 2.4))))

    cad_body = make_battery_holder_body(params)
    if cad_body is not None:
        return shift_mesh_to_buildplate(cad_body)

    hole_params = dict(params)
    for key in list(hole_params.keys()):
        if key.startswith("custom_hole_"):
            del hole_params[key]
    hole_index = 0
    for slot in range(slots):
        cx = (slot - (slots - 1) / 2.0) * spacing
        for y in (-holder_length * 0.28, holder_length * 0.28):
            hole_params[f"custom_hole_{hole_index}_x"] = cx
            hole_params[f"custom_hole_{hole_index}_y"] = y
            hole_params[f"custom_hole_{hole_index}_diameter"] = screw_d
            hole_index += 1
    hole_params["custom_hole_count"] = float(hole_index)
    hole_params["hole_count"] = float(hole_index)
    hole_params["hole_diameter"] = screw_d
    hole_params["counterbore_diameter"] = screw_head_d

    mesh = _make_box_with_rect_holes(base_w, base_d, base_t, hole_params)
    mesh = _merge_rounded_box(mesh, base_w - 4.0, 3.5, base_t * 0.42, [0.0, -base_d / 2.0 + 3.2, base_t], 0.7)
    mesh = _merge_rounded_box(mesh, base_w - 4.0, 3.5, base_t * 0.42, [0.0, base_d / 2.0 - 3.2, base_t], 0.7)

    deck_d = holder_length * 0.76
    deck_w = rail_w + margin * 0.65
    rail_depth = deck_d * 0.78
    for slot in range(slots):
        cx = (slot - (slots - 1) / 2.0) * spacing
        mesh = _merge_rounded_box(mesh, deck_w, deck_d, rail_t, [cx, 0.0, base_t], 1.2)
        mesh = _merge_rounded_box(mesh, rail_t, rail_depth, core_h, [cx - core_w / 2.0, -2.0, base_t + rail_t], 0.75)
        mesh = _merge_rounded_box(mesh, rail_t, rail_depth, core_h, [cx + core_w / 2.0, -2.0, base_t + rail_t], 0.75)
        mesh = _merge_rounded_box(mesh, core_w * 0.56, rail_depth * 0.66, core_h * 0.36, [cx, -2.0, base_t + rail_t], 0.65)
        mesh = _merge_rounded_box(
            mesh,
            deck_w,
            stop_t,
            core_h + stop_t,
            [cx, deck_d / 2.0 - stop_t / 2.0, base_t + rail_t],
            0.9,
        )
        mesh = _merge_rounded_box(
            mesh,
            latch_w,
            stop_t * 1.8,
            core_h * 0.72,
            [cx, -holder_length / 2.0 + latch_y, base_t + rail_t],
            0.7,
        )
        for y in (-holder_length * 0.28, holder_length * 0.28):
            mesh = _merge_rounded_box(mesh, screw_head_d * 1.12, screw_head_d * 1.12, 0.55, [cx, y, base_t + 0.08], 1.1)

    return shift_mesh_to_buildplate(mesh)


def _make_source_phone_stand_mesh(params: dict[str, float]) -> TriMesh:
    """Build a source-first flat-fold phone/tablet stand reconstruction."""
    width = max(52.0, min(120.0, float(params.get("width", 60.0))))
    depth = max(83.0, min(120.0, float(params.get("depth", 100.0))))
    base_t = max(3.0, min(6.0, float(params.get("thickness", 4.0))))
    angle = max(60.0, min(74.0, float(params.get("angle", 68.0))))
    panel_height = max(58.0, min(105.0, float(params.get("height", 82.0))))
    panel_width = max(width * 0.76, min(width - 8.0, width * 0.88))
    panel_t = base_t

    hinge_y = -depth * 0.11
    hinge_z = base_t + 2.0
    bottom_y = hinge_y + 1.2
    bottom_z = base_t + 1.4
    top_y = bottom_y + math.cos(math.radians(angle)) * panel_height
    top_z = bottom_z + math.sin(math.radians(angle)) * panel_height

    mesh = TriMesh()
    mesh = mesh.merge(_make_box_with_rect_holes(width, depth, base_t, params))

    # Split front stops leave a charging-cable gap, matching common flat-fold stands.
    lip_depth = max(8.0, depth * 0.105)
    lip_height = max(8.0, base_t * 2.35)
    tab_w = max(15.0, (width - 17.0) / 2.0)
    front_y = -depth / 2.0 + lip_depth / 2.0
    mesh = _merge_rounded_box(mesh, tab_w, lip_depth, lip_height, [-width * 0.24, front_y, base_t], 1.2)
    mesh = _merge_rounded_box(mesh, tab_w, lip_depth, lip_height, [width * 0.24, front_y, base_t], 1.2)
    mesh = _merge_rounded_box(mesh, width * 0.72, 3.2, base_t * 0.75, [0.0, front_y + lip_depth * 0.74, base_t], 0.8)

    # Hinged back panel in the open position. This reads like a real print-in-place stand.
    mesh = mesh.merge(_make_source_slanted_slab(panel_width, bottom_y, bottom_z, top_y, top_z, panel_t))
    mesh = _merge_box(
        mesh,
        panel_width * 0.78,
        3.2,
        base_t * 1.1,
        [0.0, top_y, top_z],
        rotation=[angle - 90.0, 0.0, 0.0],
    )

    # Print-in-place hinge barrels with visible knuckle gaps.
    for center_x, length in ((-width * 0.31, width * 0.26), (0.0, width * 0.22), (width * 0.31, width * 0.26)):
        mesh = _merge_cylinder_x(mesh, base_t * 0.62, length, center_x, hinge_y, hinge_z)

    # Side links and low rails make the model look designed, not guessed.
    side_x = width * 0.43
    for x in (-side_x, side_x):
        mesh = mesh.merge(
            _make_source_side_link(
                x,
                bottom_y - 3.5,
                top_y * 0.84,
                base_t,
                top_z * 0.58,
                max(2.5, base_t * 0.78),
            )
        )
        mesh = _merge_rounded_box(mesh, max(2.6, base_t * 0.7), depth * 0.58, base_t * 0.62, [x, -depth * 0.06, base_t], 0.7)

    # Shallow stiffening ribs on the base plate.
    mesh = _merge_rounded_box(mesh, width * 0.68, 2.1, base_t * 0.45, [0.0, -depth * 0.23, base_t], 0.5)
    mesh = _merge_rounded_box(mesh, width * 0.58, 2.1, base_t * 0.45, [0.0, depth * 0.24, base_t], 0.5)

    return shift_mesh_to_buildplate(mesh)


def replace_object_with_source_model(session: Session, obj: CadObject, prompt: str) -> list[str]:
    """Replace generated seed with a source-matched reconstructed CAD model."""
    prompt_text = _prompt_match_text(prompt)
    kind = _source_prompt_kind(prompt)
    recent_context = _recent_generation_context(session)
    if kind is None and "wall mount" in prompt_text and any(word in recent_context for word in ("dewalt", "battery")):
        kind = "dewalt_battery_holder"

    generic_actions, _source_obj = _try_replace_with_imported_source_model(
        session,
        obj,
        prompt,
        preferred_slots=3 if kind in {"dewalt_battery_holder", "battery_holder"} else 0,
        prefer_flat=_prefer_flat_for_prompt(prompt),
    )
    if generic_actions:
        return generic_actions

    if kind not in {"phone_stand", "dewalt_battery_holder", "battery_holder"}:
        return []

    if kind in {"dewalt_battery_holder", "battery_holder"}:
        brand = _battery_brand(prompt)
        source_example, source_files, selected_source_file = _source_file_evidence(prompt, preferred_slots=3)
        slots = _slot_count_from_source_file(selected_source_file, 3)
        params = dict(DEFAULT_PARAMETERS)
        params.update(
            {
                "num_batteries": float(slots),
                "battery_slots": float(slots),
                "battery_spacing": 85.0,
                "holder_length": 85.0,
                "margin_width": 10.0,
                "base_thickness": 6.0,
                "core_width": 40.0,
                "core_height": 11.5,
                "rail_width": 52.0,
                "rail_thickness": 4.5,
                "stop_thickness": 5.0,
                "screw_diameter": 4.5,
                "screw_head_diameter": 9.0,
                "counterbore_depth": 2.4,
                "latch_y_pos": 18.0,
                "latch_width": 16.0,
                "fillet_radius": 1.0,
                "hole_count": float(slots * 2),
                "wall_thickness": 3.0,
            }
        )
        imported_shape = _try_import_source_stl(selected_source_file, prefer_flat=True)
        shape = imported_shape or _make_source_battery_holder_mesh(params)
        source_obj = create_manual_object(f"{brand}_battery_wall_mount", shape, params)
        source_obj["primitive"] = "source_battery_holder"
        source_obj["template_hint"] = "source_battery_holder"
        source_obj["assembly_source"] = (
            "imported-stl:printables"
            if imported_shape is not None
            else "file-aware-reconstruction:power-tool-battery-wall-mount"
        )
        source_obj["imported_source_mesh"] = imported_shape is not None
        source_model = deepcopy(SOURCE_BATTERY_HOLDER_META)
        source_model["prompt"] = prompt
        source_model["matched_example"] = source_example
        source_model["files"] = source_files
        source_model["selected_file"] = selected_source_file
        source_model["print_settings"] = _source_print_settings(source_example)
        source_obj["source_model"] = source_model
        source_obj["operation_history"] = [
            {
                "operation": "file_aware_reconstruct",
                "source": (source_example or {}).get("title") or SOURCE_BATTERY_HOLDER_META["title"],
                "selected_file": (selected_source_file or {}).get("name"),
                "slots": slots,
            }
        ]
        source_obj["color"] = _battery_brand_color(prompt)

        _remove_object_direct(session, obj["id"])
        add_object(session, source_obj)
        session["selected_object_id"] = ""
        selected_file_name = (selected_source_file or {}).get("name")
        return [
            _source_signal_summary(prompt),
            f"source-files: selected {selected_file_name}" if selected_file_name else "source-files: file manifest unavailable; used source-ranked reconstruction",
            "imported real Printables STL mesh as starting geometry" if imported_shape is not None else "file-aware reconstruction: clean wall mount body with CAD-cut holes, counterbores, raised pads, slide rails, and latch reliefs",
        ]

    params = dict(DEFAULT_PARAMETERS)
    params.update(
        {
            "width": 60.0,
            "depth": 100.0,
            "height": 82.0,
            "thickness": 4.0,
            "angle": 68.0,
            "fillet_radius": 1.4,
            "chamfer_size": 0.0,
            "hole_count": 0.0,
            "wall_thickness": 2.0,
        }
    )
    shape = _make_source_phone_stand_mesh(params)
    source_obj = create_manual_object("phone_tablet_flat_fold_stand", shape, params)
    source_obj["primitive"] = "source_phone_stand"
    source_obj["template_hint"] = "source_phone_stand"
    source_obj["assembly_source"] = "source:printables:1161/thingiverse:3146835"
    source_obj["source_model"] = deepcopy(SOURCE_PHONE_STAND_META)
    source_obj["source_model"]["print_settings"] = _source_print_settings(
        {
            "source": "printables",
            "url": SOURCE_PHONE_STAND_META["printables_url"],
            "title": SOURCE_PHONE_STAND_META["title"],
        }
    )
    source_obj["operation_history"] = [
        {
            "operation": "source_reconstruct",
            "source": SOURCE_PHONE_STAND_META["title"],
            "dimensions": SOURCE_PHONE_STAND_META["dimensions"]["medium"],
        }
    ]
    source_obj["color"] = obj.get("color", "#a9aaad")

    _remove_object_direct(session, obj["id"])
    add_object(session, source_obj)
    session["selected_object_id"] = ""
    return [
        _source_signal_summary(prompt),
        "generative-recipe: phone/tablet flat-fold stand proportions",
        "generated clean parametric stand with hinge barrels, front stops, side links, and cable gap",
    ]


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
        params = dict(params)
        params["fillet_radius"] = max(2.5, float(params.get("fillet_radius", 3.0)))
        width = max(76.0, min(115.0, float(params.get("width", 88.0))))
        depth = max(72.0, min(112.0, float(params.get("depth", 84.0))))
        height = max(92.0, min(145.0, float(params.get("height", 116.0))))
        thickness = max(5.5, min(10.0, float(params.get("thickness", 7.0))))
        angle = max(62.0, min(72.0, float(params.get("angle", 68.0))))
        lip_depth = max(10.0, thickness * 1.55)
        lip_height = max(12.0, thickness * 2.0)
        panel_width = width * 0.78
        panel_height = height * 0.88
        gusset_height = height * 0.46
        gusset_depth = depth * 0.56
        brace_x = width * 0.38
        parts = [
            _create_box_component("phone_base_plate", width, depth, thickness, [0.0, 0.0, 0.0], params, color=color),
            _create_box_component("phone_left_front_tab", width * 0.34, lip_depth, lip_height, [-width * 0.27, -depth / 2.0 + lip_depth / 2.0, thickness], params, color=color),
            _create_box_component("phone_right_front_tab", width * 0.34, lip_depth, lip_height, [width * 0.27, -depth / 2.0 + lip_depth / 2.0, thickness], params, color=color),
            _create_box_component("phone_back_panel", panel_width, thickness, panel_height, [0.0, -depth * 0.06, thickness], params, rotation=[angle - 90.0, 0.0, 0.0], color=color),
            _create_gusset_component("phone_left_side_support", thickness * 1.15, gusset_depth, gusset_height, [-brace_x, -depth * 0.03, thickness], params, color=color),
            _create_gusset_component("phone_right_side_support", thickness * 1.15, gusset_depth, gusset_height, [brace_x, -depth * 0.03, thickness], params, color=color),
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
    session["selected_object_id"] = ""
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
        if any(word in _prompt_match_text(str(brief.get("prompt", ""))) for word in ("headset", "headphone")):
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
        appendages = 8 if "octopus" in _prompt_match_text(str(brief.get("prompt", ""))) else 4
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
    elif category == "generic":
        prompt_text = _prompt_match_text(str(brief.get("prompt", "")))
        base_h = max(thickness, min(height * 0.22, 14.0))
        core_h = max(height - base_h, base_h)
        core_w = max(width * 0.62, min(width - wall * 2.0, width * 0.78))
        core_d = max(depth * 0.58, min(depth - wall * 2.0, depth * 0.74))
        parts = [
            _create_box_component("concept_base", width, depth, base_h, [0.0, 0.0, 0.0], base_params, color=color, cut_holes=True),
            _create_box_component("concept_main_body", core_w, core_d, core_h, [0.0, 0.0, base_h], params, color=color),
        ]
        if any(word in prompt_text for word in ("holder", "hallare", "mount", "rack", "stand", "stall")):
            parts.extend([
                _create_box_component("concept_front_lip", core_w, wall, max(core_h * 0.38, wall * 2.0), [0.0, -core_d / 2.0 + wall / 2.0, base_h], params, color=color),
                _create_box_component("concept_back_register", core_w, wall, max(core_h * 0.52, wall * 2.0), [0.0, core_d / 2.0 - wall / 2.0, base_h], params, color=color),
            ])
        else:
            parts.extend([
                _create_box_component("concept_left_detail", wall, core_d * 0.78, max(core_h * 0.55, wall * 2.0), [-core_w / 2.0 + wall / 2.0, 0.0, base_h], params, color=color),
                _create_box_component("concept_right_detail", wall, core_d * 0.78, max(core_h * 0.55, wall * 2.0), [core_w / 2.0 - wall / 2.0, 0.0, base_h], params, color=color),
            ])

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


def _add_cylinder_wall(
    mesh: TriMesh,
    x: float,
    y: float,
    radius: float,
    z0: float,
    z1: float,
    *,
    segments: int = 28,
) -> None:
    if radius <= 0.0 or z1 <= z0:
        return
    bottom: list[int] = []
    top: list[int] = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        px = x + math.cos(angle) * radius
        py = y + math.sin(angle) * radius
        bottom.append(mesh.add_vertex((px, py, z0)))
        top.append(mesh.add_vertex((px, py, z1)))
    for index in range(segments):
        nxt = (index + 1) % segments
        # Reversed winding so the surface reads as the inside of a cut hole.
        mesh.add_quad(bottom[nxt], bottom[index], top[index], top[nxt])


def _apply_mesh_hole_cuts(mesh: TriMesh, params: dict[str, float]) -> TriMesh:
    """Approximate vertical screw holes for imported STL meshes.

    Imported Printables models arrive as triangles, not editable B-reps. This
    removes triangles inside the requested cylinders and adds simple inside
    walls so the edit is visible and printable enough for source meshes.
    """
    holes = _hole_specs(params)
    if not holes or not mesh.verts:
        return shift_mesh_to_buildplate(mesh)

    mins, maxs = _mesh_extents(mesh)
    z0 = mins[2] - 0.2
    z1 = maxs[2] + 0.2
    counterbore_diameter = max(0.0, float(params.get("counterbore_diameter", 0.0)))
    counterbore_depth = max(0.0, float(params.get("counterbore_depth", 0.0)))
    counterbore_z0 = max(z0, z1 - counterbore_depth) if counterbore_depth > 0 else z1

    cut_specs: list[tuple[float, float, float, float, float]] = []
    for x, y, diameter in holes:
        radius = max(0.1, diameter / 2.0)
        cut_specs.append((x, y, radius, z0, z1))
        if counterbore_diameter > diameter and counterbore_depth > 0:
            cut_specs.append((x, y, counterbore_diameter / 2.0, counterbore_z0, z1))

    cut = TriMesh()
    cut.verts = list(mesh.verts)
    for a, b, c in mesh.tris:
        va, vb, vc = mesh.verts[a], mesh.verts[b], mesh.verts[c]
        cx = (va[0] + vb[0] + vc[0]) / 3.0
        cy = (va[1] + vb[1] + vc[1]) / 3.0
        cz = (va[2] + vb[2] + vc[2]) / 3.0
        inside_cut = any(
            hz0 <= cz <= hz1 and (cx - hx) ** 2 + (cy - hy) ** 2 <= hr ** 2
            for hx, hy, hr, hz0, hz1 in cut_specs
        )
        if not inside_cut:
            cut.tris.append((a, b, c))

    for x, y, diameter in holes:
        radius = max(0.1, diameter / 2.0)
        _add_cylinder_wall(cut, x, y, radius, max(0.0, z0), z1)
        if counterbore_diameter > diameter and counterbore_depth > 0:
            _add_cylinder_wall(cut, x, y, counterbore_diameter / 2.0, counterbore_z0, z1)

    return shift_mesh_to_buildplate(cut)


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
    elif primitive == "source_phone_stand":
        obj["shape"] = _make_source_phone_stand_mesh(params)
    elif primitive == "source_battery_holder":
        obj["shape"] = _make_source_battery_holder_mesh(params)
    elif primitive == "imported_source_mesh":
        obj["shape"] = _apply_mesh_hole_cuts(_stable_source_shape(obj), params)
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
            "desk",
            "clamp",
        )
    )
    flat_primitive = primitive == "rectangle"
    imported_source = primitive == "imported_source_mesh" or bool(obj.get("imported_source_mesh"))
    flat = (flat_primitive or imported_source) and width >= 25.0 and depth >= 20.0 and height <= max(18.0, min(width, depth) * 0.35)
    return explicit or flat


def _base_candidate_score(obj: CadObject) -> float:
    name = str(obj.get("name", "")).lower()
    params = obj.get("parameters", {})
    width = max(0.0, float(params.get("width", 0.0)))
    depth = max(0.0, float(params.get("depth", 0.0)))
    height = max(0.1, float(params.get("height", params.get("thickness", 0.0))))
    area = width * depth
    flatness = area / height
    score = flatness
    if _is_base_like(obj):
        score += area * 3.0
    if any(token in name for token in ("base", "plate", "mount", "desk", "clamp", "floor", "bottom")):
        score += area * 2.0
    if any(token in name for token in ("screw", "bolt", "pin", "knob", "spacer")):
        score -= area * 4.0
    return score


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
    source_dimensions = obj.get("source_dimensions") if isinstance(obj.get("source_dimensions"), dict) else {}
    imported_source = obj.get("primitive") == "imported_source_mesh" or bool(obj.get("imported_source_mesh"))
    width = max(
        1.0,
        float((source_dimensions if imported_source else {}).get("width") or params.get("width", 80.0)),
    )
    depth = max(
        1.0,
        float((source_dimensions if imported_source else {}).get("depth") or params.get("depth", 70.0)),
    )
    height = max(
        0.5,
        float((source_dimensions if imported_source else {}).get("height") or params.get("height", params.get("thickness", 8.0))),
    )
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
    search_space = _source_group_objects(session, selected) if selected and selected.get("source_group_id") else []
    if not search_space:
        search_space = [session["objects"][oid] for oid in session["object_order"]]

    if selected and _is_base_like(selected):
        candidates = [selected]
    else:
        candidates = [obj for obj in search_space if _is_base_like(obj)]
        if not candidates and search_space:
            ranked = sorted(search_space, key=_base_candidate_score, reverse=True)
            candidates = ranked[:1] if ranked and _base_candidate_score(ranked[0]) > 0 else []
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


def _world_extents(obj: CadObject) -> tuple[list[float], list[float]]:
    mesh = obj["shape"].transformed(obj["transform"])
    if not mesh.verts:
        return [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]
    mins = [min(vertex[index] for vertex in mesh.verts) for index in range(3)]
    maxs = [max(vertex[index] for vertex in mesh.verts) for index in range(3)]
    return mins, maxs


def place_object_on_plate(obj: CadObject) -> None:
    """Move the object so its transformed bottom face sits on Z=0."""
    mins, _maxs = _world_extents(obj)
    obj["transform"].position[2] -= mins[2]


def center_object_on_plate(obj: CadObject) -> None:
    """Center the transformed object on the build plate and put it on Z=0."""
    mins, maxs = _world_extents(obj)
    center_x = (mins[0] + maxs[0]) / 2.0
    center_y = (mins[1] + maxs[1]) / 2.0
    obj["transform"].position[0] -= center_x
    obj["transform"].position[1] -= center_y
    place_object_on_plate(obj)


def update_imported_source_dimensions(obj: CadObject, changed_keys: set[str]) -> bool:
    """Apply dimension-panel edits to imported STL meshes through transform scale."""
    if obj.get("primitive") != "imported_source_mesh":
        return False
    dimension_keys = {"width", "depth", "height"}
    hole_keys = {
        "hole_count",
        "hole_diameter",
        "counterbore_diameter",
        "counterbore_depth",
        "custom_hole_count",
    }
    changed_holes = bool(hole_keys & changed_keys) or any(key.startswith("custom_hole_") for key in changed_keys)
    if changed_holes:
        rebuild_manual_object(obj)
    if not (dimension_keys & changed_keys):
        place_object_on_plate(obj)
        return True

    source_dimensions = obj.get("source_dimensions")
    if not isinstance(source_dimensions, dict):
        source_dimensions = _mesh_dimensions(_stable_source_shape(obj))
        obj["source_dimensions"] = source_dimensions

    axis_for_key = {"width": 0, "depth": 1, "height": 2}
    t: Transform = obj["transform"]
    for key, axis in axis_for_key.items():
        original = max(0.001, float(source_dimensions.get(key) or 0.0))
        desired = max(0.001, float(obj["parameters"].get(key, original)))
        t.scale[axis] = desired / original
    place_object_on_plate(obj)
    return True


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
