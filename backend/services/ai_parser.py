"""AI command parser for natural-language CAD editing instructions.

Parses user prompts into concrete parameter mutations, feature toggles,
and transform changes.  Designed to be extended with LLM integration
in the future while providing deterministic rule-based parsing now.
"""

from __future__ import annotations

import re
from typing import Any

from backend.models.schema import Feature, Transform
from backend.services.session_manager import CadObject, Session


def _ensure_feature(
    features: list[Feature],
    feature_type: str,
    enabled: bool = True,
) -> None:
    """Enable or add a feature in the feature tree."""
    for f in features:
        if f.type == feature_type:
            f.enabled = enabled
            return
    features.append(Feature(id=feature_type, type=feature_type, enabled=enabled))


def parse_ai_command(
    prompt: str,
    session: Session,
    obj: CadObject,
) -> dict[str, Any]:
    """Parse a natural-language prompt into parameter/feature/transform changes.

    Returns a dict with keys: parameters, feature_tree, transform, actions.
    """
    p = (prompt or "").strip().lower()
    params = dict(obj["parameters"])
    features = [
        f if isinstance(f, Feature) else Feature(**f) for f in obj["feature_tree"]
    ]
    src_transform: Transform = obj["transform"]
    transform = Transform(
        position=list(src_transform.position),
        rotation=list(src_transform.rotation),
        scale=list(src_transform.scale),
    )
    actions: list[str] = []

    # --- Thickness / strength ---
    if "make thicker" in p or "thicker" in p or "strengthen" in p:
        params["thickness"] = min(30.0, params.get("thickness", 8.0) + 2.0)
        actions.append("increase thickness")

    # --- Size reduction ---
    if "reduce size" in p or "smaller" in p:
        for key in ("width", "depth", "height"):
            params[key] = max(20.0, params.get(key, 80.0) * 0.9)
        actions.append("reduce size")

    # --- Size increase ---
    if "bigger" in p or "larger" in p or "increase size" in p:
        for key in ("width", "depth", "height"):
            params[key] = params.get(key, 80.0) * 1.15
        actions.append("increase size")

    # --- Resize with explicit dimensions ---
    width_match = re.search(r"width\s*[=:]\s*(\d+(?:\.\d+)?)", p)
    if width_match:
        params["width"] = max(10.0, float(width_match.group(1)))
        actions.append("set width")
    height_match = re.search(r"height\s*[=:]\s*(\d+(?:\.\d+)?)", p)
    if height_match:
        params["height"] = max(20.0, float(height_match.group(1)))
        actions.append("set height")
    depth_match = re.search(r"depth\s*[=:]\s*(\d+(?:\.\d+)?)", p)
    if depth_match:
        params["depth"] = max(10.0, float(depth_match.group(1)))
        actions.append("set depth")

    # --- Holes ---
    if "add holes" in p or "holes" in p:
        _ensure_feature(features, "mount_holes", True)
        params["hole_count"] = max(params.get("hole_count", 0.0), 2.0)
        hole_count_match = re.search(r"(\d+)\s*holes?", p)
        if hole_count_match:
            params["hole_count"] = float(hole_count_match.group(1))
        actions.append("add holes")

    # --- Fillet ---
    if "fillet" in p or "round corners" in p or "round edges" in p:
        _ensure_feature(features, "fillet_edges", True)
        params["fillet_radius"] = max(1.0, params.get("fillet_radius", 2.0))
        fillet_match = re.search(r"fillet\s*(?:radius)?\s*[=:]\s*(\d+(?:\.\d+)?)", p)
        if fillet_match:
            params["fillet_radius"] = float(fillet_match.group(1))
        actions.append("add fillet")

    # --- Chamfer ---
    if "chamfer" in p:
        _ensure_feature(features, "chamfer_edges", True)
        params["chamfer_size"] = max(0.8, params.get("chamfer_size", 0.0))
        chamfer_match = re.search(r"chamfer\s*(?:size)?\s*[=:]\s*(\d+(?:\.\d+)?)", p)
        if chamfer_match:
            params["chamfer_size"] = float(chamfer_match.group(1))
        actions.append("add chamfer")

    # --- Mirror ---
    if "mirror" in p:
        _ensure_feature(features, "mirror", True)
        actions.append("mirror geometry")

    # --- Print optimization ---
    if "optimize for printing" in p or "optimize print" in p:
        params["thickness"] = max(6.0, params.get("thickness", 8.0))
        params["angle"] = min(75.0, max(55.0, params.get("angle", 70.0)))
        actions.append("optimize printing")

    # --- Material reduction ---
    if "reduce material" in p or "less material" in p:
        params["thickness"] = max(2.0, params.get("thickness", 8.0) - 1.0)
        _ensure_feature(features, "mount_holes", True)
        params["hole_count"] = max(params.get("hole_count", 0.0), 2.0)
        actions.append("reduce material")

    # --- Movement ---
    if "move" in p and "left" in p:
        amount = 10.0
        move_match = re.search(r"move\s+(?:object\s+)?left\s+(\d+(?:\.\d+)?)", p)
        if move_match:
            amount = float(move_match.group(1))
        transform.position[0] -= amount
        actions.append("move left")

    if "move" in p and "right" in p:
        amount = 10.0
        move_match = re.search(r"move\s+(?:object\s+)?right\s+(\d+(?:\.\d+)?)", p)
        if move_match:
            amount = float(move_match.group(1))
        transform.position[0] += amount
        actions.append("move right")

    if "move" in p and ("up" in p or "higher" in p):
        amount = 10.0
        move_match = re.search(r"move\s+(?:object\s+)?up\s+(\d+(?:\.\d+)?)", p)
        if move_match:
            amount = float(move_match.group(1))
        transform.position[2] += amount
        actions.append("move up")

    if "move" in p and ("down" in p or "lower" in p):
        amount = 10.0
        move_match = re.search(r"move\s+(?:object\s+)?down\s+(\d+(?:\.\d+)?)", p)
        if move_match:
            amount = float(move_match.group(1))
        transform.position[2] -= amount
        actions.append("move down")

    if "center" in p and "object" in p:
        transform.position = [0.0, 0.0, transform.position[2]]
        actions.append("center object")

    # --- Rotation ---
    if "rotate" in p:
        angle = 90.0
        rot_match = re.search(r"rotate\s+(\d+(?:\.\d+)?)", p)
        if rot_match:
            angle = float(rot_match.group(1))
        if "x" in p:
            transform.rotation[0] += angle
            actions.append(f"rotate X {angle}")
        elif "y" in p:
            transform.rotation[1] += angle
            actions.append(f"rotate Y {angle}")
        else:
            transform.rotation[2] += angle
            actions.append(f"rotate Z {angle}")

    if not actions:
        actions.append("no-op")

    return {
        "parameters": params,
        "feature_tree": features,
        "transform": transform,
        "actions": actions,
    }
