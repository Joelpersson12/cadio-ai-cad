"""Thread-safe session manager for Cadio CAD sessions.

Each session holds a collection of CAD objects, selection state,
edit history, and printer configuration.  All mutations go through
this module so locking is centralized.
"""

from __future__ import annotations

import os
import uuid
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from threading import RLock, Thread
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
Vec3Tuple = tuple[float, float, float]

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

    # A fresh generation starts a new model — drop any source-file picker state
    # so a stale file list from a previous import doesn't linger, and clear the
    # background-prefetched mesh cache so meshes from the previous model can't
    # leak into the new one.
    session["source_files"] = []
    session["_source_mesh_cache"] = {}
    session.pop("llm_build_plan", None)

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

def _prompt_title_overlap(prompt: str, title: str) -> int:
    """How many of the prompt's meaningful words appear in a match title.

    Uses the normalized/translated query so non-English prompts count too.
    0 means the title shares nothing with what the user asked for — an
    unrelated model that must not be imported."""
    from backend.services.prompt_translation import normalize_source_query

    stop_words = {"with", "and", "the", "for", "from", "that", "this", "into", "onto", "under", "over", "mount", "holder", "stand"}
    text = f"{_prompt_match_text(prompt)} {normalize_source_query(prompt)}"
    core_words = {word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2 and word not in stop_words}
    if not core_words:
        return 1  # nothing meaningful to compare — don't block
    lower_title = (title or "").lower()
    return sum(1 for word in core_words if word in lower_title)


def _rank_source_files(files: list[Any], prompt: str, preferred_slots: int = 0) -> list[Any]:
    return sorted(files, key=lambda source_file: _source_file_score(source_file, prompt, preferred_slots), reverse=True)


def _select_source_file(files: list[Any], prompt: str, preferred_slots: int = 0) -> Any | None:
    ranked = _rank_source_files(files, prompt, preferred_slots)
    return ranked[0] if ranked else None


def _source_file_evidence(prompt: str, preferred_slots: int = 0) -> tuple[dict[str, Any] | None, list[dict[str, Any]], dict[str, Any] | None]:
    try:
        from backend.services.design_providers import get_provider_registry, resolve_source_model_files

        examples = get_provider_registry().search_all(prompt, limit=8)
    except Exception:
        return None, [], None

    importable = next((example for example in examples if example.source in _IMPORTABLE_SOURCES), None)
    top = importable or (examples[0] if examples else None)
    if top is None:
        return None, [], None

    files = resolve_source_model_files(top.url, top.source, limit=20) if top.source in _IMPORTABLE_SOURCES else []
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


# Cross-session mesh cache: the same popular files ("headset stand", demo
# models, anything recently generated by ANOTHER user) skip the download +
# parse entirely. Entries are deepcopied on the way in and out so cached
# meshes are never mutated. Small and TTL'd to bound memory.
_GLOBAL_MESH_CACHE: dict[str, tuple[float, TriMesh]] = {}
_GLOBAL_MESH_CACHE_TTL = 900.0
_GLOBAL_MESH_CACHE_MAX = max(8, int(os.environ.get("GLOBAL_MESH_CACHE_MAX", "24")))


def _global_mesh_cache_get(key: str) -> TriMesh | None:
    import time as _time

    entry = _GLOBAL_MESH_CACHE.get(key)
    if entry is None:
        return None
    ts, mesh = entry
    if _time.monotonic() - ts > _GLOBAL_MESH_CACHE_TTL:
        _GLOBAL_MESH_CACHE.pop(key, None)
        return None
    return deepcopy(mesh)


def _global_mesh_cache_put(key: str, mesh: TriMesh) -> None:
    import time as _time

    if len(_GLOBAL_MESH_CACHE) >= _GLOBAL_MESH_CACHE_MAX:
        oldest = min(_GLOBAL_MESH_CACHE.items(), key=lambda kv: kv[1][0])[0]
        _GLOBAL_MESH_CACHE.pop(oldest, None)
    _GLOBAL_MESH_CACHE[key] = (_time.monotonic(), deepcopy(mesh))


def _try_import_source_stl(
    source_file: dict[str, Any] | None,
    *,
    prefer_flat: bool = False,
    center_xy: bool = True,
    shift_to_plate: bool = True,
) -> TriMesh | None:
    if not source_file:
        return None
    file_type = str(source_file.get("file_type") or "").lower()
    if file_type not in _IMPORTABLE_FILE_TYPES:
        return None

    cache_key = ""
    fid = str(source_file.get("id") or "")
    if fid:
        cache_key = f"{source_file.get('source')}|{fid}|{prefer_flat}|{center_xy}|{shift_to_plate}"
        cached = _global_mesh_cache_get(cache_key)
        if cached is not None:
            return cached

    try:
        from backend.services.stl_importer import import_mesh_from_url
    except Exception:
        return None

    file_name = str(source_file.get("name") or "")

    def _import(candidate_url: str) -> TriMesh | None:
        if not candidate_url:
            return None
        try:
            return import_mesh_from_url(
                candidate_url,
                file_name=file_name,
                prefer_flat=prefer_flat,
                center_xy=center_xy,
                shift_to_plate=shift_to_plate,
            )
        except Exception:
            return None

    # 1) Stored download URL (guessed CDN path or a direct field) — fast path.
    mesh = _import(str(source_file.get("download_url") or ""))
    if mesh is not None:
        if cache_key:
            _global_mesh_cache_put(cache_key, mesh)
        return mesh

    # 2) Printables blocks hot-linked CDN guesses; resolve a fresh signed link
    #    via the GraphQL API (same one the website uses) and retry. This is the
    #    authoritative way to download a real STL, so anything published on
    #    Printables becomes importable even when the guessed path fails.
    if source_file.get("source") == "printables":
        model_id = str(source_file.get("model_id") or "")
        file_id = str(source_file.get("id") or "")
        if model_id and file_id:
            try:
                from backend.services.design_providers import printables_fresh_download_url

                signed = printables_fresh_download_url(model_id, file_id)
            except Exception:
                signed = None
            if signed:
                mesh = _import(signed)
                if mesh is not None:
                    if cache_key:
                        _global_mesh_cache_put(cache_key, mesh)
                    return mesh

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


def _xy_overlap_ratio(a: tuple[list[float], list[float]], b: tuple[list[float], list[float]]) -> float:
    """Fraction of the smaller part's XY footprint that overlaps the other."""
    (a_min, a_max), (b_min, b_max) = a, b
    ox = max(0.0, min(a_max[0], b_max[0]) - max(a_min[0], b_min[0]))
    oy = max(0.0, min(a_max[1], b_max[1]) - max(a_min[1], b_min[1]))
    inter = ox * oy
    area_a = max(0.0, a_max[0] - a_min[0]) * max(0.0, a_max[1] - a_min[1])
    area_b = max(0.0, b_max[0] - b_min[0]) * max(0.0, b_max[1] - b_min[1])
    smaller = min(area_a, area_b)
    return inter / smaller if smaller > 0 else 0.0


def _layout_parts_side_by_side(meshes: list[TriMesh]) -> list[TriMesh]:
    """Place separate parts in a row on the plate, each centred in Y, on z=0."""
    gap = 0.0
    widths = []
    for mesh in meshes:
        if mesh.verts:
            mins, maxs = _mesh_extents(mesh)
            widths.append(maxs[0] - mins[0])
    if widths:
        gap = max(2.0, 0.12 * (sum(widths) / len(widths)))

    laid: list[TriMesh] = []
    cursor_x = 0.0
    for mesh in meshes:
        if not mesh.verts:
            laid.append(mesh)
            continue
        mins, maxs = _mesh_extents(mesh)
        width = maxs[0] - mins[0]
        cy = (mins[1] + maxs[1]) / 2.0
        # Shift so this part starts at cursor_x, is centred in Y, sits on z=0.
        laid.append(_translate_mesh(mesh, cursor_x - mins[0], -cy, -mins[2]))
        cursor_x += width + gap
    return laid


def _normalize_mesh_group(meshes: list[TriMesh]) -> list[TriMesh]:
    """Centre an imported source assembly.

    Creators export multi-part models two ways: parts already positioned in
    their assembled world coordinates (keep the relative offsets), or every
    part individually centred at the origin (which would stack them on top of
    each other). Detect heavy overlap and lay those out side-by-side instead.
    """
    non_empty = [mesh for mesh in meshes if mesh.verts]
    if not non_empty:
        return meshes

    boxes = [_mesh_extents(mesh) for mesh in non_empty]
    stacked = any(
        _xy_overlap_ratio(boxes[i], boxes[j]) > 0.35
        for i in range(len(boxes))
        for j in range(i + 1, len(boxes))
    )
    if stacked:
        meshes = _layout_parts_side_by_side(meshes)
        non_empty = [mesh for mesh in meshes if mesh.verts]

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


# Mesh file types Cadio can import directly. ".zip" is included because some
# sources (e.g. Thingiverse) deliver a model's meshes inside a zip archive.
_IMPORTABLE_FILE_TYPES = ("stl", "obj", "zip", "3mf")

# Sources whose model files Cadio can resolve and download (see
# design_providers.resolve_source_model_files).
_IMPORTABLE_SOURCES = ("printables", "thingiverse", "makerworld")

_SOURCE_LABELS = {
    "printables": "Printables",
    "thingiverse": "Thingiverse",
    "makerworld": "MakerWorld",
}


def _source_label(source: str | None) -> str:
    return _SOURCE_LABELS.get(str(source or "").lower(), "source")


def _source_file_is_importable(source_file: dict[str, Any]) -> bool:
    """True when Cadio can fetch a real mesh for this file.

    A file is importable if it has a stored download URL (Thingiverse,
    MakerWorld, ...), or if it's a Printables STL/OBJ for which we can resolve a
    fresh signed download link on demand (model_id + file id known).
    """
    if str(source_file.get("file_type") or "").lower() not in _IMPORTABLE_FILE_TYPES:
        return False
    if source_file.get("download_url"):
        return True
    return bool(
        source_file.get("source") == "printables"
        and source_file.get("model_id")
        and source_file.get("id")
    )


def _source_file_component_score(source_file: dict[str, Any], prompt: str, preferred_slots: int = 0) -> float:
    if not _source_file_is_importable(source_file):
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
    # Detect numbered parts: files whose stems differ only by a trailing digit (part1/part2, file_1/file_2)
    has_numbered_parts = False
    if len(selected) >= 2:
        stems = [re.sub(r"\d+$", "", re.sub(r"[^a-z0-9]", "", _source_file_name(s).lower().rsplit(".", 1)[0])) for s in selected]
        has_numbered_parts = len(set(stems)) == 1 and stems[0]

    # Detect a shared filename prefix (e.g. "Zarazka_pneu_V3" + "Zarazka_pneu_rolna").
    # Creators name the parts of one model with a common prefix, so two or more
    # distinct good components sharing a meaningful prefix is a strong assembly
    # signal. Variants (small/large/v2…) were already collapsed above, so the
    # files reaching here with a shared prefix are genuinely separate parts.
    has_common_prefix = False
    if len(selected) >= 2:
        token_lists = [
            [tok for tok in re.split(r"[^a-z0-9]+", _source_file_name(s).lower().rsplit(".", 1)[0]) if tok]
            for s in selected
        ]
        if all(token_lists):
            common: list[str] = []
            for group in zip(*token_lists):
                if all(tok == group[0] for tok in group):
                    common.append(group[0])
                else:
                    break
            # Ignore generic shared words that don't imply one model.
            common = [tok for tok in common if tok not in {"the", "model", "print", "stl", "part", "parts"}]
            has_common_prefix = bool(common) and len("".join(common)) >= 4

    if len(selected) >= 2 and (
        has_complement or has_left_right or has_numbered_parts or has_common_prefix or len(selected_roles) >= 3
    ):
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
    # Measure what the model actually contains (holes, base, size) so prompt
    # edits can target the real geometry instead of guessing. Scan the FINAL
    # stored shape — create_manual_object shifts it onto the build plate.
    try:
        from backend.services.mesh_analysis import scan_trimesh

        source_obj["mesh_scan"] = scan_trimesh(source_obj["shape"])
    except Exception:  # noqa: BLE001 — scanning is best-effort
        source_obj["mesh_scan"] = None
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


def _object_license_record(obj: CadObject) -> dict[str, Any] | None:
    """Return the normalized license record attached to an imported object."""
    matched = (obj.get("source_model") or {}).get("matched_example")
    if isinstance(matched, dict):
        lic = matched.get("license")
        if isinstance(lic, dict):
            return lic
    return None


def edit_locked_source_object(session: Session) -> CadObject | None:
    """Return an imported source object whose license forbids derivatives.

    Used to refuse AI *edits* of models that may not be remixed (e.g. CC BY-ND,
    All Rights Reserved). Only confirmed (verified) non-editable licenses lock
    editing; unconfirmed licenses are allowed through but flagged in the UI.
    """
    for oid in session.get("object_order", []):
        obj = session["objects"].get(oid)
        if not obj or not obj.get("imported_source_mesh"):
            continue
        lic = _object_license_record(obj)
        if isinstance(lic, dict) and lic.get("verified") and lic.get("editable") is False:
            return obj
    return None


