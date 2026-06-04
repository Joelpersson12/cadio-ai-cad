"""Print analysis service: printability scoring, overhang detection,
wall thickness checks, and build volume validation.
"""

from __future__ import annotations

from backend.models.schema import PrintAssistantResult
from backend.services.object_manager import (
    DEFAULT_PRINTER,
    PRINTERS,
    scene_bounds,
)
from backend.services.session_manager import Session, get_selected_object


def analyze_printability(session: Session) -> PrintAssistantResult:
    """Run printability checks on the current session and return results."""
    warnings: list[str] = []
    checks: list[str] = []
    hints: list[str] = []

    # Build volume check
    bounds = scene_bounds(session)
    printer_key = session.get("printer", DEFAULT_PRINTER)
    printer = PRINTERS.get(printer_key, PRINTERS[DEFAULT_PRINTER])
    px, py, pz = printer["build_volume"]

    if bounds["x"] > px or bounds["y"] > py or bounds["z"] > pz:
        warnings.append(
            f"Model exceeds {printer['name']} build volume " f"({px}x{py}x{pz} mm)"
        )
    else:
        checks.append(f"Fits {printer['name']} build volume")

    # Selected object checks
    if not session.get("selected_object_id") or not session.get("object_order"):
        hints.append("No model selected")
        return PrintAssistantResult(
            warnings=warnings,
            checks=checks,
            hints=hints,
            printability_score=100,
        )

    selected = get_selected_object(session)
    params = selected["parameters"]

    # Wall thickness
    wall = params.get("wall_thickness", 3.0)
    if wall < 1.2:
        warnings.append(f"Wall thickness ({wall:.1f} mm) below minimum 1.2 mm")
    elif wall < 2.0:
        hints.append("Consider increasing wall thickness for durability")
    else:
        checks.append(f"Wall thickness ({wall:.1f} mm) acceptable")

    # Overhang angle
    angle = params.get("angle", 70.0)
    overhang = 90.0 - angle
    if overhang > 50.0:
        warnings.append(f"Overhang angle ({overhang:.0f} deg) may need supports")
    elif overhang > 40.0:
        hints.append("Overhang is borderline; consider reducing angle")
    else:
        checks.append("Overhang angle within printable range")

    # Thickness
    thickness = params.get("thickness", 8.0)
    if thickness < 3.0:
        warnings.append(f"Base thickness ({thickness:.1f} mm) very thin")
    elif thickness < 5.0:
        hints.append("Increase base thickness for stronger parts")
    else:
        checks.append(f"Base thickness ({thickness:.1f} mm) is good")

    # Hole diameter check
    hole_count = int(params.get("hole_count", 0))
    hole_diameter = params.get("hole_diameter", 5.0)
    if hole_count > 0 and hole_diameter < 2.0:
        warnings.append(
            f"Hole diameter ({hole_diameter:.1f} mm) may be too small to print"
        )

    # Score: start at 100, deduct per warning
    score = max(0, min(100, 100 - len(warnings) * 18))

    return PrintAssistantResult(
        warnings=warnings,
        checks=checks,
        hints=hints,
        printability_score=score,
    )
