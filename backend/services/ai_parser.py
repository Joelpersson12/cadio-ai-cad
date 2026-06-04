"""AI command parser using GPT-4o for natural-language CAD editing."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from backend.models.schema import Feature, Transform
from backend.services.session_manager import CadObject, Session

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

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
    """Parse a natural-language prompt using GPT-4o into CAD changes.
    
    Now also uses product templates to generate more realistic objects.
    """
    from backend.services.product_templates import get_template_for_prompt
    
    # Detect if prompt is requesting a specific product template
    template = get_template_for_prompt(prompt)
    
    # If template found, use template defaults as base
    if template:
        params = dict(template.default_params)
        # Preserve any user-set parameters that differ from template
        for key in obj["parameters"]:
            if key not in ["width", "depth", "height", "thickness", "angle", "hole_count"]:
                params[key] = obj["parameters"][key]
        
        features = [Feature(**f.model_dump() if hasattr(f, 'model_dump') else f) 
                   for f in template.default_features]
        
        obj["template_hint"] = template.name
    else:
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

    # Call GPT-4o for fine-tuning if not a direct template match
    if not template or "modify" in prompt.lower() or "change" in prompt.lower():
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
    else:
        # Use template directly
        actions = [f"Created {template.name}: {template.description}"]

    return {
        "parameters": params,
        "feature_tree": features,
        "transform": transform,
        "actions": actions,
        "template": template.name if template else None,
    }