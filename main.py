import math
import os
from pathlib import Path
import re
import tempfile
import traceback
import uuid
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List, Optional
import time

import cadquery as cq
import uvicorn
from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


app = FastAPI(title="Cadio Live CAD Engine")

@app.middleware("http")
async def disable_cache_for_live_cad(request: FastAPIRequest, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/session/") or path.startswith("/generate") or path.startswith("/parameters") or path.startswith("/feature/") or path.startswith("/object/") or path.startswith("/printers") or path.startswith("/health"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response
)

sessions: Dict[str, Dict[str, Any]] = {}
sessions_lock = RLock()
def force_scene_refresh(session: Dict[str, Any]):
    session["scene_token"] = str(uuid.uuid4())
    session["updated_at"] = time.time()
PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"



PRINTERS = {
    "adventurer_3": {"name": "Flashforge Adventurer 3", "build_volume": (150, 150, 150)},
    "adventurer_5m": {"name": "Flashforge Adventurer 5M", "build_volume": (220, 220, 250)},
    "creator_pro_2": {"name": "Flashforge Creator Pro 2", "build_volume": (200, 148, 150)},
    "bambu_x1c": {"name": "Bambu Lab X1C", "build_volume": (256, 256, 256)},
    "bambu_p1s": {"name": "Bambu Lab P1S", "build_volume": (256, 256, 256)},
    "bambu_a1": {"name": "Bambu Lab A1", "build_volume": (256, 256, 256)},
    "ender_3": {"name": "Creality Ender 3", "build_volume": (220, 220, 250)},
    "creality_k1": {"name": "Creality K1", "build_volume": (220, 220, 250)},
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
    object_id: Optional[str] = None
    parameters: Dict[str, float]


class FeatureToggleRequest(BaseModel):
    session_id: str
    object_id: Optional[str] = None
    feature_id: str
    enabled: bool


class ObjectSelectRequest(BaseModel):
    session_id: str
    object_id: str


class ObjectDeleteRequest(BaseModel):
    session_id: str
    object_id: str


class TransformUpdateRequest(BaseModel):
    session_id: str
    object_id: str
    position: Optional[List[float]] = None
    rotation: Optional[List[float]] = None
    scale: Optional[List[float]] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_printer(value: str) -> str:
    key = re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower())).strip("_")
    if key in PRINTERS:
        return key
    if "p1s" in key:
        return "bambu_p1s"
    if "a1" in key:
        return "bambu_a1"
    if "k1" in key:
        return "creality_k1"
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
        "chamfer_size": 0.0,
    }


def default_feature_tree() -> List[Dict[str, Any]]:
    return [
        {"id": "base_extrude", "type": "base_extrude", "enabled": True},
        {"id": "back_support", "type": "back_support", "enabled": True},
        {"id": "fillet_edges", "type": "fillet_edges", "enabled": False},
        {"id": "chamfer_edges", "type": "chamfer_edges", "enabled": False},
        {"id": "mount_holes", "type": "mount_holes", "enabled": False},
        {"id": "mirror", "type": "mirror", "enabled": False},
    ]


def default_transform() -> Dict[str, List[float]]:
    return {"position": [0.0, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0]}


def rebuild_from_feature_tree(params: Dict[str, float], feature_tree: List[Dict[str, Any]]) -> cq.Workplane:
    width = max(10.0, params["width"])
    depth = max(10.0, params["depth"])
    height = max(20.0, params["height"])
    thickness = max(2.0, params["thickness"])
    angle = min(85.0, max(25.0, params["angle"]))
    fillet_radius = max(0.0, params["fillet_radius"])
    hole_count = max(0, int(round(params["hole_count"])))
    hole_diameter = max(1.0, params["hole_diameter"])
    chamfer_size = max(0.0, params.get("chamfer_size", 0.0))

    def enabled(ftype: str) -> bool:
        for f in feature_tree:
            if f["type"] == ftype:
                return bool(f.get("enabled", True))
        return False

    model = cq.Workplane("XY")
    if enabled("base_extrude"):
        model = model.box(width, depth, thickness)
    if enabled("back_support"):
        support_height = max(thickness * 2.0, height)
        back = (
            cq.Workplane("XY")
            .transformed(rotate=(angle - 90.0, 0, 0), offset=(0, -depth * 0.3, support_height * 0.45))
            .box(width, thickness, support_height)
        )
        model = model.union(back)
    if enabled("mount_holes") and hole_count > 0:
        spacing = width / (hole_count + 1)
        holes = cq.Workplane("XY").transformed(offset=(0, 0, thickness * 0.5))
        for i in range(hole_count):
            x = -width / 2.0 + spacing * (i + 1)
            holes = holes.pushPoints([(x, depth * 0.15)]).hole(hole_diameter, thickness * 1.1)
        model = model.cut(holes)
    if enabled("fillet_edges") and fillet_radius > 0:
        try:
            model = model.edges("|Z").fillet(min(fillet_radius, thickness * 0.45))
        except Exception:
            pass
    if enabled("chamfer_edges") and chamfer_size > 0:
        try:
            model = model.edges("|Z").chamfer(min(chamfer_size, thickness * 0.45))
        except Exception:
            pass
    if enabled("mirror"):
        model = model.mirror("YZ", union=True)
    return as_workplane(model.clean())


