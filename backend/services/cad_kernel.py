"""Optional CadQuery/OpenCascade geometry backend.

CadQuery gives Cadio real B-rep operations such as shell, fillet, chamfer,
and boolean-safe solids.  The rest of the app still accepts TriMesh payloads,
so this module tessellates CadQuery solids into the existing frontend format.
"""

from __future__ import annotations

import math
from typing import Any

from backend.services.cad_engine import TriMesh


try:
    import cadquery as cq

    CADQUERY_AVAILABLE = True
except Exception:
    cq = None
    CADQUERY_AVAILABLE = False


def is_available() -> bool:
    return CADQUERY_AVAILABLE


def _solid_from(value: Any):
    if not CADQUERY_AVAILABLE:
        return None
    if hasattr(value, "val"):
        return value.val()
    return value


def to_trimesh(value: Any, tolerance: float = 0.08) -> TriMesh | None:
    """Tessellate a CadQuery object into Cadio's TriMesh format."""
    solid = _solid_from(value)
    if solid is None:
        return None

    try:
        vertices, triangles = solid.tessellate(tolerance)
    except Exception:
        return None

    mesh = TriMesh()
    for vertex in vertices:
        if hasattr(vertex, "toTuple"):
            x, y, z = vertex.toTuple()
        else:
            x, y, z = vertex
        mesh.verts.append((float(x), float(y), float(z)))

    for tri in triangles:
        a, b, c = tri
        mesh.tris.append((int(a), int(b), int(c)))

    return mesh


def _hole_specs(params: dict[str, float]) -> list[tuple[float, float, float, float, float]]:
    count = max(0, int(params.get("custom_hole_count", 0.0)))
    specs: list[tuple[float, float, float, float, float]] = []
    counterbore_diameter = max(0.0, float(params.get("counterbore_diameter", 0.0)))
    counterbore_depth = max(0.0, float(params.get("counterbore_depth", 0.0)))
    for index in range(count):
        x_key = f"custom_hole_{index}_x"
        y_key = f"custom_hole_{index}_y"
        d_key = f"custom_hole_{index}_diameter"
        if x_key not in params or y_key not in params:
            continue
        diameter = max(0.5, float(params.get(d_key, params.get("hole_diameter", 5.0))))
        specs.append((float(params[x_key]), float(params[y_key]), diameter, counterbore_diameter, counterbore_depth))
    generated_count = max(0, int(round(params.get("hole_count", 0.0)))) - len(specs)
    if generated_count > 0:
        width = max(1.0, float(params.get("width", 80.0)))
        depth = max(1.0, float(params.get("depth", 70.0)))
        diameter = max(1.0, float(params.get("hole_diameter", 5.0)))
        spacing = width / (generated_count + 1)
        for index in range(generated_count):
            specs.append((-width / 2.0 + spacing * (index + 1), depth * 0.18, diameter, counterbore_diameter, counterbore_depth))
    return specs


def _cut_vertical_holes(body: Any, params: dict[str, float], height: float):
    if not CADQUERY_AVAILABLE:
        return body
    for x, y, diameter, counterbore_diameter, counterbore_depth in _hole_specs(params):
        cutter = (
            cq.Workplane("XY")
            .center(x, y)
            .circle(diameter / 2.0)
            .extrude(height + 4.0)
            .translate((0.0, 0.0, -2.0))
        )
        body = body.cut(cutter)
        if counterbore_diameter > diameter and counterbore_depth > 0:
            recess = (
                cq.Workplane("XY")
                .center(x, y)
                .circle(counterbore_diameter / 2.0)
                .extrude(counterbore_depth + 2.0)
                .translate((0.0, 0.0, max(0.0, height - counterbore_depth)))
            )
            body = body.cut(recess)
    return body