def edit_lock_message(obj: CadObject | None) -> str:
    """User-facing reason an imported model cannot be edited."""
    lic = _object_license_record(obj) if obj else None
    name = (lic or {}).get("name") or "this model's license"
    return (
        f"Due to the license of this model ({name}), it is not editable. "
        "You can still view and download the original, or start a new model to use the AI editor."
    )


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
        from backend.services.design_providers import get_provider_registry, resolve_source_model_files

        examples = [
            example
            for example in get_provider_registry().search_all(prompt, limit=20)
            if example.source in _IMPORTABLE_SOURCES
        ]
    except Exception:
        examples = []

    # Relevance gate: a match whose title shares NOTHING with the prompt's key
    # words is a wrong model, not a model ("holster for a S&W 9mm" must never
    # import a "wall mount hat holder"). Better to fall through to the
    # LLM/parametric build than to show something unrelated.
    examples = [ex for ex in examples if _prompt_title_overlap(prompt, ex.title) > 0]

    ranked_assemblies: list[tuple[float, Any, list[dict[str, Any]], list[dict[str, Any]]]] = []
    ranked_candidates: list[tuple[float, Any, list[dict[str, Any]], dict[str, Any]]] = []
    # File resolution is a network round-trip per candidate — the dominant cost
    # of a generation. Cap how many top-ranked results we resolve (the examples
    # are already relevance-ranked, so the best match is virtually always within
    # the first few) and resolve them all IN PARALLEL, so the wait is the
    # slowest single provider rather than the sum of all of them.
    # Tunable via SOURCE_IMPORT_MAX_CANDIDATES.
    try:
        _max_candidates = max(1, int(os.environ.get("SOURCE_IMPORT_MAX_CANDIDATES", "4")))
    except (TypeError, ValueError):
        _max_candidates = 4
    top_examples = examples[:_max_candidates]

    # ── FAST PATH ────────────────────────────────────────────────────────────
    # Show the #1-ranked model IMMEDIATELY: resolve just its file list, import
    # its best file, and return — instead of waiting for all candidates to
    # resolve before anything appears. The remaining candidates resolve and
    # download on a background thread so "Next model" switches instantly.
    # If anything about the top model fails we fall through to the full
    # multi-candidate scoring below (candidate 0 re-resolves from cache).
    # The fast path is only trusted when the top hit's title actually relates
    # to the prompt - "pegboard tool holder" must never fast-path into a
    # battery mount just because that result arrived first. Otherwise the
    # full scoring loop below weighs title relevance across all candidates.
    if top_examples and _source_title_score(top_examples[0].title, prompt) > 0:
        first_example = top_examples[0]
        try:
            first_files = _rank_source_files(
                resolve_source_model_files(first_example.url, first_example.source, limit=24),
                prompt,
                preferred_slots,
            )
        except Exception:  # noqa: BLE001
            first_files = []
        first_dicts = [f.to_dict() for f in first_files]
        first_candidate = next((c for c in first_dicts if _source_file_is_importable(c)), None)
        if first_candidate is not None:
            imported_shape = _import_source_stl_cached(session, first_candidate, prefer_flat)
            if imported_shape is not None:
                source_example = first_example.to_dict()
                source_obj = _create_imported_source_object(
                    prompt, imported_shape, source_example, first_dicts, first_candidate
                )
                _remove_object_direct(session, obj["id"])
                add_object(session, source_obj)
                session["selected_object_id"] = ""
                session["source_info"] = [source_example]
                session["source_files"] = _build_source_file_options(
                    first_dicts, prompt, preferred_slots, session=session, active_id=first_candidate.get("id")
                )
                respec_notes = _respec_imported_to_prompt(source_obj, prompt)
                _spawn_source_file_prefetch(
                    session.get("session_id", ""), first_dicts, prompt, first_candidate.get("id")
                )
                # Warm the ENTIRE ranked variant list (not just the scoring
                # candidates) so repeated "Next model" presses are all instant.
                _spawn_variant_prefetch(session.get("session_id", ""), examples[1:], prompt)
                selected_file_name = first_candidate.get("name")
                options_n = len([o for o in session["source_files"] if o.get("id") != "__all__"])
                scan = source_obj.get("mesh_scan") or {}
                return [
                    _source_signal_summary(prompt),
                    f"source-match: {first_example.title}",
                    *(respec_notes or []),
                    f"source-files: selected {selected_file_name}" if selected_file_name else "source-files: selected public STL",
                    f"imported real {_source_label(first_example.source)} mesh as starting geometry",
                    f"scanned model: {scan['summary']}" if scan.get("summary") else "",
                    f"source-file-options: {options_n} files available to choose from" if options_n > 1 else "",
                ], source_obj

    resolved_files: dict[int, list[Any]] = {}
    if top_examples:
        from concurrent.futures import ThreadPoolExecutor

        def _resolve_one(idx_example: tuple[int, Any]) -> tuple[int, list[Any]]:
            idx, ex = idx_example
            try:
                return idx, resolve_source_model_files(ex.url, ex.source, limit=24)
            except Exception:  # noqa: BLE001 — one slow/broken provider must not sink the rest
                return idx, []

        with ThreadPoolExecutor(max_workers=len(top_examples)) as _pool:
            for idx, files in _pool.map(_resolve_one, enumerate(top_examples)):
                resolved_files[idx] = files

    for example_index, source_example_obj in enumerate(top_examples):
        source_files_obj = _rank_source_files(
            resolved_files.get(example_index, []),
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
            if not _source_file_is_importable(candidate):
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

    # Default: import the single best-ranked file and offer the model's other
    # files as a pickable list, rather than auto-dumping every part onto the
    # plate. Users choose additional parts (or "All parts") from the picker.
    ranked_candidates.sort(key=lambda item: item[0], reverse=True)
    for _score, source_example_obj, source_files, candidate in ranked_candidates:
        imported_shape = _import_source_stl_cached(session, candidate, prefer_flat)
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
        session["source_info"] = [source_example]
        session["source_files"] = _build_source_file_options(
            source_files, prompt, preferred_slots, session=session, active_id=candidate.get("id")
        )
        # The best-matching file is now on the plate, so the user sees the model
        # immediately. Quietly download + parse this model's other files in the
        # background so switching between them is instant — without making the
        # user wait for the initial generation.
        _spawn_source_file_prefetch(
            session.get("session_id", ""), source_files, prompt, candidate.get("id")
        )
        selected_file_name = candidate.get("name")
        options_n = len([o for o in session["source_files"] if o.get("id") != "__all__"])
        return [
            _source_signal_summary(prompt),
            f"source-match: {source_example_obj.title}",
            f"source-files: selected {selected_file_name}" if selected_file_name else "source-files: selected public STL",
            f"imported real {_source_label(source_example_obj.source)} mesh as starting geometry",
            f"source-file-options: {options_n} files available to choose from" if options_n > 1 else "",
        ], source_obj

    # Fallback: nothing imported as a single file but a multi-part assembly is
    # available — import it so the plate isn't empty.
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
        session["source_files"] = _build_source_file_options(
            source_files, prompt, preferred_slots, session=session, active_id="__all__"
        )
        file_names = ", ".join(_source_file_name(file) for file in assembly_files[:4])
        if len(assembly_files) > 4:
            file_names += f", +{len(assembly_files) - 4} more"
        return [
            _source_signal_summary(prompt),
            f"source-match: {source_example_obj.title}",
            f"source-files: imported {len(source_objects)} separate STL parts",
            f"source-parts: {file_names}",
            f"imported real multi-part {_source_label(source_example_obj.source)} assembly as editable parts",
        ], source_objects[0]

    # No STL imported as scene geometry (parse/fetch/signed-link failures are the
    # most fragile step), but if the search DID find matching models with real
    # downloadable files, still surface attribution + the file picker as a *side
    # effect* on the session. We deliberately return EMPTY actions so the caller
    # falls through to normal AI generation (the seed becomes a real model), while
    # the Source button + "Change model" picker now appear and the user can pick /
    # retry a source file. Without this the buttons silently vanish whenever the
    # live import step fails even though we found the source.
    if ranked_candidates:
        _score, source_example_obj, source_files, _candidate = ranked_candidates[0]
        session["source_info"] = [source_example_obj.to_dict()]
        session["source_files"] = _build_source_file_options(
            source_files, prompt, preferred_slots, session=session, active_id=None
        )

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


def _imported_source_objects(session: Session) -> list[CadObject]:
    """All imported-source-mesh bodies currently on the plate."""
    return [
        session["objects"][oid]
        for oid in session.get("object_order", [])
        if session["objects"].get(oid, {}).get("imported_source_mesh")
    ]


def _placed_source_file_ids(session: Session) -> set[str]:
    """File ids of the source parts currently placed on the build plate."""
    ids: set[str] = set()
    for obj in _imported_source_objects(session):
        sel = (obj.get("source_model") or {}).get("selected_file")
        if isinstance(sel, dict) and sel.get("id") is not None:
            ids.add(str(sel.get("id")))
    return ids


def _build_source_file_options(
    source_files: list[dict[str, Any]],
    prompt: str,
    preferred_slots: int,
    session: Session | None = None,
    active_id: Any = None,
    max_options: int = 24,
) -> list[dict[str, Any]]:
    """Build the pickable file list for the active source model.

    Each importable file is listed (plus a synthetic "All parts" assembly option
    for multi-part models). A file is marked ``active`` when it is currently
    placed on the plate, so several parts can be shown as placed at once.
    """
    placed = _placed_source_file_ids(session) if session is not None else set()
    if active_id is not None and str(active_id) != "__all__":
        placed = placed | {str(active_id)}

    importable = [item for item in source_files if _source_file_is_importable(item)]
    options: list[dict[str, Any]] = []
    assembly_files = _select_source_assembly_files(source_files, prompt, preferred_slots, max_parts=6)
    if len(assembly_files) >= 2:
        options.append(
            {
                "id": "__all__",
                "name": f"All {len(assembly_files)} parts (assembly)",
                "file_type": "assembly",
                "file_size": 0,
                "source": importable[0].get("source") if importable else "",
                "part_count": len(assembly_files),
                "active": str(active_id) == "__all__",
            }
        )
    seen: set[str] = set()
    for item in importable:
        fid = str(item.get("id") or "")
        if not fid or fid in seen:
            continue
        seen.add(fid)
        options.append(
            {
                "id": item.get("id"),
                "name": _source_file_name(item),
                "file_type": str(item.get("file_type") or ""),
                "file_size": int(item.get("file_size") or 0),
                "source": item.get("source"),
                "active": fid in placed,
            }
        )
        if len(options) >= max_options:
            break
    return options


def _import_source_stl_cached(session: Session, candidate: dict[str, Any], prefer_flat: bool) -> TriMesh | None:
    """Import a source file's STL, reusing a background-prefetched mesh if one is
    ready. The prefetch downloads + parses the model's other files right after the
    first one is shown, so switching between files is instant. Returns a deepcopy
    so the cached mesh is never mutated by downstream edits."""
    fid = str(candidate.get("id") or "")
    cache = session.get("_source_mesh_cache")
    if fid and isinstance(cache, dict) and fid in cache:
        return deepcopy(cache[fid])
    shape = _try_import_source_stl(candidate, prefer_flat=prefer_flat)
    if shape is not None and fid:
        session.setdefault("_source_mesh_cache", {})[fid] = deepcopy(shape)
    return shape


def _extract_target_dims(prompt: str) -> dict[str, float]:
    """Explicit dimensions the customer typed, in mm, keyed by axis.

    Understands mm/cm/inches ('6\"', '6 in', '15 cm') and axis words in
    English and Swedish. Only returns axes that were explicitly stated."""
    text = (prompt or "").lower()
    unit_re = r"(mm|millimeters?|cm|centimeters?|\"|″|''|in\b|inch(?:es)?|tum)"

    def _mm(val: str, unit: str | None) -> float:
        v = float(val.replace(",", "."))
        u = (unit or "").strip()
        if u.startswith("cm"):
            return v * 10.0
        if u in ('"', "″", "''") or u.startswith("in") or u.startswith("tum"):
            return v * 25.4
        return v

    axes = {
        "height": r"tall|high|height|h[oö]g(?:t)?|h[oö]jd",
        "width": r"wide|width|bred(?:d|t)?",
        "depth": r"deep|depth|long|length|djup(?:t)?|l[aå]ng(?:t)?|l[aä]ngd",
    }
    out: dict[str, float] = {}
    for key, kw in axes.items():
        m = re.search(rf"(\d+(?:[.,]\d+)?)\s*{unit_re}?\s*(?:{kw})\b", text)
        if not m:
            m = re.search(rf"\b(?:{kw})\b\s*(?:of|to|at|is|=|:|av|p[aå])?\s*(\d+(?:[.,]\d+)?)\s*{unit_re}?", text)
        if m:
            out[key] = max(3.0, min(1000.0, _mm(m.group(1), m.group(2))))
    return out


def _respec_imported_to_prompt(source_obj: CadObject, prompt: str) -> list[str]:
    """Rebuild an imported model to the customer's explicitly typed sizes.

    'If Cadio can't find a model that is EXACTLY what the customer wants, it
    builds it': the closest real model is imported, then stretched per-axis
    to the stated dimensions, so it still looks like the Printables design
    but measures what the customer asked for. Only stated axes change."""
    targets = _extract_target_dims(prompt)
    if not targets:
        return []
    mesh = source_obj.get("shape")
    if mesh is None or not getattr(mesh, "verts", None):
        return []
    xs = [v[0] for v in mesh.verts]
    ys = [v[1] for v in mesh.verts]
    zs = [v[2] for v in mesh.verts]
    cur = {
        "width": max(xs) - min(xs),
        "depth": max(ys) - min(ys),
        "height": max(zs) - min(zs),
    }
    scale = {
        "width": targets.get("width", 0.0) / cur["width"] if cur["width"] > 1e-6 and "width" in targets else 1.0,
        "depth": targets.get("depth", 0.0) / cur["depth"] if cur["depth"] > 1e-6 and "depth" in targets else 1.0,
        "height": targets.get("height", 0.0) / cur["height"] if cur["height"] > 1e-6 and "height" in targets else 1.0,
    }
    if all(abs(f - 1.0) < 0.02 for f in scale.values()):
        return []  # already matches
    cx = (max(xs) + min(xs)) / 2.0
    cy = (max(ys) + min(ys)) / 2.0
    z0 = min(zs)
    sx, sy, sz = scale["width"], scale["depth"], scale["height"]
    mesh.verts = [
        (cx + (v[0] - cx) * sx, cy + (v[1] - cy) * sy, z0 + (v[2] - z0) * sz)
        for v in mesh.verts
    ]
    source_obj["source_original_shape"] = deepcopy(mesh)
    params = source_obj.get("parameters", {})
    for key in ("width", "depth", "height"):
        if key in targets:
            params[key] = targets[key]
        else:
            params[key] = cur[key] * scale[key]
    try:
        from backend.services.mesh_analysis import scan_trimesh

        source_obj["mesh_scan"] = scan_trimesh(mesh)
    except Exception:  # noqa: BLE001
        pass
    changed = ", ".join(f"{k} {targets[k]:g}mm" for k in ("width", "depth", "height") if k in targets)
    return [f"rebuilt the imported model to your dimensions: {changed}"]


def _spawn_source_file_prefetch(
    session_id: str,
    source_files: list[dict[str, Any]],
    prompt: str,
    skip_file_id: Any,
) -> None:
    """Background-download + parse the model's remaining importable files into the
    session mesh cache, so the user sees the first model immediately and the other
    files load silently (and switch instantly). Best-effort; never blocks."""
    prefer_flat = _prefer_flat_for_prompt(prompt)
    pending = [
        item
        for item in source_files
        if _source_file_is_importable(item) and str(item.get("id")) != str(skip_file_id)
    ][:6]
    if not session_id or not pending:
        return

    def _work() -> None:
        for cand in pending:
            fid = str(cand.get("id") or "")
            if not fid:
                continue
            with _lock:
                sess = _sessions.get(session_id)
                if sess is None:
                    return
                cache = sess.get("_source_mesh_cache")
                if isinstance(cache, dict) and fid in cache:
                    continue
            try:
                shape = _try_import_source_stl(cand, prefer_flat=prefer_flat)
            except Exception:  # noqa: BLE001 — prefetch must never raise
                continue
            if shape is None:
                continue
            with _lock:
                sess = _sessions.get(session_id)
                if sess is None:
                    return
                sess.setdefault("_source_mesh_cache", {})[fid] = shape

    Thread(target=_work, name="cadio-source-prefetch", daemon=True).start()


# How many runner-up models to warm in the background after a generation, and
# the ceiling on cached meshes per session (memory guard — ~20 variants plus
# the active model's own files). Tunable via env without a code change.
_VARIANT_PREFETCH_COUNT = max(1, int(os.environ.get("VARIANT_PREFETCH_COUNT", "20")))
_MESH_CACHE_MAX = max(8, int(os.environ.get("SOURCE_MESH_CACHE_MAX", "28")))


def _mesh_cache_full(session_id: str) -> bool:
    with _lock:
        sess = _sessions.get(session_id)
        if sess is None:
            return True
        cache = sess.get("_source_mesh_cache")
        return isinstance(cache, dict) and len(cache) >= _MESH_CACHE_MAX


def _spawn_variant_prefetch(session_id: str, examples: list[Any], prompt: str) -> None:
    """Warm the runner-up models in the background after the fast path showed
    the #1 match: resolve each one's file list (fills the resolve cache) and
    download its best file into the session mesh cache, so pressing
    'Next model' repeatedly is instant — the whole variant list is ready
    before the user gets there. Best-effort; never blocks or raises."""
    if not session_id or not examples:
        return
    prefer_flat = _prefer_flat_for_prompt(prompt)
    ex_data = [(ex.url, ex.source) for ex in examples[:_VARIANT_PREFETCH_COUNT]]

    def _warm_one(url: str, source: str) -> None:
        from backend.services.design_providers import resolve_source_model_files as _resolve

        if _mesh_cache_full(session_id):
            return
        try:
            ranked = _rank_source_files(_resolve(url, source, limit=24), prompt, 0)
        except Exception:  # noqa: BLE001
            return
        cand = next(
            (f.to_dict() for f in ranked if _source_file_is_importable(f.to_dict())),
            None,
        )
        if cand is None:
            return
        fid = str(cand.get("id") or "")
        if not fid:
            return
        with _lock:
            sess = _sessions.get(session_id)
            if sess is None:
                return
            cache = sess.get("_source_mesh_cache")
            if isinstance(cache, dict) and fid in cache:
                return
        try:
            shape = _try_import_source_stl(cand, prefer_flat=prefer_flat)
        except Exception:  # noqa: BLE001
            return
        if shape is None:
            return
        with _lock:
            sess = _sessions.get(session_id)
            if sess is None:
                return
            cache = sess.setdefault("_source_mesh_cache", {})
            if len(cache) < _MESH_CACHE_MAX:
                cache[fid] = shape

    def _work() -> None:
        # A few workers so ~20 models warm in a fraction of the sequential
        # time, while staying gentle on the providers and the Space's memory.
        from concurrent.futures import ThreadPoolExecutor

        # Two workers: enough to warm the list quickly, gentle enough that the
        # providers don't rate-limit us (which made "Next model" fail fast).
        pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="cadio-variant-warm")
        try:
            for url, source in ex_data:
                pool.submit(_warm_one, url, source)
        finally:
            pool.shutdown(wait=True)

    Thread(target=_work, name="cadio-variant-prefetch", daemon=True).start()


# ---------------------------------------------------------------------------
# LLM-designed builds — assemble a build plan (from llm_builder) into real,
# editable bodies. The plan is stored with the session so later edit prompts
# can hand the LLM the model's exact structure ("scan") and rebuild.
# ---------------------------------------------------------------------------


def _component_from_plan_part(part: dict[str, Any], params: dict[str, float], color: str) -> CadObject | None:
    shape = part.get("shape")
    label = str(part.get("label") or shape or "part").strip().replace(" ", "_")[:48]
    pos = [float(v) for v in part.get("position_mm", [0, 0, 0])]
    rot = [float(v) for v in part.get("rotation_deg", [0, 0, 0])]
    try:
        if shape == "box":
            return _create_box_component(label, part["width_mm"], part["depth_mm"], part["height_mm"], pos, params, rotation=rot, color=color)
        if shape == "wedge":
            obj = _create_gusset_component(label, part["width_mm"], part["depth_mm"], part["height_mm"], pos, params, color=color)
            obj["transform"].rotation = rot
            return obj
        if shape == "cylinder":
            return _create_cylinder_component(label, part["radius_mm"], part["height_mm"], pos, params, rotation=rot, color=color)
        if shape == "tube":
            mesh = _make_tube_mesh(part["radius_mm"], part.get("inner_radius_mm", part["radius_mm"] * 0.8), part["height_mm"])
            part_params = dict(DEFAULT_PARAMETERS)
            part_params.update(params)
            part_params.update({
                "width": part["radius_mm"] * 2.0,
                "depth": part["radius_mm"] * 2.0,
                "height": float(part["height_mm"]),
            })
            obj = create_manual_object(label, mesh, part_params)
            obj["primitive"] = "cylinder"
            obj["template_component"] = True
            obj["color"] = color
            obj["transform"] = Transform(position=pos, rotation=rot, scale=[1.0, 1.0, 1.0])
            return obj
    except Exception:  # noqa: BLE001 — one bad part must not sink the build
        return None
    return None


def build_objects_from_llm_plan(
    session: Session,
    seed_obj: CadObject | None,
    prompt: str,
    plan: dict[str, Any],
) -> list[str]:
    """Assemble an LLM build plan into editable bodies on the plate.

    Returns action strings on success, [] on failure (caller falls through to
    the normal pipeline). Stores the plan + part ids on the session so edit
    prompts can be answered by editing the plan and rebuilding."""
    parts_spec = plan.get("parts") if isinstance(plan, dict) else None
    if not parts_spec:
        return []
    color = (seed_obj or {}).get("color", "#a9aaad") if isinstance(seed_obj, dict) else "#a9aaad"
    params = dict(DEFAULT_PARAMETERS)
    parts: list[CadObject] = []
    for part_spec in parts_spec:
        component = _component_from_plan_part(part_spec, params, color)
        if component is not None:
            component["llm_built"] = True
            component["assembly_source"] = "llm-design"
            parts.append(component)
    if not parts:
        return []

    # Ground the assembly on the plate and center it in x/y.
    try:
        mins, maxs = _world_extents_for_objects(parts)
        dx = -(mins[0] + maxs[0]) / 2.0
        dy = -(mins[1] + maxs[1]) / 2.0
        dz = -mins[2]
        for component in parts:
            t = component["transform"]
            t.position = [t.position[0] + dx, t.position[1] + dy, t.position[2] + dz]
    except Exception:  # noqa: BLE001 — placement polish must not sink the build
        pass

    if seed_obj is not None and seed_obj.get("id") in session.get("objects", {}):
        _remove_object_direct(session, seed_obj["id"])
    for component in parts:
        add_object(session, component)
    session["selected_object_id"] = ""
    session["llm_build_plan"] = {
        "prompt": prompt,
        "plan": plan,
        "part_ids": [component["id"] for component in parts],
    }
    name = str(plan.get("name", "custom design")).replace("_", " ")
    return [
        f"designed from your description: {name}",
        f"ai-built: {len(parts)} parts, editable — ask for any change",
    ]


def apply_llm_plan_edit(session: Session, prompt: str) -> list[str]:
    """Edit an LLM-built model by updating its stored build plan.

    Hands the LLM the model's current plan (its structural 'scan') plus the
    edit request, then rebuilds from the returned plan. [] on any failure so
    callers fall through to the normal edit pipeline."""
    stored = session.get("llm_build_plan")
    if not isinstance(stored, dict) or not stored.get("plan"):
        return []
    try:
        from backend.services.llm_builder import llm_edit_plan
    except Exception:  # noqa: BLE001
        return []
    new_plan = llm_edit_plan(str(stored.get("prompt", "")), stored["plan"], prompt)
    if not new_plan or not new_plan.get("parts"):
        return []

    # Keep the color the user may have set, then swap old parts for new.
    old_ids = [oid for oid in stored.get("part_ids", []) if oid in session.get("objects", {})]
    color = session["objects"][old_ids[0]].get("color", "#a9aaad") if old_ids else "#a9aaad"
    params = dict(DEFAULT_PARAMETERS)
    parts: list[CadObject] = []
    for part_spec in new_plan["parts"]:
        component = _component_from_plan_part(part_spec, params, color)
        if component is not None:
            component["llm_built"] = True
            component["assembly_source"] = "llm-design"
            parts.append(component)
    if not parts:
        return []
    try:
        mins, maxs = _world_extents_for_objects(parts)
        dx = -(mins[0] + maxs[0]) / 2.0
        dy = -(mins[1] + maxs[1]) / 2.0
        dz = -mins[2]
        for component in parts:
            t = component["transform"]
            t.position = [t.position[0] + dx, t.position[1] + dy, t.position[2] + dz]
    except Exception:  # noqa: BLE001
        pass
    for oid in old_ids:
        _remove_object_direct(session, oid)
    for component in parts:
        add_object(session, component)
    session["selected_object_id"] = ""
    session["llm_build_plan"] = {
        "prompt": stored.get("prompt", ""),
        "plan": new_plan,
        "part_ids": [component["id"] for component in parts],
    }
    return [
        f"applied your change: {prompt.strip()[:80]}",
        f"ai-edited: rebuilt {len(parts)} parts from the updated design",
    ]


def select_source_file(session: Session, file_id: str, mode: str = "swap") -> list[str]:
    """Place source-model parts on the build plate.

    mode="swap" (default): the chosen file replaces whatever is on the plate, so
    a multi-file design stays a single clean model the user switches between.
    mode="add": the chosen file is placed beside the existing parts (and clicking
    an already-placed file removes it), so several parts can be built up.
    ``__all__`` replaces everything with the full multi-part assembly.
    """
    existing = _imported_source_objects(session)
    ref = existing[-1] if existing else _active_source_object(session)
    if ref is None:
        return ["no source model to choose files for"]

    source_model = ref.get("source_model") if isinstance(ref.get("source_model"), dict) else {}
    source_example = source_model.get("matched_example") if isinstance(source_model.get("matched_example"), dict) else {}
    source_files = source_model.get("files") if isinstance(source_model.get("files"), list) else []
    if not source_files:
        source_files = session.get("source_files", [])
    prompt = _source_model_prompt(ref)
    color = ref.get("color")

    if str(file_id) == "__all__":
        assembly_files = _select_source_assembly_files(source_files, prompt, 0, max_parts=6)
        imported_parts = _try_import_source_stl_assembly(assembly_files, prefer_flat=False)
        if len(imported_parts) < 2:
            return ["could not import all parts as an assembly"]
        for obj in existing:
            _remove_object_direct(session, obj["id"])
        source_objects = _create_imported_source_objects(prompt, imported_parts, source_example, source_files)
        for source_obj in source_objects:
            if color:
                source_obj["color"] = color
            add_object(session, source_obj)
        session["selected_object_id"] = ""
        if source_example:
            session["source_info"] = [source_example]
        session["source_files"] = _build_source_file_options(source_files, prompt, 0, session=session, active_id="__all__")
        return [f"source-files: placed all {len(source_objects)} parts"]

    candidate = next((item for item in source_files if str(item.get("id")) == str(file_id)), None)
    if candidate is None:
        return ["selected file is no longer available"]

    placed_obj = next(
        (
            obj
            for obj in existing
            if str(((obj.get("source_model") or {}).get("selected_file") or {}).get("id")) == str(file_id)
        ),
        None,
    )

    # ── Remove mode ──────────────────────────────────────────────────────────
    # Take one copy of this file off the plate.
    if mode == "remove":
        if placed_obj is None:
            return [f"source-files: {_source_file_name(candidate)} is not on the plate"]
        _remove_object_direct(session, placed_obj["id"])
        remaining = _imported_source_objects(session)
        if len(remaining) == 1:
            center_object_on_plate(remaining[0])
        session["selected_object_id"] = ""
        session["source_files"] = _build_source_file_options(source_files, prompt, 0, session=session)
        return [f"source-files: removed {_source_file_name(candidate)}"]

    # ── Add mode ───────────────────────────────────────────────────────────
    # Always places another copy beside the existing parts — so you can have two
    # (or more) of the same file. Removal is the separate "remove" action.
    if mode == "add":
        shape = _import_source_stl_cached(session, candidate, _prefer_flat_for_prompt(prompt))
        if shape is None:
            return [f"could not import {_source_file_name(candidate)}"]
        source_obj = _create_imported_source_object(prompt, shape, source_example, source_files, candidate)
        if color:
            source_obj["color"] = color
        if existing:
            mins, maxs = _world_extents_for_objects(existing)
            obj_mins, _obj_maxs = _world_extents(source_obj)
            gap = max(5.0, 0.12 * max(1.0, maxs[0] - mins[0]))
            source_obj["transform"].position[0] += (maxs[0] + gap) - obj_mins[0]
        add_object(session, source_obj)
        session["selected_object_id"] = ""
        if source_example:
            session["source_info"] = [source_example]
        session["source_files"] = _build_source_file_options(source_files, prompt, 0, session=session, active_id=candidate.get("id"))
        return [f"source-files: added {_source_file_name(candidate)}"]

    # ── Swap mode (default) ────────────────────────────────────────────────
    already_only = len(existing) == 1 and placed_obj is not None
    if already_only:
        return [f"source-files: {_source_file_name(candidate)} is already on the plate"]
    shape = _import_source_stl_cached(session, candidate, _prefer_flat_for_prompt(prompt))
    if shape is None:
        return [f"could not import {_source_file_name(candidate)}"]
    source_obj = _create_imported_source_object(prompt, shape, source_example, source_files, candidate)
    if color:
        source_obj["color"] = color
    for obj in existing:
        _remove_object_direct(session, obj["id"])
    center_object_on_plate(source_obj)
    add_object(session, source_obj)
    session["selected_object_id"] = ""
    if source_example:
        session["source_info"] = [source_example]
    session["source_files"] = _build_source_file_options(source_files, prompt, 0, session=session, active_id=candidate.get("id"))
    return [f"source-files: switched to {_source_file_name(candidate)}"]


