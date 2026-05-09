from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import cadquery as cq
import uuid

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
# SYSTEM CONFIG
# --------------------------------

UNIT_SCALE = 1

PRINTERS = {
    "adventurer_3": (150, 150, 150),
    "adventurer_5m": (220, 220, 250),
    "bambu_x1c": (256, 256, 256),
    "ender_3": (220, 220, 250),
    "prusa_mk4": (250, 210, 220),
}

DEFAULT_PRINTER = "adventurer_3"

# --------------------------------
# REQUEST
# --------------------------------

class Request(BaseModel):
    prompt: str
    printer: str = DEFAULT_PRINTER
    fit: bool = True  # 🔥 toggle from frontend

# --------------------------------
# AI LOGIC (STABLE)
# --------------------------------

def ai_design(prompt: str):

    p = prompt.lower()

    if "headset" in p:
        return {"type": "headset_stand", "width": 120, "height": 240, "depth": 120, "thickness": 8}

    if "phone" in p:
        return {"type": "phone_stand", "width": 80, "height": 120, "depth": 70, "thickness": 8}

    if "bracket" in p:
        return {"type": "bracket", "width": 60, "height": 60, "depth": 20, "thickness": 8}

    return {"type": "box", "width": 40, "height": 40, "depth": 40, "thickness": 4}

# --------------------------------
# CAD BUILDER
# --------------------------------

def build_model(d):

    t = d["type"]

    if t == "headset_stand":
        base = cq.Workplane("XY").box(d["width"], d["depth"], d["thickness"])
        stand = cq.Workplane("XY").transformed(offset=(0, 0, d["height"]/2)).box(d["thickness"], d["thickness"], d["height"])
        return base.union(stand)

    if t == "phone_stand":
        base = cq.Workplane("XY").box(d["width"], d["depth"], d["thickness"])
        back = cq.Workplane("XY").transformed(offset=(0, -10, d["height"]/2)).box(d["width"], d["thickness"], d["height"])
        return base.union(back)

    if t == "bracket":
        v = cq.Workplane("XY").box(d["depth"], d["depth"], d["height"])
        h = cq.Workplane("XY").transformed(offset=(d["width"]/2, 0, d["depth"]/2)).box(d["width"], d["depth"], d["depth"])
        return v.union(h)

    return cq.Workplane("XY").box(d["width"], d["depth"], d["height"])

# --------------------------------
# PRINT SCORE (NEW)
# --------------------------------

def printability_score(model, printer_key):

    bbox = model.val().BoundingBox()
    max_x, max_y, max_z = PRINTERS.get(printer_key, PRINTERS[DEFAULT_PRINTER])

    fits = (
        bbox.xlen <= max_x and
        bbox.ylen <= max_y and
        bbox.zlen <= max_z
    )

    size_ratio = (bbox.xlen * bbox.ylen * bbox.zlen) / (max_x * max_y * max_z)

    score = 100

    if not fits:
        score -= 50

    score -= int(size_ratio * 50)

    return max(0, min(100, score))

# --------------------------------
# AUTO ORIENTATION (LIGHT VERSION)
# --------------------------------

def auto_orient(model):
    # placeholder for future full rotation system
    return model

# --------------------------------
# AUTO FIT
# --------------------------------

def auto_fit(model, printer_key):

    max_x, max_y, max_z = PRINTERS.get(printer_key, PRINTERS[DEFAULT_PRINTER])

    bbox = model.val().BoundingBox()

    scale = min(
        max_x / bbox.xlen,
        max_y / bbox.ylen,
        max_z / bbox.zlen,
        1
    )

    if scale < 1:
        model = model.scale(scale)

    return model

# --------------------------------
# HOME
# --------------------------------

@app.get("/")
def home():
    return {"status": "Cadio running"}

# --------------------------------
# GENERATE (MAIN PIPELINE)
# --------------------------------

@app.post("/generate")
def generate(data: Request):

    design = ai_design(data.prompt)

    # enforce mm system
    for k in ["width", "height", "depth", "thickness"]:
        if k in design:
            design[k] = float(design[k]) * UNIT_SCALE

    model = build_model(design)

    # orientation step (future)
    model = auto_orient(model)

    # fit toggle
    if data.fit:
        model = auto_fit(model, data.printer)

    # score
    score = printability_score(model, data.printer)

    file_id = str(uuid.uuid4())
    path = f"/tmp/{file_id}.stl"

    cq.exporters.export(model, path)

    return {
        "status": "ok",
        "design": design,
        "printer": data.printer,
        "printability_score": score,
        "download_url": f"/download/{file_id}"
    }

# --------------------------------
# DOWNLOAD
# --------------------------------

@app.get("/download/{file_id}")
def download(file_id: str):

    path = f"/tmp/{file_id}.stl"

    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"{file_id}.stl"
    )
