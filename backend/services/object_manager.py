"""High-level object operations: duplicate, transform, scene serialization.

This module sits between the raw session store and the API routes,
providing the business logic for object manipulation and scene payload
construction.
"""

from __future__ import annotations

from typing import Any

from backend.models.schema import (
    CadObjectOut,
    Feature,
    MeshPayload,
    PrintAssistantResult,
    ScenePayload,
    Transform,
)
from backend.services.cad_engine import (
    apply_transform,
    bounding_box,
    tessellate,
)
from backend.services.session_manager import (
    CadObject,
    Session,
    add_object,
    create_object,
    get_selected_object,
    rebuild_object,
)

# ---------------------------------------------------------------------------
# Printer profiles (shared constant)
# ---------------------------------------------------------------------------

PRINTERS: dict[str, dict[str, Any]] = {
    "adventurer_3": {
        "name": "Flashforge Adventurer 3",
        "build_volume": (150, 150, 150),
    },
    "adventurer_5m": {
        "name": "Flashforge Adventurer 5M",
        "build_volume": (220, 220, 250),
    },
    "creator_pro_2": {
        "name": "Flashforge Creator Pro 2",
        "build_volume": (200, 148, 150),
    },
    "bambu_x1c": {"name": "Bambu Lab X1C", "build_volume": (256, 256, 256)},
    "bambu_p1s": {"name": "Bambu Lab P1S", "build_volume": (256, 256, 256)},
    "bambu_a1": {"name": "Bambu Lab A1", "build_volume": (256, 256, 256)},
    "ender_3": {"name": "Creality Ender 3", "build_volume": (220, 220, 250)},
    "creality_k1": {"name": "Creality K1", "build_volume": (220, 220, 250)},
    "prusa_mk4": {"name": "Prusa MK4", "build_volume": (250, 210, 220)},
    "prusa_xl": {"name": "Prusa XL", "build_volume": (360, 360, 360)},
    "prusa_mini": {"name": "Prusa Mini+", "build_volume": (180, 180, 180)},
    "bambu_a1_mini": {"name": "Bambu Lab A1 Mini", "build_volume": (180, 180, 180)},
    "bambu_p1p": {"name": "Bambu Lab P1P", "build_volume": (256, 256, 256)},
    "creality_k1_max": {"name": "Creality K1 Max", "build_volume": (300, 300, 300)},
    "creality_ender_3_v3": {"name": "Creality Ender-3 V3", "build_volume": (220, 220, 250)},
    "creality_ender_5_plus": {"name": "Creality Ender-5 Plus", "build_volume": (350, 350, 400)},
    "anycubic_kobra_2": {"name": "Anycubic Kobra 2", "build_volume": (220, 220, 250)},
    "anycubic_kobra_2_max": {"name": "Anycubic Kobra 2 Max", "build_volume": (420, 420, 500)},
    "anycubic_vyper": {"name": "Anycubic Vyper", "build_volume": (245, 245, 260)},
    "elegoo_neptune_4": {"name": "Elegoo Neptune 4", "build_volume": (225, 225, 265)},
    "elegoo_neptune_4_max": {"name": "Elegoo Neptune 4 Max", "build_volume": (420, 420, 480)},
    "qidi_x_plus_3": {"name": "QIDI X-Plus 3", "build_volume": (280, 280, 270)},
    "qidi_x_max_3": {"name": "QIDI X-Max 3", "build_volume": (325, 325, 315)},
    "flashforge_ad5m_pro": {"name": "Flashforge Adventurer 5M Pro", "build_volume": (220, 220, 220)},
    "raise3d_pro3": {"name": "Raise3D Pro3", "build_volume": (300, 300, 300)},
    "ultimaker_s5": {"name": "UltiMaker S5", "build_volume": (330, 240, 300)},
    "snapmaker_j1": {"name": "Snapmaker J1", "build_volume": (300, 200, 200)},
    "voron_24_300": {"name": "Voron 2.4 300", "build_volume": (300, 300, 280)},
    "voron_24_350": {"name": "Voron 2.4 350", "build_volume": (350, 350, 330)},
}

DEFAULT_PRINTER = "adventurer_3"


# ---------------------------------------------------------------------------
# Mesh generation for a single object
# ---------------------------------------------------------------------------


def mesh_for_object(obj: CadObject) -> MeshPayload:
    """Tessellate the object's local shape.

    The frontend applies object transforms interactively.  Export and scene
    bounds still apply transforms server-side where needed.
    """
    return tessellate(obj["shape"])


# ---------------------------------------------------------------------------
# Scene bounds
# ---------------------------------------------------------------------------


