"""Research-driven design briefs for open-ended CAD generation.

The brief layer turns a prompt plus external model metadata into an
explainable CAD plan.  It uses source titles and popularity as design signals,
not copied geometry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any

from backend.services.design_providers import ExampleDesign
from backend.services.prompt_translation import normalize_source_query


@dataclass
class DesignBrief:
    prompt: str
    category: str
    confidence: float
    dimensions: dict[str, float] = field(default_factory=dict)
    features: list[str] = field(default_factory=list)
    source_examples: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "prompt": self.prompt,
            "category": self.category,
            "confidence": self.confidence,
            "dimensions": self.dimensions,
            "features": self.features,
            "source_examples": self.source_examples,
            "notes": self.notes,
            "actions": self.actions,
        }


CATEGORY_KEYWORDS: dict[str, set[str]] = {
    "battery_holder": {"battery", "batteries", "batteri", "dewalt", "makita", "milwaukee", "ryobi", "bosch"},
    "device_stand": {"stand", "stall", "dock", "cradle", "phone", "mobil", "tablet", "headset", "headphone"},
    "electronics_holder": {"cdi", "ecu", "ecm", "module", "modul", "ignition", "controller", "electronics"},
    "holder": {"holder", "hallare", "tool holder", "verktygshallare", "mount", "wall", "bracket", "clip", "retainer", "hanger"},
    "enclosure": {"case", "cover", "enclosure", "box", "housing", "shell", "lid", "cover"},
    "organizer": {"organizer", "organiser", "tray", "bin", "rack", "divider", "storage"},
    "organic": {"octopus", "blackfisk", "figurine", "statue", "miniature", "toy", "animal", "sculpture"},
    "tool": {"jig", "fixture", "adapter", "spacer", "shim", "washer", "tool", "tools", "drill", "screwdriver", "wrench", "pliers", "bit", "knife", "nozzle"},
}


DEFAULTS: dict[str, dict[str, float]] = {
    "battery_holder": {
        "width": 104.0,
        "depth": 92.0,
        "height": 46.0,
        "thickness": 7.0,
        "fillet_radius": 2.5,
        "chamfer_size": 0.0,
        "hole_count": 2.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
        "slots": 1.0,
    },
    "device_stand": {
        "width": 92.0,
        "depth": 90.0,
        "height": 120.0,
        "thickness": 7.0,
        "angle": 68.0,
        "fillet_radius": 3.0,
        "chamfer_size": 0.0,
        "hole_count": 0.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
    },
    "electronics_holder": {
        "width": 86.0,
        "depth": 68.0,
        "height": 38.0,
        "thickness": 5.0,
        "fillet_radius": 2.0,
        "chamfer_size": 0.0,
        "hole_count": 2.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
    },
    "holder": {
        "width": 90.0,
        "depth": 65.0,
        "height": 35.0,
        "thickness": 5.0,
        "fillet_radius": 2.0,
        "chamfer_size": 0.0,
        "hole_count": 2.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
    },
    "enclosure": {
        "width": 95.0,
        "depth": 72.0,
        "height": 46.0,
        "thickness": 4.0,
        "fillet_radius": 2.0,
        "chamfer_size": 0.0,
        "hole_count": 0.0,
        "hole_diameter": 4.0,
        "wall_thickness": 3.0,
    },
    "organizer": {
        "width": 120.0,
        "depth": 90.0,
        "height": 70.0,
        "thickness": 4.0,
        "fillet_radius": 2.0,
        "chamfer_size": 0.0,
        "hole_count": 0.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
        "divider_count": 3.0,
    },
    "organic": {
        "width": 70.0,
        "depth": 70.0,
        "height": 45.0,
        "thickness": 6.0,
        "fillet_radius": 6.0,
        "chamfer_size": 0.0,
        "hole_count": 0.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
    },
    "tool": {
        "width": 118.0,
        "depth": 58.0,
        "height": 52.0,
        "thickness": 7.0,
        "fillet_radius": 1.5,
        "chamfer_size": 0.0,
        "hole_count": 2.0,
        "hole_diameter": 6.0,
        "wall_thickness": 3.0,
    },
    "generic": {
        "width": 80.0,
        "depth": 60.0,
        "height": 35.0,
        "thickness": 5.0,
        "fillet_radius": 2.0,
        "chamfer_size": 0.0,
        "hole_count": 0.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
    },
}


FEATURES: dict[str, list[str]] = {
    "battery_holder": ["base", "slide_rails", "front_stop", "rear_register", "mounting_holes", "rounded_edges"],
    "device_stand": ["base", "front_lip", "back_support", "side_rails", "rounded_edges"],
    "electronics_holder": ["base", "tray_walls", "strap_bridge", "mounting_holes", "rounded_edges"],
    "holder": ["base", "side_walls", "front_lip", "mounting_holes", "rounded_edges"],
    "enclosure": ["base", "walls", "corner_posts", "lid_register", "rounded_edges"],
    "organizer": ["base", "walls", "dividers", "rounded_edges"],
    "organic": ["rounded_body", "appendages", "soft_edges"],
    "tool": ["base", "side_walls", "front_lip", "mounting_holes", "rounded_edges"],
    "generic": ["base", "rounded_edges"],
}


def build_design_brief(prompt: str, limit: int = 6) -> dict[str, Any]:
    examples = _search_sources(prompt, limit)
    text = _combined_text(prompt, examples)
    category, confidence = _infer_category(prompt, examples)
    dimensions = dict(DEFAULTS[category])
    notes: list[str] = []

    _apply_explicit_dimensions(text, dimensions, notes)
    _apply_count_hints(text, dimensions, notes)
    _apply_source_hints(text, dimensions, notes)
    _apply_product_family_hints(text, dimensions, notes)
    _clamp_dimensions(dimensions)

    source_examples = [ex.to_dict() for ex in examples[:4]]
    source_summary = "; ".join(f"{ex.source}: {ex.title}" for ex in examples[:3])
    actions = [
        f"research-brief: {category.replace('_', ' ')} ({confidence:.0%} confidence)",
    ]
    if source_summary:
        actions.append(f"source-signals: {source_summary}")
    else:
        actions.append("source-signals: no external metadata available; used conservative CAD heuristics")
    if notes:
        actions.append("brief-notes: " + "; ".join(notes[:4]))

    return DesignBrief(
        prompt=prompt,
        category=category,
        confidence=confidence,
        dimensions=dimensions,
        features=list(FEATURES[category]),
        source_examples=source_examples,
        notes=notes,
        actions=actions,
    ).to_dict()


def _search_sources(prompt: str, limit: int) -> list[ExampleDesign]:
    try:
        from backend.services.provider_extensions import get_extended_provider_registry

        registry = get_extended_provider_registry()

        # Build candidate queries: normalized/synonym-expanded first, then original, then sub-queries
        normalized = normalize_source_query(prompt)
        queries: list[str] = []
        if normalized and normalized.lower() != prompt.strip().lower():
            queries.append(normalized)
        queries.append(prompt.strip())
        words = [w for w in re.findall(r"[a-z0-9]+", (normalized or prompt).lower()) if len(w) > 2]
        for n in (3, 2):
            if len(words) > n:
                queries.append(" ".join(words[-n:]))

        seen: set[str] = set()
        for query in queries:
            key = query.lower()
            if key in seen:
                continue
            seen.add(key)
            results = registry.search_all(query, limit=limit)
            if results:
                return results
        return []
    except Exception:
        return []


def _combined_text(prompt: str, examples: list[ExampleDesign]) -> str:
    translated_prompt = normalize_source_query(prompt)
    source_text = " ".join(
        " ".join([ex.title or "", ex.description or "", " ".join(ex.tags or [])])
        for ex in examples
    )
    return f"{prompt} {translated_prompt} {source_text}".lower()


def _infer_category(prompt: str, examples: list[ExampleDesign]) -> tuple[str, float]:
    text = _combined_text(prompt, examples)
    words = set(re.findall(r"[a-z0-9]+", text.lower()))
    translated_prompt = normalize_source_query(prompt)
    prompt_words = set(re.findall(r"[a-z0-9]+", f"{prompt} {translated_prompt}".lower()))

    for priority_category in ("battery_holder", "electronics_holder", "organic"):
        if prompt_words & CATEGORY_KEYWORDS[priority_category]:
            confidence = min(0.94, 0.72 + min(len(examples), 4) * 0.04)
            return priority_category, confidence

    best_category = "generic"
    best_score = 0.0
    for category, keywords in CATEGORY_KEYWORDS.items():
        prompt_hits = len(prompt_words & keywords)
        source_hits = len(words & keywords) - prompt_hits
        score = prompt_hits * 3.0 + source_hits * 0.75
        if category == "holder" and {"holder", "mount"} & prompt_words:
            score += 1.5
        if category == "device_stand" and "stand" in prompt_words:
            score += 2.0
        if score > best_score:
            best_category = category
            best_score = score

    confidence = min(0.94, 0.42 + best_score * 0.08 + min(len(examples), 4) * 0.04)
    if best_category == "generic":
        confidence = 0.34 if examples else 0.25
    return best_category, confidence


def _apply_explicit_dimensions(text: str, dimensions: dict[str, float], notes: list[str]) -> None:
    match = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*mm",
        text,
    )
    if match:
        w, d, h = (float(match.group(i)) for i in range(1, 4))
        dimensions.update({"width": w, "depth": d, "height": h})
        notes.append(f"used explicit {w:g}x{d:g}x{h:g}mm size")

    thick = re.search(r"(?:thick|thickness|wall)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*mm", text)
    if thick:
        dimensions["thickness"] = max(1.0, float(thick.group(1)))
        dimensions["wall_thickness"] = max(1.0, min(float(thick.group(1)), 12.0))
        notes.append(f"used {float(thick.group(1)):g}mm thickness hint")

    hole = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:hole|holes|screw|mount)", text)
    if hole:
        dimensions["hole_diameter"] = max(1.0, float(hole.group(1)))
        dimensions["hole_count"] = max(dimensions.get("hole_count", 0.0), 2.0)
        notes.append(f"used {float(hole.group(1)):g}mm hole hint")


def _apply_count_hints(text: str, dimensions: dict[str, float], notes: list[str]) -> None:
    if re.search(r"\b(dual|double|two|2x|2\s+slot|2-slot)\b", text):
        dimensions["slots"] = max(dimensions.get("slots", 1.0), 2.0)
        dimensions["battery_slots"] = max(dimensions.get("battery_slots", 1.0), 2.0)
        dimensions["width"] = max(dimensions.get("width", 90.0), 170.0)
        notes.append("detected dual/two-slot layout")
    if re.search(r"\b(triple|three|3x|3\s+slot|3-slot)\b", text):
        dimensions["slots"] = max(dimensions.get("slots", 1.0), 3.0)
        dimensions["battery_slots"] = max(dimensions.get("battery_slots", 1.0), 3.0)
        dimensions["width"] = max(dimensions.get("width", 90.0), 240.0)
        notes.append("detected three-slot layout")
    if any(word in text for word in ("wall", "mount", "screw", "bolt")):
        dimensions["hole_count"] = max(dimensions.get("hole_count", 0.0), 2.0)
    if any(word in text for word in ("flat bottom", "bench", "desk", "table")):
        dimensions["height"] = max(dimensions.get("height", 30.0), dimensions.get("thickness", 5.0) * 4.0)
        notes.append("favored flat-bottom stability")


def _apply_source_hints(text: str, dimensions: dict[str, float], notes: list[str]) -> None:
    if any(word in text for word in ("sturdy", "heavy", "strong", "reinforced", "remix")):
        dimensions["thickness"] = max(dimensions.get("thickness", 5.0), 7.0)
        dimensions["fillet_radius"] = max(dimensions.get("fillet_radius", 2.0), 2.5)
        notes.append("strengthened from source wording")
    if any(word in text for word in ("rounded", "smooth", "ergonomic")):
        dimensions["fillet_radius"] = max(dimensions.get("fillet_radius", 2.0), 4.0)
    if any(word in text for word in ("mini", "small", "compact")):
        dimensions["width"] *= 0.82
        dimensions["depth"] *= 0.82
        dimensions["height"] *= 0.85
        notes.append("scaled compact from wording")
    if any(word in text for word in ("large", "xl", "big")):
        dimensions["width"] *= 1.25
        dimensions["depth"] *= 1.15
        dimensions["height"] *= 1.12
        notes.append("scaled larger from wording")
    if "slide rail" in text or "slide rails" in text:
        dimensions["height"] = max(dimensions.get("height", 35.0), 46.0)
        dimensions["thickness"] = max(dimensions.get("thickness", 5.0), 7.0)
        notes.append("used slide-rail holder structure")
    if "wall mount" in text or "wall mounted" in text:
        dimensions["hole_count"] = max(dimensions.get("hole_count", 0.0), 4.0 if "battery" in text else 2.0)
        dimensions["thickness"] = max(dimensions.get("thickness", 5.0), 6.0)
        notes.append("used wall-mount screw pattern")


def _apply_product_family_hints(text: str, dimensions: dict[str, float], notes: list[str]) -> None:
    if any(word in text for word in ("dewalt", "makita", "milwaukee", "ryobi", "bosch", "battery", "batteries")):
        dimensions.update({"width": max(dimensions["width"], 104.0), "depth": max(dimensions["depth"], 92.0)})
        dimensions["height"] = max(dimensions["height"], 46.0)
        dimensions["hole_count"] = max(dimensions.get("hole_count", 0.0), 2.0)
        notes.append("used power-tool battery family proportions")
    if any(word in text for word in ("cdi", "ecu", "ecm", "ignition")):
        dimensions.update({"width": max(dimensions["width"], 86.0), "depth": max(dimensions["depth"], 68.0)})
        dimensions["height"] = max(dimensions["height"], 38.0)
        dimensions["hole_count"] = max(dimensions.get("hole_count", 0.0), 2.0)
        notes.append("used electronics-module holder proportions")
    if any(word in text for word in ("headset", "headphone", "headphones")):
        dimensions.update({"width": max(dimensions["width"], 120.0), "depth": max(dimensions["depth"], 120.0)})
        dimensions["height"] = max(dimensions["height"], 190.0)
    if "phone" in text:
        dimensions.update({"width": max(dimensions["width"], 86.0), "depth": max(dimensions["depth"], 82.0)})
        dimensions["height"] = max(dimensions["height"], 118.0)


def _clamp_dimensions(dimensions: dict[str, float]) -> None:
    limits = {
        "width": (10.0, 500.0),
        "depth": (10.0, 500.0),
        "height": (4.0, 500.0),
        "thickness": (1.0, 30.0),
        "fillet_radius": (0.0, 20.0),
        "chamfer_size": (0.0, 12.0),
        "hole_count": (0.0, 12.0),
        "hole_diameter": (1.0, 24.0),
        "wall_thickness": (0.8, 20.0),
        "slots": (1.0, 6.0),
        "battery_slots": (1.0, 6.0),
        "divider_count": (0.0, 8.0),
    }
    for key, (low, high) in limits.items():
        if key in dimensions:
            dimensions[key] = max(low, min(high, float(dimensions[key])))
