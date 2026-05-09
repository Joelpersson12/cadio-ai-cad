from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import cadquery as cq
import uuid
import os

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
# STANDARD: 1 UNIT = 1 MM
# --------------------------------

UNIT_SCALE = 1

# --------------------------------
# REQUEST
# --------------------------------

class Request(BaseModel):
    prompt: str

# --------------------------------
# SIMPLE AI RULE ENGINE (STABIL VERSION)
# --------------------------------

def ai_design(prompt: str):

    p = prompt.lower()

    if "headset" in p:
        return {"type": "headset_stand", "width": 120, "height": 240, "depth": 120, "thickness": 8}

    if "phone" in p:
        return {"type": "phone_stand", "width": 80, "height": 120, "depth": 70, "thickness": 8}

    if "bracket" in p:
        return {"type": "bracket", "width": 60, "height": 60, "depth": 20, "thickness": 8}

    if "case" in p:
        return {"type": "case", "width": 100, "height": 30, "depth": 60, "thickness": 3}

    return {"type": "box", "width": 40, "height": 40, "depth": 40, "thickness": 4}

# --------------------------------
# CAD BUILDER
# --------------------------------

def build_model(d):

    t = d.get("type")

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

    if t == "case":

        outer = cq.Workplane("XY").box(d["width"], d["depth"], d["height"])
        inner = cq.Workplane("XY").transformed(offset=(0,0,2)).box(d["width"]-6, d["depth"]-6, d["height"]-4)

        return outer.cut(inner)

    return cq.Workplane("XY").box(d["width"], d["depth"], d["height"])

# --------------------------------
# HOME
# --------------------------------

@app.get("/")
def home():
    return {"status": "Cadio running"}

# --------------------------------
# GENERATE
# --------------------------------

@app.post("/generate")
def generate(data: Request):

    design = ai_design(data.prompt)

    # enforce mm scale
    for k in ["width", "height", "depth", "thickness"]:
        if k in design:
            design[k] = float(design[k]) * UNIT_SCALE

    model = build_model(design)

    file_id = str(uuid.uuid4())
    path = f"/tmp/{file_id}.stl"

    cq.exporters.export(model, path)

    return {
        "status": "ok",
        "design": design,
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
