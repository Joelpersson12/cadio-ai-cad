import math
import os
import re
import tempfile
import traceback
import uuid
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List, Optional

import cadquery as cq
import uvicorn
from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel


app = FastAPI(title="Cadio Live CAD Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: Dict[str, Dict[str, Any]] = {}
sessions_lock = RLock()


PRINTERS = {
    "adventurer_3": {"name": "Flashforge Adventurer 3", "build_volume": (150, 150, 150)},
    "adventurer_5m": {"name": "Flashforge Adventurer 5M", "build_volume": (220, 220, 250)},
    "creator_pro_2": {"name": "Flashforge Creator Pro 2", "build_volume": (200, 148, 150)},
    "bambu_x1c": {"name": "Bambu Lab X1C", "build_volume": (256, 256, 256)},
    "ender_3": {"name": "Creality Ender 3", "build_volume": (220, 220, 250)},
    "prusa_mk4": {"name": "Prusa MK4", "build_volume": (250, 210, 220)},
}

DEFAULT_PRINTER = "adventurer_3"


class GenerateRequest(BaseModel):
    session_id: Optional[str] = None
    prompt: str = ""
    printer: str = DEFAULT_PRINTER
    fit: bool = True


class ParameterUpdateRequest(BaseModel):
    session_id: str
    parameters: Dict[str, float]


class FeatureToggleRequest(BaseModel):
    session_id: str
    feature_id: str
    enabled: bool


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_printer(value: str) -> str:
    key = re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower())).strip("_")
    if key in PRINTERS:
        return key
    if "adventurer" in key and "5" in key:
        return "adventurer_5m"
    if "creator" in key and "pro" in key and "2" in key:
        return "creator_pro_2"
    if "flashforge" in key or ("adventurer" in key and "3" in key):
        return "adventurer_3"
    if "prusa" in key:
        return "prusa_mk4"
    if "ender" in key:
        return "ender_3"
    if "x1" in key or "bambu" in key:
        return "bambu_x1c"
    return DEFAULT_PRINTER


def as_workplane(model: Any) -> cq.Workplane:
    if isinstance(model, cq.Workplane):
        model.val()
        return model
    if isinstance(model, cq.Shape):
        return cq.Workplane("XY").add(model)
    raise TypeError(f"Expected CadQuery Workplane or Shape, got {type(model).__name__}")


def bbox_of(model: Any):
    return as_workplane(model).val().BoundingBox()


def mesh_payload(model: Any) -> Dict[str, List[float]]:
    shape = as_workplane(model).val()
    vertices, triangles = shape.tessellate(0.7, 0.2)
    pos: List[float] = []
    idx: List[int] = []
    for v in vertices:
        pos.extend([float(v.x), float(v.y), float(v.z)])
    for tri in triangles:
        idx.extend([int(tri[0]), int(tri[1]), int(tri[2])])
    return {"positions": pos, "indices": idx}


def default_parameters() -> Dict[str, float]:
    return {
        "width": 80.0,
        "depth": 70.0,
        "height": 120.0,
        "thickness": 8.0,
        "angle": 70.0,
        "fillet_radius": 2.0,
        "hole_count": 0.0,
        "hole_diameter": 5.0,
        "wall_thickness": 3.0,
    }


def default_feature_tree() -> List[Dict[str, Any]]:
    return [
        {"id": "base_extrude", "type": "base_extrude", "enabled": True},
        {"id": "back_support", "type": "back_support", "enabled": True},
        {"id": "fillet_edges", "type": "fillet_edges", "enabled": False},
        {"id": "mount_holes", "type": "mount_holes", "enabled": False},
        {"id": "mirror", "type": "mirror", "enabled": False},
    ]