def import_uploaded_mesh(session: Session, data: bytes, file_name: str) -> list[str]:
    """Import a mesh file the user dragged/dropped into the workspace.

    Parses STL / OBJ / ZIP bytes into real geometry, clears the plate and places
    the dropped model on it as an editable manual body."""
    try:
        from backend.services.stl_importer import import_mesh_from_bytes
    except Exception:
        return ["mesh importer unavailable"]

    name = (file_name or "model").strip()
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext and ext not in {"stl", "obj", "zip"}:
        return [f"unsupported file type: .{ext} (use STL, OBJ or ZIP)"]

    shape = import_mesh_from_bytes(data, file_name=name)
    if shape is None or not shape.verts:
        return ["could not read that file — is it a valid STL/OBJ/ZIP mesh?"]

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
    clean_name = re.sub(r"[^a-zA-Z0-9]+", "_", name.rsplit(".", 1)[0]).strip("_").lower()[:64] or "uploaded_model"
    obj = create_manual_object(clean_name, shape, params)
    obj["primitive"] = "imported_source_mesh"
    obj["imported_source_mesh"] = True
    obj["assembly_source"] = "uploaded-file"
    obj["operation_history"] = [{"operation": "upload_import", "file": name}]
    center_object_on_plate(obj)

    for existing in list(session.get("objects", {}).values()):
        _remove_object_direct(session, existing["id"])
    session["source_info"] = []
    session["source_files"] = []
    add_object(session, obj)
    session["selected_object_id"] = obj["id"]
    return [f"imported {name}"]


def switch_source_model_variant(session: Session, direction: str = "next") -> list[str]:
    """Swap the active source model to another ranked importable result."""
    current = _active_source_object(session)
    prompt = _source_model_prompt(current)
    if current is None or not prompt:
        return ["no source model to switch"]

    try:
        from backend.services.design_providers import get_provider_registry, resolve_source_model_files
    except Exception:
        return ["source providers unavailable"]

    examples = [
        example
        for example in get_provider_registry().search_all(prompt, limit=20)
        if example.source in _IMPORTABLE_SOURCES
    ]
    if not examples:
        return ["no importable source variants found"]

    current_url = ""
    source_model = current.get("source_model") if isinstance(current.get("source_model"), dict) else {}
    matched = source_model.get("matched_example")
    if isinstance(matched, dict):
        current_url = str(matched.get("url") or "")

    def _norm_url(url: str) -> str:
        return (url or "").strip().lower().rstrip("/").removeprefix("https://").removeprefix("http://").removeprefix("www.")

    normalized_current = _norm_url(current_url)
    current_index = next(
        (idx for idx, example in enumerate(examples) if _norm_url(example.url) == normalized_current),
        -1,
    )
    step = -1 if direction.strip().lower().startswith("prev") else 1
    start = current_index if current_index >= 0 else (-1 if step > 0 else 0)
    order = [((start + step * offset) % len(examples)) for offset in range(1, len(examples) + 1)]

    for index in order:
        example = examples[index]
        # Never "switch" to the model already on the plate — with a fuzzy URL
        # match that used to return instantly with the same model, which read
        # as "Next model aborted".
        if normalized_current and _norm_url(example.url) == normalized_current:
            continue
        files = _rank_source_files(resolve_source_model_files(example.url, example.source, limit=24), prompt, 0)
        files_dicts = [source_file.to_dict() for source_file in files]

        # If the background warm-up already downloaded one of this model's
        # files, use it IMMEDIATELY - this is what makes every "Next model"
        # press land instantly instead of failing on a throttled download.
        mesh_cache = session.get("_source_mesh_cache")
        if isinstance(mesh_cache, dict) and mesh_cache:
            warmed = next(
                (
                    c for c in files_dicts
                    if _source_file_is_importable(c) and str(c.get("id") or "") in mesh_cache
                ),
                None,
            )
            if warmed is not None:
                shape = _import_source_stl_cached(session, warmed, _prefer_flat_for_prompt(prompt))
                if shape is not None:
                    source_obj = _create_imported_source_object(
                        prompt, shape, example.to_dict(), files_dicts, warmed
                    )
                    source_obj["color"] = current.get("color", source_obj.get("color", "#a9aaad"))
                    source_obj["source_model"]["variant_index"] = index
                    source_obj["source_model"]["variant_count"] = len(examples)
                    _remove_source_group_direct(session, current)
                    add_object(session, source_obj)
                    session["selected_object_id"] = ""
                    session["source_info"] = [example.to_dict()]
                    session["source_files"] = _build_source_file_options(
                        files_dicts, prompt, 0, session=session, active_id=warmed.get("id")
                    )
                    return [
                        f"{'previous' if step < 0 else 'next'} source model",
                        f"source-match: {example.title}",
                        f"source-files: selected {warmed.get('name')}",
                    ]

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
                session["source_info"] = [example.to_dict()]
                session["source_files"] = _build_source_file_options(files_dicts, prompt, 0, session=session, active_id="__all__")
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
            shape = _import_source_stl_cached(session, candidate, _prefer_flat_for_prompt(prompt))
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
            session["source_info"] = [example.to_dict()]
            session["source_files"] = _build_source_file_options(files_dicts, prompt, 0, session=session, active_id=candidate.get("id"))
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
    if any(term in text for term in plate_terms) and any(term in text for term in relation_terms):
        return True
    # "give the model a (full/solid) base" in any common phrasing — including
    # Polish "podstawa" (a user asked "niech model ma podstawę" and got his
    # model REPLACED instead of edited).
    if re.search(r"\bpodstaw\w*\b", text):
        return True
    return bool(
        re.search(r"\b(?:add|give|needs?|niech|ge|lagg\s+till|med|ma|full|solid)\b", text)
        and re.search(r"\b(?:base|bas|bottom)\b", text)
        and len(text.split()) <= 10
    )


# ---------------------------------------------------------------------------
# Spec parts: "a rectangular plate, 40mm long, 20mm wide, 3mm thick, two 5mm
# through holes 25mm apart" must produce EXACTLY that part — parametrically,
# with the typed numbers surviving generation — never a searched model.
# ---------------------------------------------------------------------------

_SPEC_SHAPE_WORDS = (
    "plate", "platta", "skiva", "block", "kloss", "box", "bar", "beam",
    "spacer", "shim", "washer", "bricka", "disc", "disk", "bracket",
    "cylinder", "rod", "stav", "tube", "ror",
    "tetrahedron", "tetraeder", "pyramid", "cone", "kon", "sphere", "kula",
    "hexagon", "cube", "kub",
)

# Pure geometric solids: buildable from a single size, never worth a model
# search ("Create a tetrahedron 150mm tall" must yield a tetrahedron).
_SPEC_SOLIDS = {
    "tetrahedron": "tetrahedron", "tetraeder": "tetrahedron",
    "pyramid": "pyramid",
    "cone": "cone", "kon": "cone",
    "sphere": "sphere", "kula": "sphere",
    "hexagon": "hexagon",
    "cube": "cube", "kub": "cube",
}
_SPEC_EDIT_BLOCKERS = ("make it", "resize", "gor den", "gor det", "andra den", "scale it")

_NUM = r"(\d+(?:[.,]\d+)?)"


def _spec_num(match_val: str) -> float:
    return float(match_val.replace(",", "."))


def _parse_spec_part(prompt: str) -> dict[str, Any] | None:
    """Parse a dimensioned simple-part request; None when it isn't one."""
    text = _prompt_match_text(prompt)
    if not any(re.search(rf"\b{word}\b", text) for word in _SPEC_SHAPE_WORDS):
        return None
    if any(blocker in text for blocker in _SPEC_EDIT_BLOCKERS):
        return None

    dims: dict[str, float] = {}
    triple = re.search(rf"\b{_NUM}\s*[x×*]\s*{_NUM}\s*[x×*]\s*{_NUM}\s*(?:mm)?\b", text)
    if triple:
        dims["width"], dims["depth"], dims["height"] = (
            _spec_num(triple.group(1)), _spec_num(triple.group(2)), _spec_num(triple.group(3))
        )
    else:
        axis_words = {
            "width": ("long", "length", "lang", "langd"),
            "depth": ("wide", "width", "bred", "bredd", "deep", "depth", "djup"),
            "height": ("thick", "thickness", "tjock", "tall", "high", "height", "hog", "hojd"),
        }
        for axis, words in axis_words.items():
            for word in words:
                m = re.search(rf"\b{_NUM}\s*mm\s*(?:\w+\s+)?{word}\b", text) or re.search(
                    rf"\b{word}\b\D{{0,10}}{_NUM}\s*mm\b", text
                )
                if m:
                    dims[axis] = _spec_num(m.group(1))
                    break
    solid = next((kind for word, kind in _SPEC_SOLIDS.items() if re.search(rf"\b{word}\b", text)), None)
    is_l_bracket = bool(re.search(r"\b(?:l[\s-]?bracket|angle\s+bracket|vinkeljarn|vinkelfaste)\b", text))
    # A cylinder/rod spec: diameter + length
    is_round = any(re.search(rf"\b{w}\b", text) for w in ("cylinder", "rod", "stav", "tube", "ror", "washer", "bricka", "disc", "disk"))
    if is_round:
        dm = re.search(rf"\b{_NUM}\s*mm\s*(?:in\s+)?(?:od|outer\s+diameter|ytterdiameter|diameter|dia)\b", text) or re.search(
            rf"\b(?:od|outer\s+diameter|ytterdiameter|diameter|dia)\D{{0,10}}{_NUM}\s*mm\b", text
        )
        if dm:
            dims["width"] = dims["depth"] = _spec_num(dm.group(1))
            # For round parts "long/length" is the AXIS length, not the width
            # the generic axis parse assumed ("tube 20mm OD, 50mm long").
            lm = re.search(rf"\b{_NUM}\s*mm\s*(?:\w+\s+)?(?:long|length|tall|high|lang|langd|hog|hojd)\b", text)
            if lm and abs(_spec_num(lm.group(1)) - dims["width"]) > 0.01:
                dims["height"] = _spec_num(lm.group(1))

    # Bore: "16mm ID", "inner diameter 16mm", "bore 16mm". Tubes and washers
    # without a stated bore still get one - a solid "washer" is just wrong.
    bore = 0.0
    bm = re.search(rf"\b{_NUM}\s*mm\s*(?:id|inner\s+diameter|innerdiameter|inre\s+diameter|bore|hal\s+i\s+mitten)\b", text) or re.search(
        rf"\b(?:id|inner\s+diameter|innerdiameter|inre\s+diameter|bore)\D{{0,10}}{_NUM}\s*mm\b", text
    )
    if bm:
        bore = _spec_num(bm.group(1))
    elif re.search(r"\bhole\s+in\s+the\s+(?:middle|center|centre|mitten)\b|\bcenter\s+hole\b|\bcentre\s+hole\b|\bcenterhal\b", text):
        cm0 = re.search(rf"\b{_NUM}\s*mm\b[^.]{{0,30}}\b(?:middle|center|centre|mitten)\b", text)
        bore = _spec_num(cm0.group(1)) if cm0 else max(2.0, dims.get("width", 20.0) * 0.3)
    elif is_round and re.search(r"\b(?:tube|ror|washer|bricka)\b", text):
        bore = dims.get("width", 20.0) * 0.5

    if is_l_bracket:
        # L-brackets: "Nmm legs" sets both legs, "40 x 20mm legs" sets each
        # leg separately, and "walls" is a synonym for material thickness.
        thickness = 4.0
        tm = re.search(rf"\b{_NUM}\s*mm\s*(?:\w+\s+)?(?:thick|thickness|tjock|walls?|vaggar)\b", text)
        if tm:
            thickness = max(1.0, min(20.0, _spec_num(tm.group(1))))
            if abs(dims.get("height", -1.0) - thickness) < 0.01:
                del dims["height"]
        pair = re.search(rf"\b{_NUM}\s*(?:mm)?\s*[x×*]\s*{_NUM}\s*mm\s*(?:\w+\s+)?(?:legs?|ben)\b", text)
        legm = re.search(rf"\b{_NUM}\s*mm\s*(?:\w+\s+)?(?:legs?|ben)\b", text)
        if pair:
            leg_a = max(thickness * 2.0, min(300.0, _spec_num(pair.group(1))))
            leg_b = max(thickness * 2.0, min(300.0, _spec_num(pair.group(2))))
            dims["depth"] = leg_a
            dims["height"] = leg_b
            dims.setdefault("width", max(leg_a, leg_b))
        elif legm:
            leg = max(thickness * 2.0, min(300.0, _spec_num(legm.group(1))))
            dims["depth"] = leg
            dims["height"] = leg
        elif "height" not in dims:
            dims["height"] = dims.get("depth", 30.0)
        dims["l_thickness"] = thickness

    if solid is not None:
        # A single stated size (or none) is enough for a pure solid.
        size = dims.get("height") or dims.get("width") or 0.0
        if size <= 0.0:
            sm0 = re.search(rf"\b{_NUM}\s*mm\b", text)
            size = _spec_num(sm0.group(1)) if sm0 else 60.0
        size = max(2.0, min(400.0, size))
        dims.setdefault("height", size)
        dims.setdefault("width", size)
        dims.setdefault("depth", dims["width"])
    elif len(dims) < 2:
        return None

    dims.setdefault("width", 40.0)
    dims.setdefault("depth", dims["width"] if is_round else 20.0)
    dims.setdefault("height", 3.0)
    for key in dims:
        dims[key] = max(0.4, min(500.0, dims[key]))

    # Rounded corners: "rounded corners", "corner radius 3mm", "3mm fillet"
    corner_radius = 0.0
    cr = re.search(rf"\b{_NUM}\s*mm\s*(?:corner\s+radius|fillet|radie)\b", text) or re.search(
        rf"\b(?:corner\s+radius|fillet|radie)\D{{0,10}}{_NUM}\s*mm\b", text
    )
    if cr:
        corner_radius = max(0.0, min(20.0, _spec_num(cr.group(1))))
    elif re.search(r"\brounded\s+corners?\b|\brundade\s+horn\b", text):
        corner_radius = 2.0

    # Holes: "two 5mm (through) holes 25mm apart"
    holes: dict[str, float] | None = None
    if re.search(r"\bholes?\b|\bhal\b", text):
        count_words = {"one": 1, "two": 2, "three": 3, "four": 4, "en": 1, "ett": 1, "tva": 2, "tre": 3, "fyra": 4}
        cm = re.search(r"\b(one|two|three|four|en|ett|tva|tre|fyra|[1-8])\b[^.]{0,30}\bholes?\b", text) or re.search(
            r"\bholes?\b[^.]{0,12}\b(one|two|three|four|[1-8])\b", text
        )
        count = 2
        if cm:
            token = cm.group(1)
            count = count_words.get(token, int(token) if token.isdigit() else 2)
        elif bore > 0.0:
            # The only hole mentioned was the centre hole/bore - don't add a
            # default pattern of extra holes on top of it.
            count = 0
        # The number must sit right next to "holes" (max two words between,
        # e.g. "5mm through holes") — otherwise "3mm thick, two 5mm holes"
        # would steal the thickness as the hole diameter.
        dm = re.search(rf"\b{_NUM}\s*mm\s*(?:\w+\s+){{0,2}}holes?\b", text)
        diameter = _spec_num(dm.group(1)) if dm else 0.0
        # Metric thread callouts: "two M5 holes" -> standard clearance fit.
        m_clearance = {3: 3.4, 4: 4.5, 5: 5.5, 6: 6.6, 8: 9.0, 10: 11.0}
        mm_ = re.search(r"\bm([2-9]|1[02])\b[^.]{0,16}\bholes?\b", text) or re.search(r"\bholes?\b[^.]{0,12}\bm([2-9]|1[02])\b", text)
        m_size = int(mm_.group(1)) if mm_ else 0
        if diameter <= 0.0:
            diameter = m_clearance.get(m_size, 5.0) if m_size else 5.0
        sm_ = re.search(rf"\b{_NUM}\s*mm\s*(?:on\s+)?(?:apart|isar|mellan|c\s*-?\s*c|cent(?:er|re)s?)", text)
        spacing = _spec_num(sm_.group(1)) if sm_ else 0.0
        # "10mm from each end/edge" -> exact end-inset placement.
        em = re.search(rf"\b{_NUM}\s*mm\s*from\s*(?:each|the|both)\s*(?:ends?|edges?|sidorna|kanterna)\b", text)
        end_inset = _spec_num(em.group(1)) if em else 0.0
        wants_counterbore = bool(re.search(r"\bcounterbore(?:d)?\b|\bcountersunk\b|\bcountersink\b|\bforsankta?\b|\bforsankning\b", text))
        cb_head = {3: 6.0, 4: 8.0, 5: 10.0, 6: 12.0, 8: 16.0, 10: 20.0}.get(m_size, 0.0) or diameter * 2.0
        if count == 0:
            holes = None
            spacing = 0.0
        else:
            holes = {
                "count": float(max(1, min(8, count))),
                "diameter": max(0.5, min(60.0, diameter)),
                "spacing": spacing,
                "end_inset": end_inset,
                "counterbore": cb_head if wants_counterbore else 0.0,
            }

    if bore > 0.0 and bore < dims.get("width", 999.0):
        pass  # bore validated at build time against actual OD
    else:
        bore = min(bore, max(0.0, dims.get("width", 20.0) - 1.0)) if bore > 0 else 0.0
    return {
        "dims": dims,
        "holes": holes,
        "round": is_round,
        "l_bracket": is_l_bracket,
        "bore": bore,
        "corner_radius": corner_radius,
        "solid": solid,
    }


def is_spec_part_prompt(prompt: str) -> bool:
    return _parse_spec_part(prompt) is not None


def _make_solid_mesh(kind: str, width: float, height: float) -> TriMesh:
    """Simple watertight meshes for pure geometric solids, sitting on z=0."""
    mesh = TriMesh()

    def tri(a, b, c):
        ia, ib, ic = mesh.add_vertex(a), mesh.add_vertex(b), mesh.add_vertex(c)
        mesh.add_tri(ia, ib, ic)

    if kind == "tetrahedron":
        # Regular tetrahedron scaled to the requested height.
        edge = height / math.sqrt(2.0 / 3.0)
        r = edge / math.sqrt(3.0)
        base = [
            (r * math.cos(a), r * math.sin(a), 0.0)
            for a in (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 + 4 * math.pi / 3)
        ]
        apex = (0.0, 0.0, height)
        tri(base[0], base[2], base[1])
        for i in range(3):
            tri(base[i], base[(i + 1) % 3], apex)
    elif kind == "pyramid":
        h = width / 2.0
        base = [(-h, -h, 0.0), (h, -h, 0.0), (h, h, 0.0), (-h, h, 0.0)]
        apex = (0.0, 0.0, height)
        tri(base[0], base[2], base[1]); tri(base[0], base[3], base[2])
        for i in range(4):
            tri(base[i], base[(i + 1) % 4], apex)
    elif kind == "cone":
        n = 40
        r = width / 2.0
        ring = [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), 0.0) for i in range(n)]
        apex = (0.0, 0.0, height)
        centre = (0.0, 0.0, 0.0)
        for i in range(n):
            tri(ring[i], ring[(i + 1) % n], apex)
            tri(ring[(i + 1) % n], ring[i], centre)
    elif kind == "sphere":
        seg, rings = 28, 18
        r = height / 2.0
        grid = []
        for j in range(rings + 1):
            phi = math.pi * j / rings
            row = []
            for i in range(seg):
                th = 2 * math.pi * i / seg
                row.append((r * math.sin(phi) * math.cos(th), r * math.sin(phi) * math.sin(th), r + r * math.cos(phi)))
            grid.append(row)
        for j in range(rings):
            for i in range(seg):
                a, b = grid[j][i], grid[j][(i + 1) % seg]
                c, d = grid[j + 1][(i + 1) % seg], grid[j + 1][i]
                tri(a, b, c); tri(a, c, d)
    elif kind == "hexagon":
        n = 6
        r = width / 2.0
        bot = [(r * math.cos(2 * math.pi * i / n + math.pi / 6), r * math.sin(2 * math.pi * i / n + math.pi / 6), 0.0) for i in range(n)]
        top = [(x, y, height) for x, y, _ in bot]
        cb, ct = (0.0, 0.0, 0.0), (0.0, 0.0, height)
        for i in range(n):
            j = (i + 1) % n
            tri(bot[j], bot[i], cb); tri(top[i], top[j], ct)
            tri(bot[i], bot[j], top[j]); tri(bot[i], top[j], top[i])
    else:  # cube
        return make_rounded_box(width, width, width, 0.0, segments=4)
    return mesh


