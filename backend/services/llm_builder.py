"""LLM-designed parametric models — Cadio's "brain" for specific prompts.

When a prompt describes something specific ("90-degree exhaust adapter for a
6x6 inch outlet into a 6 inch hose", "holster for a S&W Equalizer 9mm"), a
generic template or a loosely matched public model is the wrong answer. This
module asks an LLM to design the object as a small BUILD PLAN — a list of
primitive parts (boxes, cylinders, tubes, wedges) with millimeter dimensions,
positions and rotations — which session_manager assembles into real, editable
geometry.

The plan is stored with the session, so follow-up edits ("make the bend 60
degrees") are answered by handing the LLM the current plan (a machine-readable
"scan" of the model) plus the edit request, and rebuilding from the updated
plan it returns.

Everything is best-effort: no API key, a timeout, or malformed output simply
returns None and the caller falls through to the existing pipeline.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

MAX_PARTS = 24
MAX_DIM_MM = 400.0
MIN_DIM_MM = 0.4

_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "parts": {
            "type": "array",
            "maxItems": MAX_PARTS,
            "items": {
                "type": "object",
                "properties": {
                    "shape": {"type": "string", "enum": ["box", "cylinder", "tube", "wedge"]},
                    "label": {"type": "string"},
                    "width_mm": {"type": "number"},
                    "depth_mm": {"type": "number"},
                    "height_mm": {"type": "number"},
                    "radius_mm": {"type": "number"},
                    "inner_radius_mm": {"type": "number"},
                    "position_mm": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 3,
                        "maxItems": 3,
                    },
                    "rotation_deg": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 3,
                        "maxItems": 3,
                    },
                },
                "required": ["shape", "label", "position_mm"],
                "additionalProperties": False,
            },
        },
        "notes": {"type": "string"},
    },
    "required": ["name", "parts"],
    "additionalProperties": False,
}

_DESIGN_SYSTEM_PROMPT = """You are the CAD design brain of Cadio, a 3D-printing app. \
You design real, functional, printable objects as a build plan of primitive parts.

Coordinate system (millimeters):
- z=0 is the build plate; +z is up. The assembly should roughly center on x=0, y=0.
- Each part's position_mm is [x, y, z] where x,y locate the part's CENTER and z is the part's BOTTOM.
- rotation_deg is [rx, ry, rz] in degrees, applied around the part's own origin (x then y then z).

Shapes:
- box: width_mm (x), depth_mm (y), height_mm (z).
- cylinder: radius_mm, height_mm (axis along z before rotation; rotate 90 on x or y for horizontal pipes).
- tube: radius_mm (outer), inner_radius_mm, height_mm (a hollow pipe, axis along z before rotation).
- wedge: width_mm, depth_mm, height_mm (right-triangle prism; good for gussets and ramps).

Design rules:
- Follow the user's description EXACTLY: every stated dimension, angle, count and feature. Convert inches to mm (1 inch = 25.4 mm).
- Angled connections (elbows, bends): build them from 2-3 rotated segments meeting at the joint.
- Walls and small features at least 2 mm thick. Parts that must join should overlap 1-2 mm so they fuse.
- Whole model must fit a 250x250x250 mm printer unless the user asks bigger.
- Use as few parts as truly needed (usually 3-12). Label every part descriptively.
- If the user references a style ("looks like an Apex Legends loot box"), design the FUNCTIONAL object they asked for with that style's proportions/details — never a replica prop of something else.

