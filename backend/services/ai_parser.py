"""AI command parser using GPT-4o for natural-language CAD editing."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from backend.models.schema import Feature, Transform
from backend.services.prompt_translation import normalize_source_query
from backend.services.session_manager import CadObject, Session

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

CREATE_PATTERNS = (
    r"\b(create|generate|build|design)\b",
    r"\bmake\s+(a|an|one)\b",
    r"\b(skapa|generera|bygg|rita)\b",
    r"\bgor\s+(en|ett|a|an)\b",
    r"\bgör\s+(en|ett)\b",
)

EDIT_PATTERNS = (
    r"\b(add|remove|delete|change|modify|edit|increase|decrease|resize|scale|rotate|move)\b",
    r"\b(make it|taller|wider|thicker|thinner|rounded|fillet|chamfer|extrude|shell|mirror|holes?)\b",
    r"\b(lagg till|ta bort|andra|redigera|flytta|rotera|skala|hal|rund|fasa|tjockare|bredare|hogre)\b",
    r"\b(lägg till|ta bort|ändra|redigera|flytta|rotera|skala|hål|rund|fasa|tjockare|bredare|högre)\b",
    r"\bgor\s+(den|det)\b",
    r"\bgör\s+(den|det)\b",
)


def _prompt_match_text(prompt: str) -> str:
    translated = normalize_source_query(prompt)
    return f"{prompt} {translated}".strip().lower()


def is_new_model_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    return any(re.search(pattern, text) for pattern in CREATE_PATTERNS)


def is_edit_only_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    has_edit = any(re.search(pattern, text) for pattern in EDIT_PATTERNS)
    return has_edit and not is_new_model_prompt(text)


def is_mounting_hole_edit(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    if not is_edit_only_prompt(text):
        return False
    return any(
        phrase in text
        for phrase in (
            "mounting hole",
            "mounting holes",
            "add holes",
            "holes",
            "screw holes",
            "hål",
            "skruvhål",
            "monteringshål",
        )
    )


def parse_hole_edit(prompt: str) -> dict[str, float]:
    text = _prompt_match_text(prompt)
    count_match = re.search(r"\b([2-4])\s*(?:x\s*)?(?:mounting\s*)?(?:holes?|hål)\b", text)
    diameter_match = re.search(r"\b(\d+(?:\.\d+)?)\s*mm\s*(?:holes?|hål|screw|skruv)", text)
    counterbore_match = re.search(r"\b(?:counterbore|sänka|försänkning)\s*(\d+(?:\.\d+)?)\s*mm", text)
    return {
        "count": float(count_match.group(1)) if count_match else 2.0,
        "diameter": float(diameter_match.group(1)) if diameter_match else 5.0,
        "counterbore_diameter": float(counterbore_match.group(1)) if counterbore_match else 9.0,
    }

SYSTEM_PROMPT = """You are a professional CAD assistant that converts natural language into realistic 3D model parameters.

Your role: Create practical, printable objects with appropriate dimensions and structural features.

You control a parametric CAD engine with these dimensions (all in millimeters):
- width: overall width (10-500mm)
- depth: overall depth (10-500mm)  
- height: overall height (20-500mm)
- thickness: wall/base thickness (2-30mm)
- angle: tilt angle in degrees (25-85)
- fillet_radius: corner rounding radius (0-20mm)
- chamfer_size: chamfer size (0-10mm)
- hole_count: number of mounting holes (0-8)
- hole_diameter: hole diameter (1-20mm)
- wall_thickness: wall thickness (1-20mm)

Available structural features (set enabled true/false):
- base_extrude: solid base plate for stability
- back_support: angled rear support for tilt
- fillet_edges: smooth rounded edges (safe to print)
- chamfer_edges: beveled edges (alternative to fillet)
- mount_holes: attachment points for assembly
- mirror: duplicate geometry mirrored across center

