"""Export service: binary STL export with proper transform handling.

Uses the pure-Python TriMesh geometry -- no OCP / libGL required.
"""

from __future__ import annotations

import os
import tempfile
import uuid

from backend.services.cad_engine import TriMesh, apply_transform, make_box
from backend.services.session_manager import Session

# Supported export formats
SUPPORTED_FORMATS = {"stl"}


def _assemble_scene(session: Session) -> TriMesh:
    """Merge all objects in the session into a single mesh with transforms."""
    combined = TriMesh()
    for oid in session["object_order"]:
        obj = session["objects"][oid]
        transformed = apply_transform(obj["shape"], obj["transform"])
        combined = combined.merge(transformed)

    if not combined.verts:
        combined = make_box(1, 1, 1)

    return combined


def export_assembly(session: Session, fmt: str) -> str:
    """Export the assembled scene to a file.  Returns the file path."""
    fmt = fmt.strip().lower()
    if fmt not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {fmt}. Supported: {SUPPORTED_FORMATS}")

    mesh = _assemble_scene(session)
    path = os.path.join(
        tempfile.gettempdir(),
        f"cadio-{session['session_id']}-{uuid.uuid4()}.{fmt}",
    )

    if fmt == "stl":
        data = mesh.to_binary_stl()
        with open(path, "wb") as f:
            f.write(data)

    return path


def media_type_for(fmt: str) -> str:
    """Return the HTTP media type for a given export format."""
    return {
        "stl": "model/stl",
    }.get(fmt, "application/octet-stream")