# ---------------------------------------------------------------------------
# Parametric duct / hose adapters — "square 6x6 inch opening to a 6 inch round
# hose with a 90 degree bend". A real tester asked for exactly this and model
# search can only ever return SOMEONE ELSE'S adapter with the wrong sizes.
# These are lofted procedurally from the user's own numbers instead.
# ---------------------------------------------------------------------------


def _parse_duct_adapter(prompt: str) -> dict[str, float] | None:
    """Detect an adapter/transition request and extract its dimensions (mm).

    Dimensions are read from the RAW prompt: normalize_source_query strips
    connective words like 'to', which would make '200mm to round' collapse to
    '200mm round' and misread the round diameter as 200."""
    text = (prompt or "").lower()
    if not re.search(r"\b(?:adapter|adaptor|coupler|transition|reducer|övergång|overgang)\b", text):
        return None
    if not re.search(r"\b(?:duct|exhaust|hose|vent|air|pipe|tube|slang|rör|ror|kanal|utblås|utblas)\b", text):
        return None

    def _mm(val: float, unit: str | None) -> float:
        u = (unit or "").strip().lower()
        if u.startswith("cm"):
            return val * 10.0
        if u in ('"', "″", "''") or u.startswith("in") or u.startswith("tum"):
            return val * 25.4
        return val

    unit_re = r"(mm|cm|\"|″|''|in\b|inch(?:es)?|tum)"
    # Square side: "6 inches by 6 inches", "6x6 inch", "square ... 6 in"
    square: float | None = None
    m = re.search(rf"(\d+(?:[.,]\d+)?)\s*{unit_re}?\s*(?:by|x|×)\s*(\d+(?:[.,]\d+)?)\s*{unit_re}?", text)
    if m:
        square = _mm(float(m.group(1).replace(",", ".")), m.group(2) or m.group(4))
    elif re.search(r"\bsquare\b|\bfyrkant", text):
        m2 = re.search(rf"\bsquare\b[^.]{{0,40}}?(\d+(?:[.,]\d+)?)\s*{unit_re}", text)
        if m2:
            square = _mm(float(m2.group(1).replace(",", ".")), m2.group(2))
    # Round diameter: "6-inch diameter round hose", "diameter 150mm", "Ø150",
    # or a size directly before "round/hose/pipe/tube" ("6 inch round hose",
    # "to a 100mm hose").
    round_d: float | None = None
    m3 = (
        re.search(rf"(\d+(?:[.,]\d+)?)\s*{unit_re}?[\s-]*(?:diameter|dia\b|ø)", text)
        or re.search(rf"(?:diameter|dia\b|ø)\s*(?:of\s*)?(\d+(?:[.,]\d+)?)\s*{unit_re}?", text)
        or re.search(rf"(\d+(?:[.,]\d+)?)\s*{unit_re}?[\s-]*(?:round|hose|pipe|tube|slang|r[oö]r)\b", text)
        or re.search(rf"(?:round|hose|pipe|tube|slang|r[oö]r)\s*(?:of\s*)?(\d+(?:[.,]\d+)?)\s*{unit_re}?", text)
    )
    if m3:
        round_d = _mm(float(m3.group(1).replace(",", ".")), m3.group(2))
    if square is None and round_d is None:
        return None
    if square is None:
        square = round_d
    if round_d is None:
        round_d = square
    # Any bend angle the customer asks for — "40 degree bend", "böj 60 grader".
    bend = 0.0
    bm = re.search(r"(\d{1,3})\s*(?:°|deg(?:rees?)?|grader)", text)
    if bm:
        bend = max(0.0, min(120.0, float(bm.group(1))))
    elif re.search(r"\bninety\b|right[\s-]?angle|\bL[\s-]?shape|\belbow\b", text):
        bend = 90.0
    elif re.search(r"\bbend|b[oö]j", text):
        bend = 90.0
    if re.search(r"\b(?:wall|thick|v[aä]gg)", text):
        wall = max(1.6, min(6.0, _parse_named_mm(prompt, ("wall", "thick", "vagg"), 2.5)))
    else:
        wall = 2.5
    return {
        "square": max(20.0, min(400.0, square)),
        "round_d": max(20.0, min(400.0, round_d)),
        "bend": bend,
        "wall": wall,
    }


def is_duct_adapter_prompt(prompt: str) -> bool:
    return _parse_duct_adapter(prompt) is not None


def _make_duct_adapter_mesh(square: float, round_d: float, bend_deg: float, wall: float) -> TriMesh:
    """Loft a hollow square-to-round transition, optionally along a 90° bend.

    Watertight: outer skin + inner skin + annular rims at both mouths. The
    square mouth sits on the build plate (prints flange-down, bend rising up
    and over — no supports needed inside the smooth sweep)."""
    P = 48   # points per profile ring
    S = 28   # sections along the path
    a_i = square / 2.0          # inner half-size at the square end
    r_i = round_d / 2.0         # inner radius at the round end
    bend = math.radians(max(0.0, min(120.0, bend_deg)))
    # Path length / bend radius scaled to the part so the sweep stays compact.
    R = max(a_i, r_i) * 1.6
    straight_len = max(square, round_d) * 1.2

    def profile_radius(theta: float, t: float, inset: float) -> float:
        """Blend a slightly-rounded square (superellipse) into a circle."""
        c, sn = abs(math.cos(theta)), abs(math.sin(theta))
        n = 8.0
        r_sq = (a_i - inset) / max(1e-6, (c ** n + sn ** n) ** (1.0 / n))
        r_ci = r_i - inset
        blend = t * t * (3.0 - 2.0 * t)  # smoothstep
        return r_sq * (1.0 - blend) + r_ci * blend

    def frame(t: float) -> tuple[Vec3Tuple, Vec3Tuple, Vec3Tuple]:
        """Section origin + in-plane axes (u sideways, v across) at path t."""
        if bend <= 1e-6:
            origin = (0.0, 0.0, straight_len * t)
        else:
            phi = bend * t
            origin = (R * (1.0 - math.cos(phi)), 0.0, R * math.sin(phi))
        if bend <= 1e-6:
            u = (1.0, 0.0, 0.0)
        else:
            phi = bend * t
            u = (math.cos(phi), 0.0, -math.sin(phi))
        v = (0.0, 1.0, 0.0)
        return origin, u, v

    mesh = TriMesh()

    def build_skin(inset: float) -> list[list[int]]:
        rings: list[list[int]] = []
        for si in range(S + 1):
            t = si / S
            origin, u, v = frame(t)
            ring: list[int] = []
            for pi in range(P):
                theta = 2.0 * math.pi * pi / P
                r = profile_radius(theta, t, inset)
                x_p, y_p = r * math.cos(theta), r * math.sin(theta)
                pt = (
                    origin[0] + u[0] * x_p + v[0] * y_p,
                    origin[1] + u[1] * x_p + v[1] * y_p,
                    origin[2] + u[2] * x_p + v[2] * y_p,
                )
                ring.append(mesh.add_vertex(pt))
            rings.append(ring)
        return rings

    outer = build_skin(0.0)
    inner = build_skin(wall)

    def stitch(r1: list[int], r2: list[int], flip: bool) -> None:
        for pi in range(P):
            a, b = r1[pi], r1[(pi + 1) % P]
            c2, d2 = r2[pi], r2[(pi + 1) % P]
            if flip:
                mesh.add_tri(a, c2, b)
                mesh.add_tri(b, c2, d2)
            else:
                mesh.add_tri(a, b, c2)
                mesh.add_tri(b, d2, c2)

    for si in range(S):
        stitch(outer[si], outer[si + 1], flip=False)
        stitch(inner[si], inner[si + 1], flip=True)
    # Annular rims closing the wall at both mouths.
    stitch(outer[0], inner[0], flip=True)
    stitch(outer[S], inner[S], flip=False)
    return mesh


def build_duct_adapter_from_prompt(session: Session, obj: CadObject, prompt: str) -> list[str]:
    """Build the user's adapter from their own numbers. [] when not an adapter."""
    spec = _parse_duct_adapter(prompt)
    if spec is None:
        return []
    mesh = _make_duct_adapter_mesh(spec["square"], spec["round_d"], spec["bend"], spec["wall"])
    params = dict(DEFAULT_PARAMETERS)
    params.update(
        {
            "width": spec["square"],
            "depth": spec["square"],
            "height": spec["square"],
            "thickness": spec["wall"],
            "wall_thickness": spec["wall"],
            "hole_count": 0.0,
            "fillet_radius": 0.0,
            "chamfer_size": 0.0,
        }
    )
    part = create_manual_object("duct_adapter", mesh, params)
    part["primitive"] = "imported_source_mesh"
    part["imported_source_mesh"] = True
    part["source_original_shape"] = deepcopy(part["shape"])
    try:
        from backend.services.mesh_analysis import scan_trimesh

        part["mesh_scan"] = scan_trimesh(part["shape"])
    except Exception:  # noqa: BLE001
        part["mesh_scan"] = None
    part["assembly_source"] = "parametric:duct-adapter"
    # Remember the recipe so a later "change it to 60 degrees" / "make the
    # round end 100mm" rebuilds the adapter instead of failing.
    part["duct_spec"] = dict(spec)
    _remove_object_direct(session, obj["id"])
    add_object(session, part)
    session["selected_object_id"] = part["id"]
    center_object_on_plate(part)
    bend_txt = f" with a {spec['bend']:g}° bend" if spec["bend"] else ""
    return [
        "built parametrically from your dimensions (no model search)",
        f"square mouth {spec['square']:g}×{spec['square']:g}mm → round outlet Ø{spec['round_d']:g}mm{bend_txt}, wall {spec['wall']:g}mm",
        "tip: say e.g. 'wall 3mm' or different sizes to rebuild it exactly",
    ]


def build_spec_part_from_prompt(session: Session, obj: CadObject, prompt: str) -> list[str]:
    """Build the exact dimensioned part the user typed. Returns [] if the
    prompt isn't a spec-part request (caller continues the normal pipeline)."""
    spec = _parse_spec_part(prompt)
    if spec is None:
        return []
    dims = spec["dims"]
    width, depth, height = dims["width"], dims["depth"], dims["height"]

    params = dict(DEFAULT_PARAMETERS)
    params.update(
        {
            "width": width,
            "depth": depth,
            "height": height,
            "thickness": height,
            "fillet_radius": 0.0,
            "chamfer_size": 0.0,
            "hole_count": 0.0,
            "wall_thickness": height,
        }
    )

    if spec.get("solid"):
        kind = spec["solid"]
        size_h = height if kind != "cube" else width
        shape = _make_solid_mesh(kind, width, size_h)
        if kind == "cube":
            params["depth"] = params["height"] = params["thickness"] = width
        part = create_manual_object("spec_part", shape, params)
        part["primitive"] = "imported_source_mesh"
        part["imported_source_mesh"] = True
        part["source_original_shape"] = deepcopy(shape)
        mins0, maxs0 = _mesh_extents(shape)
        part["source_dimensions"] = {
            "width": maxs0[0] - mins0[0],
            "depth": maxs0[1] - mins0[1],
            "height": maxs0[2] - mins0[2],
        }
    elif spec.get("l_bracket"):
        # A real L-profile: horizontal leg W x D, vertical leg W x H rising
        # from the back edge, both `thickness` thick. Thickness comes from the
        # smallest stated dimension when three were given, else 4mm.
        thickness = float(dims.get("l_thickness", 4.0))
        leg_h = max(thickness * 2.0, height)
        h_leg = make_rounded_box(width, depth, thickness, 0.0, segments=4)
        v_leg = _translate_mesh(
            make_rounded_box(width, thickness, leg_h, 0.0, segments=4),
            0.0, (depth - thickness) / 2.0, 0.0,
        )
        shape = _merge_trimeshes([h_leg, v_leg])
        params["height"] = leg_h
        params["thickness"] = thickness
        part = create_manual_object("spec_part", shape, params)
        # Raw merged mesh: rebuilds must re-cut holes in THIS geometry, never
        # regenerate a plain box.
        part["primitive"] = "imported_source_mesh"
        part["imported_source_mesh"] = True
        part["source_original_shape"] = deepcopy(shape)
        part["source_dimensions"] = {"width": width, "depth": depth, "height": leg_h}
    elif spec["round"]:
        radius = width / 2.0
        shape = make_cylinder_body(radius, height) or make_cylinder(radius, height)
        part = create_manual_object("spec_part", shape, params)
        part["primitive"] = "cylinder"
    else:
        corner_r = min(float(spec.get("corner_radius", 0.0)), min(width, depth) * 0.3)
        params["fillet_radius"] = corner_r
        shape = make_box_body(width, depth, height, fillet=corner_r) or make_rounded_box(
            width, depth, height, corner_r, segments=8 if corner_r > 0 else 4
        )
        part = create_manual_object("spec_part", shape, params)
        part["primitive"] = "rectangle"

    hole_action = ""
    holes = spec["holes"]
    if holes:
        count = int(holes["count"])
        diameter = holes["diameter"]
        spacing = holes["spacing"]
        hole_y = 0.0
        if spec.get("l_bracket"):
            # Centre of the exposed horizontal leg (the wall sits at the back).
            hole_y = -float(part["parameters"].get("thickness", 4.0)) / 2.0
        end_inset = float(holes.get("end_inset", 0.0))
        if end_inset > 0 and count >= 2 and end_inset < width / 2.0:
            # "10mm from each end": exact end-referenced placement, evenly
            # distributed between the two end holes when count > 2.
            x0, x1 = -width / 2.0 + end_inset, width / 2.0 - end_inset
            positions = [(x0 + (x1 - x0) * i / (count - 1), hole_y) for i in range(count)]
        elif spacing > 0 and count >= 2:
            # Exact centre-to-centre spacing along the length, centred.
            span = spacing * (count - 1)
            positions = [(-span / 2.0 + spacing * i, hole_y) for i in range(count)]
        else:
            positions = [(x, hole_y if spec.get("l_bracket") else y) for x, y in _mounting_hole_positions(width, depth, count)]
        for index, (x, y) in enumerate(positions):
            part["parameters"][f"custom_hole_{index}_x"] = x
            part["parameters"][f"custom_hole_{index}_y"] = y
            part["parameters"][f"custom_hole_{index}_diameter"] = diameter
        part["parameters"]["custom_hole_count"] = float(len(positions))
        part["parameters"]["hole_count"] = float(len(positions))
        part["parameters"]["hole_diameter"] = diameter
        cb = float(holes.get("counterbore", 0.0))
        if cb > diameter:
            part["parameters"]["counterbore_diameter"] = cb
            part["parameters"]["counterbore_depth"] = max(0.6, min(height * 0.45, 3.0))
        _set_feature_enabled(part["feature_tree"], "mount_holes", True)
        rebuild_manual_object(part)
        placement = (
            f", {end_inset:g}mm from each end (exact)" if end_inset > 0 and count >= 2 and end_inset < width / 2.0
            else f", {spacing:g}mm apart (exact)" if spacing > 0 and count >= 2
            else " (symmetric)"
        )
        hole_action = f"holes: {len(positions)} × {diameter:g}mm{placement}" + (
            ", counterbored" if cb > diameter else ""
        )

    # Spec parts are prompt-generated content: a NEW generation must replace
    # them like any generated model (the "sticky session" bug - the previous
    # plate survived every following prompt). assembly_source marks them as
    # generated while manual=True keeps every edit tool working.
    part["assembly_source"] = "spec-part"
    bore = float(spec.get("bore", 0.0))
    if bore > 0.5 and bore < width - 0.8:
        idx = int(part["parameters"].get("custom_hole_count", 0.0))
        part["parameters"][f"custom_hole_{idx}_x"] = 0.0
        part["parameters"][f"custom_hole_{idx}_y"] = 0.0
        part["parameters"][f"custom_hole_{idx}_diameter"] = bore
        part["parameters"]["custom_hole_count"] = float(idx + 1)
        part["parameters"]["hole_count"] = float(idx + 1)
        _set_feature_enabled(part["feature_tree"], "mount_holes", True)
        rebuild_manual_object(part)
        if not hole_action:
            hole_action = f"bore: {bore:g}mm through centre"
        else:
            hole_action += f" + {bore:g}mm centre bore"

    _remove_object_direct(session, obj["id"])
    center_object_on_plate(part)
    add_object(session, part)
    session["selected_object_id"] = part["id"]

    # Self-check: measure the real mesh so "the number you typed is the
    # number you get" is verified, not assumed.
    mins, maxs = _mesh_extents(part["shape"])
    measured = (maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2])
    shape_word = spec.get("solid") or ("L-bracket" if spec.get("l_bracket") else ("cylinder" if spec["round"] else "plate"))
    actions = [
        f"spec-part: {width:g} × {depth:g} × {height:g} mm {shape_word}, built parametrically",
        f"measured: {measured[0]:.1f} × {measured[1]:.1f} × {measured[2]:.1f} mm",
    ]
    if hole_action:
        actions.insert(1, hole_action)
    return actions


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
    if target is None and session.get("object_order"):
        # Nothing selected (normal right after a generation) — the user means
        # the model on the plate.
        target = session["objects"].get(session["object_order"][-1])
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


def _cutout_specs(params: dict[str, float]) -> list[dict[str, float]]:
    specs: list[dict[str, float]] = []
    count = max(0, int(params.get("custom_cutout_count", 0.0)))
    for index in range(count):
        x_key = f"custom_cutout_{index}_x"
        y_key = f"custom_cutout_{index}_y"
        w_key = f"custom_cutout_{index}_width"
        d_key = f"custom_cutout_{index}_depth"
        if x_key not in params or y_key not in params:
            continue
        width = max(0.5, float(params.get(w_key, params.get("cutout_width", 18.0))))
        depth = max(0.5, float(params.get(d_key, params.get("cutout_depth", 8.0))))
        specs.append(
            {
                "x": float(params[x_key]),
                "y": float(params[y_key]),
                "width": width,
                "depth": depth,
                "z0": float(params.get(f"custom_cutout_{index}_z0", -0.2)),
                "z1": float(params.get(f"custom_cutout_{index}_z1", params.get("height", 20.0) + 0.2)),
            }
        )
    return specs


def _add_rect_cutout_walls(mesh: TriMesh, spec: dict[str, float]) -> None:
    x = spec["x"]
    y = spec["y"]
    hw = spec["width"] / 2.0
    hd = spec["depth"] / 2.0
    z0 = spec["z0"]
    z1 = spec["z1"]
    if z1 <= z0 or hw <= 0.0 or hd <= 0.0:
        return

    corners = [
        (x - hw, y - hd, z0),
        (x + hw, y - hd, z0),
        (x + hw, y + hd, z0),
        (x - hw, y + hd, z0),
        (x - hw, y - hd, z1),
        (x + hw, y - hd, z1),
        (x + hw, y + hd, z1),
        (x - hw, y + hd, z1),
    ]
    ids = [mesh.add_vertex(point) for point in corners]
    # Winding faces inward so these render as the inside walls of the cut.
    mesh.add_quad(ids[0], ids[4], ids[5], ids[1])
    mesh.add_quad(ids[1], ids[5], ids[6], ids[2])
    mesh.add_quad(ids[2], ids[6], ids[7], ids[3])
    mesh.add_quad(ids[3], ids[7], ids[4], ids[0])


def _apply_mesh_rect_cutouts(mesh: TriMesh, params: dict[str, float]) -> TriMesh:
    specs = _cutout_specs(params)
    if not specs or not mesh.verts:
        return mesh

    cut = TriMesh()
    cut.verts = list(mesh.verts)
    for a, b, c in mesh.tris:
        va, vb, vc = mesh.verts[a], mesh.verts[b], mesh.verts[c]
        cx = (va[0] + vb[0] + vc[0]) / 3.0
        cy = (va[1] + vb[1] + vc[1]) / 3.0
        cz = (va[2] + vb[2] + vc[2]) / 3.0
        inside_cutout = False
        for spec in specs:
            if (
                spec["z0"] <= cz <= spec["z1"]
                and abs(cx - spec["x"]) <= spec["width"] / 2.0
                and abs(cy - spec["y"]) <= spec["depth"] / 2.0
            ):
                inside_cutout = True
                break
        if not inside_cutout:
            cut.tris.append((a, b, c))

    for spec in specs:
        _add_rect_cutout_walls(cut, spec)
    return cut


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
        return shift_mesh_to_buildplate(_apply_mesh_rect_cutouts(mesh, params))

    mins, maxs = _mesh_extents(mesh)
    z0 = mins[2] - 0.2
    z1 = maxs[2] + 0.2
    counterbore_diameter = max(0.0, float(params.get("counterbore_diameter", 0.0)))
    counterbore_depth = max(0.0, float(params.get("counterbore_depth", 0.0)))
    counterbore_z0 = max(z0, z1 - counterbore_depth) if counterbore_depth > 0 else z1

    # REAL subtraction per hole (plane clips, same technique as Cut slot) —
    # the old centroid test left "surface marks" instead of holes on coarse
    # meshes, or deleted whole giant triangles (missing chunks + floating
    # wall tubes). Each hole clips the mesh against an N-gon column; the
    # counterbore only cuts material above its shoulder height.
    has_counterbore = counterbore_diameter > 0 and counterbore_depth > 0
    cut = mesh
    for x, y, diameter in holes:
        radius = max(0.1, diameter / 2.0)
        cut = _subtract_cylinder_column(cut, x, y, radius)
        if has_counterbore and counterbore_diameter > diameter:
            cut = _subtract_cylinder_column(cut, x, y, counterbore_diameter / 2.0, z_from=counterbore_z0)

    # Wall tubes end exactly at the surfaces — the ±0.2 overshoot is only for
    # the subtraction reach, not visible geometry (it inflated measured height).
    wall_z0, wall_z1 = mins[2], maxs[2]
    for x, y, diameter in holes:
        radius = max(0.1, diameter / 2.0)
        if has_counterbore and counterbore_diameter > diameter:
            cb_radius = counterbore_diameter / 2.0
            _add_cylinder_wall(cut, x, y, radius, wall_z0, counterbore_z0)
            _add_cylinder_wall(cut, x, y, cb_radius, counterbore_z0, wall_z1)
            _add_annulus_ring(cut, x, y, radius, cb_radius, counterbore_z0)
        else:
            _add_cylinder_wall(cut, x, y, radius, wall_z0, wall_z1)

    return shift_mesh_to_buildplate(_apply_mesh_rect_cutouts(cut, params))