def make_box_body(
    width: float,
    depth: float,
    height: float,
    *,
    fillet: float = 0.0,
    chamfer: float = 0.0,
    shell_wall: float = 0.0,
    params: dict[str, float] | None = None,
    edge_target: str = "all",
    edge_operations: list[dict[str, Any]] | None = None,
) -> TriMesh | None:
    """Create a true CAD box with optional shell/fillet/chamfer."""
    if not CADQUERY_AVAILABLE:
        return None

    try:
        body = cq.Workplane("XY").box(width, depth, height, centered=(True, True, False))

        size_limit = min(width / 2.0 - 0.1, depth / 2.0 - 0.1, height / 2.0 - 0.1)

        def edge_selectors(target: str):
            """Ordered list of edge selectors to try for a given target.

            Returns the requested selection first, then progressively safer
            subsets.  Filleting *every* edge of a box (or any edge set that
            includes the circular hole rims) frequently throws in OCC, so we
            fall back to the vertical corner edges and finally the top rim
            rather than letting the whole operation fail and collapse to a
            crude mesh approximation.
            """
            normalized = (target or "all").lower()
            if "hole" in normalized:
                return [lambda: body.edges("%CIRCLE")]
            if "top" in normalized:
                return [lambda: body.faces(">Z").edges(), lambda: body.edges("|Z")]
            if "bottom" in normalized or "under" in normalized:
                return [lambda: body.faces("<Z").edges(), lambda: body.edges("|Z")]
            if "right" in normalized:
                return [lambda: body.faces(">X").edges()]
            if "left" in normalized:
                return [lambda: body.faces("<X").edges()]
            if "back" in normalized:
                # Three.js Z+ → backend Y+ → CadQuery >Y
                return [lambda: body.faces(">Y").edges()]
            if "front" in normalized:
                # Three.js Z- → backend Y- → CadQuery <Y
                return [lambda: body.faces("<Y").edges()]
            if "corner" in normalized:
                return [lambda: body.edges("|Z")]
            if "side" in normalized:
                return [lambda: body.edges("|Z"), lambda: body.faces(">Z").edges()]
            # "all" / unspecified — try every edge first (preserves the fully
            # rounded box when OCC can do it), then fall back to the vertical
            # corners and finally the top rim so a box with holes still rounds
            # cleanly instead of collapsing to the crude mesh fallback.
            return [
                lambda: body.edges(),
                lambda: body.edges("|Z"),
                lambda: body.faces(">Z").edges(),
            ]

        def apply_round(op: str, target: str, amount: float) -> bool:
            """Try op on the target with shrinking size and safer edge subsets."""
            nonlocal body
            base = max(0.1, min(amount, size_limit))
            for size in (base, base * 0.6, base * 0.35):
                if size < 0.1:
                    continue
                for make_sel in edge_selectors(target):
                    try:
                        selection = make_sel()
                        body = selection.fillet(size) if op == "fillet" else selection.chamfer(size)
                        return True
                    except Exception:
                        continue
            return False

        body = _cut_vertical_holes(body, params or {}, height)

        if shell_wall > 0:
            wall = max(0.5, min(shell_wall, width / 3.0, depth / 3.0, height / 2.0))
            try:
                body = body.faces(">Z").shell(-wall)
            except Exception:
                pass

        applied_edge_history = False
        for item in edge_operations or []:
            op = str(item.get("operation", "")).lower()
            target = str(item.get("target", edge_target or "all"))
            amount = max(0.0, float(item.get("amount", 0.0)))
            if amount <= 0 or op not in {"fillet", "chamfer"}:
                continue
            if apply_round(op, target, amount):
                applied_edge_history = True

        if not applied_edge_history and fillet > 0:
            apply_round("fillet", edge_target, fillet)
        elif not applied_edge_history and chamfer > 0:
            apply_round("chamfer", edge_target, chamfer)

        return to_trimesh(body)
    except Exception:
        return None


def make_cylinder_body(radius: float, height: float) -> TriMesh | None:
    if not CADQUERY_AVAILABLE:
        return None
    try:
        return to_trimesh(cq.Workplane("XY").circle(radius).extrude(height))
    except Exception:
        return None


def _box_solid(width: float, depth: float, height: float, pos: tuple[float, float, float]):
    return cq.Workplane("XY").box(width, depth, height, centered=(True, True, False)).translate(pos)


