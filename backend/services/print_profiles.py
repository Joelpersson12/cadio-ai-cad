"""Material, printer, scaling, and source print-setting recommendations."""

from __future__ import annotations

from typing import Any

from backend.services.session_manager import Session, get_object


MATERIALS: dict[str, dict[str, Any]] = {
    "PLA": {
        "label": "PLA",
        "aliases": ["pla"],
        "nozzle_temp_c": [200, 215],
        "bed_temp_c": [50, 60],
        "fan_percent": 100,
        "layer_height_mm": 0.20,
        "first_layer_height_mm": 0.24,
        "speed_mm_s": 60,
        "outer_wall_speed_mm_s": 35,
        "infill_percent": 15,
        "walls": 3,
        "top_bottom_layers": 4,
        "support": "Only if overhangs exceed 50 deg",
        "adhesion": "Skirt",
        "scale_compensation_percent": 100.0,
        "notes": ["Best default for easy decorative and functional prints."],
    },
    "PLA_PLUS": {
        "label": "PLA+",
        "aliases": ["pla+", "pla plus", "pla_plus", "pro pla"],
        "nozzle_temp_c": [205, 220],
        "bed_temp_c": [55, 60],
        "fan_percent": 100,
        "layer_height_mm": 0.20,
        "first_layer_height_mm": 0.24,
        "speed_mm_s": 58,
        "outer_wall_speed_mm_s": 34,
        "infill_percent": 18,
        "walls": 3,
        "top_bottom_layers": 4,
        "support": "Only if overhangs exceed 50 deg",
        "adhesion": "Skirt",
        "scale_compensation_percent": 100.1,
        "notes": ["Slightly tougher than regular PLA; good for holders and brackets."],
    },
    "PETG": {
        "label": "PETG",
        "aliases": ["petg", "pet-g"],
        "nozzle_temp_c": [230, 245],
        "bed_temp_c": [70, 85],
        "fan_percent": 35,
        "layer_height_mm": 0.20,
        "first_layer_height_mm": 0.26,
        "speed_mm_s": 45,
        "outer_wall_speed_mm_s": 28,
        "infill_percent": 18,
        "walls": 3,
        "top_bottom_layers": 5,
        "support": "Use tree/support only where necessary",
        "adhesion": "Skirt or brim for tall parts",
        "scale_compensation_percent": 100.2,
        "notes": ["Good for heat resistance and tougher clips; print slower than PLA."],
    },
    "ABS": {
        "label": "ABS",
        "aliases": ["abs"],
        "nozzle_temp_c": [240, 255],
        "bed_temp_c": [95, 110],
        "fan_percent": 0,
        "layer_height_mm": 0.20,
        "first_layer_height_mm": 0.26,
        "speed_mm_s": 45,
        "outer_wall_speed_mm_s": 25,
        "infill_percent": 20,
        "walls": 4,
        "top_bottom_layers": 5,
        "support": "Use supports for overhangs above 45 deg",
        "adhesion": "Brim",
        "scale_compensation_percent": 100.7,
        "notes": ["Use an enclosure and avoid drafts."],
    },
    "ASA": {
        "label": "ASA",
        "aliases": ["asa"],
        "nozzle_temp_c": [245, 260],
        "bed_temp_c": [95, 110],
        "fan_percent": 0,
        "layer_height_mm": 0.20,
        "first_layer_height_mm": 0.26,
        "speed_mm_s": 42,
        "outer_wall_speed_mm_s": 24,
        "infill_percent": 20,
        "walls": 4,
        "top_bottom_layers": 5,
        "support": "Use supports for overhangs above 45 deg",
        "adhesion": "Brim",
        "scale_compensation_percent": 100.6,
        "notes": ["Good UV/weather resistance; enclosure strongly recommended."],
    },
    "TPU": {
        "label": "TPU",
        "aliases": ["tpu", "flex", "flexible"],
        "nozzle_temp_c": [220, 235],
        "bed_temp_c": [35, 55],
        "fan_percent": 60,
        "layer_height_mm": 0.20,
        "first_layer_height_mm": 0.24,
        "speed_mm_s": 25,
        "outer_wall_speed_mm_s": 18,
        "infill_percent": 15,
        "walls": 3,
        "top_bottom_layers": 4,
        "support": "Avoid supports where possible",
        "adhesion": "Skirt",
        "scale_compensation_percent": 100.0,
        "notes": ["Slow print, low retraction, and direct drive preferred."],
    },
    "NYLON": {
        "label": "Nylon",
        "aliases": ["nylon", "pa", "pa6", "pa12"],
        "nozzle_temp_c": [250, 270],
        "bed_temp_c": [80, 100],
        "fan_percent": 15,
        "layer_height_mm": 0.20,
        "first_layer_height_mm": 0.26,
        "speed_mm_s": 38,
        "outer_wall_speed_mm_s": 24,
        "infill_percent": 20,
        "walls": 4,
        "top_bottom_layers": 5,
        "support": "Use supports for overhangs above 45 deg",
        "adhesion": "Brim",
        "scale_compensation_percent": 100.5,
        "notes": ["Dry filament before printing; enclosure preferred."],
    },
}


