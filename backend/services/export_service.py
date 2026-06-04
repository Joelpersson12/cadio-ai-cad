"""Export service for common slicer/printer mesh formats."""

from __future__ import annotations

import os
import tempfile
import uuid
import zipfile
from xml.sax.saxutils import escape

from backend.services.cad_engine import TriMesh, apply_transform, make_box
from backend.services.session_manager import Session

SUPPORTED_FORMATS = {"stl", "obj", "3mf", "amf"}


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
        with open(path, "wb") as f:
            f.write(mesh.to_binary_stl())
    elif fmt == "obj":
        with open(path, "w", encoding="utf-8") as f:
            f.write("# Cadio OBJ export\n")
            for x, y, z in mesh.verts:
                f.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
            for a, b, c in mesh.tris:
                f.write(f"f {a + 1} {b + 1} {c + 1}\n")
    elif fmt == "amf":
        with open(path, "w", encoding="utf-8") as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
            f.write('<amf unit="millimeter">\n<object id="0">\n<mesh>\n<vertices>\n')
            for x, y, z in mesh.verts:
                f.write(
                    f"<vertex><coordinates><x>{x:.6f}</x><y>{y:.6f}</y><z>{z:.6f}</z></coordinates></vertex>\n"
                )
            f.write("</vertices>\n<volume>\n")
            for a, b, c in mesh.tris:
                f.write(f"<triangle><v1>{a}</v1><v2>{b}</v2><v3>{c}</v3></triangle>\n")
            f.write("</volume>\n</mesh>\n</object>\n</amf>\n")
    elif fmt == "3mf":
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", _content_types_3mf())
            zf.writestr("_rels/.rels", _rels_3mf())
            zf.writestr("3D/3dmodel.model", _model_3mf(mesh))

    return path


def _content_types_3mf() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
"""


def _rels_3mf() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
"""


def _model_3mf(mesh: TriMesh) -> str:
    vertices = "\n".join(
        f'<vertex x="{x:.6f}" y="{y:.6f}" z="{z:.6f}"/>'
        for x, y, z in mesh.verts
    )
    triangles = "\n".join(
        f'<triangle v1="{a}" v2="{b}" v3="{c}"/>'
        for a, b, c in mesh.tris
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">{escape("Cadio")}</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
{vertices}
        </vertices>
        <triangles>
{triangles}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>
"""


def media_type_for(fmt: str) -> str:
    """Return the HTTP media type for a given format."""
    return {
        "stl": "model/stl",
        "obj": "model/obj",
        "3mf": "model/3mf",
        "amf": "application/amf+xml",
    }.get(fmt, "application/octet-stream")