IMPORTANT REFERENCE DIMENSIONS (realistic printable objects):
- Phone stand: w=80, d=70, h=120, thickness=8, angle=70 (stable diagonal)
- Tablet stand: w=200, d=90, h=160, thickness=10, angle=65 (strong support)
- Laptop stand: w=280, d=200, h=200, thickness=12, angle=60 (heavy load)
- Business card holder: w=100, d=60, h=80, thickness=5, angle=75
- Cable organizer: w=60, d=40, h=30, thickness=4, angle=90 (flat)
- Headphone stand: w=120, d=120, h=200, thickness=8, angle=90 (vertical)
- Plant pot holder: w=130, d=130, h=140, thickness=5, angle=90
- Pen holder: w=70, d=70, h=100, thickness=4, angle=90
- Monitor stand: w=300, d=200, h=100, thickness=15, angle=90 (flat base)
- Shelf bracket: w=150, d=150, h=20, thickness=10, angle=90 (wall mount)
- Desk organizer: w=150, d=100, h=120, thickness=6, angle=90
- Phone charging dock: w=80, d=60, h=100, thickness=6, angle=45
- AirPod holder: w=60, d=50, h=40, thickness=4, angle=90
- Watch stand: w=70, d=70, h=50, thickness=4, angle=75
- Keyboard tilt: w=350, d=150, h=80, thickness=8, angle=15
- Power-tool battery holder: w=104, d=92, h=46, thickness=7, 2 mounting holes, slide rails
- CDI/ECU/electronics holder: w=86, d=68, h=38, thickness=5, 2 mounting holes, low tray walls

QUALITY RULES for realistic objects:
1. Always enable base_extrude for stability
2. Use fillet_edges for smooth, printable surfaces (most common)
3. Thickness: 4mm minimum for strength, 8-12mm for heavy objects
4. Angles: 60-75° most natural for supporting objects
5. Proportions: Keep aspect ratios reasonable (not too tall/thin)
6. Dimensions: Most prints fit in 150-300mm range
7. Enable features based on object purpose (support=back_support, assembly=mount_holes)

Return ONLY a valid JSON object:
{
  "parameters": {"width": 80, "height": 120, "thickness": 8, ...},
  "features": [{"id": "base_extrude", "type": "base_extrude", "enabled": true}, ...],
  "transform": {},
  "actions": ["description of what changed"]
}

MUST INCLUDE:
- All parameters (complete dict)
- All 6 features in features array
- Realistic dimensions matching object type
- Enabled features that make sense for the object