PRINTER_TUNING: dict[str, dict[str, Any]] = {
    "adventurer_3": {"speed_cap": 50, "speed_factor": 0.78, "enclosed": True, "note": "Conservative profile for the Adventurer 3 feeder and motion system."},
    "adventurer_5m": {"speed_cap": 120, "speed_factor": 1.35, "enclosed": False, "note": "Fast profile; lower speed for PETG/TPU."},
    "flashforge_ad5m_pro": {"speed_cap": 115, "speed_factor": 1.25, "enclosed": True, "note": "Fast enclosed Flashforge profile."},
    "creator_pro_2": {"speed_cap": 55, "speed_factor": 0.82, "enclosed": True, "note": "Stable dual-extruder profile."},
    "bambu_x1c": {"speed_cap": 180, "speed_factor": 1.8, "enclosed": True, "note": "High-speed enclosed Bambu profile."},
    "bambu_p1s": {"speed_cap": 160, "speed_factor": 1.65, "enclosed": True, "note": "High-speed enclosed Bambu profile."},
    "bambu_p1p": {"speed_cap": 150, "speed_factor": 1.55, "enclosed": False, "note": "High-speed Bambu profile; avoid ABS/ASA without enclosure."},
    "bambu_a1": {"speed_cap": 140, "speed_factor": 1.45, "enclosed": False, "note": "High-speed bedslinger profile."},
    "bambu_a1_mini": {"speed_cap": 130, "speed_factor": 1.35, "enclosed": False, "note": "Compact high-speed profile."},
    "creality_k1": {"speed_cap": 150, "speed_factor": 1.55, "enclosed": True, "note": "Fast CoreXY profile."},
    "creality_k1_max": {"speed_cap": 150, "speed_factor": 1.55, "enclosed": True, "note": "Large fast CoreXY profile."},
    "prusa_mk4": {"speed_cap": 95, "speed_factor": 1.15, "enclosed": False, "note": "Reliable Prusa profile."},
    "prusa_xl": {"speed_cap": 95, "speed_factor": 1.1, "enclosed": False, "note": "Large Prusa profile."},
    "prusa_mini": {"speed_cap": 70, "speed_factor": 0.95, "enclosed": False, "note": "Compact Prusa profile."},
    "voron_24_300": {"speed_cap": 170, "speed_factor": 1.65, "enclosed": True, "note": "Fast enclosed Voron profile."},
    "voron_24_350": {"speed_cap": 170, "speed_factor": 1.65, "enclosed": True, "note": "Fast enclosed Voron profile."},
}


def normalize_material(value: str | None) -> str:
    text = (value or "PLA").strip().lower()
    for key, profile in MATERIALS.items():
        aliases = [key.lower(), str(profile["label"]).lower()] + list(profile.get("aliases", []))
        if text in aliases:
            return key
    if "petg" in text:
        return "PETG"
    if "pla+" in text or "pla plus" in text:
        return "PLA_PLUS"
    if "pla" in text:
        return "PLA"
    if "abs" in text:
        return "ABS"
    if "asa" in text:
        return "ASA"
    if "tpu" in text or "flex" in text:
        return "TPU"
    if "nylon" in text or text.startswith("pa"):
        return "NYLON"
    return "PLA"


