"""AI command parser using GPT-4o for natural-language CAD editing."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from backend.models.schema import Feature, Transform
from backend.services.session_manager import CadObject, Session

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

SYSTEM_PROMPT = """You are a CAD assistant that converts natural language into CAD parameter changes.

Given the current object parameters and a user prompt, return ONLY a valid JSON object with these keys:
- parameters: object with any of these keys to update:
  width, height, depth, thickness, fillet_radius, chamfer_size, hole_count, angle
- features: list of objects with {id, type, enabled} — supported types:
  mount_holes, fillet_edges, chamfer_edges, mirror
- transform: object with optional position [x,y,z], rotation [x,y,z], scale [x,y,z]
- actions: list of strings describing what was done

Rules:
- Only include keys that should change
- All dimensions are in millimeters
- Return ONLY raw JSON, no markdown, no explanation
- If nothing matches, return {"parameters": {}, "features": [], "transform": {}, "actions": ["no-op"]}
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
User instruction: {prompt}"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.1,
            max_tokens=500,
        )

        raw = response.choices[0].message.content or "{}"
        # Strip markdown if model adds it
        raw = re.sub(r"```json|```", "", raw).strip()
        return json.loads(raw)

    except Exception as e:
        print(f"GPT error: {e}")
        return {"parameters": {}, "features": [], "transform": {}, "actions": ["ai-error"]}


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
    for key, value in result.get("parameters", {}).items():
        params[key] = float(value)

    # Apply feature changes
    for feat in result.get("features", []):
        _ensure_feature(features, feat.get("type", ""), feat.get("enabled", True))

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