def scene_bounds(session: Session) -> dict[str, float]:
    """Compute the axis-aligned bounding box of the entire scene."""
    if not session["object_order"]:
        return {"x": 0.0, "y": 0.0, "z": 0.0}

    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3

    for oid in session["object_order"]:
        obj = session["objects"][oid]
        transformed = apply_transform(obj["shape"], obj["transform"])
        bb = bounding_box(transformed)
        # bounding_box returns dimensions; we need to track actual extents
        # For simplicity, use the dimension-based approach
        for i, key in enumerate(["x", "y", "z"]):
            half = bb[key] / 2.0
            mins[i] = min(mins[i], -half)
            maxs[i] = max(maxs[i], half)

    return {
        "x": maxs[0] - mins[0],
        "y": maxs[1] - mins[1],
        "z": maxs[2] - mins[2],
    }


# ---------------------------------------------------------------------------
# Auto-fit to printer build volume
# ---------------------------------------------------------------------------


def auto_fit_session(session: Session) -> None:
    """Scale all objects so the scene fits the selected printer."""
    printer_key = session.get("printer", DEFAULT_PRINTER)
    printer = PRINTERS.get(printer_key, PRINTERS[DEFAULT_PRINTER])
    px, py, pz = printer["build_volume"]

    max_ratio = 0.0
    for oid in session["object_order"]:
        obj = session["objects"][oid]
        transformed = apply_transform(obj["shape"], obj["transform"])
        bb = bounding_box(transformed)
        max_ratio = max(max_ratio, bb["x"] / px, bb["y"] / py, bb["z"] / pz)

    if max_ratio > 1.0:
        scale_factor = 1.0 / max_ratio
        for oid in session["object_order"]:
            obj = session["objects"][oid]
            t: Transform = obj["transform"]
            t.position = [v * scale_factor for v in t.position]
            t.scale = [v * scale_factor for v in t.scale]


# ---------------------------------------------------------------------------
# Duplicate object
# ---------------------------------------------------------------------------


def duplicate_object(session: Session, source_id: str | None = None) -> CadObject:
    """Duplicate the selected (or specified) object, offset to the right."""
    src = (
        session["objects"].get(source_id) if source_id else get_selected_object(session)
    )
    if src is None:
        src = get_selected_object(session)

    new_obj = create_object(f"{src['name']}_copy")
    new_obj["parameters"] = dict(src["parameters"])
    new_obj["feature_tree"] = [Feature(**f.model_dump()) for f in src["feature_tree"]]

    src_transform: Transform = src["transform"]
    new_obj["transform"] = Transform(
        position=[
            src_transform.position[0] + 20.0,
            src_transform.position[1],
            src_transform.position[2],
        ],
        rotation=list(src_transform.rotation),
        scale=list(src_transform.scale),
    )
    rebuild_object(new_obj)
    add_object(session, new_obj)
    session["selected_object_id"] = new_obj["id"]
    return new_obj


# ---------------------------------------------------------------------------
# Scene payload builder
# ---------------------------------------------------------------------------


def build_scene_payload(
    session: Session,
    include_mesh: bool = False,
    model_updated: bool = False,
) -> ScenePayload:
    """Serialize the full session state into a ScenePayload for the frontend."""
    from backend.services.print_analysis import analyze_printability

    objects_out: list[CadObjectOut] = []
    for oid in session["object_order"]:
        obj = session["objects"][oid]
        mesh = mesh_for_object(obj) if include_mesh else None
        t: Transform = obj["transform"]
        objects_out.append(
            CadObjectOut(
                id=obj["id"],
                name=obj["name"],
                parameters=obj["parameters"],
                feature_tree=[
                    f if isinstance(f, Feature) else Feature(**f)
                    for f in obj["feature_tree"]
                ],
                transform=Transform(
                    position=list(t.position),
                    rotation=list(t.rotation),
                    scale=list(t.scale),
                ),
                material=str(obj.get("material", "PLA")),
                color=str(obj.get("color", "#4fc3f7")),
                mesh=mesh,
            )
        )

    pa = analyze_printability(session)
    bounds = scene_bounds(session)

    return ScenePayload(
        session_id=session["session_id"],
        version=session["version"],
        selected_object_id=session["selected_object_id"],
        objects=objects_out,
        object_order=session["object_order"],
        bounds=bounds,
        printer=session.get("printer", DEFAULT_PRINTER),
        scene_token=session.get("scene_token", ""),
        print_assistant=pa,
        printability_score=pa.printability_score,
        edit_history=session["edit_history"][-30:],
        updated_at=session.get("updated_at", ""),
        model_updated=model_updated,
    )