_TEXT_GLYPHS: dict[str, tuple[str, ...]] = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10011", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
}


def _sanitize_label_text(text: str) -> str:
    folded = re.sub(r"[^A-Za-z0-9 ._-]+", " ", str(text or ""))
    folded = re.sub(r"\s+", " ", folded).strip(" ._-")
    if not folded:
        return "TEXT"
    return folded[:28]


def _extract_label_text(prompt: str) -> str:
    raw = str(prompt or "")
    quoted = re.search(r"[\"']([^\"']{1,40})[\"']", raw)
    if quoted:
        return _sanitize_label_text(quoted.group(1))

    patterns = (
        r"(?:l[äa]gg\s+till|lagg\s+till|add)\s+([A-Za-z0-9][A-Za-z0-9 ._-]{0,30})\s+(?:text|logo|logga|bokstav|ord)",
        r"(?:text|logo|logga)\s+(?:med\s+|with\s+)?([A-Za-z0-9][A-Za-z0-9 ._-]{0,30})",
        r"(?:skriv|write)\s+([A-Za-z0-9][A-Za-z0-9 ._-]{0,30})",
        r"(?:engrave|engraved|ingravera|ingraverat)\s+([A-Za-z0-9][A-Za-z0-9 ._-]{0,30})",
    )
    for pattern in patterns:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match:
            candidate = re.sub(
                r"\b(?:pa|på|on|i|in|text|logo|logga|kortsidorna|kortsida|langsidorna|langsida|long|short|side|sides|top|bottom|front|back|engraved|ingraverat)\b.*$",
                "",
                match.group(1),
                flags=re.IGNORECASE,
            )
            # Strip leading articles so "add a sony logo" engraves "SONY",
            # not "A SONY".
            candidate = re.sub(r"^\s*(?:a|an|the|en|ett|min|mitt|my)\s+", "", candidate, flags=re.IGNORECASE)
            label = _sanitize_label_text(candidate)
            if label:
                return label
    return "TEXT"


def _is_text_removal_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    return any(token in text for token in ("remove text", "delete text", "ta bort text", "remove logo", "delete logo"))


def is_text_label_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    has_text_target = any(
        token in text
        for token in (
            "text",
            "logo",
            "label",
            "engrave",
            "engraved",
            "engraving",
            "emboss",
            "embossed",
            "raised",
            "ingravera",
            "ingraverat",
            "gravyr",
            "logga",
            "upphojd",
            "upphojt",
            "praglad",
        )
    )
    has_edit = any(
        token in text
        for token in (
            "add",
            "write",
            "create",
            "set",
            "adjust",
            "remove",
            "delete",
            "change",
            "lagg till",
            "skriv",
            "ta bort",
            "engrave",
            "ingravera",
        )
    )
    return has_text_target and has_edit


def _label_style(prompt: str) -> str:
    text = _prompt_match_text(prompt)
    if any(token in text for token in ("raised", "emboss", "embossed", "upphojd", "upphojt", "praglad")):
        return "raised"
    if any(token in text for token in ("engrave", "engraved", "engraving", "recessed", "ingravera", "ingraverat", "gravyr")):
        return "engraved"
    return "raised"


def _label_depth(prompt: str, style: str) -> float:
    text = _prompt_match_text(prompt)
    match = re.search(r"\b(\d+(?:\.\d+)?)\s*mm\b", text)
    default = 0.55 if style == "engraved" else 0.9
    if not match:
        return default
    return max(0.25, min(4.0, float(match.group(1))))


def _is_text_depth_edit_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    adding_text = any(token in text for token in ("add", "write", "lagg till", "skriv", "engrave", "ingravera"))
    return (
        not adding_text
        and "text" in text
        and any(token in text for token in ("depth", "deep", "thickness", "djup", "tjocklek"))
    )


def _update_text_label_depths(session: Session, prompt: str) -> list[str]:
    style = _label_style(prompt)
    depth = _label_depth(prompt, style)
    targets = [
        obj
        for obj in session.get("objects", {}).values()
        if obj.get("primitive") == "text_label"
    ]
    if not targets:
        return ["text depth skipped: no text labels found"]
    for obj in targets:
        obj["parameters"]["text_depth"] = depth
        obj["parameters"]["depth"] = depth
        obj["parameters"]["thickness"] = depth
        rebuild_manual_object(obj)
    return [f"set text depth to {depth:g}mm"]


def _label_placement(prompt: str, width: float, depth: float) -> str:
    text = _prompt_match_text(prompt)
    if any(token in text for token in ("top", "ovansida", "ovanpa", "upper face")):
        return "top"
    if any(token in text for token in ("bottom", "undersida")):
        return "bottom"
    if any(token in text for token in ("short side", "short sides", "kortsida", "kortsidorna")):
        return "x_sides" if width >= depth else "y_sides"
    if any(token in text for token in ("long side", "long sides", "langsida", "langsidorna")):
        return "y_sides" if width >= depth else "x_sides"
    # "both sides" / "both faces" → place on the two largest vertical faces
    if re.search(r"\b(?:both|b[aå]da)\b", text) and re.search(r"\b(?:side|sides|sida|sidor|sidorna|face|faces)\b", text):
        return "y_sides" if width >= depth else "x_sides"
    if re.search(r"\b(?:side|sides|sida|sidor|sidorna)\b", text):
        return "y_sides" if width >= depth else "x_sides"
    if any(token in text for token in ("left", "right", "vanster", "hoger")):
        return "x_sides"
    if any(token in text for token in ("front", "back", "framsida", "baksida")):
        return "y_sides"
    return "top"


def _glyph_units(label: str) -> int:
    units = 0
    for char in label:
        units += 3 if char == " " else 6
    return max(5, units - 1)


def _fit_label_height(label: str, available_width: float, available_height: float) -> float:
    units = _glyph_units(label)
    by_width = max(2.5, available_width * 0.84 * 7.0 / units)
    by_height = max(2.5, available_height * 0.72)
    return max(2.5, min(28.0, by_width, by_height))


def _make_block_text_mesh(label: str, letter_height: float, depth: float, *, mirror_x: bool = False) -> tuple[TriMesh, float, float]:
    # Try CadQuery TrueType rendering first — produces smooth, professional text.
    try:
        from backend.services.cad_kernel import make_text_body, is_available as _cq_available
        if _cq_available():
            cq_mesh = make_text_body(label, letter_height, depth)
            if cq_mesh and cq_mesh.verts:
                xs = [v[0] for v in cq_mesh.verts]
                zs = [v[2] for v in cq_mesh.verts]
                w = max(xs) - min(xs)
                h = max(zs) - min(zs)
                if mirror_x:
                    cq_mesh.verts = [(-x, y, z) for x, y, z in cq_mesh.verts]
                return cq_mesh, w, h
    except Exception:
        pass

    # Pixel-grid fallback for environments without CadQuery.
    # The glyph table only has uppercase entries, so force uppercase here.
    label = _sanitize_label_text(label).upper()
    cell = max(0.25, float(letter_height) / 7.0)
    pixel = cell * 0.86
    advance = cell * 6.0
    space = cell * 3.0
    mesh = TriMesh()
    cursor = 0.0

    for char in label:
        if char == " ":
            cursor += space
            continue
        glyph = _TEXT_GLYPHS.get(char, _TEXT_GLYPHS.get("?", _TEXT_GLYPHS["0"]))
        for row, pattern in enumerate(glyph):
            for col, filled in enumerate(pattern):
                if filled != "1":
                    continue
                x = cursor + col * cell + cell / 2.0
                z = (6 - row) * cell + cell / 2.0
                block = make_box(pixel, max(0.2, depth), pixel).transformed(
                    Transform(
                        position=[x, 0.0, z],
                        rotation=[0.0, 0.0, 0.0],
                        scale=[1.0, 1.0, 1.0],
                    )
                )
                mesh = mesh.merge(block)
        cursor += advance

    if not mesh.verts:
        mesh = make_box(cell * 5.0, max(0.2, depth), cell * 7.0)
        cursor = cell * 5.0

    min_x = min(v[0] for v in mesh.verts)
    max_x = max(v[0] for v in mesh.verts)
    center_x = (min_x + max_x) / 2.0
    mesh.verts = [(x - center_x, y, z) for x, y, z in mesh.verts]
    if mirror_x:
        mesh.verts = [(-x, y, z) for x, y, z in mesh.verts]
    width = max_x - min_x
    height = cell * 7.0
    return mesh, width, height


def _base_objects_for_ai_edit(session: Session) -> list[CadObject]:
    selected = get_object(session, session.get("selected_object_id"))
    if selected and selected.get("primitive") != "text_label":
        return [
            obj
            for obj in _source_group_objects(session, selected)
            if obj.get("primitive") != "text_label"
        ]
    return [
        session["objects"][oid]
        for oid in session.get("object_order", [])
        if session["objects"].get(oid, {}).get("primitive") != "text_label"
    ]


def _remove_text_labels(session: Session, label: str | None = None) -> list[str]:
    wanted = _sanitize_label_text(label or "") if label else ""
    removed = 0
    for oid in list(session.get("object_order", [])):
        obj = session["objects"].get(oid)
        if not obj or obj.get("primitive") != "text_label":
            continue
        if wanted and _sanitize_label_text(str(obj.get("text_label", ""))) != wanted:
            continue
        _remove_object_direct(session, oid)
        removed += 1
    return [f"remove {removed} text label{'s' if removed != 1 else ''}"] if removed else ["no text labels to remove"]


def _create_text_label_object(
    label: str,
    *,
    letter_height: float,
    depth: float,
    position: list[float],
    rotation: list[float],
    style: str,
    target_color: str,
    mirror_x: bool = False,
) -> CadObject:
    mesh, text_width, text_height = _make_block_text_mesh(label, letter_height, depth, mirror_x=mirror_x)
    obj = create_manual_object(
        f"{label.lower()}_{style}_text",
        mesh,
        {
            "width": text_width,
            "depth": depth,
            "height": text_height,
            "thickness": depth,
            "fillet_radius": 0.0,
            "chamfer_size": 0.0,
            "text_height": letter_height,
            "text_depth": depth,
        },
    )
    obj["primitive"] = "text_label"
    obj["text_label"] = label
    obj["text_mirror_x"] = bool(mirror_x)
    obj["text_style"] = style
    obj["color"] = "#151515" if style == "engraved" else target_color
    obj["transform"] = Transform(
        position=[float(position[0]), float(position[1]), float(position[2])],
        rotation=rotation,
        scale=[1.0, 1.0, 1.0],
    )
    obj["operation_history"] = [
        {
            "operation": "ai_text_label",
            "label": label,
            "style": style,
        }
    ]
    return obj


def add_text_label_from_prompt(session: Session, prompt: str) -> list[str]:
    """Add simple raised/engraved block text to the current model."""
    if _is_text_depth_edit_prompt(prompt):
        return _update_text_label_depths(session, prompt)
    if _is_text_removal_prompt(prompt):
        label = _extract_label_text(prompt)
        return _remove_text_labels(session, None if label == "TEXT" else label)

    targets = _base_objects_for_ai_edit(session)
    if not targets:
        return ["no object available for text edit"]

    mins, maxs = _world_extents_for_objects(targets)
    width = max(1.0, maxs[0] - mins[0])
    depth = max(1.0, maxs[1] - mins[1])
    height = max(1.0, maxs[2] - mins[2])
    cx = (mins[0] + maxs[0]) / 2.0
    cy = (mins[1] + maxs[1]) / 2.0
    label = _extract_label_text(prompt)
    style = _label_style(prompt)
    placement = _label_placement(prompt, width, depth)
    text_depth = _label_depth(prompt, style)
    offset = text_depth / 2.0 + 0.05
    target_color = str(targets[0].get("color", "#d6c12a"))
    created: list[CadObject] = []

    if placement == "top":
        letter_h = _fit_label_height(label, width, depth)
        created.append(
            _create_text_label_object(
                label,
                letter_height=letter_h,
                depth=text_depth,
                position=[cx, cy + letter_h / 2.0, maxs[2] + offset],
                rotation=[-90.0, 0.0, 0.0],
                style=style,
                target_color=target_color,
            )
        )
    elif placement == "bottom":
        letter_h = _fit_label_height(label, width, depth)
        created.append(
            _create_text_label_object(
                label,
                letter_height=letter_h,
                depth=text_depth,
                position=[cx, cy - letter_h / 2.0, mins[2] - offset],
                rotation=[90.0, 0.0, 0.0],
                style=style,
                target_color=target_color,
                mirror_x=True,
            )
        )
    elif placement == "x_sides":
        letter_h = _fit_label_height(label, depth, height)
        z = mins[2] + max(1.0, (height - letter_h) / 2.0)
        created.extend(
            [
                _create_text_label_object(
                    label,
                    letter_height=letter_h,
                    depth=text_depth,
                    position=[mins[0] - offset, cy, z],
                    rotation=[0.0, 0.0, 90.0],
                    style=style,
                    target_color=target_color,
                    mirror_x=True,
                ),
                _create_text_label_object(
                    label,
                    letter_height=letter_h,
                    depth=text_depth,
                    position=[maxs[0] + offset, cy, z],
                    rotation=[0.0, 0.0, -90.0],
                    style=style,
                    target_color=target_color,
                    mirror_x=True,
                ),
            ]
        )
    else:
        letter_h = _fit_label_height(label, width, height)
        z = mins[2] + max(1.0, (height - letter_h) / 2.0)
        created.extend(
            [
                _create_text_label_object(
                    label,
                    letter_height=letter_h,
                    depth=text_depth,
                    position=[cx, mins[1] - offset, z],
                    rotation=[0.0, 0.0, 180.0],
                    style=style,
                    target_color=target_color,
                ),
                _create_text_label_object(
                    label,
                    letter_height=letter_h,
                    depth=text_depth,
                    position=[cx, maxs[1] + offset, z],
                    rotation=[0.0, 0.0, 0.0],
                    style=style,
                    target_color=target_color,
                ),
            ]
        )

    for obj in created:
        add_object(session, obj)
    session["selected_object_id"] = str(targets[0].get("id", ""))
    return [f"add {style} '{label}' text on {placement.replace('_', ' ')}"]


def rebuild_manual_object(obj: CadObject) -> None:
    """Rebuild an expert-mode primitive from its parameters and operations."""
    params = obj["parameters"]
    primitive = obj.get("primitive", "rectangle")
    width = max(1.0, float(params.get("width", 40.0)))
    depth = max(1.0, float(params.get("depth", 30.0)))
    height = max(0.5, float(params.get("height", params.get("thickness", 8.0))))

    if primitive in {"circle", "cylinder"}:
        radius = max(width, depth) / 2.0
        holes = _hole_specs(params)
        # Apply any mounting holes the user cut into the cylinder. Without this
        # the cylinder was rebuilt as a plain solid and holes silently vanished.
        shape = make_cylinder_body(radius, height, params if holes else None)
        if shape is None:
            # CadQuery unavailable — fall back to the engine mesh and cut the
            # holes directly in the triangle mesh so they still appear.
            shape = make_cylinder(radius, height)
            if holes:
                shape = _apply_mesh_hole_cuts(shape, params)
        obj["shape"] = shape
    elif primitive == "hole":
        radius = max(float(params.get("hole_diameter", max(width, depth))) / 2.0, 0.5)
        obj["shape"] = make_cylinder_body(radius, height) or make_cylinder(radius, height)
    elif primitive == "source_phone_stand":
        obj["shape"] = _make_source_phone_stand_mesh(params)
    elif primitive == "source_battery_holder":
        obj["shape"] = _make_source_battery_holder_mesh(params)
    elif primitive == "imported_source_mesh":
        # Rebuild from the pristine source mesh and re-apply BOTH hole cuts and
        # rectangular slot cutouts (Cut slot). Without the rect cutouts the
        # "Cut slot" tool silently did nothing on imported/raw meshes.
        shape = _apply_mesh_hole_cuts(_stable_source_shape(obj), params)
        obj["shape"] = _apply_mesh_rect_cutouts(shape, params)
    elif primitive == "text_label":
        label = _sanitize_label_text(str(obj.get("text_label", "TEXT")))
        obj["shape"] = _make_block_text_mesh(
            label,
            max(1.0, float(params.get("text_height", params.get("height", 8.0)))),
            max(0.2, float(params.get("text_depth", params.get("depth", 0.8)))),
            mirror_x=bool(obj.get("text_mirror_x", False)),
        )[0]
    else:
        fillet = max(0.0, float(params.get("fillet_radius", 0.0)))
        chamfer = max(0.0, float(params.get("chamfer_size", 0.0)))
        shell = bool(float(params.get("shell_enabled", 0.0)))
        edge_target = str(obj.get("edge_operation_target", "all"))
        edge_operations = [
            item for item in obj.get("operation_history", [])
            if item.get("operation") in {"fillet", "chamfer"} and str(item.get("target", "")).startswith("edge:")
        ] if edge_target.startswith("edge:") else []
        kernel_shape = make_box_body(
            width,
            depth,
            height,
            fillet=fillet,
            chamfer=chamfer,
            shell_wall=max(0.0, float(params.get("wall_thickness", 0.0))) if shell else 0.0,
            params=params,
            edge_target=edge_target,
            edge_operations=edge_operations,
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
        if not kernel_shape and _hole_specs(params):
            obj["shape"] = _apply_mesh_hole_cuts(obj["shape"], params)

    if primitive not in {"text_label", "imported_source_mesh"}:
        obj["shape"] = _apply_mesh_rect_cutouts(obj["shape"], params)
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


def _smart_mesh_hole_positions(
    mesh: TriMesh, count: int, diameter: float
) -> list[tuple[float, float]] | None:
    """Study an imported mesh and place mounting holes deliberately.

    Strategy: find the model's BASE PLATE (triangles fully inside the bottom
    slab of the mesh), take its real footprint, and aim for a symmetric
    corner/line pattern inset from that footprint. Every position is then
    verified to sit inside actual base material (point-in-triangle on the slab
    triangles) and nudged toward the slab centre until it does — so holes land
    in the plate a screw would really go through, never in air or mid-wall.
    Returns None when the mesh has no usable base, letting the caller fall
    back to the bounding-box heuristic."""
    if not isinstance(mesh, TriMesh) or not mesh.verts or not mesh.tris:
        return None
    mins, maxs = _mesh_extents(mesh)
    height = max(0.1, maxs[2] - mins[2])
    slab_top = mins[2] + max(3.0, min(8.0, height * 0.25))

    tris: list[tuple[Any, Any, Any]] = []
    for face in mesh.tris:
        try:
            a, b, c = mesh.verts[face[0]], mesh.verts[face[1]], mesh.verts[face[2]]
        except (IndexError, TypeError):
            continue
        if a[2] <= slab_top and b[2] <= slab_top and c[2] <= slab_top:
            tris.append((a, b, c))
    if not tris:
        return None
    # Keep the material test fast on dense meshes.
    if len(tris) > 4000:
        stride = len(tris) // 4000 + 1
        tris = tris[::stride]

    xs = [v[0] for tri in tris for v in tri]
    ys = [v[1] for tri in tris for v in tri]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    base_w, base_d = x1 - x0, y1 - y0
    if base_w < diameter * 3.0 or base_d < diameter * 2.2:
        return None

    inset = min(max(4.0, diameter * 1.8), base_w * 0.25, base_d * 0.25)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    if count >= 4:
        targets = [
            (x0 + inset, y0 + inset),
            (x1 - inset, y0 + inset),
            (x0 + inset, y1 - inset),
            (x1 - inset, y1 - inset),
        ]
    elif count == 3:
        targets = [(x0 + inset, cy), (cx, cy), (x1 - inset, cy)]
    else:
        targets = [(x0 + inset, cy), (x1 - inset, cy)]

    def _in_material(px: float, py: float) -> bool:
        for a, b, c in tris:
            d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1])
            d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1])
            d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1])
            has_neg = d1 < 0 or d2 < 0 or d3 < 0
            has_pos = d1 > 0 or d2 > 0 or d3 > 0
            if not (has_neg and has_pos):
                return True
        return False

    placed: list[tuple[float, float]] = []
    for px, py in targets:
        for step in range(11):
            t = step / 10.0
            qx = px + (cx - px) * t
            qy = py + (cy - py) * t
            if _in_material(qx, qy) and all(
                (qx - ox) ** 2 + (qy - oy) ** 2 > (diameter * 2.0) ** 2 for ox, oy in placed
            ):
                placed.append((qx, qy))
                break
    if len(placed) < min(2, count):
        return None
    return placed


