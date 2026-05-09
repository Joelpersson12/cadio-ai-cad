import os
import re
import tempfile
import traceback
import uuid

import cadquery as cq
import uvicorn
from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# --------------------------------
# APP
# --------------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------
# PRINTER DATABASE (mm)
# --------------------------------

PRINTERS = {
    "adventurer_3": (150, 150, 150),
    "adventurer_5m": (220, 220, 250),
    "creator_pro_2": (200, 148, 150),
    "bambu_x1c": (256, 256, 256),
    "ender_3": (220, 220, 250),
    "prusa_mk4": (250, 210, 220),
}

DEFAULT_PRINTER = "adventurer_3"

PRINTER_ALIASES = {
    "flashforge_adventurer_3": "adventurer_3",
    "flashforge_adventurer3": "adventurer_3",
    "flashforge_adventurer_5m": "adventurer_5m",
    "flashforge_creator_pro_2": "creator_pro_2",
    "bambu_lab_x1c": "bambu_x1c",
    "x1c": "bambu_x1c",
    "ender_3": "ender_3",
    "prusa_mk4": "prusa_mk4",
}

# --------------------------------
# REQUEST
# --------------------------------

class GenerateRequest(BaseModel):
    prompt: str
    printer: str = DEFAULT_PRINTER
    fit: bool = True

# --------------------------------
# ERROR HANDLING
# --------------------------------

@app.exception_handler(Exception)
async def error_handler(request: FastAPIRequest, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": str(exc)},
    )

# --------------------------------
# AI DESIGN (FIXED SCALE LOGIC)
# --------------------------------

def ai_design(prompt: str):
    p = prompt.lower()

    # IMPORTANT: realistic mm values (NO extra scaling layers)
    if "headset" in p:
        return {"type": "headset", "w": 120, "h": 240, "d": 120, "t": 8}

    if "phone" in p:
        return {"type": "phone", "w": 80, "h": 120, "d": 70, "t": 8}

    if "bracket" in p:
        return {"type": "bracket", "w": 60, "h": 60, "d": 20, "t": 8}

    if "case" in p:
        return {"type": "case", "w": 100, "h": 30, "d": 60, "t": 3}

    return {"type": "box", "w": 40, "h": 40, "d": 40, "t": 4}

# --------------------------------
# PRINTER NORMALIZER
# --------------------------------

def normalize_printer(p: str):
    p = (p or "").lower().replace(" ", "_")

    if p in PRINTERS:
        return p

    if p in PRINTER_ALIASES:
        return PRINTER_ALIASES[p]

    return DEFAULT_PRINTER

# --------------------------------
# CAD BUILDER
# --------------------------------

def build_model(d):

    if d["type"] == "headset":
        base = cq.Workplane("XY").box(d["w"], d["d"], d["t"])
        stand = cq.Workplane("XY").transformed(offset=(0, 0, d["h"]/2)).box(d["t"], d["t"], d["h"])
        return base.union(stand)

    if d["type"] == "phone":
        base = cq.Workplane("XY").box(d["w"], d["d"], d["t"])
        back = cq.Workplane("XY").transformed(offset=(0, -10, d["h"]/2)).box(d["w"], d["t"], d["h"])
        return base.union(back)

    if d["type"] == "bracket":
        v = cq.Workplane("XY").box(d["d"], d["d"], d["h"])
        h = cq.Workplane("XY").transformed(offset=(d["w"]/2, 0, d["d"]/2)).box(d["w"], d["d"], d["d"])
        return v.union(h)

    if d["type"] == "case":
        outer = cq.Workplane("XY").box(d["w"], d["d"], d["h"])
        inner = cq.Workplane("XY").box(d["w"]-6, d["d"]-6, d["h"]-4)
        return outer.cut(inner)

    return cq.Workplane("XY").box(d["w"], d["d"], d["h"])

# --------------------------------
# BOUNDING BOX
# --------------------------------

def bbox(model):
    return model.val().BoundingBox()

# --------------------------------
# AUTO FIT (FIXED — NO DOUBLE SCALING)
# --------------------------------

def auto_fit(model, printer_key):

    printer_key = normalize_printer(printer_key)

    px, py, pz = PRINTERS[printer_key]
    b = bbox(model)

    if b.xlen <= 0 or b.ylen <= 0 or b.zlen <= 0:
        return model

    scale = min(
        px / b.xlen,
        py / b.ylen,
        pz / b.zlen,
        1
    )

    # ONLY SCALE IF NECESSARY
    if scale < 1:
        model = model.scale(scale)

    return model

# --------------------------------
# SCORE
# --------------------------------

def score(model, printer_key):

    printer_key = normalize_printer(printer_key)

    px, py, pz = PRINTERS[printer_key]
    b = bbox(model)

    fits = b.xlen <= px and b.ylen <= py and b.zlen <= pz

    ratio = (b.xlen * b.ylen * b.zlen) / (px * py * pz)

    s = 100
    if not fits:
        s -= 50

    s -= int(ratio * 50)

    return max(0, min(100, s))

# --------------------------------
# ENDPOINTS
# --------------------------------

@app.get("/")
def home():
    return {"status": "ok"}

@app.get("/printers")
def printers():
    return {"printers": PRINTERS}

@app.post("/generate")
def generate(data: GenerateRequest):

    try:
        printer = normalize_printer(data.printer)

        design = ai_design(data.prompt)
        model = build_model(design)

        # 🔥 IMPORTANT FIX: NO PRE-SCALING ANYWHERE
        if data.fit:
            model = auto_fit(model, printer)

        b = bbox(model)
        s = score(model, printer)

        file_id = str(uuid.uuid4())
        path = os.path.join(tempfile.gettempdir(), f"{file_id}.stl")

        cq.exporters.export(model, path)

        return {
            "status": "ok",
            "printer": printer,
            "bounds": {"x": b.xlen, "y": b.ylen, "z": b.zlen},
            "score": s,
            "download": f"/download/{file_id}"
        }

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)},
        )

@app.get("/download/{file_id}")
def download(file_id: str):

    path = os.path.join(tempfile.gettempdir(), f"{file_id}.stl")

    if not os.path.exists(path):
        return JSONResponse({"status": "error", "message": "not found"}, status_code=404)

    return FileResponse(path, filename="model.stl")

# --------------------------------
# RUN
# --------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