MUST NOT:
- Create unrealistic dimensions (too thin, too tall, too small)
- Forget to enable base_extrude
- Use only chamfer without fillet (use fillet by default)
- Return incomplete JSON or non-JSON text
"""


def _coerce_feature(feature: Any) -> Feature:
    """Normalize template/GPT feature values into the API schema."""
    if isinstance(feature, Feature):
        return feature
    if isinstance(feature, str):
        return Feature(id=feature, type=feature, enabled=True)
    if isinstance(feature, dict):
        feature_type = str(feature.get("type") or feature.get("id") or "")
        return Feature(
            id=str(feature.get("id") or feature_type),
            type=feature_type,
            enabled=bool(feature.get("enabled", True)),
        )
    if hasattr(feature, "model_dump"):
        return _coerce_feature(feature.model_dump())
    raise TypeError(f"Unsupported feature value: {feature!r}")


def _external_design_signals(prompt: str, params: dict[str, float]) -> list[str]:
    """Use ranked external metadata as inspiration signals, never source geometry."""
    try:
        from backend.services.design_providers import get_provider_registry

        examples = get_provider_registry().search_all(prompt, limit=6)
    except Exception:
        return []

    if not examples:
        return []

    title_text = " ".join(ex.title.lower() for ex in examples)

    # Conservative, explainable parameter nudges from clear design patterns.
    if any(word in title_text for word in ("heavy", "stable", "sturdy", "practical")):
        params["depth"] = max(params.get("depth", 75.0), 82.0)
        params["thickness"] = max(params.get("thickness", 6.0), 7.0)
    if any(word in title_text for word in ("adjustable", "foldable")):
        params["angle"] = min(72.0, max(params.get("angle", 65.0), 68.0))
    if any(word in title_text for word in ("thin", "credit card", "card")):
        params["thickness"] = max(5.0, min(params.get("thickness", 6.0), 6.0))
    if any(word in title_text for word in ("pillow", "soft", "rounded")):
        params["fillet_radius"] = max(params.get("fillet_radius", 2.0), 4.0)
    if any(word in title_text for word in ("magsafe", "charging", "charger", "dock")):
        params["depth"] = max(params.get("depth", 75.0), 85.0)
        params["angle"] = min(params.get("angle", 68.0), 68.0)
    if any(word in title_text for word in ("dewalt", "makita", "milwaukee", "ryobi", "battery", "batteries")):
        params["width"] = max(params.get("width", 90.0), 104.0)
        params["depth"] = max(params.get("depth", 80.0), 92.0)
        params["height"] = max(params.get("height", 35.0), 46.0)
        params["thickness"] = max(params.get("thickness", 6.0), 7.0)
        params["hole_count"] = max(params.get("hole_count", 0.0), 2.0)
    if any(word in title_text for word in ("cdi", "ecu", "ecm", "ignition", "module", "bracket")):
        params["width"] = max(params.get("width", 70.0), 86.0)
        params["depth"] = max(params.get("depth", 55.0), 68.0)
        params["height"] = max(params.get("height", 28.0), 38.0)
        params["hole_count"] = max(params.get("hole_count", 0.0), 2.0)

    top = examples[:3]
    return [
        "external-inspiration: "
        + "; ".join(
            f"{ex.source}:{ex.title} ({ex.likes} likes, {ex.downloads} downloads)"
            for ex in top
        )
    ]


def _ensure_feature(
    features: list[Feature],
    feature_type: str,
    enabled: bool = True,
) -> None:
    for f in features:
        if f.type == feature_type:
            f.enabled = enabled
            return
    features.append(Feature(id=feature_type, type=feature_type, enabled=enabled))


def _apply_deterministic_edit(
    prompt: str,
    params: dict[str, float],
    features: list[Feature],
    transform: Transform,
) -> list[str]:
    """Handle common quick edits without relying on an external LLM."""
    text = _prompt_match_text(prompt)
    actions: list[str] = []

    def scale_param(key: str, factor: float, minimum: float = 0.0, maximum: float = 500.0) -> None:
        params[key] = max(minimum, min(maximum, float(params.get(key, 0.0)) * factor))

    if any(phrase in text for phrase in ("make it taller", "taller", "increase height", "hogre")):
        scale_param("height", 1.25, 20.0)
        actions.append("increased height")

    if any(phrase in text for phrase in ("make it wider", "wider", "increase width", "bredare")):
        scale_param("width", 1.25, 10.0)
        actions.append("increased width")

    if any(phrase in text for phrase in ("make it thicker", "thicker", "stronger", "heavy duty", "heavy-duty", "tjockare")):
        scale_param("thickness", 1.25, 2.0, 30.0)
        params["wall_thickness"] = max(float(params.get("wall_thickness", 3.0)), 4.0)
        actions.append("increased thickness")

    if any(phrase in text for phrase in ("rounded", "round corners", "fillet", "runda")):
        params["fillet_radius"] = max(float(params.get("fillet_radius", 2.0)), 4.0)
        _ensure_feature(features, "fillet_edges", True)
        _ensure_feature(features, "chamfer_edges", False)
        actions.append("enabled rounded corners")

    if any(phrase in text for phrase in ("mounting holes", "add holes", "holes", "screw holes")):
        params["hole_count"] = max(float(params.get("hole_count", 0.0)), 2.0)
        params["hole_diameter"] = max(float(params.get("hole_diameter", 5.0)), 5.0)
        _ensure_feature(features, "mount_holes", True)
        actions.append("enabled mounting holes")

    if "mirror" in text:
        _ensure_feature(features, "mirror", True)
        actions.append("enabled mirrored geometry")

    if any(phrase in text for phrase in ("optimize for printing", "optimise for printing", "printable")):
        params["thickness"] = max(float(params.get("thickness", 6.0)), 6.0)
        params["wall_thickness"] = max(float(params.get("wall_thickness", 3.0)), 3.0)
        params["angle"] = min(72.0, max(60.0, float(params.get("angle", 68.0))))
        _ensure_feature(features, "base_extrude", True)
        _ensure_feature(features, "fillet_edges", True)
        actions.append("optimized for printing")

    rotate_match = re.search(r"rotate\s+(-?\d+(?:\.\d+)?)", text)
    if rotate_match:
        transform.rotation[2] += float(rotate_match.group(1))
        actions.append(f"rotated {rotate_match.group(1)} degrees")

    if any(word in text for word in ("dewalt", "makita", "milwaukee", "ryobi", "battery holder", "battery mount")):
        if any(word in text for word in ("dual", "double", "two", "2x", "2 ")):
            params["battery_slots"] = 2.0
        else:
            params["battery_slots"] = max(float(params.get("battery_slots", 1.0)), 1.0)
        params["width"] = max(float(params.get("width", 104.0)), 104.0)
        params["depth"] = max(float(params.get("depth", 92.0)), 92.0)
        params["height"] = max(float(params.get("height", 46.0)), 46.0)
        params["thickness"] = max(float(params.get("thickness", 7.0)), 7.0)
        params["hole_count"] = max(float(params.get("hole_count", 0.0)), 2.0)
        params["hole_diameter"] = max(float(params.get("hole_diameter", 5.0)), 5.0)
        _ensure_feature(features, "mount_holes", True)
        actions.append("matched power-tool battery holder proportions")

    if any(word in text for word in ("cdi", "ecu", "ecm", "ignition module", "cr250r", "crf")):
        params["width"] = max(float(params.get("width", 86.0)), 86.0)
        params["depth"] = max(float(params.get("depth", 68.0)), 68.0)
        params["height"] = max(float(params.get("height", 38.0)), 38.0)
        params["thickness"] = max(float(params.get("thickness", 5.0)), 5.0)
        params["hole_count"] = max(float(params.get("hole_count", 0.0)), 2.0)
        params["hole_diameter"] = max(float(params.get("hole_diameter", 5.0)), 5.0)
        _ensure_feature(features, "mount_holes", True)
        actions.append("matched electronics holder proportions")

    return actions


def _apply_prompt_shape_inference(
    prompt: str,
    params: dict[str, float],
    features: list[Feature],
) -> list[str]:
    """Create a useful first sketch when no curated template exists yet."""
    text = _prompt_match_text(prompt)
    actions: list[str] = []

    if any(word in text for word in ("holder", "mount", "bracket", "clip", "retainer")):
        params["width"] = max(float(params.get("width", 70.0)), 86.0)
        params["depth"] = max(float(params.get("depth", 55.0)), 64.0)
        params["height"] = max(float(params.get("height", 24.0)), 34.0)
        params["thickness"] = max(float(params.get("thickness", 4.0)), 5.0)
        params["hole_count"] = max(float(params.get("hole_count", 0.0)), 2.0)
        params["hole_diameter"] = max(float(params.get("hole_diameter", 5.0)), 5.0)
        _ensure_feature(features, "base_extrude", True)
        _ensure_feature(features, "mount_holes", True)
        _ensure_feature(features, "back_support", False)
        actions.append("inferred generic holder/mount geometry from prompt")

    if any(word in text for word in ("case", "cover", "enclosure", "box", "housing", "shell")):
        params["width"] = max(float(params.get("width", 80.0)), 90.0)
        params["depth"] = max(float(params.get("depth", 65.0)), 70.0)
        params["height"] = max(float(params.get("height", 35.0)), 45.0)
        params["thickness"] = max(float(params.get("thickness", 3.0)), 4.0)
        params["wall_thickness"] = max(float(params.get("wall_thickness", 2.0)), 3.0)
        _ensure_feature(features, "base_extrude", True)
        _ensure_feature(features, "back_support", False)
        actions.append("inferred enclosure-style geometry from prompt")

    if any(word in text for word in ("spacer", "shim", "washer", "plate", "adapter")):
        params["width"] = max(float(params.get("width", 50.0)), 60.0)
        params["depth"] = max(float(params.get("depth", 40.0)), 45.0)
        params["height"] = min(max(float(params.get("height", 8.0)), 6.0), 18.0)
        params["thickness"] = params["height"]
        _ensure_feature(features, "base_extrude", True)
        _ensure_feature(features, "back_support", False)
        actions.append("inferred flat adapter/plate geometry from prompt")

    return actions


def _feature_tree_for_template(default_features: list[str]) -> list[Feature]:
    from backend.services.cad_engine import DEFAULT_FEATURE_TREE

    enabled = set(default_features)
    features = [_coerce_feature(f) for f in DEFAULT_FEATURE_TREE]
    for feature in features:
        feature.enabled = feature.type in enabled
    return features


def _apply_research_brief(
    brief: dict[str, Any] | None,
    params: dict[str, float],
    features: list[Feature],
) -> list[str]:
    """Apply a source-informed CAD brief to parameter defaults."""
    if not brief:
        return []

    for key, value in dict(brief.get("dimensions", {})).items():
        try:
            params[key] = float(value)
        except (TypeError, ValueError):
            continue

    brief_features = set(brief.get("features", []))
    _ensure_feature(features, "base_extrude", True)
    _ensure_feature(features, "fillet_edges", "rounded_edges" in brief_features or "soft_edges" in brief_features)
    _ensure_feature(features, "chamfer_edges", "chamfered_edges" in brief_features)
    _ensure_feature(features, "mount_holes", "mounting_holes" in brief_features)
    _ensure_feature(features, "back_support", "back_support" in brief_features)

    return list(brief.get("actions", []))


def _parse_with_gpt(prompt: str, current_params: dict, current_transform: dict) -> dict:
    """Call GPT-4o to parse the prompt into CAD changes."""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)

        user_message = f"""Current parameters: {json.dumps(current_params)}
