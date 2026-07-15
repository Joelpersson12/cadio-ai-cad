"""Model scanning for imported meshes.

Measures what an imported STL actually contains — overall size, whether it
has a flat printable base, the base plate thickness, and any through-holes
(position + diameter) — so prompt edits can target the REAL model instead of
guessing from its bounding box. This is what lets "make the holes 6mm" work
on a random Printables bracket: the holes are found by measuring, not by
trusting stored parameters that an imported mesh never had.

Everything here is pure geometry on the TriMesh (verts + tris), dependency
free, and best-effort: a scan that finds nothing returns an empty result and
never raises.
"""

from __future__ import annotations

import math
from typing import Any

Vec3 = tuple[float, float, float]


def _tri_normal_and_area(a: Vec3, b: Vec3, c: Vec3) -> tuple[Vec3, float]:
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    if length <= 1e-12:
        return (0.0, 0.0, 0.0), 0.0
    return (nx / length, ny / length, nz / length), length / 2.0


def _fit_circle_xy(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """Least-squares (Kåsa) circle fit. Returns (cx, cy, r, rms_residual)."""
    n = len(points)
    if n < 3:
        return 0.0, 0.0, 0.0, float("inf")
    sx = sum(p[0] for p in points) / n
    sy = sum(p[1] for p in points) / n
    u = [p[0] - sx for p in points]
    v = [p[1] - sy for p in points]
    suu = sum(a * a for a in u)
    svv = sum(a * a for a in v)
    suv = sum(a * b for a, b in zip(u, v))
    suuu = sum(a * a * a for a in u)
    svvv = sum(a * a * a for a in v)
    suvv = sum(a * b * b for a, b in zip(u, v))
    svuu = sum(b * a * a for a, b in zip(u, v))
    det = suu * svv - suv * suv
    if abs(det) < 1e-12:
        return 0.0, 0.0, 0.0, float("inf")
    ucx = (svv * (suuu + suvv) - suv * (svvv + svuu)) / (2.0 * det)
    ucy = (suu * (svvv + svuu) - suv * (suuu + suvv)) / (2.0 * det)
    r = math.sqrt(ucx * ucx + ucy * ucy + (suu + svv) / n)
    cx, cy = ucx + sx, ucy + sy
    rms = math.sqrt(
        sum((math.hypot(p[0] - cx, p[1] - cy) - r) ** 2 for p in points) / n
    )
    return cx, cy, r, rms


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def scan_trimesh(mesh: Any) -> dict[str, Any]:
    """Measure an imported mesh. Returns a dict:

    {
      "dims": (w, d, h) in mm,
      "tri_count": int,
      "flat_bottom": bool,
      "base_thickness": float | None,   # mm, when a bottom plate is detected
      "holes": [{"cx", "cy", "diameter", "depth"}...],  # local coordinates
      "summary": "120×80×30mm · flat base 4mm · 4 holes Ø5.0mm",
    }
    """
    empty: dict[str, Any] = {
        "dims": (0.0, 0.0, 0.0),
        "tri_count": 0,
        "flat_bottom": False,
        "base_thickness": None,
        "holes": [],
        "summary": "",
    }
    try:
        verts = list(getattr(mesh, "verts", []) or [])
        tris = list(getattr(mesh, "tris", []) or [])
        if not verts or not tris:
            return empty

        xs = [v[0] for v in verts]
        ys = [v[1] for v in verts]
        zs = [v[2] for v in verts]
        minx, maxx = min(xs), max(xs)
        miny, maxy = min(ys), max(ys)
        minz, maxz = min(zs), max(zs)
        w, d, h = maxx - minx, maxy - miny, maxz - minz
        diag = max(1e-6, math.sqrt(w * w + d * d))

        # Classify triangles by orientation and measure areas.
        down_area_at_floor = 0.0
        total_down_area = 0.0
        horizontal_up_z: list[tuple[float, float]] = []  # (z, area) of up faces
        for i, j, k in tris:
            try:
                a, b, c = verts[i], verts[j], verts[k]
            except IndexError:
                continue
            n, area = _tri_normal_and_area(a, b, c)
            if area <= 1e-9:
                continue
            nz = n[2]
            zc = (a[2] + b[2] + c[2]) / 3.0
            if nz <= -0.85:
                total_down_area += area
                if zc <= minz + max(0.6, h * 0.02):
                    down_area_at_floor += area
            elif nz >= 0.85:
                horizontal_up_z.append((zc, area))

        flat_bottom = total_down_area > 0 and (down_area_at_floor / total_down_area) >= 0.6

        # Base plate thickness: the lowest strong band of upward-facing area
        # above the floor is the top surface of the bottom plate.
        base_thickness: float | None = None
        if flat_bottom and horizontal_up_z:
            band: dict[float, float] = {}
            for z, area in horizontal_up_z:
                dz = z - minz
                if 0.4 <= dz <= max(1.0, h * 0.8):
                    key = round(dz * 2) / 2
                    band[key] = band.get(key, 0.0) + area
            if band:
                strong = [dz for dz, area in band.items() if area >= 0.05 * (w * d)]
                if strong:
                    base_thickness = round(min(strong), 1)

        # ── Through-hole detection via rim loops ──────────────────────────
        # A bore shows up as a closed boundary loop in the horizontal surface
        # triangles (the rim where the top/bottom face meets the hole). This
        # works whether the bore walls are modeled or the cut left them open,
        # and on imported STLs. Boundary edge = an edge used by exactly one
        # horizontal triangle (position-quantized: boolean cuts duplicate
        # vertices, so index identity can't be trusted).
        holes: list[dict[str, float]] = []

        def _pk(v: Vec3) -> tuple[int, int]:
            return (round(v[0] * 10), round(v[1] * 10))

        horiz_tris = []
        for i, j, k in tris:
            try:
                a, b, c = verts[i], verts[j], verts[k]
            except IndexError:
                continue
            n, area = _tri_normal_and_area(a, b, c)
            if area > 1e-9 and abs(n[2]) >= 0.85:
                horiz_tris.append((a, b, c))
        edge_count: dict[tuple[tuple[int, int], tuple[int, int]], int] = {}
        edge_pts: dict[tuple[int, int], tuple[float, float]] = {}
        for a, b, c in horiz_tris:
            for p, q in ((a, b), (b, c), (c, a)):
                kp, kq = _pk(p), _pk(q)
                if kp == kq:
                    continue
                edge = (kp, kq) if kp < kq else (kq, kp)
                edge_count[edge] = edge_count.get(edge, 0) + 1
                edge_pts[kp] = (p[0], p[1])
                edge_pts[kq] = (q[0], q[1])

        # Drop axis-aligned boundary segments: boolean-cut decomposition leaves
        # T-junction seams along the x/y cut planes that masquerade as
        # boundary edges. Rim segments of a bore are predominantly diagonal,
        # so losing the few axis-aligned ones barely dents coverage.
        def _is_axis_aligned(e: tuple[tuple[int, int], tuple[int, int]]) -> bool:
            (x1, y1), (x2, y2) = e
            return x1 == x2 or y1 == y2

        boundary = [
            e for e, cnt in edge_count.items() if cnt == 1 and not _is_axis_aligned(e)
        ]
        if boundary:
            keys = sorted({k for e in boundary for k in e})
            key_idx = {k: i for i, k in enumerate(keys)}
            uf = _UnionFind(len(keys))
            for kp, kq in boundary:
                uf.union(key_idx[kp], key_idx[kq])
            # Also union by PROXIMITY (2mm grid): dropping the seam edges
            # above disconnects a rim into arc fragments; spatially adjacent
            # fragments belong to the same rim.
            grid: dict[tuple[int, int], list[int]] = {}
            for k in keys:
                px, py = edge_pts[k]
                grid.setdefault((int(px // 2), int(py // 2)), []).append(key_idx[k])
            for (gx, gy), members in grid.items():
                anchor = members[0]
                for m in members[1:]:
                    uf.union(anchor, m)
                for nx2, ny2 in ((gx + 1, gy), (gx, gy + 1), (gx + 1, gy + 1), (gx + 1, gy - 1)):
                    for m in grid.get((nx2, ny2), []):
                        uf.union(anchor, m)
            loops: dict[int, list[tuple[float, float]]] = {}
            for k in keys:
                loops.setdefault(uf.find(key_idx[k]), []).append(edge_pts[k])

            max_hole_r = 0.4 * min(w, d) if min(w, d) > 0 else 0.0
            for pts in loops.values():
                if len(pts) < 5:
                    continue
                cx, cy, r, rms = _fit_circle_xy(pts)
                if rms > max(0.4, 0.15 * max(r, 0.3)):
                    # One trim-refit pass: keep points near the median radius
                    # and refit — rescues rims polluted by leftover seam points.
                    dists = sorted(math.hypot(p[0] - cx, p[1] - cy) for p in pts)
                    med = dists[len(dists) // 2]
                    kept = [
                        p for p in pts if abs(math.hypot(p[0] - cx, p[1] - cy) - med) <= max(0.6, 0.2 * med)
                    ]
                    if len(kept) >= 5:
                        cx, cy, r, rms = _fit_circle_xy(kept)
                        pts = kept
                if r <= 0.3 or r > max_hole_r:
                    continue
                if rms > max(0.4, 0.15 * r):
                    continue
                # A rim surrounds its center; an outer corner arc doesn't.
                angles = sorted(math.atan2(p[1] - cy, p[0] - cx) for p in pts)
                gaps = [b2 - a2 for a2, b2 in zip(angles, angles[1:])]
                gaps.append(2 * math.pi - (angles[-1] - angles[0]))
                if max(gaps) > math.radians(100):
                    continue
                # Must sit inside the footprint, not trace its outline.
                if not (minx + 0.02 * diag < cx < maxx - 0.02 * diag):
                    continue
                if not (miny + 0.02 * diag < cy < maxy - 0.02 * diag):
                    continue
                holes.append(
                    {"cx": round(cx, 2), "cy": round(cy, 2), "diameter": round(2 * r, 2), "depth": round(h, 2)}
                )
            # The same bore leaves a rim in the top AND bottom face — merge.
            merged: list[dict[str, float]] = []
            for hole in sorted(holes, key=lambda item: item["diameter"]):
                dup = next(
                    (
                        m
                        for m in merged
                        if math.hypot(m["cx"] - hole["cx"], m["cy"] - hole["cy"])
                        < 0.6 * max(m["diameter"], hole["diameter"])
                    ),
                    None,
                )
                if dup is None:
                    merged.append(hole)
            holes = sorted(merged, key=lambda item: (item["cx"], item["cy"]))

        parts = [f"{w:.0f}×{d:.0f}×{h:.0f}mm"]
        if flat_bottom:
            parts.append(f"flat base{f' {base_thickness:g}mm' if base_thickness else ''}")
        if holes:
            diams = sorted({item["diameter"] for item in holes})
            dtxt = "/".join(f"{item:g}" for item in diams[:3])
            parts.append(f"{len(holes)} hole{'s' if len(holes) != 1 else ''} Ø{dtxt}mm")
        return {
            "dims": (round(w, 1), round(d, 1), round(h, 1)),
            "tri_count": len(tris),
            "flat_bottom": flat_bottom,
            "base_thickness": base_thickness,
            "holes": holes,
            "summary": " · ".join(parts),
        }
    except Exception:  # noqa: BLE001 — scanning must never break import/edit
        return empty