Return ONLY JSON matching the schema."""

_EDIT_SYSTEM_PROMPT = """You are the CAD edit brain of Cadio. You receive the current build plan \
of a model (its exact machine-readable structure) and a user edit request. Apply the requested \
change PRECISELY — adjust angles by re-rotating/re-positioning the affected segments, resize the \
named features, add or remove parts as asked — and keep everything else identical. Keep parts \
joined (1-2 mm overlap) and printable. Same coordinate conventions as the plan. \
Return ONLY the FULL updated plan as JSON matching the schema."""


def llm_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("GROQ_API_KEY"))


_DIM_RE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:mm|cm|m\b|inch|inches|in\b|\"|tum|grader|degrees|deg\b|°)", re.IGNORECASE)
_STYLE_RE = re.compile(r"\b(look(?:s)? like|shaped like|styled|in the style of|som ser ut som|liknande)\b", re.IGNORECASE)


def is_specific_build_prompt(prompt: str) -> bool:
    """True when the prompt describes a specific object precisely enough that
    a generic template or a loose search match would disappoint — long
    multi-feature descriptions, explicit dimensions, or styled requests."""
    text = (prompt or "").strip()
    if not text:
        return False
    words = len(text.split())
    has_dims = bool(_DIM_RE.search(text))
    if words >= 14:
        return True
    if words >= 6 and has_dims:
        return True
    if _STYLE_RE.search(text):
        return True
    return False


def _chat_json(system: str, user: str, max_tokens: int = 2048) -> dict[str, Any] | None:
    """Run one JSON-returning chat call on the best configured LLM."""
    try:
        if os.environ.get("ANTHROPIC_API_KEY"):
            import anthropic

            client = anthropic.Anthropic(timeout=30.0, max_retries=0)
            response = client.messages.create(
                model="claude-opus-4-8",
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"format": {"type": "json_schema", "schema": _PLAN_SCHEMA}},
            )
            text = next((b.text for b in response.content if b.type == "text"), "")
            return json.loads(text) if text else None
        if os.environ.get("GROQ_API_KEY"):
            from openai import OpenAI

            client = OpenAI(
                api_key=os.environ["GROQ_API_KEY"],
                base_url="https://api.groq.com/openai/v1",
                timeout=25.0,
                max_retries=0,
            )
            resp = client.chat.completions.create(
                model=os.environ.get("GROQ_BUILD_MODEL", "llama-3.3-70b-versatile"),
                messages=[
                    {
                        "role": "system",
                        "content": system + "\n\nJSON schema:\n" + json.dumps(_PLAN_SCHEMA),
                    },
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            text = resp.choices[0].message.content or ""
            return json.loads(text) if text else None
    except Exception as exc:  # noqa: BLE001 — the LLM must never break generation
        print(f"[llm_builder] LLM call failed: {exc}")
    return None


def _sanitize_plan(raw: Any) -> dict[str, Any] | None:
    """Validate and clamp an LLM plan so the assembler can trust every field."""
    if not isinstance(raw, dict):
        return None
    parts_in = raw.get("parts")
    if not isinstance(parts_in, list) or not parts_in:
        return None

    def num(value: Any, default: float, lo: float, hi: float) -> float:
        try:
            return max(lo, min(hi, float(value)))
        except (TypeError, ValueError):
            return default

    parts: list[dict[str, Any]] = []
    for item in parts_in[:MAX_PARTS]:
        if not isinstance(item, dict):
            continue
        shape = str(item.get("shape", "")).strip().lower()
        if shape not in {"box", "cylinder", "tube", "wedge"}:
            continue
        pos = item.get("position_mm") or [0, 0, 0]
        rot = item.get("rotation_deg") or [0, 0, 0]
        if not isinstance(pos, list) or len(pos) < 3:
            pos = [0, 0, 0]
        if not isinstance(rot, list) or len(rot) < 3:
            rot = [0, 0, 0]
        part: dict[str, Any] = {
            "shape": shape,
            "label": re.sub(r"[^a-zA-Z0-9_\- ]", "", str(item.get("label", shape)))[:48] or shape,
            "position_mm": [num(pos[0], 0, -MAX_DIM_MM, MAX_DIM_MM), num(pos[1], 0, -MAX_DIM_MM, MAX_DIM_MM), num(pos[2], 0, -MAX_DIM_MM, MAX_DIM_MM)],
            "rotation_deg": [num(rot[0], 0, -360, 360), num(rot[1], 0, -360, 360), num(rot[2], 0, -360, 360)],
        }
        if shape in {"box", "wedge"}:
            part["width_mm"] = num(item.get("width_mm"), 20.0, MIN_DIM_MM, MAX_DIM_MM)
            part["depth_mm"] = num(item.get("depth_mm"), 20.0, MIN_DIM_MM, MAX_DIM_MM)
            part["height_mm"] = num(item.get("height_mm"), 20.0, MIN_DIM_MM, MAX_DIM_MM)
        else:
            part["radius_mm"] = num(item.get("radius_mm"), 10.0, MIN_DIM_MM, MAX_DIM_MM / 2)
            part["height_mm"] = num(item.get("height_mm"), 20.0, MIN_DIM_MM, MAX_DIM_MM)
            if shape == "tube":
                inner = num(item.get("inner_radius_mm"), part["radius_mm"] * 0.8, 0.1, MAX_DIM_MM / 2)
                part["inner_radius_mm"] = min(inner, part["radius_mm"] - 0.8)
        parts.append(part)

    if not parts:
        return None
    return {
        "name": re.sub(r"[^a-zA-Z0-9_\- ]", "", str(raw.get("name", "custom_design")))[:64] or "custom_design",
        "parts": parts,
        "notes": str(raw.get("notes", ""))[:400],
    }


def llm_design_plan(prompt: str) -> dict[str, Any] | None:
    """Design a build plan for a free-text description. None on any failure."""
    if not llm_available() or not (prompt or "").strip():
        return None
    raw = _chat_json(
        _DESIGN_SYSTEM_PROMPT,
        f"Design this object as a build plan:\n\n{prompt.strip()}",
    )
    return _sanitize_plan(raw)


def llm_edit_plan(original_prompt: str, plan: dict[str, Any], edit_prompt: str) -> dict[str, Any] | None:
    """Apply a free-text edit to an existing plan. None on any failure."""
    if not llm_available() or not plan:
        return None
    raw = _chat_json(
        _EDIT_SYSTEM_PROMPT,
        (
            f"The model was originally designed from: {original_prompt.strip()}\n\n"
            f"Current build plan (the model's structure):\n{json.dumps(plan)}\n\n"
            f"User edit request: {edit_prompt.strip()}"
        ),
    )
    return _sanitize_plan(raw)


_EDIT_VERB_RE = re.compile(
    r"\b(make|change|set|increase|decrease|widen|narrow|shorten|lengthen|raise|lower|rotate|tilt|angle|bend|round|thicker|thinner|taller|shorter|wider|bigger|smaller|add|remove|gör|ändra|öka|minska|högre|lägre|bredare|smalare|större|mindre|vinkla|böj)\b",
    re.IGNORECASE,
)


def is_plan_edit_prompt(prompt: str) -> bool:
    """Loose check: does this look like an edit instruction (vs a new design)?"""
    text = (prompt or "").strip()
    if not text or len(text.split()) > 24:
        return False
    return bool(_EDIT_VERB_RE.search(text))