Current transform: {json.dumps(current_transform)}
User instruction: {prompt}

Remember: return ONLY raw JSON, nothing else."""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.1,
            max_tokens=800,
        )

        raw = response.choices[0].message.content or "{}"
        raw = re.sub(r"```json|```", "", raw).strip()
        return json.loads(raw)

    except Exception as e:
        print(f"GPT error: {e}")
        return {
            "parameters": current_params,
            "features": [],
            "transform": {},
            "actions": [f"ai-error: {str(e)}"]
        }


def parse_ai_command(
    prompt: str,
    session: Session,
    obj: CadObject,
) -> dict[str, Any]:
    """Parse a natural-language prompt using GPT-4o into CAD changes.
    
    Now also uses product templates to generate more realistic objects.
    """
    from backend.services.product_templates import get_template_for_prompt
    
    edit_only = is_edit_only_prompt(prompt)
    # Detect if prompt is requesting a specific product template
    template = None if edit_only else get_template_for_prompt(prompt)
    
    # If template found, use template defaults as base
    if template:
        params = dict(template.default_params)
        # Preserve any user-set parameters that differ from template
        for key in obj["parameters"]:
            if key not in ["width", "depth", "height", "thickness", "angle", "hole_count"]:
                params[key] = obj["parameters"][key]
        
        features = _feature_tree_for_template(template.default_features)
        external_actions = _external_design_signals(prompt, params)
        
        obj["template_hint"] = template.name
        research_brief = None
        brief_actions: list[str] = []
    else:
        params = dict(obj["parameters"])
        features = [_coerce_feature(f) for f in obj["feature_tree"]]
        external_actions = [] if edit_only else _external_design_signals(prompt, params)
        if edit_only:
            research_brief = None
            brief_actions = []
        else:
            from backend.services.design_brief import build_design_brief

            research_brief = build_design_brief(prompt)
            brief_actions = _apply_research_brief(research_brief, params, features)
            obj["template_hint"] = None
    
    src_transform: Transform = obj["transform"]
    transform = Transform(
        position=list(src_transform.position),
        rotation=list(src_transform.rotation),
        scale=list(src_transform.scale),
    )

    current_transform = {
        "position": transform.position,
        "rotation": transform.rotation,
        "scale": transform.scale,
    }

    quick_actions = _apply_deterministic_edit(prompt, params, features, transform)
    uses_brief = bool(research_brief and research_brief.get("category") != "generic")
    inference_actions = [] if template or uses_brief else _apply_prompt_shape_inference(prompt, params, features)

    # Call GPT-4o for fine-tuning if not a direct template match
    if quick_actions or inference_actions or brief_actions:
        actions = brief_actions + quick_actions + inference_actions
    elif not template or "modify" in _prompt_match_text(prompt) or "change" in _prompt_match_text(prompt):
        result = _parse_with_gpt(prompt, params, current_transform)
        
        # Apply parameter changes
        new_params = result.get("parameters", {})
        if new_params:
            for key, value in new_params.items():
                try:
                    params[key] = float(value)
                except (TypeError, ValueError):
                    pass
        
        # Apply feature changes
        feat_list = result.get("features", [])
        if feat_list:
            features = [_coerce_feature(feat) for feat in feat_list]
        
        # Apply transform changes
        t = result.get("transform", {})
        if "position" in t and len(t["position"]) == 3:
            transform.position = [float(v) for v in t["position"]]
        if "rotation" in t and len(t["rotation"]) == 3:
            transform.rotation = [float(v) for v in t["rotation"]]
        if "scale" in t and len(t["scale"]) == 3:
            transform.scale = [max(0.001, float(v)) for v in t["scale"]]
        
        actions = result.get("actions", ["no-op"])
    else:
        # Use template directly
        actions = [f"Created {template.name}: {template.description}"]

    if external_actions:
        actions += external_actions

    return {
        "parameters": params,
        "feature_tree": features,
        "transform": transform,
        "actions": actions,
        "template": template.name if template else None,
        "research_brief": research_brief,
        "mode": "edit" if edit_only else "create",
    }
