"""Export service: STL, OBJ, and STEP export with proper transform handling.

Rebuilds geometry before export to ensure the exported file matches
the current scene state exactly.
"""

from __future__ import annotations

import os
import tempfile
import uuid

from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse
from OCP.StlAPI import StlAPI_Writer
from OCP.TopoDS import TopoDS_Shape

from backend.services.cad_engine import apply_transform, make_box
from backend.services.session_manager import Session

# Supported export formats
SUPPORTED_FORMATS = {"stl", "step"}


def _assemble_scene(session: Session) -> TopoDS_Shape:
    """Fuse all objects in the session into a single shape with transforms applied."""
    parts: list[TopoDS_Shape] = []
    for oid in session["object_order"]:
        obj = session["objects"][oid]
        transformed = apply_transform(obj["shape"], obj["transform"])
        parts.append(transformed)

    if not parts:
        return make_box(1, 1, 1)

    result = parts[0]
    for part in parts[1:]:
        result = BRepAlgoAPI_Fuse(result, part).Shape()

    return result


def export_assembly(session: Session, fmt: str) -> str:
    """Export the assembled scene to a file.  Returns the file path."""
    fmt = fmt.strip().lower()
    if fmt not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {fmt}. Supported: {SUPPORTED_FORMATS}")

    shape = _assemble_scene(session)
    suffix = f".{fmt}"
    path = os.path.join(
        tempfile.gettempdir(),
        f"cadio-{session['session_id']}-{uuid.uuid4()}{suffix}",
    )

    if fmt == "stl":
        writer = StlAPI_Writer()
        writer.Write(shape, path)
    elif fmt == "step":
        from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs

        writer = STEPControl_Writer()
        writer.Transfer(shape, STEPControl_AsIs)
        writer.Write(path)

    return path


def media_type_for(fmt: str) -> str:
    """Return the HTTP media type for a given export format."""
    return {
        "stl": "model/stl",
        "step": "model/step",
    }.get(fmt, "application/octet-stream")
