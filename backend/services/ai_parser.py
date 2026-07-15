"""AI command parser using Groq llama-3.3-70b-versatile for natural-language CAD editing."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from backend.models.schema import Feature, Transform
from backend.services.prompt_translation import normalize_source_query
from backend.services.session_manager import CadObject, Session

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

_groq_client: Any = None


def _get_groq_client() -> Any:
    global _groq_client
    if _groq_client is None:
        from openai import OpenAI
        _groq_client = OpenAI(
            api_key=GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )
    return _groq_client


# ---------------------------------------------------------------------------
# Claude (Anthropic) — preferred free-text fallback. When ANTHROPIC_API_KEY is
# set, prompts that the deterministic rules + templates + source search don't
# already handle are interpreted by Claude, so users can describe a model in
# almost any words and still get sensible CAD parameters. This is purely a
# fallback: it only runs when the deterministic path produced nothing, so it
# never overrides or slows the already-working recognized prompts.
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

_anthropic_client: Any = None


def _get_anthropic_client() -> Any:
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


# Strict schema so Claude returns exactly the parametric dimensions the CAD
# engine understands — no free-form keys to sanitize.
_CAD_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "parameters": {
            "type": "object",
            "properties": {
                "width": {"type": "number"},
                "depth": {"type": "number"},
                "height": {"type": "number"},
                "thickness": {"type": "number"},
                "angle": {"type": "number"},
                "fillet_radius": {"type": "number"},
                "chamfer_size": {"type": "number"},
                "hole_count": {"type": "number"},
                "hole_diameter": {"type": "number"},
                "wall_thickness": {"type": "number"},
            },
            "additionalProperties": False,
        },
        "actions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["parameters", "actions"],
    "additionalProperties": False,
}


def _parse_with_claude(
    prompt: str,
    current_params: dict,
    current_transform: dict,
    current_features: list | None = None,
) -> dict:
    """Interpret a free-text prompt into CAD parameters using Claude Opus 4.8."""
    try:
        client = _get_anthropic_client()

        user_message = (
            f"Current parameters: {json.dumps(current_params)}"
            f"\nCurrent transform: {json.dumps(current_transform)}"
            f"\nUser instruction: {prompt}"
            "\n\nReturn realistic millimeter dimensions for this object as JSON "
            "matching the schema. Keep proportions printable and sensible."
        )

        response = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
            output_config={"format": {"type": "json_schema", "schema": _CAD_OUTPUT_SCHEMA}},
        )
        # output_config.format guarantees the first text block is valid JSON.
        text = next((b.text for b in response.content if b.type == "text"), "{}")
        return json.loads(text)
    except Exception as e:  # noqa: BLE001 — never let the LLM break generation
        print(f"[cadio] Claude error: {e}")
        return {"parameters": current_params, "features": [], "transform": {}, "actions": [f"ai-error: {e}"]}


def _parse_with_llm(
    prompt: str,
    current_params: dict,
    current_transform: dict,
    current_features: list | None = None,
) -> dict:
    """Provider-agnostic free-text fallback: prefer Claude, then Groq, else no-op.

    Whichever is configured runs only AFTER the deterministic rules, templates,
    research brief, and source search have had their chance — so configuring a
    key strictly expands what users can phrase, without changing any prompt that
    already works.
    """
    if ANTHROPIC_API_KEY:
        return _parse_with_claude(prompt, current_params, current_transform, current_features)
    if GROQ_API_KEY:
        return _parse_with_groq(prompt, current_params, current_transform, current_features)
    # No LLM configured — signal a no-op so callers fall back to neutral geometry.
    return {"parameters": current_params, "features": [], "transform": {}, "actions": ["no-op"]}

CREATE_PATTERNS = (
    r"\b(create|generate|build|design)\b",
    r"\bmake\s+(a|an|one)\b",
    r"\b(skapa|generera|bygg|rita)\b",
    r"\bgor\s+(en|ett|a|an)\b",
    r"\bgör\s+(en|ett)\b",
)

EDIT_PATTERNS = (
    r"\b(add|remove|delete|change|modify|edit|increase|decrease|resize|scale|rotate|move|write|engrave|emboss)\b",
    r"\b(make it|taller|wider|thicker|thinner|rounded|fillet|chamfer|extrude|shell|mirror|holes?|text|logo|label|engraved|raised|cutout|notch|slot|boss|standoff|clip|hook|rib|stronger|bend|bent|b[oö]j)\b",
    # Natural-language size/shape edits so users don't need exact keywords.
    r"\b(bigger|larger|smaller|grow|shrink|enlarge|reduce|expand|downsize|upsize|"
    r"shorter|lower|higher|narrower|broader|slimmer|deeper|longer|shallower|flatter|"
    r"double|triple|halve|smooth|smoother|soften|bevel|beveled|hollow|round|rounder|wider)\b",
    r"\bhalf\s+(?:the\s+)?size\b",
    r"\bmake (it|the model|this|them)\b",
    r"\b(lagg till|ta bort|andra|redigera|flytta|rotera|skala|hal|rund|fasa|tjockare|bredare|hogre|skriv|ingravera|ingraverat|gravyr|logga|upphojd|upphojt|praglad|utskarning|bossar|distanser|klamma|krok|ribba|ribbor|starkare)\b",
    r"\b(lägg till|ta bort|ändra|redigera|flytta|rotera|skala|hål|rund|fasa|tjockare|bredare|högre)\b",
    # Swedish natural-language size/shape edits.
    r"\b(större|storre|mindre|krymp|förstora|forstora|förminska|forminska|"
    r"kortare|lägre|lagre|smalare|djupare|längre|langre|plattare|"
    r"dubbelt|dubbla|hälften|halften|halva|jämna|jamna|len|ihålig|ihalig|tunnare)\b",
    r"\bgor\s+(den|det)\b",
    r"\bgör\s+(den|det)\b",
)


def _prompt_match_text(prompt: str) -> str:
    translated = normalize_source_query(prompt)
    return f"{prompt} {translated}".strip().lower()


def is_new_model_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    return any(re.search(pattern, text) for pattern in CREATE_PATTERNS)


# An explicit dimension reference — "120mm high", "make it 250 tall", "width
# 100", "120x80x250". Used so a resize request on the CURRENT model is treated
# as an edit instead of a fresh generation (which previously searched sources
# and, ironically, returned a literal 120mm fan for "make it 120mm high").
# Unit suffix accepted after a number: metric, or inches as 6", 6'', 6 in,
# 6 inch/inches. Users paste imperial specs constantly ("6\" x 6\"") and a
# missed unit silently turned their edit into a fresh (wrong) generation.
_UNIT = r"(?:mm|millimeters?|millimetres?|cm|centimeters?|centimetres?|\"|″|''|in\b|inch(?:es)?)"

_DIMENSION_HINT = re.compile(
    rf"\b\d+(?:\.\d+)?\s*{_UNIT}?\s*"
    r"(?:tall|taller|high|height|wide|wider|width|deep|depth|thick|thickness|long|length|"
    r"h[oö]g|h[oö]gt|h[oö]jd|bred|brett|bredd|djup|djupt|tjock|tjockt|tjocklek|l[aå]ng|l[aå]ngt|l[aä]ngd)\b"
    r"|\b(?:tall|high|height|wide|width|deep|depth|thick|thickness|long|length|dimensions?|"
    r"h[oö]gd?|h[oö]jd|bred|bredd|djup|tjock|tjocklek|l[aå]ng|l[aä]ngd|m[aå]tt(?:en)?)\b"
    r"\s*(?:are|of|to|at|is|=|:|av|till|[aä]r|p[aå])?\s*\d+(?:\.\d+)?"
    rf"|\b\d+(?:\.\d+)?\s*{_UNIT}?\s*[x×*]\s*\d+(?:\.\d+)?\s*{_UNIT}?(?:\s*[x×*]\s*\d+(?:\.\d+)?\s*{_UNIT}?)?"
)


def _mentions_explicit_dimension(text: str) -> bool:
    return bool(_DIMENSION_HINT.search(text))


def is_edit_only_prompt(prompt: str) -> bool:
    text = _prompt_match_text(prompt)
    has_edit = (
        any(re.search(pattern, text) for pattern in EDIT_PATTERNS)
        or _mentions_explicit_dimension(text)
    )
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
- Tool holder / verktygshållare: w=118, d=58, h=52, thickness=7, 2 mounting holes, wall/pegboard-ready
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
        from backend.services.provider_extensions import get_extended_provider_registry

        examples = get_extended_provider_registry().search_all(prompt, limit=6)
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

    # ------------------------------------------------------------------
    # Explicit numeric dimensions — e.g. "make it 250mm tall", "width 100",
    # "100 x 60 x 250 mm", "5mm thick". This MUST run deterministically: the
    # external LLM is often unavailable on the live server, and without this a
    # "resize to <N>mm" prompt silently does nothing (the #1 user complaint).
    # Explicit values win over the relative taller/wider scaling below.
    # ------------------------------------------------------------------
    def _set_dim(key: str, value: float, lo: float, hi: float) -> None:
        params[key] = max(lo, min(hi, value))

    # Unit-aware value: users mix mm, cm and inches (6", 6 in, 6 inches).
    # Everything is stored in mm.
    _unit_re = r"(mm|millimeters?|millimetres?|cm|centimeters?|centimetres?|\"|″|''|in|inch(?:es)?)"

    def _to_mm(value: float, unit: str | None) -> float:
        u = (unit or "").strip().lower()
        if u.startswith("cm") or u.startswith("centimet"):
            return value * 10.0
        if u in ('"', "″", "''") or u.startswith("in"):
            return value * 25.4
        return value

    # axis -> (keyword alternation, min, max)
    _dim_axes = {
        "height": (r"tall|taller|high|height|hoog|hog|hogt|hojd|hög|högt|höjd", 5.0, 1000.0),
        "width": (r"wide|wider|width|bred|bredd|brett", 5.0, 1000.0),
        "depth": (r"deep|depth|long|length|djup|djupt|lang|langd|lång|långt|längd", 5.0, 1000.0),
        "thickness": (r"thick|thickness|tjock|tjockt|tjocklek|vaggtjocklek|väggtjocklek", 1.0, 60.0),
    }
    explicit_changes: list[str] = []
    for _key, (_kw, _lo, _hi) in _dim_axes.items():
        _val: float | None = None
        # "<number> [unit] <keyword>"  (e.g. "250mm tall", '6" wide')
        _m = re.search(rf"(\d+(?:\.\d+)?)\s*{_unit_re}?\s*(?:{_kw})\b", text)
        if _m:
            _val = _to_mm(float(_m.group(1)), _m.group(2))
        else:
            # "<keyword> [of/to/=] <number> [unit]"  (e.g. "height of 250", 'width 6"')
            _m = re.search(rf"\b(?:{_kw})\b\s*(?:of|to|at|is|=|:|av|till|på|pa)?\s*(\d+(?:\.\d+)?)\s*{_unit_re}?", text)
            if _m:
                _val = _to_mm(float(_m.group(1)), _m.group(2))
        if _val is not None:
            _set_dim(_key, _val, _lo, _hi)
            explicit_changes.append(f"{_key} {params[_key]:.0f}mm")

    # "WxDxH" shorthand, e.g. "100x60x250", "100 x 60 x 250 mm", '6" x 6" x 2"'
    _num = rf"(\d+(?:\.\d+)?)\s*{_unit_re}?"
    _wdh = re.search(rf"\b{_num}\s*[x×*]\s*{_num}\s*[x×*]\s*{_num}", text)
    if _wdh:
        _set_dim("width", _to_mm(float(_wdh.group(1)), _wdh.group(2)), 5.0, 1000.0)
        _set_dim("depth", _to_mm(float(_wdh.group(3)), _wdh.group(4)), 5.0, 1000.0)
        _set_dim("height", _to_mm(float(_wdh.group(5)), _wdh.group(6)), 5.0, 1000.0)
        explicit_changes = [
            f"width {params['width']:.0f}mm",
            f"depth {params['depth']:.0f}mm",
            f"height {params['height']:.0f}mm",
        ]
    else:
        # "W x D" 2D shorthand — e.g. 'dimensions are 6" x 6"'. Sets the
        # footprint and leaves height alone.
        _wd = re.search(rf"\b{_num}\s*[x×*]\s*{_num}", text)
        if _wd and not explicit_changes:
            _set_dim("width", _to_mm(float(_wd.group(1)), _wd.group(2)), 5.0, 1000.0)
            _set_dim("depth", _to_mm(float(_wd.group(3)), _wd.group(4)), 5.0, 1000.0)
            explicit_changes = [
                f"width {params['width']:.0f}mm",
                f"depth {params['depth']:.0f}mm",
            ]
    if explicit_changes:
        actions.append("set " + ", ".join(explicit_changes))

    # ------------------------------------------------------------------
    # Natural-language OVERALL resize — "make it bigger", "a bit smaller",
    # "20% larger", "double it", "half the size". Lets users phrase a resize
    # however they like instead of naming an axis. Skipped when an explicit
    # dimension was already given.
    # ------------------------------------------------------------------
    if not explicit_changes:
        factor: float | None = None
        # Axis multiplier — "twice as tall", "3 times as wide". Runs before the
        # overall resize so "twice as tall" scales height, not the whole model.
        _axis_words = {"tall": "height", "high": "height", "wide": "width", "broad": "width",
                       "deep": "depth", "long": "depth", "thick": "thickness"}
        _mult = re.search(
            r"\b(?:(\d+(?:[.,]\d+)?)\s*(?:x\b|time?s?\b)?|double|twice|triple)\s*"
            r"(?:time?s?\s+)?as\s+(tall|high|wide|broad|deep|long|thick)\b",
            text,
        )
        _axis_scaled = False
        if _mult and _mult.group(2):
            raw = _mult.group(1)
            mfac = float(raw.replace(",", ".")) if raw else (3.0 if "triple" in _mult.group(0) else 2.0)
            mfac = max(0.05, min(10.0, mfac))
            _mkey = _axis_words[_mult.group(2)]
            hi = 60.0 if _mkey == "thickness" else 1000.0
            scale_param(_mkey, mfac, 1.0, hi)
            actions.append(f"scaled {_mkey} to {mfac * 100:.0f}%")
            _axis_scaled = True
        pct = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent|procent)", text)
        # "N times bigger" / the common "10 time bigger" typo / "5x larger"
        times = re.search(
            r"\b(\d+(?:[.,]\d+)?)\s*(?:x\b|time?s?\b)[^.]{0,16}?\b(?:bigger|larger|the size|as big|större|storre)"
            r"|\b(\d+(?:[.,]\d+)?)\s*x\s*(?:bigger|larger|större|storre)\b",
            text,
        )
        grow_words = ("bigger", "larger", "enlarge", "grow", "scale up", "scale it up",
                      "increase the size", "upsize", "make it big", "större", "storre",
                      "förstora", "forstora")
        shrink_words = ("smaller", "shrink", "scale down", "scale it down",
                        "reduce the size", "downsize", "make it small", "mindre", "krymp",
                        "förminska", "forminska")
        if _axis_scaled:
            pass
        elif times:
            raw = times.group(1) or times.group(2)
            factor = max(0.05, min(10.0, float(raw.replace(",", "."))))
        elif re.search(r"\b(double|twice|2x|two times|dubbelt|dubbla)\b", text):
            factor = 2.0
        elif re.search(r"\b(triple|3x|three times)\b", text):
            factor = 3.0
        elif re.search(r"\b(halve|half size|half the size|hälften|halften|halva)\b", text):
            factor = 0.5
        elif pct:
            value = float(pct.group(1))
            if any(w in text for w in grow_words):
                factor = 1.0 + value / 100.0
            elif any(w in text for w in shrink_words):
                factor = max(0.05, 1.0 - value / 100.0)
            elif re.search(r"\b(scale|size|to|of)\b", text):
                factor = max(0.05, value / 100.0)
        elif any(w in text for w in grow_words):
            factor = 1.25
        elif any(w in text for w in shrink_words):
            factor = 0.8
        if factor is not None:
            for _axis in ("width", "depth", "height"):
                scale_param(_axis, factor, 1.0, 1000.0)
            actions.append(f"scaled model to {factor * 100:.0f}% of its size")

    if any(phrase in text for phrase in ("make it taller", "taller", "higher", "increase height", "hogre", "högre", "höj", "hoj")):
        scale_param("height", 1.25, 20.0)
        actions.append("increased height")

    if any(phrase in text for phrase in ("shorter", "make it shorter", "lower", "less tall", "reduce height", "kortare", "lägre", "lagre")):
        scale_param("height", 0.8, 5.0)
        actions.append("reduced height")

    if any(phrase in text for phrase in ("make it wider", "wider", "broader", "increase width", "bredare")):
        scale_param("width", 1.25, 10.0)
        actions.append("increased width")

    if any(phrase in text for phrase in ("narrower", "slimmer", "less wide", "smalare")):
        scale_param("width", 0.8, 5.0)
        actions.append("reduced width")

    if any(phrase in text for phrase in ("deeper", "longer", "djupare", "längre", "langre")):
        scale_param("depth", 1.25, 5.0)
        actions.append("increased depth")

    if any(phrase in text for phrase in ("shallower", "less deep", "flatter", "plattare", "grundare")):
        scale_param("depth", 0.8, 5.0)
        actions.append("reduced depth")

    if any(phrase in text for phrase in ("make it thicker", "thicker", "stronger", "heavy duty", "heavy-duty", "tjockare", "sturdier")):
        scale_param("thickness", 1.25, 2.0, 30.0)
        params["wall_thickness"] = max(float(params.get("wall_thickness", 3.0)), 4.0)
        actions.append("increased thickness")

    if any(phrase in text for phrase in ("thinner", "tunnare", "less thick")):
        scale_param("thickness", 0.8, 1.0, 30.0)
        actions.append("reduced thickness")

    if any(phrase in text for phrase in ("rounded", "round corners", "round the", "rounder", "fillet", "smooth", "smoother", "soften", "soft edges", "runda", "rundade", "jämna", "jamna", "len")):
        params["fillet_radius"] = max(float(params.get("fillet_radius", 2.0)), 4.0)
        _ensure_feature(features, "fillet_edges", True)
        _ensure_feature(features, "chamfer_edges", False)
        actions.append("enabled rounded corners")

    if any(phrase in text for phrase in ("bevel", "beveled", "bevelled", "chamfer", "chamfered", "fasa", "fasad", "fasade")):
        params["chamfer_size"] = max(float(params.get("chamfer_size", 0.0)), 2.0)
        _ensure_feature(features, "chamfer_edges", True)
        _ensure_feature(features, "fillet_edges", False)
        actions.append("enabled beveled edges")

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

    if any(word in text for word in ("tool holder", "tool rack", "workshop organizer", "drill holder", "bit holder", "screwdriver holder", "wrench holder", "pliers holder")):
        params["width"] = max(float(params.get("width", 90.0)), 118.0)
        params["depth"] = max(float(params.get("depth", 50.0)), 58.0)
        params["height"] = max(float(params.get("height", 35.0)), 52.0)
        params["thickness"] = max(float(params.get("thickness", 5.0)), 7.0)
        params["wall_thickness"] = max(float(params.get("wall_thickness", 3.0)), 4.0)
        params["hole_count"] = max(float(params.get("hole_count", 0.0)), 2.0)
        params["hole_diameter"] = max(float(params.get("hole_diameter", 5.0)), 5.0)
        _ensure_feature(features, "base_extrude", True)
        _ensure_feature(features, "mount_holes", True)
        _ensure_feature(features, "fillet_edges", True)
        _ensure_feature(features, "back_support", False)
        actions.append("matched workshop tool holder proportions")

    return actions


def _apply_prompt_shape_inference(
    prompt: str,
    params: dict[str, float],
    features: list[Feature],
) -> list[str]:
    """Create a useful first sketch when no curated template exists yet."""
    text = _prompt_match_text(prompt)
    actions: list[str] = []

    if any(word in text for word in (
        "holder", "mount", "bracket", "clip", "retainer", "rack", "organizer",
        "guide", "hose guide", "cable guide", "wire guide", "channel",
        "hook", "hanger", "support", "rest", "cradle", "saddle",
    )):
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

    flat_hardware = any(word in text for word in ("spacer", "shim", "washer", "plate", "adapter"))
    # "pressure washer" / "power washer" is a tool, not the flat round hardware —
    # don't flatten a "pressure washer hose guide" into a plate.
    if "pressure washer" in text or "power washer" in text:
        flat_hardware = False
    if flat_hardware:
        params["width"] = max(float(params.get("width", 50.0)), 60.0)
        params["depth"] = max(float(params.get("depth", 40.0)), 45.0)
        params["height"] = min(max(float(params.get("height", 8.0)), 6.0), 18.0)
        params["thickness"] = params["height"]
        _ensure_feature(features, "base_extrude", True)
        _ensure_feature(features, "back_support", False)
        actions.append("inferred flat adapter/plate geometry from prompt")

    return actions


def _apply_neutral_fallback_geometry(
    params: dict[str, float],
    features: list[Feature],
) -> list[str]:
    """Last-resort geometry for an unrecognized prompt when no template, brief,
    deterministic edit, specific inference, or LLM produced anything.

    The default parameters are an angled phone-stand wedge (angle=70 +
    back_support), which reads as a meaningless slab/"rectangle" for unrelated
    prompts. Give unknown objects a neutral, intentional upright box with a base
    and rounded edges instead.
    """
    params["width"] = max(20.0, float(params.get("width", 80.0)))
    params["depth"] = max(20.0, float(params.get("depth", 70.0)))
    params["height"] = max(20.0, float(params.get("height", 60.0)))
    params["angle"] = 90.0
    params["fillet_radius"] = max(float(params.get("fillet_radius", 0.0)), 2.0)
    _ensure_feature(features, "base_extrude", True)
    _ensure_feature(features, "back_support", False)
    _ensure_feature(features, "fillet_edges", True)
    return ["inferred neutral upright body from prompt"]


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


def _parse_with_groq(
    prompt: str,
    current_params: dict,
    current_transform: dict,
    current_features: list | None = None,
) -> dict:
    """Call Groq llama-3.3-70b-versatile to parse the prompt into CAD changes."""
    try:
        client = _get_groq_client()

        features_summary = ""
        if current_features:
            enabled = [f["type"] if isinstance(f, dict) else getattr(f, "type", str(f)) for f in current_features if (f.get("enabled") if isinstance(f, dict) else getattr(f, "enabled", True))]
            disabled = [f["type"] if isinstance(f, dict) else getattr(f, "type", str(f)) for f in current_features if not (f.get("enabled") if isinstance(f, dict) else getattr(f, "enabled", True))]
            features_summary = f"\nEnabled features: {enabled}\nDisabled features: {disabled}"

        user_message = (
            f"Current parameters: {json.dumps(current_params)}"
            f"{features_summary}"
            f"\nCurrent transform: {json.dumps(current_transform)}"
            f"\nUser instruction: {prompt}"
        )

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.1,
            max_tokens=600,
            response_format={"type": "json_object"},
            timeout=12,
        )

        raw = response.choices[0].message.content or "{}"
        return json.loads(raw)

    except Exception as e:
        print(f"[cadio] Groq error: {e}")
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
    """Parse a natural-language prompt using Groq into CAD changes.

    Also uses product templates to generate more realistic objects.
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

    # Call Groq for fine-tuning if not a direct template match
    if quick_actions or inference_actions or brief_actions:
        actions = brief_actions + quick_actions + inference_actions
    elif not template or "modify" in _prompt_match_text(prompt) or "change" in _prompt_match_text(prompt):
        result = _parse_with_llm(prompt, params, current_transform, features)
        
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

        # If the LLM was unavailable or unhelpful on a fresh create (no params
        # returned, or an error/no-op), don't leave the default phone-stand wedge
        # standing in — it reads as a meaningless "rectangle" for unrelated
        # prompts (e.g. "pressure washer hose guide"). Apply neutral geometry.
        groq_failed = (not new_params) or any(
            str(a).startswith("ai-error") or str(a) == "no-op" for a in actions
        )
        if not edit_only and groq_failed:
            actions = _apply_neutral_fallback_geometry(params, features)
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