def _side_rib_solid(
    x: float,
    y0: float,
    y1: float,
    z0: float,
    z1: float,
    thickness: float,
):
    half = thickness / 2.0
    points = [
        (x - half, y0, z0),
        (x - half, y1, z0),
        (x - half, y1, z1),
        (x + half, y0, z0),
        (x + half, y1, z0),
        (x + half, y1, z1),
    ]
    faces = [
        (0, 1, 2),
        (3, 5, 4),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    return cq.Solid.makeShell(
        [
            cq.Face.makeFromWires(cq.Wire.makePolygon([cq.Vector(*points[i]) for i in face] + [cq.Vector(*points[face[0]])]))
            for face in faces
        ]
    ).makeSolid()


def make_phone_stand_body(params: dict[str, float]) -> TriMesh | None:
    """Create a printable phone stand from real CAD solids."""
    if not CADQUERY_AVAILABLE:
        return None

    try:
        width = max(72.0, min(125.0, params.get("width", 88.0)))
        depth = max(65.0, min(120.0, params.get("depth", 82.0)))
        height = max(85.0, min(165.0, params.get("height", 118.0)))
        thickness = max(5.0, min(12.0, params.get("thickness", 7.0)))
        angle = max(58.0, min(75.0, params.get("angle", 68.0)))
        fillet = max(0.0, min(params.get("fillet_radius", 2.0), thickness * 0.45))
        chamfer = max(0.0, min(params.get("chamfer_size", 0.0), thickness * 0.45))

        base = _box_solid(width, depth, thickness, (0.0, 0.0, 0.0))
        lip_depth = max(thickness * 1.45, 10.0)
        lip_height = max(thickness * 2.0, 13.0)
        lip = _box_solid(
            width * 0.78,
            lip_depth,
            lip_height,
            (0.0, -depth / 2.0 + lip_depth / 2.0, thickness),
        )

        lean = math.tan(math.radians(90.0 - angle)) * height
        bottom_y = -depth * 0.12
        top_y = min(depth * 0.36, bottom_y + lean)
        support_length = math.hypot(top_y - bottom_y, height - thickness)
        support_angle = math.degrees(math.atan2(height - thickness, top_y - bottom_y)) - 90.0
        support = (
            cq.Workplane("XY")
            .box(width * 0.70, thickness, support_length, centered=(True, True, False))
            .rotate((0, 0, 0), (1, 0, 0), -support_angle)
            .translate((0.0, bottom_y, thickness))
        )

        solid = base.union(lip).union(support)
        for x in (-width * 0.41, width * 0.41):
            solid = solid.union(_side_rib_solid(x, bottom_y, top_y, thickness, height * 0.66, max(thickness * 0.75, 4.2)))
            solid = solid.union(_box_solid(max(thickness * 0.65, 4.5), depth * 0.54, thickness * 1.25, (x, -depth * 0.02, thickness)))

        cable_slot = (
            cq.Workplane("XY")
            .center(0, -depth / 2.0 + lip_depth * 0.52)
            .rect(max(width * 0.18, 14.0), lip_depth * 1.6)
            .extrude(lip_height + thickness + 6.0)
            .translate((0.0, 0.0, -2.0))
        )
        solid = solid.cut(cable_slot)

        solid = _cut_vertical_holes(solid, params, height + thickness + lip_height)

        if fillet > 0:
            solid = solid.edges().fillet(fillet)
        elif chamfer > 0:
            solid = solid.edges().chamfer(chamfer)

        return to_trimesh(solid)
    except Exception:
        return None


def make_text_body(
    label: str,
    font_size: float,
    depth: float,
    font: str = "Liberation Sans",
) -> TriMesh | None:
    """Create high-quality 3D text via CadQuery's TrueType font engine.

    Returns a mesh in canonical text-label space:
      x = left / right  (centered at 0)
      y = extrusion / depth direction
      z = up (letter height)

    Returns None if CadQuery is unavailable or the font cannot be found;
    the caller falls back to the pixel-grid font in that case.
    """
    if not CADQUERY_AVAILABLE:
        return None

    clean = str(label or "").strip()[:40]
    if not clean:
        return None

    font_size = max(1.0, float(font_size))
    depth = max(0.2, float(depth))

    # Try fonts in order of preference; stop at the first that succeeds.
    for font_name in (font, "Liberation Sans", "Arial", "FreeSans", "DejaVu Sans"):
        if not font_name:
            continue
        try:
            solid = (
                cq.Workplane("XY")
                .text(
                    clean,
                    fontsize=font_size,
                    distance=depth,
                    halign="center",
                    valign="bottom",
                    font=font_name,
                )
            )
            mesh = to_trimesh(solid, tolerance=0.06)
            if mesh is None or not mesh.verts:
                continue

            # CadQuery text lies in the XY plane: x=left-right, y=up, z=extrusion.
            # Canonical text-label space: x=left-right, y=extrusion, z=up.
            mesh.verts = [(x, z, y) for x, y, z in mesh.verts]
            return mesh
        except Exception:
            continue

    return None


def make_battery_holder_body(params: dict[str, float]) -> TriMesh | None:
    """Create a source-like power-tool battery wall mount from CAD booleans.

    The layout follows the common Printables DeWalt-style holder family: a
    clean long wall plate, repeated raised battery pads, slide-register rails,
    screw through-holes with shallow counterbores, and latch relief pockets.
    """
    if not CADQUERY_AVAILABLE:
        return None

    try:
        slots = max(1, min(6, int(round(float(params.get("num_batteries", params.get("battery_slots", 3.0)))))))
        spacing = max(62.0, min(110.0, float(params.get("battery_spacing", 85.0))))
        holder_length = max(58.0, min(120.0, float(params.get("holder_length", 85.0))))
        margin = max(6.0, min(24.0, float(params.get("margin_width", 10.0))))
        base_t = max(3.0, min(12.0, float(params.get("base_thickness", params.get("thickness", 6.0)))))
        core_w = max(28.0, min(54.0, float(params.get("core_width", 40.0))))
        core_h = max(7.0, min(22.0, float(params.get("core_height", 11.5))))
        rail_w = max(core_w + 8.0, min(76.0, float(params.get("rail_width", 52.0))))
        rail_t = max(2.5, min(9.0, float(params.get("rail_thickness", 4.5))))
        stop_t = max(3.0, min(12.0, float(params.get("stop_thickness", 5.0))))
        screw_d = max(3.0, min(8.0, float(params.get("screw_diameter", 4.5))))
        screw_head_d = max(screw_d + 2.0, min(16.0, float(params.get("screw_head_diameter", 9.0))))
        counterbore_depth = max(1.0, min(base_t + rail_t - 0.5, float(params.get("counterbore_depth", 2.4))))
        latch_y = max(8.0, min(holder_length * 0.45, float(params.get("latch_y_pos", 18.0))))
        latch_w = max(8.0, min(core_w, float(params.get("latch_width", 16.0))))

        base_w = spacing * (slots - 1) + rail_w + margin * 2.0
        base_d = holder_length + margin * 2.0
        deck_w = rail_w + margin * 0.45
        deck_d = holder_length * 0.70
        rail_depth = deck_d * 0.82
        total_h = base_t + rail_t + core_h * 0.62 + stop_t

        params["num_batteries"] = float(slots)
        params["battery_slots"] = float(slots)
        params["width"] = base_w
        params["depth"] = base_d
        params["height"] = total_h
        params["thickness"] = base_t
        params["hole_count"] = float(slots * 2)
        params["hole_diameter"] = screw_d
        params["counterbore_diameter"] = screw_head_d
        params["counterbore_depth"] = counterbore_depth

        solid = _box_solid(base_w, base_d, base_t, (0.0, 0.0, 0.0))

        # Subtle perimeter lips make the plate read as a molded printable part.
        lip_h = max(1.2, base_t * 0.34)
        solid = solid.union(_box_solid(base_w - 4.0, 3.2, lip_h, (0.0, -base_d / 2.0 + 3.0, base_t)))
        solid = solid.union(_box_solid(base_w - 4.0, 3.2, lip_h, (0.0, base_d / 2.0 - 3.0, base_t)))

        for slot in range(slots):
            cx = (slot - (slots - 1) / 2.0) * spacing

            # Raised top island, matching the simpler CADAM/Printables silhouette.
            solid = solid.union(_box_solid(deck_w, deck_d, rail_t, (cx, 0.0, base_t)))

            # Battery slide registers: two clean side rails and a low center tongue.
            side_rail_h = core_h * 0.62
            side_rail_w = max(4.2, min(8.0, rail_t * 1.35))
            for x in (cx - core_w / 2.0, cx + core_w / 2.0):
                solid = solid.union(_box_solid(side_rail_w, rail_depth, side_rail_h, (x, -2.0, base_t + rail_t)))
            solid = solid.union(_box_solid(core_w * 0.50, rail_depth * 0.62, max(3.0, side_rail_h * 0.34), (cx, -2.0, base_t + rail_t)))

            # Rear stop block. This is deliberately broad and flat like the source files.
            solid = solid.union(
                _box_solid(
                    deck_w,
                    stop_t,
                    side_rail_h + stop_t * 0.55,
                    (cx, deck_d / 2.0 - stop_t / 2.0, base_t + rail_t),
                )
            )

            # Shallow square latch relief on the top pad.
            latch_cut = _box_solid(
                latch_w,
                latch_w * 0.72,
                counterbore_depth + 1.0,
                (cx, -holder_length / 2.0 + latch_y, base_t + rail_t - counterbore_depth * 0.82),
            )
            solid = solid.cut(latch_cut)

            for y in (-holder_length * 0.25, holder_length * 0.25):
                through = (
                    cq.Workplane("XY")
                    .center(cx, y)
                    .circle(screw_d / 2.0)
                    .extrude(total_h + 6.0)
                    .translate((0.0, 0.0, -2.0))
                )
                counterbore = (
                    cq.Workplane("XY")
                    .center(cx, y)
                    .circle(screw_head_d / 2.0)
                    .extrude(counterbore_depth + 1.0)
                    .translate((0.0, 0.0, base_t + rail_t - counterbore_depth))
                )
                solid = solid.cut(through).cut(counterbore)

        fillet = max(0.0, min(float(params.get("fillet_radius", 1.2)), 1.8))
        chamfer = max(0.0, min(float(params.get("chamfer_size", 0.0)), 1.5))
        if fillet > 0:
            try:
                solid = solid.edges().fillet(fillet)
            except Exception:
                pass
        elif chamfer > 0:
            try:
                solid = solid.edges().chamfer(chamfer)
            except Exception:
                pass

        return to_trimesh(solid, tolerance=0.04)
    except Exception:
        return None