def material_profiles_response() -> dict[str, dict[str, Any]]:
    return {
        key: {
            "label": value["label"],
            "nozzle_temp_c": value["nozzle_temp_c"],
            "bed_temp_c": value["bed_temp_c"],
            "fan_percent": value["fan_percent"],
            "scale_compensation_percent": value["scale_compensation_percent"],
            "notes": value["notes"],
        }
        for key, value in MATERIALS.items()
    }


def _printer_tuning(printer_key: str, printer_name: str) -> dict[str, Any]:
    if printer_key in PRINTER_TUNING:
        return PRINTER_TUNING[printer_key]
    lower = f"{printer_key} {printer_name}".lower()
    if any(word in lower for word in ("qidi", "raise3d", "ultimaker")):
        return {"speed_cap": 90, "speed_factor": 1.05, "enclosed": True, "note": "Enclosed printer profile."}
    if any(word in lower for word in ("ender", "neptune", "kobra", "vyper")):
        return {"speed_cap": 75, "speed_factor": 0.98, "enclosed": False, "note": "Open bedslinger profile."}
    return {"speed_cap": 70, "speed_factor": 1.0, "enclosed": False, "note": "Generic FDM profile."}


def _active_object(session: Session) -> dict[str, Any] | None:
    selected = get_object(session, session.get("selected_object_id"))
    if selected is not None:
        return selected
    for oid in session.get("object_order", []):
        obj = session["objects"].get(oid)
        if obj is not None:
            return obj
    return None


def _active_source_settings(session: Session) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    active = _active_object(session)
    if active is not None:
        candidates.append(active)
    for oid in session.get("object_order", []):
        obj = session["objects"].get(oid)
        if obj is not None and obj not in candidates:
            candidates.append(obj)

    for obj in candidates:
        source_model = obj.get("source_model") if isinstance(obj.get("source_model"), dict) else {}
        settings = source_model.get("print_settings") if isinstance(source_model, dict) else {}
        if isinstance(settings, dict) and settings.get("has_creator_settings"):
            return settings
        matched = source_model.get("matched_example") if isinstance(source_model, dict) else {}
        if isinstance(matched, dict) and matched.get("source") == "printables" and matched.get("url"):
            try:
                from backend.services.design_providers import resolve_printables_model_metadata

                settings = resolve_printables_model_metadata(str(matched["url"]))
                if settings.get("has_creator_settings"):
                    return settings
            except Exception:
                continue
    return {}


def _source_field_number(fields: dict[str, Any], key: str) -> float | None:
    value = fields.get(key)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        import re

        match = re.search(r"\d+(?:[.,]\d+)?", value)
        if match:
            return float(match.group(0).replace(",", "."))
    return None