def apply_transform_to_workplane(model: cq.Workplane, transform: Dict[str, List[float]]) -> cq.Workplane:
    shape = model.val()

    # --- SAFE DEFAULTS (fix missing/dirty state) ---
    pos = transform.get("position") or [0.0, 0.0, 0.0]
    rot = transform.get("rotation") or [0.0, 0.0, 0.0]
    scl = transform.get("scale") or [1.0, 1.0, 1.0]

    # --- SCALE (stable, no drift) ---
    sx, sy, sz = [float(v) for v in scl]
    scale = max(0.001, (sx + sy + sz) / 3.0)
    if abs(scale - 1.0) > 1e-6:
        shape = shape.scale(scale)

    # --- ROTATION (FIX: clamp + prevent runaway rotation) ---
    rx, ry, rz = [float(v) % 360.0 for v in rot]

    if abs(rx) > 1e-6:
        shape = shape.rotate(cq.Vector(0,0,0), cq.Vector(1,0,0), rx)
    if abs(ry) > 1e-6:
        shape = shape.rotate(cq.Vector(0,0,0), cq.Vector(0,1,0), ry)
    if abs(rz) > 1e-6:
        shape = shape.rotate(cq.Vector(0,0,0), cq.Vector(0,0,1), rz)

    # --- POSITION ---
    px, py, pz = [float(v) for v in pos]
    shape = shape.translate((px, py, pz))

    return cq.Workplane("XY").add(shape)


def mesh_payload_for_object(model: cq.Workplane, transform: Dict[str, List[float]]) -> Dict[str, List[float]]:
    wp = apply_transform_to_workplane(model, transform)
   vertices, triangles = model.val().tessellate(0.7, 0.2)
    pos: List[float] = []
    idx: List[int] = []
    for v in vertices:
        pos.extend([float(v.x), float(v.y), float(v.z)])
    for tri in triangles:
        idx.extend([int(tri[0]), int(tri[1]), int(tri[2])])
    return {"positions": pos, "indices": idx}


def create_object(name: str = "part") -> Dict[str, Any]:
    params = default_parameters()
    feature_tree = default_feature_tree()
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "parameters": params,
        "feature_tree": feature_tree,
        "transform": default_transform(),
        "model": rebuild_from_feature_tree(params, feature_tree),
    }