def _mounting_hole_positions(width: float, depth: float, count: int) -> list[tuple[float, float]]:
    """Symmetric hole layout that HONORS the requested count. The old version
    silently downgraded 4 holes to 2 on plates smaller than 55x45mm - the user
    asked for 4, was told 4 were added, and got 2."""
    count = max(2, min(4, int(count)))
    if count >= 4:
        # Corner pattern scaled to the plate: works on small plates too.
        fx = 0.32 if width >= 55.0 else 0.30
        fy = 0.26 if depth >= 45.0 else 0.28
        return [
            (-width * fx, -depth * fy),
            (width * fx, -depth * fy),
            (-width * fx, depth * fy),
            (width * fx, depth * fy),
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
    row_layout: bool = False,
) -> bool:
    """Apply the holes; returns True when placement came from studying the
    actual mesh geometry (vs the bounding-box pattern)."""
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
    # Imported meshes: study the actual geometry and place holes in the real
    # base plate instead of at bounding-box fractions (which land anywhere on
    # complex models). Parametric shapes keep the proven layout unchanged.
    positions: list[tuple[float, float]] | None = None
    studied = False
    if row_layout:
        # "N holes even spacing": a single evenly-pitched row along the
        # length, with half-pitch end margins.
        n = max(2, min(8, int(count)))
        pitch = width / n
        positions = [(-width / 2.0 + pitch * (i + 0.5), 0.0) for i in range(n)]
    if not positions and imported_source and isinstance(obj.get("shape"), TriMesh):
        positions = _smart_mesh_hole_positions(obj["shape"], count, safe_diameter)
        studied = positions is not None
    if not positions:
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
    return studied


def add_mounting_holes_to_session(
    session: Session,
    selected: CadObject | None,
    *,
    count: int = 2,
    diameter: float = 5.0,
    counterbore_diameter: float = 9.0,
    row_layout: bool = False,
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

    any_studied = False
    applied_count = 0
    for target in candidates:
        if row_layout:
            target_count = max(2, min(8, count))
        else:
            target_count = 4 if count >= 4 or float(target["parameters"].get("width", 0.0)) >= 150.0 else max(2, count)
        if _apply_mounting_holes_to_object(
            target,
            count=target_count,
            diameter=diameter,
            counterbore_diameter=counterbore_diameter,
            row_layout=row_layout,
        ):
            any_studied = True
        applied_count = max(applied_count, int(target["parameters"].get("custom_hole_count", 0.0)))

    names = ", ".join(str(target.get("name", "part")) for target in candidates[:4])
    how = (
        "studied the model and placed them in the base plate"
        if any_studied
        else "in an evenly spaced row" if row_layout
        else "placed them in a symmetric pattern"
    )
    return [f"added {applied_count} mounting holes ({diameter:g}mm, counterbored) to {names} — {how}"]


_AI_EDIT_DECORATION_PRIMITIVES = {
    "text_label",
    "screw_boss",
    "support_rib",
    "clip_component",
    "hanging_hook",
}


def _edit_match_text(prompt: str) -> str:
    return _prompt_match_text(prompt)


def _parse_mm_values(prompt: str) -> list[float]:
    text = _edit_match_text(prompt)
    return [
        float(match.group(1))
        for match in re.finditer(r"\b(\d+(?:\.\d+)?)\s*mm\b", text)
    ]


def _parse_named_mm(prompt: str, names: tuple[str, ...], default: float) -> float:
    text = _edit_match_text(prompt)
    for name in names:
        match = re.search(rf"\b{name}\b[^\d]{{0,18}}(\d+(?:\.\d+)?)\s*mm\b", text)
        if match:
            return float(match.group(1))
        match = re.search(rf"\b(\d+(?:\.\d+)?)\s*mm[^\w]{{0,18}}\b{name}\b", text)
        if match:
            return float(match.group(1))
    values = _parse_mm_values(prompt)
    return values[0] if values else default


def _parse_feature_count(prompt: str, words: tuple[str, ...], default: int, minimum: int = 1, maximum: int = 8) -> int:
    text = _edit_match_text(prompt)
    word_numbers = {
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "en": 1,
        "ett": 1,
        "tva": 2,
        "tre": 3,
        "fyra": 4,
        "fem": 5,
        "sex": 6,
    }
    joined_words = "|".join(re.escape(word) for word in words)
    descriptor = r"(?:screw|mounting|support|battery|batteries|skruv)?"
    match = re.search(rf"\b([1-8])\s*(?:x|st|pcs|pieces)?\s*{descriptor}\s*(?:{joined_words})\b", text)
    if match:
        return max(minimum, min(maximum, int(match.group(1))))
    for word, value in word_numbers.items():
        if re.search(rf"\b{word}\s+{descriptor}\s*(?:{joined_words})\b", text):
            return max(minimum, min(maximum, value))
    return max(minimum, min(maximum, default))


def _object_dimensions(obj: CadObject) -> tuple[float, float, float]:
    source_dimensions = obj.get("source_dimensions") if isinstance(obj.get("source_dimensions"), dict) else {}
    params = obj.get("parameters", {})
    if source_dimensions:
        return (
            max(1.0, float(source_dimensions.get("width") or params.get("width", 80.0))),
            max(1.0, float(source_dimensions.get("depth") or params.get("depth", 70.0))),
            max(0.5, float(source_dimensions.get("height") or params.get("height", params.get("thickness", 8.0)))),
        )
    return (
        max(1.0, float(params.get("width", 80.0))),
        max(1.0, float(params.get("depth", 70.0))),
        max(0.5, float(params.get("height", params.get("thickness", params.get("base_thickness", 8.0))))),
    )


def _editable_search_space(session: Session, selected: CadObject | None = None) -> list[CadObject]:
    if selected and selected.get("source_group_id"):
        space = _source_group_objects(session, selected)
    else:
        space = [session["objects"][oid] for oid in session.get("object_order", [])]
    return [
        obj
        for obj in space
        if obj.get("primitive") not in _AI_EDIT_DECORATION_PRIMITIVES
    ]


def _select_ai_edit_targets(session: Session, *, prefer_base: bool = True) -> list[CadObject]:
    selected = get_object(session, session.get("selected_object_id"))
    search_space = _editable_search_space(session, selected)
    if not search_space:
        return []
    if selected and selected.get("primitive") not in _AI_EDIT_DECORATION_PRIMITIVES:
        if prefer_base and not _is_base_like(selected):
            base_candidates = [obj for obj in search_space if _is_base_like(obj)]
            if base_candidates:
                return sorted(base_candidates, key=_base_candidate_score, reverse=True)[:1]
        return [selected]
    if prefer_base:
        base_candidates = [obj for obj in search_space if _is_base_like(obj)]
        if base_candidates:
            return sorted(base_candidates, key=_base_candidate_score, reverse=True)[:1]
    return sorted(search_space, key=_base_candidate_score, reverse=True)[:1]


def _rebuild_ai_target(obj: CadObject, changed_keys: set[str] | None = None) -> None:
    if obj.get("manual"):
        if changed_keys and update_imported_source_dimensions(obj, changed_keys):
            return
        rebuild_manual_object(obj)
    else:
        rebuild_object(obj)
    place_object_on_plate(obj)


def _local_hole_positions_for_target(obj: CadObject, count: int, diameter: float) -> list[tuple[float, float]]:
    existing = _hole_specs(obj.get("parameters", {}))
    if existing:
        return [(x, y) for x, y, _d in existing[:count]]
    width, depth, _height = _object_dimensions(obj)
    return _mounting_hole_positions(width, depth, count)


def _make_tube_mesh(outer_radius: float, inner_radius: float, height: float, segments: int = 40) -> TriMesh:
    outer = max(0.6, float(outer_radius))
    inner = max(0.1, min(float(inner_radius), outer - 0.2))
    h = max(0.5, float(height))
    segments = max(12, int(segments))
    mesh = TriMesh()
    outer_bottom: list[int] = []
    outer_top: list[int] = []
    inner_bottom: list[int] = []
    inner_top: list[int] = []

    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        co = math.cos(angle)
        si = math.sin(angle)
        outer_bottom.append(mesh.add_vertex((co * outer, si * outer, 0.0)))
        outer_top.append(mesh.add_vertex((co * outer, si * outer, h)))
        inner_bottom.append(mesh.add_vertex((co * inner, si * inner, 0.0)))
        inner_top.append(mesh.add_vertex((co * inner, si * inner, h)))

    for index in range(segments):
        nxt = (index + 1) % segments
        mesh.add_quad(outer_bottom[index], outer_bottom[nxt], outer_top[nxt], outer_top[index])
        mesh.add_quad(inner_bottom[nxt], inner_bottom[index], inner_top[index], inner_top[nxt])
        mesh.add_quad(outer_top[index], outer_top[nxt], inner_top[nxt], inner_top[index])
        mesh.add_quad(outer_bottom[nxt], outer_bottom[index], inner_bottom[index], inner_bottom[nxt])
    return mesh


def _add_screw_bosses_to_session(session: Session, prompt: str) -> list[str]:
    targets = _select_ai_edit_targets(session, prefer_base=True)
    if not targets:
        return ["screw bosses skipped: no editable base body found"]
    target = targets[0]
    count = _parse_feature_count(prompt, ("boss", "bosses", "standoff", "standoffs", "post", "posts", "holes", "hal"), 2, 1, 6)
    screw_d = max(2.0, min(10.0, _parse_named_mm(prompt, ("screw", "hole", "diameter", "hal"), 4.5)))
    boss_d = max(screw_d + 3.0, min(24.0, _parse_named_mm(prompt, ("boss", "standoff", "post", "outer"), screw_d * 2.25)))
    boss_h = max(2.0, min(25.0, _parse_named_mm(prompt, ("height", "tall", "boss height", "hojd"), 7.0)))
    _apply_mounting_holes_to_object(target, count=count, diameter=screw_d, counterbore_diameter=max(screw_d + 2.0, boss_d * 0.72))

    transform: Transform = target["transform"]
    sx = max(0.001, float(transform.scale[0]))
    sy = max(0.001, float(transform.scale[1]))
    _mins, maxs = _world_extents(target)
    top_z = maxs[2]
    color = str(target.get("color", "#d6c12a"))
    created = 0
    for index, (local_x, local_y) in enumerate(_local_hole_positions_for_target(target, count, screw_d), start=1):
        boss = create_manual_object(
            f"screw_boss_{index}",
            _make_tube_mesh(boss_d / 2.0, screw_d / 2.0, boss_h),
            {
                "width": boss_d,
                "depth": boss_d,
                "height": boss_h,
                "thickness": boss_h,
                "hole_diameter": screw_d,
            },
        )
        boss["primitive"] = "screw_boss"
        boss["color"] = color
        boss["transform"] = Transform(
            position=[
                float(transform.position[0]) + local_x * sx,
                float(transform.position[1]) + local_y * sy,
                top_z,
            ],
            rotation=[0.0, 0.0, 0.0],
            scale=[1.0, 1.0, 1.0],
        )
        add_object(session, boss)
        created += 1

    session["selected_object_id"] = ""
    return [f"added {created} screw bosses with {screw_d:g}mm holes"]


def _parse_cutout_size(prompt: str, target: CadObject) -> tuple[float, float]:
    text = _edit_match_text(prompt)
    width, depth, _height = _object_dimensions(target)
    pair = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*mm\b", text)
    if pair:
        return (
            max(2.0, min(width * 0.9, float(pair.group(1)))),
            max(2.0, min(depth * 0.9, float(pair.group(2)))),
        )
    values = _parse_mm_values(prompt)
    if len(values) >= 2:
        return (
            max(2.0, min(width * 0.9, values[0])),
            max(2.0, min(depth * 0.9, values[1])),
        )
    if any(token in text for token in ("cable", "cord", "sladd", "kabel")):
        return max(8.0, min(width * 0.45, 24.0)), max(5.0, min(depth * 0.35, 14.0))
    if "slot" in text or "slits" in text:
        return max(12.0, min(width * 0.65, 48.0)), max(4.0, min(depth * 0.22, 10.0))
    return max(10.0, min(width * 0.35, 28.0)), max(6.0, min(depth * 0.28, 16.0))


def _add_cutout_to_object(obj: CadObject, prompt: str) -> str:
    text = _edit_match_text(prompt)
    width, depth, height = _object_dimensions(obj)
    cut_w, cut_d = _parse_cutout_size(prompt, obj)
    if any(token in text for token in ("front", "framsida", "fram", "cable", "cord", "sladd", "kabel")):
        x = 0.0
        y = -depth / 2.0 + cut_d / 2.0
    elif any(token in text for token in ("back", "baksida", "bak")):
        x = 0.0
        y = depth / 2.0 - cut_d / 2.0
    elif any(token in text for token in ("left", "vanster")):
        x = -width / 2.0 + cut_w / 2.0
        y = 0.0
    elif any(token in text for token in ("right", "hoger")):
        x = width / 2.0 - cut_w / 2.0
        y = 0.0
    else:
        x = 0.0
        y = 0.0

    pocket = any(token in text for token in ("pocket", "recess", "indent", "forsank", "forsankt"))
    pocket_depth = max(1.0, min(height * 0.7, _parse_named_mm(prompt, ("depth", "deep", "djup"), 3.0)))
    z0 = max(0.0, height - pocket_depth) if pocket else -0.2
    z1 = height + 0.2

    params = obj["parameters"]
    index = max(0, int(params.get("custom_cutout_count", 0.0)))
    params[f"custom_cutout_{index}_x"] = x
    params[f"custom_cutout_{index}_y"] = y
    params[f"custom_cutout_{index}_width"] = cut_w
    params[f"custom_cutout_{index}_depth"] = cut_d
    params[f"custom_cutout_{index}_z0"] = z0
    params[f"custom_cutout_{index}_z1"] = z1
    params["custom_cutout_count"] = float(index + 1)
    params["cutout_width"] = cut_w
    params["cutout_depth"] = cut_d
    _rebuild_ai_target(obj, {"custom_cutout_count"})
    kind = "pocket" if pocket else "cutout"
    return f"added {cut_w:g}x{cut_d:g}mm {kind} to {obj.get('name', 'part')}"


def _add_cutout_to_session(session: Session, prompt: str) -> list[str]:
    targets = _select_ai_edit_targets(session, prefer_base=True)
    if not targets:
        return ["cutout skipped: no editable body found"]
    return [_add_cutout_to_object(targets[0], prompt)]


def _add_clip_to_session(session: Session, prompt: str) -> list[str]:
    targets = _select_ai_edit_targets(session, prefer_base=True)
    if not targets:
        return ["clip skipped: no editable body found"]
    target = targets[0]
    mins, maxs = _world_extents(target)
    width = max(1.0, maxs[0] - mins[0])
    depth = max(1.0, maxs[1] - mins[1])
    color = str(target.get("color", "#d6c12a"))
    cx = (mins[0] + maxs[0]) / 2.0
    cy = (mins[1] + maxs[1]) / 2.0
    top_z = maxs[2]
    clip_w = max(18.0, min(width * 0.5, _parse_named_mm(prompt, ("width", "wide", "bredd"), 34.0)))
    clip_d = max(12.0, min(depth * 0.5, _parse_named_mm(prompt, ("depth", "djup"), 18.0)))
    clip_h = max(8.0, min(34.0, _parse_named_mm(prompt, ("height", "tall", "hojd"), 16.0)))
    wall = max(2.0, min(5.0, clip_w * 0.16))
    parts = [
        _create_box_component("clip_base", clip_w, clip_d, 3.0, [cx, cy, top_z], target["parameters"], color=color),
        _create_box_component("clip_left_jaw", wall, clip_d, clip_h, [cx - clip_w / 2.0 + wall / 2.0, cy, top_z + 3.0], target["parameters"], color=color),
        _create_box_component("clip_right_jaw", wall, clip_d, clip_h, [cx + clip_w / 2.0 - wall / 2.0, cy, top_z + 3.0], target["parameters"], color=color),
        _create_box_component("clip_front_lip", clip_w, wall, max(3.0, clip_h * 0.24), [cx, cy - clip_d / 2.0 + wall / 2.0, top_z + 3.0], target["parameters"], color=color),
    ]
    for part in parts:
        part["primitive"] = "clip_component"
        add_object(session, part)
    session["selected_object_id"] = ""
    return [f"added printable clip to {target.get('name', 'part')}"]


def _add_hanging_hook_to_session(session: Session, prompt: str) -> list[str]:
    targets = _select_ai_edit_targets(session, prefer_base=True)
    if not targets:
        return ["hanging hook skipped: no editable body found"]
    target = targets[0]
    mins, maxs = _world_extents(target)
    width = max(1.0, maxs[0] - mins[0])
    depth = max(1.0, maxs[1] - mins[1])
    color = str(target.get("color", "#d6c12a"))
    tab_w = max(22.0, min(width * 0.55, _parse_named_mm(prompt, ("width", "wide", "bredd"), 42.0)))
    tab_d = max(18.0, min(depth * 0.5, _parse_named_mm(prompt, ("length", "depth", "djup"), 30.0)))
    tab_h = max(3.0, min(9.0, _parse_named_mm(prompt, ("thickness", "tjocklek"), 5.0)))
    hole_d = max(4.0, min(tab_w * 0.35, _parse_named_mm(prompt, ("hole", "screw", "hal"), 7.0)))
    params = dict(target["parameters"])
    params["custom_hole_0_x"] = 0.0
    params["custom_hole_0_y"] = 0.0
    params["custom_hole_0_diameter"] = hole_d
    params["custom_hole_count"] = 1.0
    params["hole_count"] = 1.0
    params["hole_diameter"] = hole_d
    hook = _create_box_component(
        "hanging_hook_tab",
        tab_w,
        tab_d,
        tab_h,
        [(mins[0] + maxs[0]) / 2.0, maxs[1] + tab_d / 2.0 + 1.0, max(0.0, mins[2])],
        params,
        color=color,
        cut_holes=True,
    )
    hook["primitive"] = "hanging_hook"
    add_object(session, hook)
    session["selected_object_id"] = ""
    return [f"added hanging hook tab with {hole_d:g}mm hole"]


def _add_support_ribs_to_session(session: Session, prompt: str) -> list[str]:
    targets = _select_ai_edit_targets(session, prefer_base=True)
    if not targets:
        return ["strength ribs skipped: no editable body found"]
    target = targets[0]
    mins, maxs = _world_extents(target)
    width = max(1.0, maxs[0] - mins[0])
    depth = max(1.0, maxs[1] - mins[1])
    color = str(target.get("color", "#d6c12a"))
    count = _parse_feature_count(prompt, ("rib", "ribs", "support", "supports", "ribba", "ribbor"), 2, 1, 4)
    rib_w = max(2.0, min(8.0, _parse_named_mm(prompt, ("thickness", "rib", "tjocklek"), 3.0)))
    rib_d = max(12.0, min(depth * 0.72, _parse_named_mm(prompt, ("length", "depth", "langd", "djup"), depth * 0.52)))
    rib_h = max(6.0, min(40.0, _parse_named_mm(prompt, ("height", "tall", "hojd"), 14.0)))
    positions = [0.0] if count == 1 else [
        -width * 0.25 + (width * 0.5) * (index / max(1, count - 1))
        for index in range(count)
    ]
    for index, x_offset in enumerate(positions, start=1):
        rib = create_manual_object(
            f"support_rib_{index}",
            _make_triangular_prism(rib_w, rib_d, rib_h),
            {
                "width": rib_w,
                "depth": rib_d,
                "height": rib_h,
                "thickness": rib_w,
            },
        )
        rib["primitive"] = "support_rib"
        rib["color"] = color
        rib["transform"] = Transform(
            position=[(mins[0] + maxs[0]) / 2.0 + x_offset, (mins[1] + maxs[1]) / 2.0, maxs[2]],
            rotation=[0.0, 0.0, 0.0],
            scale=[1.0, 1.0, 1.0],
        )
        add_object(session, rib)
    session["selected_object_id"] = ""
    return [f"added {len(positions)} support ribs"]


def _apply_slot_edit_from_prompt(session: Session, prompt: str) -> list[str]:
    text = _edit_match_text(prompt)
    targets = _select_ai_edit_targets(session, prefer_base=False)
    if not targets:
        return []
    target = targets[0]
    params = target.get("parameters", {})
    slot_keys = {"num_batteries", "battery_slots", "battery_spacing", "slots"}
    if not (slot_keys & set(params.keys())):
        return []
    actions: list[str] = []
    count = _parse_feature_count(prompt, ("slot", "slots", "batteries", "battery"), 0, 0, 6)
    if count > 0 and any(token in text for token in ("slot", "slots", "battery", "batteries")):
        if "num_batteries" in params:
            params["num_batteries"] = float(count)
        if "battery_slots" in params:
            params["battery_slots"] = float(count)
        if "slots" in params:
            params["slots"] = float(count)
        actions.append(f"set slot count to {count}")
    if any(token in text for token in ("spacing", "space", "avstand")):
        spacing = max(35.0, min(140.0, _parse_named_mm(prompt, ("spacing", "space", "avstand"), float(params.get("battery_spacing", 85.0)))))
        params["battery_spacing"] = spacing
        actions.append(f"set slot spacing to {spacing:g}mm")
    if actions:
        _rebuild_ai_target(target, {"num_batteries", "battery_slots", "slots", "battery_spacing"})
    return actions


def _apply_dimension_edit_from_prompt(session: Session, prompt: str) -> list[str]:
    text = _edit_match_text(prompt)
    if not any(token in text for token in ("thicker", "tjockare", "taller", "hogre", "wider", "bredare", "longer", "langre")):
        return []
    targets = _select_ai_edit_targets(session, prefer_base=False)
    if not targets:
        return []
    target = targets[0]
    params = target.get("parameters", {})
    values = _parse_mm_values(prompt)
    changed: set[str] = set()
    pct_match = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:percent|%)\b", text)
    factor = 1.0 + (float(pct_match.group(1)) / 100.0 if pct_match else 0.20)

    if any(token in text for token in ("thicker", "tjockare")):
        amount = values[0] if values else None
        for key in ("thickness", "base_thickness"):
            if key in params:
                params[key] = max(0.5, float(params.get(key, 5.0)) + (amount if amount is not None else max(1.0, float(params.get(key, 5.0)) * 0.20)))
                changed.add(key)
        if "height" in params and "thickness" in params:
            params["height"] = max(float(params.get("height", 8.0)), float(params["thickness"]))
            changed.add("height")
    if any(token in text for token in ("taller", "hogre")) and "height" in params:
        params["height"] = max(0.5, values[0] if values else float(params.get("height", 20.0)) * factor)
        changed.add("height")
    if any(token in text for token in ("wider", "bredare")) and "width" in params:
        params["width"] = max(1.0, values[0] if values else float(params.get("width", 60.0)) * factor)
        changed.add("width")
    if any(token in text for token in ("longer", "langre")):
        key = "holder_length" if "holder_length" in params else "depth"
        if key in params:
            params[key] = max(1.0, values[0] if values else float(params.get(key, 60.0)) * factor)
            changed.add(key)
    if not changed:
        return []
    _rebuild_ai_target(target, changed)
    return [f"updated dimensions: {', '.join(sorted(changed))}"]