def recommended_print_settings(session: Session) -> dict[str, Any]:
    from backend.services.object_manager import DEFAULT_PRINTER, PRINTERS, scene_bounds

    selected_printer_key = str(session.get("printer") or "").strip()
    if selected_printer_key == "choose_printer":
        selected_printer_key = ""
    if selected_printer_key:
        printer_key = selected_printer_key
        printer = PRINTERS.get(printer_key, PRINTERS[DEFAULT_PRINTER])
    else:
        printer_key = ""
        printer = {"name": "Choose printer", "build_volume": (220, 220, 250)}
    printer_name = str(printer["name"])
    px, py, pz = [float(v) for v in printer["build_volume"]]
    tuning = _printer_tuning(printer_key, printer_name)

    active = _active_object(session)
    material_key = normalize_material(str((active or {}).get("material", "PLA")))
    material = MATERIALS[material_key]

    bounds = scene_bounds(session)
    bx = max(0.0, float(bounds.get("x", 0.0)))
    by = max(0.0, float(bounds.get("y", 0.0)))
    bz = max(0.0, float(bounds.get("z", 0.0)))
    if bx > 0 and by > 0 and bz > 0:
        fit_scale = min((px * 0.94) / bx, (py * 0.94) / by, (pz * 0.97) / bz)
        fit_scale_percent = max(1.0, min(999.0, fit_scale * 100.0))
    else:
        fit_scale_percent = 100.0
    fits_without_scaling = fit_scale_percent >= 100.0
    material_compensation = float(material["scale_compensation_percent"])
    recommended_scale = material_compensation if fits_without_scaling else min(fit_scale_percent, material_compensation)

    speed = min(float(material["speed_mm_s"]) * float(tuning["speed_factor"]), float(tuning["speed_cap"]))
    outer_speed = min(float(material["outer_wall_speed_mm_s"]) * float(tuning["speed_factor"]), speed * 0.72)

    source_settings = _active_source_settings(session)
    source_fields = source_settings.get("fields") if isinstance(source_settings.get("fields"), dict) else {}
    source_overrides: list[str] = []

    layer_height = float(material["layer_height_mm"])
    source_layer = _source_field_number(source_fields, "layer_height_mm")
    if source_layer and 0.04 <= source_layer <= 0.4:
        layer_height = source_layer
        source_overrides.append("layer height")

    infill = int(material["infill_percent"])
    source_infill = _source_field_number(source_fields, "infill_percent")
    if source_infill is not None and 0 <= source_infill <= 100:
        infill = int(round(source_infill))
        source_overrides.append("infill")

    source_scale = _source_field_number(source_fields, "scale_percent")
    if source_scale is not None and 1 <= source_scale <= 300:
        recommended_scale = min(source_scale, fit_scale_percent if not fits_without_scaling else source_scale)
        source_overrides.append("scale")

    support = str(material["support"])
    if source_fields.get("supports"):
        support = str(source_fields["supports"])
        source_overrides.append("supports")

    adhesion = str(material["adhesion"])
    if source_fields.get("adhesion"):
        adhesion = str(source_fields["adhesion"])
        source_overrides.append("adhesion")

    warnings: list[str] = []
    notes: list[str] = [str(tuning["note"])] + list(material.get("notes", []))
    if not fits_without_scaling:
        warnings.append(f"Model is too large for {printer_name}; scale to {recommended_scale:.1f}% or smaller.")
    if material_key in {"ABS", "ASA", "NYLON"} and not bool(tuning.get("enclosed")):
        warnings.append(f"{material['label']} is risky on open printers; use enclosure or choose PETG/PLA.")
    if material_key == "TPU" and "direct" not in printer_name.lower():
        notes.append("For TPU, reduce retraction and print slowly; direct drive works best.")
    if source_settings.get("has_creator_settings"):
        notes.append("Creator settings from Printables are shown and used where they are specific.")

    slicer = {
        "profile_source": f"Cadio tuned for {printer_name} + {material['label']}",
        "layer_height_mm": round(layer_height, 3),
        "first_layer_height_mm": material["first_layer_height_mm"],
        "nozzle_temp_c": list(material["nozzle_temp_c"]),
        "bed_temp_c": list(material["bed_temp_c"]),
        "fan_percent": material["fan_percent"],
        "print_speed_mm_s": int(round(speed)),
        "outer_wall_speed_mm_s": int(round(outer_speed)),
        "infill_percent": infill,
        "walls": material["walls"],
        "top_bottom_layers": material["top_bottom_layers"],
        "support": support,
        "adhesion": adhesion,
        "source_overrides": source_overrides,
    }

    return {
        "material": material_key,
        "material_label": material["label"],
        "printer": {
            "key": printer_key,
            "name": printer_name,
            "build_volume": [px, py, pz],
            "enclosed": bool(tuning.get("enclosed")),
        },
        "scale": {
            "fits_without_scaling": fits_without_scaling,
            "fit_scale_percent": round(fit_scale_percent, 1),
            "recommended_scale_percent": round(recommended_scale, 1),
            "material_compensation_percent": material_compensation,
            "max_model_size_mm": [round(px * 0.94, 1), round(py * 0.94, 1), round(pz * 0.97, 1)],
        },
        "slicer": slicer,
        "source_settings": source_settings,
        "warnings": warnings,
        "notes": notes[:5],
    }