def create_session(session_id: Optional[str]) -> str:
    sid = (session_id or "").strip() or str(uuid.uuid4())
    base = create_object("part_1")
    sessions[sid] = {
        "session_id": sid,
        "objects": {base["id"]: base},
        "object_order": [base["id"]],
        "selected_object_id": base["id"],
        "edit_history": [],
        "version": 0,
        "printer": DEFAULT_PRINTER,
        "fit": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        force_scene_refresh(session)
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


def get_selected_object(session: Dict[str, Any]) -> Dict[str, Any]:
    oid = session["selected_object_id"]
    return session["objects"][oid]


def ensure_feature(feature_tree: List[Dict[str, Any]], feature_type: str, enabled: bool = True):
    for f in feature_tree:
        if f["type"] == feature_type:
            f["enabled"] = enabled
            return
    feature_tree.append({"id": feature_type, "type": feature_type, "enabled": enabled})


def parse_ai_command(prompt: str, session: Dict[str, Any], obj: Dict[str, Any]) -> Dict[str, Any]:
    p = (prompt or "").strip().lower()
    params = dict(obj["parameters"])
    feature_tree = [dict(f) for f in obj["feature_tree"]]
    transform = dict(obj["transform"])
    transform["position"] = list(transform["position"])
    transform["rotation"] = list(transform["rotation"])
    transform["scale"] = list(transform["scale"])
    actions: List[str] = []

    if "make thicker" in p or "thicker" in p or "strengthen structure" in p:
        params["thickness"] = min(30.0, params["thickness"] + 2.0)
        actions.append("increase thickness")
    if "reduce size" in p or "smaller" in p:
        params["width"] = max(20.0, params["width"] * 0.9)
        params["depth"] = max(20.0, params["depth"] * 0.9)
        params["height"] = max(20.0, params["height"] * 0.9)
        actions.append("reduce size")
    if "add holes" in p or "holes" in p:
        ensure_feature(feature_tree, "mount_holes", True)
        params["hole_count"] = max(float(params["hole_count"]), 2.0)
        actions.append("add holes")
    if "fillet" in p or "round corners" in p:
        ensure_feature(feature_tree, "fillet_edges", True)
        params["fillet_radius"] = max(1.0, params["fillet_radius"])
        actions.append("add fillet")
    if "chamfer" in p:
        ensure_feature(feature_tree, "chamfer_edges", True)
        params["chamfer_size"] = max(0.8, params["chamfer_size"])
        actions.append("add chamfer")
    if "mirror" in p:
        ensure_feature(feature_tree, "mirror", True)
        actions.append("mirror geometry")
    if "optimize for printing" in p:
        params["thickness"] = max(6.0, params["thickness"])
        params["angle"] = min(75.0, max(55.0, params["angle"]))
        actions.append("optimize printing")
    if "reduce material usage" in p:
        params["thickness"] = max(2.0, params["thickness"] - 1.0)
        ensure_feature(feature_tree, "mount_holes", True)
        actions.append("reduce material")

    if "move object left" in p:
        transform["position"][0] -= 10.0
        actions.append("move left")
    if "move object right" in p:
        transform["position"][0] += 10.0
        actions.append("move right")
    if "center object" in p:
        transform["position"] = [0.0, 0.0, transform["position"][2]]
        actions.append("center object")
    if "rotate 90" in p:
        transform["rotation"][2] += 90.0
        actions.append("rotate 90")

    if not actions:
        actions.append("no-op")
    return {"parameters": params, "feature_tree": feature_tree, "transform": transform, "actions": actions}


def auto_fit_session(session: Dict[str, Any]):
    px, py, pz = PRINTERS[session["printer"]]["build_volume"]
    max_len = 0.0
    for oid in session["object_order"]:
        obj = session["objects"][oid]
        mesh_box = bbox_of(apply_transform_to_workplane(obj["model"], obj["transform"]))
        max_len = max(max_len, mesh_box.xlen / px, mesh_box.ylen / py, mesh_box.zlen / pz)
    if max_len > 1.0:
        scale = 1.0 / max_len
        for oid in session["object_order"]:
            obj = session["objects"][oid]
            obj["transform"]["position"] = [v * scale for v in obj["transform"]["position"]]
            obj["transform"]["scale"] = [v * scale for v in obj["transform"]["scale"]]


def scene_bounds(session: Dict[str, Any]) -> Dict[str, float]:
    mins = [float("inf"), float("inf"), float("inf")]
    maxs = [float("-inf"), float("-inf"), float("-inf")]
    if not session["object_order"]:
        return {"x": 0.0, "y": 0.0, "z": 0.0}
    for oid in session["object_order"]:
        box = bbox_of(apply_transform_to_workplane(session["objects"][oid]["model"], session["objects"][oid]["transform"]))
        mins[0], mins[1], mins[2] = min(mins[0], box.xmin), min(mins[1], box.ymin), min(mins[2], box.zmin)
        maxs[0], maxs[1], maxs[2] = max(maxs[0], box.xmax), max(maxs[1], box.ymax), max(maxs[2], box.zmax)
    return {"x": maxs[0] - mins[0], "y": maxs[1] - mins[1], "z": maxs[2] - mins[2]}


def print_assistant(session: Dict[str, Any]) -> Dict[str, Any]:
    warnings: List[str] = []
    checks: List[str] = []
    hints: List[str] = []
    bounds = scene_bounds(session)
    px, py, pz = PRINTERS[session["printer"]]["build_volume"]
    if bounds["x"] > px or bounds["y"] > py or bounds["z"] > pz:
        warnings.append("model exceeds selected printer build volume")
    else:
        checks.append("fits selected printer")
    selected = get_selected_object(session)
    wall = selected["parameters"]["wall_thickness"]
    if wall < 1.2:
        warnings.append("walls too thin")
    else:
        checks.append("wall thickness acceptable")
    angle = selected["parameters"]["angle"]
    if 90.0 - angle > 50.0:
        warnings.append("unsupported overhang risk")
    else:
        checks.append("overhang generally printable")
    if selected["parameters"]["thickness"] < 5:
        hints.append("increase thickness for stronger parts")
    else:
        hints.append("structural thickness is good")
    score = max(0, min(100, 100 - len(warnings) * 18))
    return {"warnings": warnings, "checks": checks, "hints": hints, "printability_score": score}


def session_payload(session: Dict[str, Any], include_mesh: bool = False) -> Dict[str, Any]:
    objects: List[Dict[str, Any]] = []
    for oid in session["object_order"]:
        obj = session["objects"][oid]
        o = {
            "id": obj["id"],
            "name": obj["name"],
            "parameters": obj["parameters"],
            "feature_tree": obj["feature_tree"],
            "transform": obj["transform"],
        }
        if include_mesh:
            o["mesh"] = mesh_payload_for_object(obj["model"], obj["transform"])
        objects.append(o)
    pa = print_assistant(session)
    return {
        "status": "ok",
        "session_id": session["session_id"],
        "version": session["version"],
        "selected_object_id": session["selected_object_id"],
        "objects": objects,
        "object_order": session["object_order"],
        "bounds": scene_bounds(session),
        "printer": session["printer"],
        "scene_token": session.get("scene_token", ""),
        "print_assistant": pa,
        "printability_score": pa["printability_score"],
        "edit_history": session["edit_history"][-30:],
        "updated_at": session["updated_at"],
        "dirty_flag": session["version"],
    }


def export_assembly(session: Dict[str, Any], fmt: str) -> str:
    parts = []
    for oid in session["object_order"]:
        obj = session["objects"][oid]
        parts.append(apply_transform_to_workplane(obj["model"], obj["transform"]).val())
    if not parts:
        model = cq.Workplane("XY").box(1, 1, 1)
    else:
        model = cq.Workplane("XY").add(parts[0])
        for p in parts[1:]:
            model = model.union(p)
    path = os.path.join(tempfile.gettempdir(), f"{session['session_id']}-{uuid.uuid4()}.{fmt}")
    cq.exporters.export(model.clean(), path)
    return path


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: FastAPIRequest, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"status": "error", "message": str(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: FastAPIRequest, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.get("/health")
def health():
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

            prompt = (data.prompt or "").strip().lower()
            if "duplicate" in prompt:
                src = get_selected_object(session)
                new_obj = create_object(f"{src['name']}_copy")
                new_obj["parameters"] = dict(src["parameters"])
                new_obj["feature_tree"] = [dict(f) for f in src["feature_tree"]]
                new_obj["transform"] = {
                    "position": [src["transform"]["position"][0] + 20.0, src["transform"]["position"][1], src["transform"]["position"][2]],
                    "rotation": list(src["transform"]["rotation"]),
                    "scale": list(src["transform"]["scale"]),
                }
                new_obj["model"] = rebuild_from_feature_tree(new_obj["parameters"], new_obj["feature_tree"])
                session["objects"][new_obj["id"]] = new_obj
                session["object_order"].append(new_obj["id"])
                session["selected_object_id"] = new_obj["id"]
                actions = ["duplicate selected object"]
            elif "delete object" in prompt:
                selected = session["selected_object_id"]
                if len(session["object_order"]) > 1:
                    del session["objects"][selected]
                    session["object_order"] = [oid for oid in session["object_order"] if oid != selected]
                    session["selected_object_id"] = session["object_order"][-1]
                    actions = ["delete selected object"]
                else:
                    actions = ["cannot delete only object"]
            elif "new object" in prompt or "add object" in prompt or "new part" in prompt:
                obj = create_object(f"part_{len(session['object_order']) + 1}")
                session["objects"][obj["id"]] = obj
                session["object_order"].append(obj["id"])
                session["selected_object_id"] = obj["id"]
                actions = ["create new object"]
            else:
                obj = get_selected_object(session)
                parsed = parse_ai_command(data.prompt, session, obj)
                obj["parameters"] = parsed["parameters"]
                obj["feature_tree"] = parsed["feature_tree"]
                obj["transform"] = parsed["transform"]
                obj["model"] = rebuild_from_feature_tree(obj["parameters"], obj["feature_tree"])
                actions = parsed["actions"]

            if session["fit"]:
                auto_fit_session(session)

            session["version"] += 1
            session["updated_at"] = now_iso()
            session["edit_history"].append({"time": session["updated_at"], "prompt": data.prompt, "actions": actions, "version": session["version"]})
            payload = session_payload(session, include_mesh=True)
            payload["model_updated"] = True
            return payload
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
            oid = data.object_id or session["selected_object_id"]
            if oid not in session["objects"]:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Object not found"})
            obj = session["objects"][oid]
            for key, value in data.parameters.items():
                if key in obj["parameters"]:
                    obj["parameters"][key] = float(value)
            obj["model"] = rebuild_from_feature_tree(obj["parameters"], obj["feature_tree"])
            if session["fit"]:
                auto_fit_session(session)
            session["version"] += 1
            session["updated_at"] = now_iso()
            session["edit_history"].append({"time": session["updated_at"], "prompt": "parameter-update", "actions": list(data.parameters.keys()), "version": session["version"]})
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
            oid = data.object_id or session["selected_object_id"]
            if oid not in session["objects"]:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Object not found"})
            obj = session["objects"][oid]
            found = False
            for feature in obj["feature_tree"]:
                if feature["id"] == data.feature_id or feature["type"] == data.feature_id:
                    feature["enabled"] = bool(data.enabled)
                    found = True
                    break
            if not found:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Feature not found"})
            obj["model"] = rebuild_from_feature_tree(obj["parameters"], obj["feature_tree"])
            session["version"] += 1
            session["updated_at"] = now_iso()
            session["edit_history"].append({"time": session["updated_at"], "prompt": "feature-toggle", "actions": [data.feature_id, data.enabled], "version": session["version"]})
            return session_payload(session, include_mesh=True)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.post("/object/select")
def select_object(data: ObjectSelectRequest):
    try:
        with sessions_lock:
            if data.session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            session = sessions[data.session_id]
            if data.object_id not in session["objects"]:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Object not found"})
            session["selected_object_id"] = data.object_id
            session["version"] += 1
            session["updated_at"] = now_iso()
            return session_payload(session, include_mesh=True)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.post("/object/delete")
def delete_object(data: ObjectDeleteRequest):
    try:
        with sessions_lock:
            if data.session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            session = sessions[data.session_id]
            if data.object_id not in session["objects"]:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Object not found"})
            if len(session["object_order"]) <= 1:
                return JSONResponse(status_code=400, content={"status": "error", "message": "Cannot delete last object"})
            del session["objects"][data.object_id]
            session["object_order"] = [oid for oid in session["object_order"] if oid != data.object_id]
            if session["selected_object_id"] == data.object_id:
                session["selected_object_id"] = session["object_order"][-1]
            session["version"] += 1
            session["updated_at"] = now_iso()
            return session_payload(session, include_mesh=True)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.post("/object/transform")
def update_transform(data: TransformUpdateRequest):
    try:
        with sessions_lock:
            if data.session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            session = sessions[data.session_id]
            if data.object_id not in session["objects"]:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Object not found"})
            obj = session["objects"][data.object_id]
            if data.position and len(data.position) == 3:
                obj["transform"]["position"] = [float(v) for v in data.position]
            if data.rotation and len(data.rotation) == 3:
                obj["transform"]["rotation"] = [float(v) for v in data.rotation]
            if data.scale and len(data.scale) == 3:
                obj["transform"]["scale"] = [max(0.001, float(v)) for v in data.scale]
                obj["model"] = rebuild_from_feature_tree(obj["parameters"], obj["feature_tree"])
            session["version"] += 1
            session["updated_at"] = now_iso()
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


@app.get("/export/{session_id}/{fmt}")
def export_model(session_id: str, fmt: str):
    try:
        with sessions_lock:
            if session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})
            fmt_key = (fmt or "").strip().lower()
            if fmt_key not in {"stl", "obj", "step", "glb"}:
                return JSONResponse(status_code=400, content={"status": "error", "message": "Unsupported export format"})
            path = export_assembly(sessions[session_id], "step" if fmt_key == "step" else fmt_key)
        media = {"stl": "model/stl", "obj": "model/obj", "step": "model/step", "glb": "model/gltf-binary"}[fmt_key]
        ext = "step" if fmt_key == "step" else fmt_key
        return FileResponse(path, media_type=media, filename=f"{session_id}.{ext}")
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend-assets")


@app.get("/", response_class=HTMLResponse)
def serve_frontend_root():
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(
            str(index_path),
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
    return HTMLResponse("<h1>Cadio API</h1><p>Frontend build not found. Build frontend with: npm run build</p>", status_code=200)


@app.get("/{full_path:path}", response_class=HTMLResponse)
def serve_frontend_routes(full_path: str):
    if full_path.startswith("export/") or full_path.startswith("session/") or full_path in {
        "generate",
        "parameters",
        "feature/toggle",
        "object/select",
        "object/delete",
        "object/transform",
        "printers",
        "health",
    }:
        return JSONResponse(status_code=404, content={"status": "error", "message": "Not found"})
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(
            str(index_path),
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
                  return JSONResponse(status_code=404, content={"status": "error", "message": "Not found"})
            },
        )
  


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