def create_session(session_id: Optional[str]) -> str:
    sid = (session_id or "").strip() or str(uuid.uuid4())
    params = default_parameters()
    sessions[sid] = {
        "session_id": sid,
        "parameters": params,
        "feature_tree": default_feature_tree(),
        "edit_history": [],
        "model": cq.Workplane("XY").box(40, 40, 40),
        "version": 0,
        "printer": DEFAULT_PRINTER,
        "fit": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    return sid


def get_or_create_session(session_id: Optional[str]) -> Dict[str, Any]:
    sid = (session_id or "").strip()
    if sid and sid in sessions:
        return sessions[sid]
    if sid and sid not in sessions:
        create_session(sid)
        return sessions[sid]
    new_id = create_session(None)
    return sessions[new_id]


def feature_enabled(feature_tree: List[Dict[str, Any]], feature_type: str) -> bool:
    for f in feature_tree:
        if f["type"] == feature_type:
            return bool(f.get("enabled", True))
    return False


def ensure_feature(feature_tree: List[Dict[str, Any]], feature_type: str, enabled: bool = True):
    for f in feature_tree:
        if f["type"] == feature_type:
            f["enabled"] = enabled
            return
    feature_tree.append({"id": feature_type, "type": feature_type, "enabled": enabled})


def rebuild_from_feature_tree(params: Dict[str, float], feature_tree: List[Dict[str, Any]]) -> cq.Workplane:
    width = max(10.0, params["width"])
    depth = max(10.0, params["depth"])
    height = max(20.0, params["height"])
    thickness = max(2.0, params["thickness"])
    angle = min(85.0, max(25.0, params["angle"]))
    fillet_radius = max(0.0, params["fillet_radius"])
    hole_count = max(0, int(round(params["hole_count"])))
    hole_diameter = max(1.0, params["hole_diameter"])

    model = cq.Workplane("XY")

    if feature_enabled(feature_tree, "base_extrude"):
        model = model.box(width, depth, thickness)

    if feature_enabled(feature_tree, "back_support"):
        support_height = max(thickness * 2.0, height)
        back = (
            cq.Workplane("XY")
            .transformed(rotate=(angle - 90.0, 0, 0), offset=(0, -depth * 0.3, support_height * 0.45))
            .box(width, thickness, support_height)
        )
        model = model.union(back)

    if feature_enabled(feature_tree, "mount_holes") and hole_count > 0:
        spacing = width / (hole_count + 1)
        holes = cq.Workplane("XY").transformed(offset=(0, 0, thickness * 0.5))
        for i in range(hole_count):
            x = -width / 2.0 + spacing * (i + 1)
            holes = holes.pushPoints([(x, depth * 0.15)]).hole(hole_diameter, thickness * 1.1)
        model = model.cut(holes)

    if feature_enabled(feature_tree, "fillet_edges") and fillet_radius > 0:
        try:
            model = model.edges("|Z").fillet(min(fillet_radius, thickness * 0.45))
        except Exception:
            pass

    if feature_enabled(feature_tree, "mirror"):
        mirrored = model.mirror("YZ", union=True)
        model = mirrored

    return as_workplane(model.clean())


def auto_fit(model: cq.Workplane, printer_key: str) -> cq.Workplane:
    px, py, pz = PRINTERS[printer_key]["build_volume"]
    box = bbox_of(model)
    if box.xlen <= 0 or box.ylen <= 0 or box.zlen <= 0:
        return model
    scale = min(px / box.xlen, py / box.ylen, pz / box.zlen, 1.0)
    if scale < 1.0:
        model = as_workplane(model.scale(scale))
    return model


def printability_score(model: cq.Workplane, printer_key: str) -> int:
    px, py, pz = PRINTERS[printer_key]["build_volume"]
    box = bbox_of(model)
    fits = box.xlen <= px and box.ylen <= py and box.zlen <= pz
    ratio = (box.xlen * box.ylen * box.zlen) / (px * py * pz)
    score = 100 - int(ratio * 45) - (0 if fits else 50)
    return max(0, min(100, score))


def parse_ai_command(prompt: str, session: Dict[str, Any]) -> Dict[str, Any]:
    p = (prompt or "").strip().lower()
    params = dict(session["parameters"])
    feature_tree = [dict(f) for f in session["feature_tree"]]
    actions: List[str] = []

    if any(word in p for word in ["phone", "stand"]):
        actions.append("set phone-stand template")
        params.update(default_parameters())

    if "headset" in p:
        actions.append("set headset template")
        params.update({"width": 120.0, "depth": 120.0, "height": 240.0, "thickness": 10.0})

    if "thicker" in p or "stronger" in p:
        params["thickness"] = min(30.0, params["thickness"] + 2.0)
        actions.append("increase thickness")

    if "reduce width" in p or "narrower" in p:
        params["width"] = max(20.0, params["width"] - 10.0)
        actions.append("reduce width")

    if "resize" in p:
        nums = [float(n) for n in re.findall(r"\d+\.?\d*", p)]
        if len(nums) >= 3:
            params["width"], params["depth"], params["height"] = nums[0], nums[1], nums[2]
            actions.append("resize w/d/h")

    if "fillet" in p or "round corners" in p:
        ensure_feature(feature_tree, "fillet_edges", True)
        params["fillet_radius"] = max(1.0, params["fillet_radius"])
        actions.append("enable fillet")

    if "add holes" in p or "holes" in p:
        ensure_feature(feature_tree, "mount_holes", True)
        nums = [int(float(n)) for n in re.findall(r"\d+\.?\d*", p)]
        params["hole_count"] = float(nums[0] if nums else max(2, int(params["hole_count"]) or 2))
        actions.append("enable holes")

    if "mirror" in p:
        ensure_feature(feature_tree, "mirror", True)
        actions.append("enable mirror")

    if "optimize for printing" in p:
        params["thickness"] = max(params["thickness"], 6.0)
        params["angle"] = min(75.0, max(params["angle"], 55.0))
        actions.append("optimize printability")

    if not actions:
        actions.append("no-op")

    return {"parameters": params, "feature_tree": feature_tree, "actions": actions}


def session_payload(session: Dict[str, Any], include_mesh: bool = False) -> Dict[str, Any]:
    model = as_workplane(session["model"])
    box = bbox_of(model)
    payload = {
        "status": "ok",
        "session_id": session["session_id"],
        "version": session["version"],
        "parameters": session["parameters"],
        "feature_tree": session["feature_tree"],
        "edit_history": session["edit_history"][-20:],
        "bounds": {"x": box.xlen, "y": box.ylen, "z": box.zlen},
        "printer": session["printer"],
        "printability_score": printability_score(model, session["printer"]),
        "updated_at": session["updated_at"],
    }
    if include_mesh:
        payload["mesh"] = mesh_payload(model)
    return payload


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: FastAPIRequest, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"status": "error", "message": str(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: FastAPIRequest, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.get("/")
def home():
    return {"status": "ok", "service": "cadio-live-cad", "sessions": len(sessions)}


@app.get("/printers")
def list_printers():
    return {"status": "ok", "default": DEFAULT_PRINTER, "printers": PRINTERS}


@app.post("/generate")
def generate(data: GenerateRequest):
    try:
        with sessions_lock:
            session = get_or_create_session(data.session_id)
            session["printer"] = normalize_printer(data.printer)
            session["fit"] = bool(data.fit)

            ai_result = parse_ai_command(data.prompt, session)
            session["parameters"] = ai_result["parameters"]
            session["feature_tree"] = ai_result["feature_tree"]
            model = rebuild_from_feature_tree(session["parameters"], session["feature_tree"])
            if session["fit"]:
                model = auto_fit(model, session["printer"])
            session["model"] = as_workplane(model.clean())
            session["version"] += 1
            session["updated_at"] = now_iso()
            session["edit_history"].append(
                {
                    "time": session["updated_at"],
                    "prompt": data.prompt,
                    "actions": ai_result["actions"],
                    "version": session["version"],
                }
            )
            response = session_payload(session, include_mesh=True)
            response["model_updated"] = True
            return response
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.post("/parameters")
def update_parameters(data: ParameterUpdateRequest):
    try:
        with sessions_lock:
            if data.session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            session = sessions[data.session_id]
            for key, value in data.parameters.items():
                if key in session["parameters"]:
                    session["parameters"][key] = float(value)
            model = rebuild_from_feature_tree(session["parameters"], session["feature_tree"])
            if session["fit"]:
                model = auto_fit(model, session["printer"])
            session["model"] = as_workplane(model.clean())
            session["version"] += 1
            session["updated_at"] = now_iso()
            session["edit_history"].append(
                {"time": session["updated_at"], "prompt": "parameter-update", "actions": list(data.parameters.keys()), "version": session["version"]}
            )
            return session_payload(session, include_mesh=True)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.post("/feature/toggle")
def toggle_feature(data: FeatureToggleRequest):
    try:
        with sessions_lock:
            if data.session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            session = sessions[data.session_id]
            found = False
            for feature in session["feature_tree"]:
                if feature["id"] == data.feature_id or feature["type"] == data.feature_id:
                    feature["enabled"] = bool(data.enabled)
                    found = True
                    break
            if not found:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Feature not found"})
            model = rebuild_from_feature_tree(session["parameters"], session["feature_tree"])
            if session["fit"]:
                model = auto_fit(model, session["printer"])
            session["model"] = as_workplane(model.clean())
            session["version"] += 1
            session["updated_at"] = now_iso()
            session["edit_history"].append(
                {"time": session["updated_at"], "prompt": "feature-toggle", "actions": [data.feature_id, data.enabled], "version": session["version"]}
            )
            return session_payload(session, include_mesh=True)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.get("/session/{session_id}")
def get_session(session_id: str):
    try:
        with sessions_lock:
            if session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            return session_payload(sessions[session_id], include_mesh=False)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.get("/session/{session_id}/mesh")
def get_session_mesh(session_id: str):
    try:
        with sessions_lock:
            if session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            return session_payload(sessions[session_id], include_mesh=True)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


def export_session_model(session_id: str, fmt: str) -> str:
    session = sessions[session_id]
    model = as_workplane(session["model"]).clean()
    path = os.path.join(tempfile.gettempdir(), f"{session_id}-{uuid.uuid4()}.{fmt}")
    cq.exporters.export(model, path)
    return path


@app.get("/export/{session_id}/{fmt}")
def export_model(session_id: str, fmt: str):
    try:
        with sessions_lock:
            if session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            fmt_key = (fmt or "").strip().lower()
            if fmt_key not in {"stl", "obj", "step", "glb"}:
                return JSONResponse(status_code=400, content={"status": "error", "message": "Unsupported export format"})
            path = export_session_model(session_id, "step" if fmt_key == "step" else fmt_key)

        media = {
            "stl": "model/stl",
            "obj": "model/obj",
            "step": "model/step",
            "glb": "model/gltf-binary",
        }[fmt_key]
        ext = "step" if fmt_key == "step" else fmt_key
        return FileResponse(path, media_type=media, filename=f"{session_id}.{ext}")
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