def _expert_operation_from_prompt(prompt: str) -> tuple[str, float] | None:
    text = _edit_match_text(prompt)
    values = _parse_mm_values(prompt)
    first = values[0] if values else 0.0
    if "fillet" in text or "rounded" in text or "rund" in text:
        return "fillet", first or 2.0
    if "chamfer" in text or "fasa" in text:
        return "chamfer", first or 2.0
    # "Narrow the edges (so force has to be applied to insert it)" — a
    # press-fit taper request; a chamfer is the printable way to do it.
    if re.search(r"\b(?:narrow(?:er)?|taper(?:ed)?|tight(?:er)?)\b", text) and re.search(r"\bedges?\b|\bkant(?:er(?:na)?)?\b", text):
        return "chamfer", first or 1.5
    if "shell" in text or "skal" in text:
        return "shell", first or 2.0
    if "extrude" in text or "extrudera" in text:
        return "extrude", first or 5.0
    return None


def _looks_like_new_model_request(text: str) -> bool:
    return bool(
        re.search(r"\b(create|generate|build|design|skapa|generera|bygg|rita)\b", text)
        or re.search(r"\bmake\s+(?:a|an|one|en|ett)\b", text)
        or re.search(r"\bgor\s+(?:en|ett)\b", text)
    )


def is_structural_ai_edit_prompt(prompt: str) -> bool:
    text = _edit_match_text(prompt)
    if _looks_like_new_model_request(text):
        return False
    has_edit_action = any(
        token in text
        for token in (
            "add",
            "adjust",
            "change",
            "put",
            "place",
            "satt",
            "set",
            "extend",
            "widen",
            "lengthen",
            "forlang",
            "bredda",
            "remove",
            "delete",
            "make it",
            "make 2",
            "make 3",
            "make 4",
            "increase",
            "decrease",
            "fillet",
            "chamfer",
            "shell",
            "extrude",
            "stronger",
            "thicker",
            "wider",
            "taller",
            "lagg till",
            "andra",
            "ta bort",
            "gor den",
            "gor det",
            "starkare",
            "tjockare",
            "bredare",
            "hogre",
        )
    )
    if not has_edit_action:
        # Bare hole-spec phrasings like "4 holes even spacing" are edits too,
        # even without a verb.
        return bool(re.search(r"\b[1-8]\s+holes?\b|\bholes?\s+(?:even|evenly|spacing)\b", text))
    return any(
        token in text
        for token in (
            "hole",
            "holes",
            "screw",
            "bend",
            "bent",
            "boj",
            "flange",
            "flanges",
            "flans",
            "post",
            "posts",
            "lettering",
            "letters",
            "logo",
            "label",
            "boss",
            "bosses",
            "standoff",
            "cutout",
            "cut out",
            "notch",
            "slot",
            "cable",
            "clip",
            "clamp",
            "hook",
            "hanger",
            "wall",
            "walls",
            "vagg",
            "extend",
            "widen",
            "spacing",
            "stronger",
            "rib",
            "ribs",
            "fillet",
            "chamfer",
            "shell",
            "extrude",
            "thicker",
            "wider",
            "taller",
            "hal",
            "skruv",
            "klamma",
            "krok",
            "starkare",
            "ribba",
            "fasa",
            "rund",
            "tjockare",
            "bredare",
            "hogre",
        )
    )


def _apply_scanned_hole_edit(session: Session, prompt: str) -> list[str]:
    """Resize the model's REAL holes, found by scanning the mesh.

    'Make the holes 6mm' / 'enlarge the holes' on an imported model targets
    the through-holes the scanner measured — same centers, bigger bore —
    instead of drilling new generic mounting holes. Enlarging is a true
    subtraction so it works on any mesh; shrinking would need material added
    and is answered honestly instead of faked."""
    text = _edit_match_text(prompt)
    if not re.search(r"\bholes?\b|\bh[aå]l(?:en)?\b", text):
        return []
    # Only when the user speaks about existing holes ("the holes", enlarge/
    # widen/resize wording) — "add 4 holes" must keep meaning NEW holes.
    wants_resize = re.search(
        r"\b(?:enlarge|widen|bigger|larger|increase|resize|expand|f[oö]rstora|st[oö]rre|bredda)\b"
        r"|\bholes?\s*(?:to|=|:)?\s*\d+(?:[.,]\d+)?\s*mm\b"
        r"|\bmake\s+(?:the\s+)?holes?\b",
        text,
    )
    wants_new = re.search(r"\b(?:add|drill|new|more|another|extra|l[aä]gg\s*till|fler|nya?)\b", text)
    if not wants_resize or wants_new:
        return []

    target = _active_source_object(session) or get_object(session, session.get("selected_object_id"))
    if target is None or not target.get("imported_source_mesh"):
        return []
    scan = target.get("mesh_scan")
    if not isinstance(scan, dict) or not scan.get("holes"):
        return []
    holes = scan["holes"]

    shrink = re.search(r"\b(?:smaller|shrink|reduce|narrow|mindre|krymp|minska)\b", text)
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*mm\b", text)
    current_max = max(item["diameter"] for item in holes)
    new_d = float(m.group(1).replace(",", ".")) if m else round(current_max * 1.3, 1)
    if shrink or new_d <= current_max:
        return [
            f"the scanned holes are Ø{current_max:g}mm — making them smaller means filling "
            "material, which isn't possible on an imported mesh yet. Try a larger diameter."
        ]

    mesh = deepcopy(target["shape"])
    for hole in holes:
        mesh = _subtract_cylinder_column(mesh, hole["cx"], hole["cy"], new_d / 2.0, sides=24)
    target["shape"] = mesh
    target["source_original_shape"] = deepcopy(mesh)
    try:
        from backend.services.mesh_analysis import scan_trimesh

        target["mesh_scan"] = scan_trimesh(mesh)
    except Exception:  # noqa: BLE001
        pass
    target.setdefault("operation_history", []).append(
        {"operation": "resize_scanned_holes", "count": len(holes), "diameter": new_d}
    )
    return [
        f"enlarged the model's {len(holes)} scanned hole{'s' if len(holes) != 1 else ''} "
        f"to Ø{new_d:g}mm at their original positions"
    ]


def _apply_removal_edit_from_prompt(session: Session, prompt: str) -> list[str]:
    """Handle 'remove the X' intents BEFORE the add-branches get a chance.

    A real tester wrote 'remove those newly-introduced posts' and the bosses
    branch ADDED more posts. Removal intent must never fall through to an
    add-branch. Parametric holes can genuinely be removed (hole_count -> 0);
    everything else gets an honest answer with the actual way out (Undo)."""
    text = _edit_match_text(prompt)
    if not re.search(r"\b(?:remove|delete|get rid of|ta bort)\b", text):
        return []
    if re.search(r"\b(?:add|and add|lagg till|l[aä]gg till)\b", text):
        return []
    feature_nouns = re.search(
        r"\b(?:holes?|posts?|boss(?:es)?|standoffs?|flanges?|ribs?|hooks?|clips?|"
        r"lettering|letters?|text|logo|labels?|h[aå]l|fl[aä]ns(?:en)?|krok(?:en)?|ribb(?:a|or))\b",
        text,
    )
    if not feature_nouns:
        return []
    target = _active_source_object(session) or get_object(session, session.get("selected_object_id"))
    if target is None and session.get("object_order"):
        target = session["objects"].get(session["object_order"][-1])
    if target is None:
        return []

    wants_holes = bool(re.search(r"\bholes?\b|\bh[aå]l\b", text))
    if wants_holes and not target.get("imported_source_mesh"):
        # Parametric bodies can genuinely drop their holes.
        params = target["parameters"]
        had = int(params.get("hole_count", 0.0)) or int(params.get("custom_hole_count", 0.0))
        params["hole_count"] = 0.0
        params["custom_hole_count"] = 0.0
        if target.get("manual"):
            rebuild_manual_object(target)
        else:
            rebuild_object(target)
        return [f"removed the holes ({had or 'all'})"]

    return [
        "Cadio can't remove that feature from this model yet — press Undo (Ctrl+Z or the ↶ "
        "button in the top bar) to revert the last change, or use the Cut slot / Split tools "
        "to slice material away."
    ]


def is_duct_adapter_edit_prompt(session: Session, prompt: str) -> bool:
    """True when the plate holds a Cadio-built adapter and the prompt looks
    like a change to it ('round end 100mm', 'wall 3mm', 'straight', '45°').

    Session-aware, so it catches adapter edits that the generic structural
    detector misses (e.g. bare 'wall 3mm' with no verb) and keeps them from
    falling through to a brand-new generation."""
    target = _active_source_object(session) or get_object(session, session.get("selected_object_id"))
    if target is None and session.get("object_order"):
        target = session["objects"].get(session["object_order"][-1])
    if target is None or not isinstance(target.get("duct_spec"), dict):
        return False
    text = _edit_match_text(prompt)
    return bool(
        re.search(
            r"\bbend|b[oö]j|straight|rak\b|angle|vinkel"
            r"|\d+\s*(?:°|deg|degrees?|grader)"
            r"|\bround\b|\bsquare\b|\bwall\b|\bdiameter\b|\bthick"
            r"|\bbigger|smaller|wider|narrower|taller|shorter|st[oö]rre|mindre"
            r"|\d+\s*(?:mm|cm|inch|in\b|tum)",
            text,
        )
    )


def _apply_duct_adapter_edit(session: Session, prompt: str) -> list[str]:
    """Rebuild a Cadio-built duct adapter to new values.

    This is the core of 'if the customer wants a 40° bend instead of 70°,
    Cadio rebuilds the model to their wish'. When the current model is a
    parametric adapter, 'change it to 60 degrees', 'make the round end
    100mm', 'wall 3mm', 'make the square side 200mm' all re-loft it with the
    changed value and keep everything else. Returns [] when the model isn't
    one of ours (so other handlers run)."""
    target = _active_source_object(session) or get_object(session, session.get("selected_object_id"))
    if target is None and session.get("object_order"):
        target = session["objects"].get(session["object_order"][-1])
    if target is None or not isinstance(target.get("duct_spec"), dict):
        return []

    spec = dict(target["duct_spec"])
    text = _edit_match_text(prompt)
    changed: list[str] = []

    def _mm_from(match: "re.Match[str] | None") -> float | None:
        if not match:
            return None
        val = float(match.group(1).replace(",", "."))
        unit = (match.group(2) or "").strip().lower()
        if unit in ('"', "″", "''") or unit.startswith("in") or unit.startswith("tum"):
            val *= 25.4
        elif unit.startswith("cm"):
            val *= 10.0
        return val

    unit_re = r"(mm|cm|\"|″|''|in\b|inch(?:es)?|tum)"

    # Bend angle: "change it to 60 degrees", "60 degree bend", "make it straight"
    if re.search(r"\bstraight\b|\bno bend\b|\brak\b", text):
        if spec["bend"] != 0.0:
            spec["bend"] = 0.0
            changed.append("removed the bend (now straight)")
    else:
        bm = re.search(r"(\d{1,3})\s*(?:°|deg(?:rees?)?|grader)", text)
        if bm and re.search(r"\bbend|b[oö]j|angle|vinkel|straight|degrees?|grader|°\b", text):
            nb = max(0.0, min(120.0, float(bm.group(1))))
            if abs(nb - spec["bend"]) > 0.1:
                spec["bend"] = nb
                changed.append(f"bend {nb:g}°")

    # Round outlet diameter
    rm = re.search(rf"round\s+(?:end|outlet|side|hose|pipe)?\s*(?:to\s*)?(\d+(?:[.,]\d+)?)\s*{unit_re}?", text)
    if not rm:
        rm = re.search(rf"(\d+(?:[.,]\d+)?)\s*{unit_re}?\s*(?:diameter|dia\b|round)", text)
    rv = _mm_from(rm)
    if rv is not None and 20.0 <= rv <= 400.0 and abs(rv - spec["round_d"]) > 0.5:
        spec["round_d"] = rv
        changed.append(f"round Ø{rv:g}mm")

    # Square mouth side
    sqm = re.search(rf"square\s+(?:end|side|mouth|opening)?\s*(?:to\s*)?(\d+(?:[.,]\d+)?)\s*{unit_re}?", text)
    sqv = _mm_from(sqm)
    if sqv is not None and 20.0 <= sqv <= 400.0 and abs(sqv - spec["square"]) > 0.5:
        spec["square"] = sqv
        changed.append(f"square {sqv:g}mm")

    # Wall thickness
    wm = re.search(rf"wall\s*(?:thickness|to)?\s*(\d+(?:[.,]\d+)?)\s*{unit_re}?|(\d+(?:[.,]\d+)?)\s*{unit_re}?\s*(?:thick|wall)", text)
    if wm:
        raw = wm.group(1) or wm.group(3)
        unit = wm.group(2) or wm.group(4)
        if raw:
            wv = float(raw.replace(",", "."))
            if unit and (unit.startswith("in") or unit in ('"', "''")):
                wv *= 25.4
            wv = max(1.2, min(8.0, wv))
            if abs(wv - spec["wall"]) > 0.05:
                spec["wall"] = wv
                changed.append(f"wall {wv:g}mm")

    if not changed:
        return []

    mesh = _make_duct_adapter_mesh(spec["square"], spec["round_d"], spec["bend"], spec["wall"])
    target["shape"] = shift_mesh_to_buildplate(mesh)
    target["source_original_shape"] = deepcopy(target["shape"])
    target["duct_spec"] = spec
    params = target.get("parameters", {})
    params.update({"width": spec["square"], "depth": spec["square"], "height": spec["square"],
                   "thickness": spec["wall"], "wall_thickness": spec["wall"]})
    try:
        from backend.services.mesh_analysis import scan_trimesh

        target["mesh_scan"] = scan_trimesh(target["shape"])
    except Exception:  # noqa: BLE001
        pass
    center_object_on_plate(target)
    bend_txt = f", {spec['bend']:g}° bend" if spec["bend"] else ", straight"
    return [
        f"rebuilt your adapter: {', '.join(changed)}",
        f"now square {spec['square']:g}mm → round Ø{spec['round_d']:g}mm{bend_txt}, wall {spec['wall']:g}mm",
    ]


def _apply_bend_edit_from_prompt(session: Session, prompt: str) -> list[str]:
    """'Give it a 90-degree bend in the middle' — this used to be routed as a
    NEW generation and replaced the model with an unrelated search hit
    ('from ductwork to a phone stand in one fell swoop', as the tester put
    it). Bending an arbitrary imported mesh isn't supported yet, so keep the
    model and answer honestly, pointing at the parametric adapter that CAN
    be built with a bend."""
    text = _edit_match_text(prompt)
    if not re.search(r"\b(?:bend|bent|b[oö]j(?:en)?)\b", text):
        return []
    target = _active_source_object(session) or get_object(session, session.get("selected_object_id"))
    if target is None and session.get("object_order"):
        target = session["objects"].get(session["object_order"][-1])
    if target is None:
        return []
    deg = 90
    m = re.search(r"(\d{2,3})\s*(?:°|deg|degrees?|grader)", text)
    if m:
        deg = int(m.group(1))
    return [
        f"bending this model {deg}° isn't supported yet — the model was left unchanged. "
        "For ducts and hoses, describe the part instead (e.g. 'square 150x150mm to round "
        f"150mm diameter hose adapter with a {deg} degree bend') and Cadio builds it "
        "parametrically with the bend included."
    ]


