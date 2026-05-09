import os
import re
import tempfile
import traceback
import uuid
from datetime import datetime, timezone
from threading import RLock
from typing import Optional

import cadquery as cq
import uvicorn
from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel


app = FastAPI(title="Cadio Stateful CAD Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}
sessions_lock = RLock()

PRINTERS = {
    "adventurer_3": {"name": "Flashforge Adventurer 3", "brand": "Flashforge", "build_volume": (150, 150, 150)},
    "adventurer_5m": {"name": "Flashforge Adventurer 5M", "brand": "Flashforge", "build_volume": (220, 220, 250)},
    "creator_pro_2": {"name": "Flashforge Creator Pro 2", "brand": "Flashforge", "build_volume": (200, 148, 150)},
    "bambu_x1c": {"name": "Bambu Lab X1C", "brand": "Bambu Lab", "build_volume": (256, 256, 256)},
    "ender_3": {"name": "Creality Ender 3", "brand": "Creality", "build_volume": (220, 220, 250)},
    "prusa_mk4": {"name": "Prusa MK4", "brand": "Prusa", "build_volume": (250, 210, 220)},
}

DEFAULT_PRINTER = "adventurer_3"

PRINTER_ALIASES = {
    "adventurer_3": "adventurer_3",
    "flashforge_adventurer_3": "adventurer_3",
    "flashforge_adventurer3": "adventurer_3",
    "adventurer_5m": "adventurer_5m",
    "flashforge_adventurer_5m": "adventurer_5m",
    "flashforge_adventurer5m": "adventurer_5m",
    "creator_pro_2": "creator_pro_2",
    "flashforge_creator_pro_2": "creator_pro_2",
    "flashforge_creatorpro2": "creator_pro_2",
    "bambu_x1c": "bambu_x1c",
    "bambu_lab_x1c": "bambu_x1c",
    "x1c": "bambu_x1c",
    "ender_3": "ender_3",
    "creality_ender_3": "ender_3",
    "prusa_mk4": "prusa_mk4",
    "original_prusa_mk4": "prusa_mk4",
}


class GenerateRequest(BaseModel):
    session_id: Optional[str] = None
    prompt: str = ""
    printer: str = DEFAULT_PRINTER
    fit: bool = True


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: FastAPIRequest, exc: RequestValidationError):
    print("VALIDATION ERROR:", exc)
    return JSONResponse(status_code=422, content={"status": "error", "message": str(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: FastAPIRequest, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


def command_from_prompt(prompt: str):
    p = (prompt or "").strip().lower()

    if not p:
        return {"operation": "keep", "type": "box", "width": 40, "height": 40, "depth": 40, "thickness": 4}

    if "phone" in p:
        return {"operation": "replace", "type": "phone_stand", "width": 80, "height": 120, "depth": 70, "thickness": 8}

    if "headset" in p:
        return {"operation": "replace", "type": "headset_stand", "width": 120, "height": 240, "depth": 120, "thickness": 8}

    if "bracket" in p:
        return {"operation": "replace", "type": "bracket", "width": 60, "height": 60, "depth": 20, "thickness": 8}

    if "case" in p:
        return {"operation": "replace", "type": "case", "width": 100, "height": 30, "depth": 60, "thickness": 3}

    return {"operation": "replace", "type": "box", "width": 40, "height": 40, "depth": 40, "thickness": 4}


def as_workplane(model):
    if isinstance(model, cq.Workplane):
        model.val()
        return model

    if isinstance(model, cq.Shape):
        return cq.Workplane("XY").add(model)

    raise TypeError(f"Expected CadQuery Workplane or Shape, got {type(model).__name__}")


def bounding_box(model):
    workplane = as_workplane(model)
    return workplane.val().BoundingBox()


def bounds_dict(model):
    bbox = bounding_box(model)
    return {"x": bbox.xlen, "y": bbox.ylen, "z": bbox.zlen}


def clean_model(model):
    return as_workplane(as_workplane(model).clean())


def build_model(command):
    t = command["type"]

    if t == "headset_stand":
        base = cq.Workplane("XY").box(command["width"], command["depth"], command["thickness"])
        stand = (
            cq.Workplane("XY")
            .transformed(offset=(0, 0, command["height"] / 2))
            .box(command["thickness"], command["thickness"], command["height"])
        )
        return as_workplane(base.union(stand))

    if t == "phone_stand":
        base = cq.Workplane("XY").box(command["width"], command["depth"], command["thickness"])
        back = (
            cq.Workplane("XY")
            .transformed(offset=(0, -10, command["height"] / 2))
            .box(command["width"], command["thickness"], command["height"])
        )
        lip = (
            cq.Workplane("XY")
            .transformed(offset=(0, command["depth"] / 2 - command["thickness"], command["thickness"]))
            .box(command["width"], command["thickness"], command["thickness"] * 2)
        )
        return as_workplane(base.union(back).union(lip))

    if t == "bracket":
        v = cq.Workplane("XY").box(command["depth"], command["depth"], command["height"])
        h = (
            cq.Workplane("XY")
            .transformed(offset=(command["width"] / 2, 0, command["depth"] / 2))
            .box(command["width"], command["depth"], command["depth"])
        )
        return as_workplane(v.union(h))

    if t == "case":
        outer = cq.Workplane("XY").box(command["width"], command["depth"], command["height"])
        inner = (
            cq.Workplane("XY")
            .transformed(offset=(0, 0, 2))
            .box(command["width"] - 6, command["depth"] - 6, command["height"] - 4)
        )
        return as_workplane(outer.cut(inner))

    return as_workplane(cq.Workplane("XY").box(command["width"], command["depth"], command["height"]))


def default_model():
    return build_model({"operation": "replace", "type": "box", "width": 40, "height": 40, "depth": 40, "thickness": 4})


def normalize_key(value: str):
    key = (value or "").strip().lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    key = re.sub(r"_+", "_", key).strip("_")
    return key


def normalize_printer(printer: str):
    printer_key = normalize_key(printer)

    if not printer_key:
        return DEFAULT_PRINTER

    if printer_key in PRINTERS:
        return printer_key

    if printer_key in PRINTER_ALIASES:
        return PRINTER_ALIASES[printer_key]

    if "flashforge" in printer_key:
        if "creator" in printer_key and "pro" in printer_key and "2" in printer_key:
            return "creator_pro_2"
        if "5m" in printer_key or ("adventurer" in printer_key and "5" in printer_key):
            return "adventurer_5m"
        if "adventurer" in printer_key and "3" in printer_key:
            return "adventurer_3"

    return DEFAULT_PRINTER


def printer_volume(printer_key):
    return PRINTERS[normalize_printer(printer_key)]["build_volume"]


def auto_fit(model, printer_key):
    workplane = as_workplane(model)
    printer_key = normalize_printer(printer_key)
    printer_x, printer_y, printer_z = printer_volume(printer_key)
    bbox = bounding_box(workplane)

    if bbox.xlen <= 0 or bbox.ylen <= 0 or bbox.zlen <= 0:
        raise ValueError("Model has invalid zero-size bounding box")

    scale = min(printer_x / bbox.xlen, printer_y / bbox.ylen, printer_z / bbox.zlen, 1)

    print("PRINTER:", printer_key)
    print("BOUNDS:", bbox.xlen, bbox.ylen, bbox.zlen)
    print("SCALE:", scale)

    if scale < 1:
        return as_workplane(workplane.scale(scale))

    return workplane


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def create_session(session_id=None):
    new_session_id = session_id or str(uuid.uuid4())
    model = clean_model(default_model())
    sessions[new_session_id] = {
        "model": model,
        "version": 0,
        "last_prompt": "",
        "last_command": {"operation": "replace", "type": "box"},
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    return new_session_id, sessions[new_session_id]


def get_or_create_session(session_id=None):
    requested_id = (session_id or "").strip()

    with sessions_lock:
        if requested_id and requested_id in sessions:
            return requested_id, sessions[requested_id], False

        session_key = requested_id or str(uuid.uuid4())
        session_key, session = create_session(session_key)
        return session_key, session, True


def update_session_model(session, prompt, printer_key, fit=True):
    command = command_from_prompt(prompt)
    current_model = as_workplane(session.get("model") or default_model())

    if command["operation"] == "keep":
        next_model = current_model
    else:
        next_model = build_model(command)

    if fit:
        next_model = auto_fit(next_model, printer_key)

    next_model = clean_model(next_model)
    session["model"] = next_model
    session["version"] += 1
    session["last_prompt"] = prompt or ""
    session["last_command"] = command
    session["updated_at"] = utc_now()
    return next_model, command


def printability_score(model, printer_key):
    printer_key = normalize_printer(printer_key)
    max_x, max_y, max_z = printer_volume(printer_key)
    bbox = bounding_box(model)

    fits = bbox.xlen <= max_x and bbox.ylen <= max_y and bbox.zlen <= max_z
    ratio = (bbox.xlen * bbox.ylen * bbox.zlen) / (max_x * max_y * max_z)

    score = 100

    if not fits:
        score -= 50

    score -= int(ratio * 50)

    return max(0, min(100, score))


@app.get("/")
def home():
    return {"status": "Cadio running", "mode": "stateful_cad_engine", "sessions": len(sessions)}


@app.get("/printers")
def list_printers():
    return {
        "status": "ok",
        "default": DEFAULT_PRINTER,
        "printers": [
            {"key": key, "name": value["name"], "brand": value["brand"], "build_volume": value["build_volume"]}
            for key, value in PRINTERS.items()
        ],
    }


@app.get("/session/{session_id}")
def get_session(session_id: str):
    try:
        with sessions_lock:
            if session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})

            session = sessions[session_id]
            return {
                "status": "ok",
                "session_id": session_id,
                "version": session["version"],
                "last_prompt": session["last_prompt"],
                "last_command": session["last_command"],
                "bounds": bounds_dict(session["model"]),
                "updated_at": session["updated_at"],
            }
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.post("/generate")
def generate(data: GenerateRequest):
    try:
        printer_key = normalize_printer(data.printer)

        with sessions_lock:
            session_id, session, created = get_or_create_session(data.session_id)
            model, command = update_session_model(
                session=session,
                prompt=data.prompt,
                printer_key=printer_key,
                fit=data.fit,
            )

            return {
                "status": "ok",
                "session_id": session_id,
                "session_created": created,
                "model_updated": True,
                "version": session["version"],
                "command": command["type"],
                "operation": command["operation"],
                "bounds": bounds_dict(model),
                "printer": printer_key,
                "printability_score": printability_score(model, printer_key),
                "updated_at": session["updated_at"],
            }
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


@app.get("/export/{session_id}")
def export_model(session_id: str):
    try:
        with sessions_lock:
            if session_id not in sessions:
                return JSONResponse(status_code=404, content={"status": "error", "message": "Session not found"})

            model = clean_model(sessions[session_id]["model"])

        path = os.path.join(tempfile.gettempdir(), f"{session_id}-{uuid.uuid4()}.stl")
        cq.exporters.export(model, path)

        return FileResponse(
            path,
            media_type="model/stl",
            filename=f"{session_id}.stl",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
