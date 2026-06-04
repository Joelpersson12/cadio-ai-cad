"""AI command parser using GPT-4o for natural-language CAD editing."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from backend.models.schema import Feature, Transform
from backend.services.session_manager import CadObject, Session

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

SYSTEM_PROMPT = """You are a CAD assistant that converts natural language into parametric 3D model changes.

You control a parametric CAD engine with these parameters (all in millimeters):
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

Available features (set enabled true/false):
- base_extrude: flat base plate
- back_support: angled back support
- fillet_edges: rounded edges
- chamfer_edges: chamfered edges
- mount_holes: mounting holes

Common object dimensions to use as reference:
- Phone stand: width=80, depth=70, height=120, thickness=8, angle=70
- Tablet stand: width=200, depth=90, height=160, thickness=10, angle=65
- Laptop stand: width=280, depth=200, height=200, thickness=12, angle=60
- Business card holder: width=100, depth=60, height=80, thickness=5, angle=75
- Cable organizer: width=60, depth=40, height=30, thickness=4, angle=90
- Headphone stand: width=120, depth=120, height=200, thickness=8, angle=90
- Plant pot holder: width=130, depth=130, height=140, thickness=5, angle=90
- Pen holder: width=70, depth=70, height=100, thickness=4, angle=90
- Monitor stand: width=300, depth=200, height=100, thickness=15, angle=90
- Shelf bracket: width=150, depth=150, height=20, thickness=10, angle=90

Return ONLY a valid JSON object with these keys:
{
  "parameters": {"width": 80, "height": 120, ...},
  "features": [{"id": "base_extrude", "type": "base_extrude", "enabled": true}, ...],
  "transform": {},
  "actions": ["description of what changed"]
}

Rules:
- Always include ALL features in the features array
- Use realistic dimensions based on the object type
- Return ONLY raw JSON, no markdown, no explanation
- For modifications like "taller", adjust the relevant parameter by 20-30%
- For new objects, use the reference dimensions above as starting point
"""


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
    """Parse a natural-language prompt using GPT-4o into CAD changes."""
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

    current_transform = {
        "position": transform.position,
        "rotation": transform.rotation,
        "scale": transform.scale,
    }

    # Call GPT-4o
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
        # Reset all features first then apply GPT result
        features = []
        for feat in feat_list:
            features.append(Feature(
                id=feat.get("id", feat.get("type", "")),
                type=feat.get("type", ""),
                enabled=bool(feat.get("enabled", True)),
            ))

    # Apply transform changes
    t = result.get("transform", {})
    if "position" in t and len(t["position"]) == 3:
        transform.position = [float(v) for v in t["position"]]
    if "rotation" in t and len(t["rotation"]) == 3:
        transform.rotation = [float(v) for v in t["rotation"]]
    if "scale" in t and len(t["scale"]) == 3:
        transform.scale = [max(0.001, float(v)) for v in t["scale"]]

    actions = result.get("actions", ["no-op"])

    return {
        "parameters": params,
        "feature_tree": features,
        "transform": transform,
        "actions": actions,
    }