def apply_structural_ai_edit_from_prompt(session: Session, prompt: str) -> list[str]:
    text = _edit_match_text(prompt)
    # Cadio-built adapters can be rebuilt to any new bend/size — must run
    # before the generic bend handler (which only knows how to say "no").
    adapter_actions = _apply_duct_adapter_edit(session, prompt)
    if adapter_actions:
        return adapter_actions
    bend_actions = _apply_bend_edit_from_prompt(session, prompt)
    if bend_actions:
        return bend_actions
    removal_actions = _apply_removal_edit_from_prompt(session, prompt)
    if removal_actions:
        return removal_actions
    scanned_hole_actions = _apply_scanned_hole_edit(session, prompt)
    if scanned_hole_actions:
        return scanned_hole_actions
    slot_actions = _apply_slot_edit_from_prompt(session, prompt)
    if slot_actions:
        return slot_actions
    if any(token in text for token in ("boss", "bosses", "standoff", "standoffs", "post", "posts")):
        return _add_screw_bosses_to_session(session, prompt)
    if any(token in text for token in ("clip", "clamp", "klamma")):
        return _add_clip_to_session(session, prompt)
    if any(token in text for token in ("hook", "hanger", "hanging", "krok")):
        return _add_hanging_hook_to_session(session, prompt)
    if any(token in text for token in ("cutout", "cut out", "notch", "cable", "cord", "pocket", "recess", "sladd", "kabel")):
        return _add_cutout_to_session(session, prompt)
    if any(token in text for token in ("stronger", "support rib", "ribs", "ribba", "starkare")):
        return _add_support_ribs_to_session(session, prompt)
    expert = _expert_operation_from_prompt(prompt)
    if expert:
        targets = _select_ai_edit_targets(session, prefer_base=False)
        if not targets:
            return ["operation skipped: no editable body found"]
        operation, amount = expert
        if targets[0].get("primitive") == "imported_source_mesh" and operation in {"fillet", "chamfer", "shell"}:
            return [f"{operation} skipped: imported STL meshes need a CAD body for true edge operations"]
        return apply_expert_operation(targets[0], operation, amount)
    dimension_actions = _apply_dimension_edit_from_prompt(session, prompt)
    if dimension_actions:
        return dimension_actions
    # "Extend it 10mm each side keep holes the same" is a RESIZE, not a hole
    # command — handle it before the hole branch (which used to hijack it and
    # add 10mm holes instead).
    ext = re.search(
        r"\b(?:extend|widen|lengthen|stretch|forlang|bredda)\b[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*mm(\s*(?:on\s+)?(?:each|both|per|every)\s*side)?",
        text,
    )
    if ext:
        targets = _select_ai_edit_targets(session, prefer_base=True)
        target = targets[0] if targets else get_object(session, session.get("selected_object_id"))
        if target is not None:
            delta = float(ext.group(1).replace(",", "."))
            if ext.group(2):
                delta *= 2.0
            params = target["parameters"]
            params["width"] = max(1.0, float(params.get("width", 40.0)) + delta)
            if target.get("manual"):
                rebuild_manual_object(target)
            else:
                rebuild_object(target)
            kept = int(params.get("custom_hole_count", 0.0))
            note = f", holes kept in place ({kept})" if kept else ""
            return [f"extended width by {delta:g}mm to {params['width']:g}mm{note}"]

    # "Put a solid wall on the front face so the battery will stop when slid
    # in" — add a wall plate against a named face of the model.
    wallm = re.search(
        r"\bwalls?\b[^.]{0,40}?\b(front|back|rear|left|right|framsidan|baksidan|fram|bak)\b"
        r"|\b(front|back|rear|left|right|framsidan|baksidan|fram|bak)\b[^.]{0,24}?\bwalls?\b",
        text,
    )
    if wallm and re.search(r"\b(?:put|add|place|solid|satt|lagg|behov|need|so\s+the)\b", text):
        face = (wallm.group(1) or wallm.group(2) or "front").strip()
        face = {"framsidan": "front", "fram": "front", "baksidan": "back", "bak": "back", "rear": "back"}.get(face, face)
        target = _active_source_object(session) or get_object(session, session.get("selected_object_id"))
        targets = _source_group_objects(session, target) or ([target] if target else [])
        if targets:
            mins, maxs = _world_extents_for_objects(targets)
            t = max(1.5, min(12.0, _parse_named_mm(prompt, ("wall", "thick", "vagg"), 3.0)))
            zh = max(4.0, maxs[2] - mins[2])
            if face in ("front", "back"):
                w_, d_ = max(4.0, maxs[0] - mins[0]), t
                cx = (mins[0] + maxs[0]) / 2.0
                cy = (mins[1] - t / 2.0) if face == "front" else (maxs[1] + t / 2.0)
            else:
                w_, d_ = t, max(4.0, maxs[1] - mins[1])
                cy = (mins[1] + maxs[1]) / 2.0
                cx = (mins[0] - t / 2.0) if face == "left" else (maxs[0] + t / 2.0)
            shape = make_box_body(w_, d_, zh, fillet=0.0) or make_rounded_box(w_, d_, zh, 0.0, segments=4)
            wparams = dict(DEFAULT_PARAMETERS)
            wparams.update({"width": w_, "depth": d_, "height": zh, "thickness": t, "hole_count": 0.0})
            wall = create_manual_object(f"{face}_wall", shape, wparams)
            wall["primitive"] = "rectangle"
            wall["template_component"] = True
            wall["assembly_source"] = "chat-edit:face-wall"
            wall["transform"].position[0] = cx
            wall["transform"].position[1] = cy
            add_object(session, wall)
            return [f"added a solid {t:g}mm wall on the {face} face ({w_:.0f} × {zh:.0f}mm)"]

    holes_kept_intent = bool(re.search(r"\bkeep\b[^.]{0,24}\bholes?\b|\bholes?\s+the\s+same\b", text))
    if not holes_kept_intent and any(token in text for token in ("hole", "holes", "screw", "hal", "skruv")):
        targets = _select_ai_edit_targets(session, prefer_base=True)
        selected = targets[0] if targets else get_object(session, session.get("selected_object_id"))
        count = _parse_feature_count(prompt, ("hole", "holes", "screw", "screws", "hal"), 2, 1, 8)
        diameter = max(1.0, min(16.0, _parse_named_mm(prompt, ("hole", "screw", "diameter", "hal"), 5.0)))
        counterbore = max(diameter + 1.0, min(24.0, _parse_named_mm(prompt, ("counterbore", "head", "forsank"), max(9.0, diameter * 1.8))))
        return add_mounting_holes_to_session(
            session,
            selected,
            count=count,
            diameter=diameter,
            counterbore_diameter=counterbore,
            row_layout=bool(re.search(r"\beven(?:ly)?\b|\bjamn(?:t|a)?\b|\bin\s+a\s+(?:row|line)\b", text)),
        )
    return []


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

    # Imported source meshes are triangulated geometry, not parametric B-reps,
    # so fillet/chamfer/shell/extrude can't be applied to them.  Be honest about
    # it instead of silently rebuilding the mesh unchanged (which looked like the
    # tool was broken).  Mounting holes still work via add_hole_to_object.
    is_imported = obj.get("primitive") == "imported_source_mesh" or bool(obj.get("imported_source_mesh"))
    # Raw-mesh bodies (split/cut halves and other non-parametric meshes) have no
    # parametric build, so a rebuild would regenerate a default-sized box — which
    # is exactly the "model became huge" bug. Treat them like imported meshes.
    is_raw_mesh = is_imported or obj.get("primitive") in {"cut_half", "cut_pocket", "edited_mesh"} or (
        not obj.get("manual") and not obj.get("feature_tree") and not obj.get("template_hint")
    )
    if is_raw_mesh and op in {"fillet", "chamfer", "shell", "extrude"}:
        return [
            f"{op} isn't available on this body (it's a cut/imported mesh, not a parametric shape) — "
            "use scale or mounting holes, or describe the change to the AI instead"
        ]

    # Template-generated (non-manual) objects support fillet and chamfer via
    # their build functions, but shell and extrude don't have a template path.
    is_template = not obj.get("manual") and not is_imported
    if is_template and op == "shell":
        return ["shell isn't supported on generated models — convert to a manual body first by drawing a rectangle"]

    if op == "fillet":
        params["fillet_radius"] = amt
        params["chamfer_size"] = 0.0
        obj["edge_operation_target"] = target if target.startswith("edge:") else "all"
        _set_feature_enabled(features, "fillet_edges", True)
        _set_feature_enabled(features, "chamfer_edges", False)
        actions.append(f"fillet {target} radius {amt}mm")
    elif op == "chamfer":
        params["chamfer_size"] = amt
        params["fillet_radius"] = 0.0
        obj["edge_operation_target"] = target if target.startswith("edge:") else "all"
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


def _split_mesh_by_line(session: Session, obj: CadObject, center: list[float], delta: list[float]) -> list[str]:
    """Clip any TriMesh object along a line into two new bodies."""
    shape = obj.get("shape")
    if not isinstance(shape, TriMesh) or not shape.verts:
        return ["split skipped: no mesh available"]
    if len(center) < 2 or len(delta) < 2:
        return ["split skipped: missing line"]

    # Backend mesh coords: mesh X = world X (scale[0]), mesh Y = world Z (scale[1]).
    # This mirrors the same transform used by cut_object_by_line for _apply_mesh_rect_cutouts.
    transform: Transform = obj["transform"]
    sx = max(0.001, float(transform.scale[0]))
    sy = max(0.001, float(transform.scale[1]))

    local_cx = (float(center[0]) - float(transform.position[0])) / sx
    local_cy = (float(center[1]) - float(transform.position[1])) / sy

    ldx = float(delta[0]) / sx
    ldy = float(delta[1]) / sy
    local_len = math.sqrt(ldx * ldx + ldy * ldy)
    if local_len < 0.001:
        return ["split skipped: line too short in local space"]

    # Normal perpendicular to the line direction in local XY plane (vertical cut).
    nx = -ldy / local_len  # mesh v[0] component
    ny = ldx / local_len   # mesh v[1] component
    nz = 0.0               # mesh v[2] (height) — no tilt
    d = -(nx * local_cx + ny * local_cy)

    half1 = _plane_clip_trimesh(shape, nx, ny, nz, d, keep_sign=1)
    half2 = _plane_clip_trimesh(shape, nx, ny, nz, d, keep_sign=-1)

    if not half1.verts or not half2.verts:
        return ["split skipped: line didn't cross the object"]

    obj_name = obj.get("name", "part")
    transform_obj: Transform = obj["transform"]
    for idx, half in enumerate([half1, half2], start=1):
        part = create_manual_object(f"{obj_name}_part_{idx}", half)
        # Treat each half as a raw-mesh body (like an imported mesh) so later
        # Cut slot / Make hole / resize edit the actual mesh instead of
        # rebuild_manual_object regenerating a box from the default parameters.
        part["primitive"] = "imported_source_mesh"
        part["imported_source_mesh"] = True
        part["source_original_shape"] = deepcopy(half)
        dims = _mesh_dimensions(half)
        part["parameters"].update({
            "width": max(1.0, dims["width"]),
            "depth": max(1.0, dims["depth"]),
            "height": max(0.5, dims["height"]),
        })
        part["source_dimensions"] = {
            "width": max(1.0, dims["width"]),
            "depth": max(1.0, dims["depth"]),
            "height": max(0.5, dims["height"]),
        }
        # Carry over source attribution so split parts still show Source/license.
        if isinstance(obj.get("source_model"), dict):
            part["source_model"] = deepcopy(obj["source_model"])
        part["transform"] = Transform(
            position=list(transform_obj.position),
            rotation=list(transform_obj.rotation),
            scale=list(transform_obj.scale),
        )
        part["material"] = obj.get("material", "PLA")
        part["color"] = obj.get("color", "#b8babd")
        add_object(session, part)

    object_id = obj["id"]
    del session["objects"][object_id]
    session["object_order"] = [oid for oid in session["object_order"] if oid != object_id]
    session["selected_object_id"] = session["object_order"][-1] if session["object_order"] else ""
    return [f"split '{obj_name}' into 2 bodies"]


def split_object_by_line(session: Session, obj: CadObject, center: list[float], delta: list[float]) -> list[str]:
    """Split a CAD object into two bodies along a drawn line.

    For parametric rectangle sketches, the split is done analytically so
    both halves remain resizable. For any other object (AI-generated STL,
    imported mesh, cylinder, etc.) the existing TriMesh is clipped along a
    vertical plane aligned with the drawn line.
    """
    if not obj.get("manual") or obj.get("primitive") != "rectangle":
        return _split_mesh_by_line(session, obj, center, delta)
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


def _plane_clip_trimesh(
    mesh: TriMesh,
    nx: float,
    ny: float,
    nz: float,
    d: float,
    keep_sign: int = 1,
) -> TriMesh:
    """Clip a TriMesh, keeping the half where (nx*x + ny*y + nz*z + d) * keep_sign >= 0."""
    result = TriMesh()

    def sdist(v: tuple) -> float:
        return (nx * v[0] + ny * v[1] + nz * v[2] + d) * keep_sign

    def lerp_v(v1: tuple, v2: tuple, t: float) -> tuple:
        return (
            v1[0] + t * (v2[0] - v1[0]),
            v1[1] + t * (v2[1] - v1[1]),
            v1[2] + t * (v2[2] - v1[2]),
        )

    for tri in mesh.tris:
        tri_verts = [mesh.verts[i] for i in tri]
        dists = [sdist(v) for v in tri_verts]

        in_poly: list[tuple] = []
        for i in range(3):
            j = (i + 1) % 3
            vi, di = tri_verts[i], dists[i]
            vj, dj = tri_verts[j], dists[j]
            if di >= 0:
                in_poly.append(vi)
            if (di < 0) != (dj < 0):
                t = di / (di - dj)
                in_poly.append(lerp_v(vi, vj, t))

        if len(in_poly) < 3:
            continue

        base = len(result.verts)
        result.verts.extend(in_poly)
        for k in range(1, len(in_poly) - 1):
            result.tris.append((base, base + k, base + k + 1))

    return result


def _merge_trimeshes(parts: list[TriMesh]) -> TriMesh:
    result = TriMesh()
    for part in parts:
        if not part.verts:
            continue
        base = len(result.verts)
        result.verts.extend(part.verts)
        for (a, b, c) in part.tris:
            result.tris.append((a + base, b + base, c + base))
    return result


def _subtract_cylinder_column(
    mesh: TriMesh,
    cx: float,
    cy: float,
    radius: float,
    z_from: float | None = None,
    sides: int = 12,
) -> TriMesh:
    """Remove a vertical cylindrical column from a mesh — a REAL subtraction.

    The old centroid test removed nothing on coarse meshes (holes became
    surface marks) or removed whole giant triangles (chunks of the model
    vanished). This clips the mesh against the column like Cut slot does:
    the material outside the hole's bounding box is kept verbatim, and the
    small core region is decomposed against an N-gon approximation of the
    circle, keeping every piece outside it. ``z_from`` limits the cut to
    material above that height (used for counterbores)."""
    if not mesh.verts or radius <= 0.0:
        return mesh
    r = radius
    x0, x1, y0, y1 = cx - r, cx + r, cy - r, cy + r

    left = _plane_clip_trimesh(mesh, 1.0, 0.0, 0.0, -x0, keep_sign=-1)
    right = _plane_clip_trimesh(mesh, 1.0, 0.0, 0.0, -x1, keep_sign=1)
    mid = _plane_clip_trimesh(mesh, 1.0, 0.0, 0.0, -x0, keep_sign=1)
    mid = _plane_clip_trimesh(mid, 1.0, 0.0, 0.0, -x1, keep_sign=-1)
    front = _plane_clip_trimesh(mid, 0.0, 1.0, 0.0, -y0, keep_sign=-1)
    back = _plane_clip_trimesh(mid, 0.0, 1.0, 0.0, -y1, keep_sign=1)
    core = _plane_clip_trimesh(mid, 0.0, 1.0, 0.0, -y0, keep_sign=1)
    core = _plane_clip_trimesh(core, 0.0, 1.0, 0.0, -y1, keep_sign=-1)

    parts: list[TriMesh] = [left, right, front, back]
    if z_from is not None:
        parts.append(_plane_clip_trimesh(core, 0.0, 0.0, 1.0, -z_from, keep_sign=-1))  # below stays
        core = _plane_clip_trimesh(core, 0.0, 0.0, 1.0, -z_from, keep_sign=1)

    # Complement decomposition of the N-gon column inside the core: piece i is
    # outside edge-plane i and inside planes 0..i-1, so the union tiles the
    # core minus the hole exactly once. Edge planes are tangent to the circle
    # (apothem = r), so the hole is never smaller than requested.
    edge_planes: list[tuple[float, float, float]] = []
    for i in range(sides):
        ang = 2.0 * math.pi * (i + 0.5) / sides
        nx_, ny_ = math.cos(ang), math.sin(ang)
        edge_planes.append((nx_, ny_, -(nx_ * cx + ny_ * cy) - r))
    for i, (nx_, ny_, d_) in enumerate(edge_planes):
        piece = _plane_clip_trimesh(core, nx_, ny_, 0.0, d_, keep_sign=1)
        for j in range(i):
            if not piece.verts:
                break
            pnx, pny, pd = edge_planes[j]
            piece = _plane_clip_trimesh(piece, pnx, pny, 0.0, pd, keep_sign=-1)
        parts.append(piece)

    result = _merge_trimeshes(parts)
    return result if result.verts else mesh


def _add_annulus_ring(
    mesh: TriMesh, x: float, y: float, r_in: float, r_out: float, z: float, *, segments: int = 28
) -> None:
    """Horizontal ring surface (counterbore shoulder), facing up."""
    if r_out <= r_in or r_in < 0.0:
        return
    inner: list[int] = []
    outer: list[int] = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        ca, sa = math.cos(angle), math.sin(angle)
        inner.append(mesh.add_vertex((x + ca * r_in, y + sa * r_in, z)))
        outer.append(mesh.add_vertex((x + ca * r_out, y + sa * r_out, z)))
    for index in range(segments):
        nxt = (index + 1) % segments
        mesh.add_quad(inner[index], inner[nxt], outer[nxt], outer[index])


def _subtract_box_column(mesh: TriMesh, x0: float, x1: float, y0: float, y1: float) -> TriMesh:
    """Remove the vertical rectangular column x∈[x0,x1], y∈[y0,y1] (all Z) from a
    mesh — a real geometric Cut slot that works on coarse meshes too.

    Unlike a centroid test (which removes nothing when no triangle centroid
    happens to fall inside the slot), this clips the mesh against the four slot
    boundary planes and keeps only the material OUTSIDE the column: the left
    slab (x≤x0), the right slab (x≥x1), and the front/back slabs within the slot
    width (y≤y0 / y≥y1). Uses the same plane clipper as Split, so it lands in the
    exact frame the user drew in.
    """
    if not mesh.verts or x1 <= x0 or y1 <= y0:
        return mesh

    left = _plane_clip_trimesh(mesh, 1.0, 0.0, 0.0, -x0, keep_sign=-1)   # x ≤ x0
    right = _plane_clip_trimesh(mesh, 1.0, 0.0, 0.0, -x1, keep_sign=1)   # x ≥ x1
    mid = _plane_clip_trimesh(mesh, 1.0, 0.0, 0.0, -x0, keep_sign=1)     # x ≥ x0
    mid = _plane_clip_trimesh(mid, 1.0, 0.0, 0.0, -x1, keep_sign=-1)     # x ≤ x1
    front = _plane_clip_trimesh(mid, 0.0, 1.0, 0.0, -y0, keep_sign=-1)   # y ≤ y0
    back = _plane_clip_trimesh(mid, 0.0, 1.0, 0.0, -y1, keep_sign=1)     # y ≥ y1

    result = TriMesh()
    for part in (left, right, front, back):
        if not part.verts:
            continue
        base = len(result.verts)
        result.verts.extend(part.verts)
        for (a, b, c) in part.tris:
            result.tris.append((a + base, b + base, c + base))
    return result if result.verts else mesh


def cut_object_by_line(
    session: Session,
    obj: CadObject,
    center_xy: list[float],
    size_xy: list[float],
) -> list[str]:
    """Cut a rectangular slot of material out of the selected object.

    The "Cut slot" tool removes the dragged area entirely (a through-pocket),
    rather than splitting the body into two parts. For parametric primitives the
    cut is stored as a custom cutout so it survives later resizes; mesh bodies
    (imported, split parts, raw/template) are cut geometrically in place.
    """
    width = abs(float(size_xy[0])) if len(size_xy) > 0 else 0.0
    depth = abs(float(size_xy[1])) if len(size_xy) > 1 else 0.0
    if max(width, depth) < 1.0:
        return ["cut skipped: drag a larger area to remove"]

    shape = obj.get("shape")
    if not isinstance(shape, TriMesh) or not shape.verts:
        return ["cut skipped: shape not available for this object type"]

    transform: Transform = obj["transform"]
    sx = max(0.001, float(transform.scale[0]))
    sy = max(0.001, float(transform.scale[1]))
    local_x = (float(center_xy[0]) - float(transform.position[0])) / sx
    local_y = (float(center_xy[1]) - float(transform.position[1])) / sy
    local_w = width / sx
    local_d = depth / sy

    params = obj["parameters"]
    is_mesh_body = (
        obj.get("imported_source_mesh")
        or obj.get("primitive") in ("imported_source_mesh", "manual", None, "")
        or not obj.get("manual")
    )

    if is_mesh_body:
        # Imported / split / raw mesh — geometrically remove the slot column from
        # the current mesh so it lands exactly where the user drew it, then bake
        # the result so a later rebuild (resize) keeps the cut instead of
        # re-growing a solid body.
        x0, x1 = local_x - local_w / 2.0, local_x + local_w / 2.0
        y0, y1 = local_y - local_d / 2.0, local_y + local_d / 2.0
        cut_shape = _subtract_box_column(shape, x0, x1, y0, y1)
        obj["shape"] = shift_mesh_to_buildplate(cut_shape)
        if obj.get("imported_source_mesh") or obj.get("primitive") == "imported_source_mesh":
            obj["source_original_shape"] = deepcopy(obj["shape"])
    else:
        # Parametric primitive — store the cutout so rebuild re-applies it and it
        # survives later dimension changes.
        index = max(0, int(params.get("custom_cutout_count", 0.0)))
        params[f"custom_cutout_{index}_x"] = local_x
        params[f"custom_cutout_{index}_y"] = local_y
        params[f"custom_cutout_{index}_width"] = local_w
        params[f"custom_cutout_{index}_depth"] = local_d
        params["custom_cutout_count"] = float(index + 1)
        rebuild_manual_object(obj)

    obj.setdefault("operation_history", []).append(
        {"operation": "cut_slot", "x": local_x, "y": local_y, "width": local_w, "depth": local_d}
    )
    return [f"cut a {local_w:.0f}×{local_d:.0f}mm slot out of '{obj.get('name', 'part')}'"]


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
            "printer": "choose_printer",
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


def get_or_create_empty_session(session_id: str | None) -> Session:
    """Return an existing session, or create one with NO default geometry.

    Unlike :func:`get_or_create_session`, this never seeds a default part.
    It is used by endpoints such as printer selection that must leave an
    empty build plate empty — selecting a printer should never fabricate or
    resurrect model geometry.
    """
    sid = (session_id or "").strip()
    with _lock:
        if sid and sid in _sessions:
            return _sessions[sid]
        new_sid = sid or str(uuid.uuid4())
        _sessions[new_sid] = {
            "session_id": new_sid,
            "objects": {},
            "object_order": [],
            "selected_object_id": "",
            "edit_history": [],
            "version": 0,
            "printer": "choose_printer",
            "fit": True,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "scene_token": _new_scene_token(),
            "undo_stack": [],
            "redo_stack": [],
        }
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


def is_reset_prompt(prompt: str) -> bool:
    """'Delete everything and start again', 'start over', 'clear the plate'…

    Real testers typed these and were (rightly) annoyed that nothing happened."""
    text = (prompt or "").strip().lower()
    # Only unambiguous whole-plate phrasings. Deliberately NOT bare "all":
    # "remove all the holes" is a feature edit, not a reset.
    return bool(
        re.search(
            r"\b(?:delete|remove|clear|rensa|ta bort)\b.{0,12}\b(?:everything|allt|allting|alltihop)\b"
            r"|\bstart\s*(?:over|again|fresh|from scratch)\b"
            r"|\bb[oö]rja\s*om\b"
            r"|\bclear\s+the\s+(?:plate|scene|workspace)\b",
            text,
        )
    )


def clear_all_objects(session: Session) -> int:
    """Remove every object from the plate. Returns how many were removed."""
    count = len(session["object_order"])
    session["objects"] = {}
    session["object_order"] = []
    session["selected_object_id"] = ""
    session["source_files"] = []
    session["source_info"] = []
    session["_source_mesh_cache"] = {}
    return count


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
