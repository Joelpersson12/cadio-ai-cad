import os
import tempfile
import traceback
import uuid

import cadquery as cq
import uvicorn
from fastapi import FastAPI
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
# UNIT SYSTEM (mm)
# --------------------------------

UNIT_SCALE = 1


# --------------------------------
# PRINTER DATABASE
# --------------------------------

PRINTERS = {
    "adventurer_3": (150, 150, 150),
    "adventurer_5m": (220, 220, 250),
    "bambu_x1c": (256, 256, 256),
    "ender_3": (220, 220, 250),
    "prusa_mk4": (250, 210, 220),
}

DEFAULT_PRINTER = "adventurer_3"


# --------------------------------
# REQUEST MODEL
# --------------------------------

class Request(BaseModel):
    prompt: str
    printer: str = DEFAULT_PRINTER
    fit: bool = True


# --------------------------------
# AI DESIGN ENGINE (STABLE RULE-BASED)
# --------------------------------

def ai_design(prompt: str):
    p = prompt.lower()

    if "headset" in p:
        return {
            "type": "headset_stand",
            "width": 120,
            "height": 240,
            "depth": 120,
            "thickness": 8,
        }

    if "phone" in p:
        return {
            "type": "phone_stand",
            "width": 80,
            "height": 120,
            "depth": 70,
            "thickness": 8,
        }

    if "bracket" in p:
        return {
            "type": "bracket",
            "width": 60,
            "height": 60,
            "depth": 20,
            "thickness": 8,
        }

    if "case" in p:
        return {
            "type": "case",
            "width": 100,
            "height": 30,
            "depth": 60,
            "thickness": 3,
        }

    return {"type": "box", "width": 40, "height": 40, "depth": 40, "thickness": 4}


# --------------------------------
# CAD BUILDER
# --------------------------------

def build_model(d):
    t = d["type"]

    if t == "headset_stand":
        base = cq.Workplane("XY").box(d["width"], d["depth"], d["thickness"])
        stand = (
            cq.Workplane("XY")
            .transformed(offset=(0, 0, d["height"] / 2))
            .box(d["thickness"], d["thickness"], d["height"])
        )

        return base.union(stand)

    if t == "phone_stand":
        base = cq.Workplane("XY").box(d["width"], d["depth"], d["thickness"])
        back = (
            cq.Workplane("XY")
            .transformed(offset=(0, -10, d["height"] / 2))
            .box(d["width"], d["thickness"], d["height"])
        )

        return base.union(back)

    if t == "bracket":
        v = cq.Workplane("XY").box(d["depth"], d["depth"], d["height"])
        h = (
            cq.Workplane("XY")
            .transformed(offset=(d["width"] / 2, 0, d["depth"] / 2))
            .box(d["width"], d["depth"], d["depth"])
        )

        return v.union(h)

    if t == "case":
        outer = cq.Workplane("XY").box(d["width"], d["depth"], d["height"])
        inner = (
            cq.Workplane("XY")
            .transformed(offset=(0, 0, 2))
            .box(d["width"] - 6, d["depth"] - 6, d["height"] - 4)
        )

        return outer.cut(inner)

    return cq.Workplane("XY").box(d["width"], d["depth"], d["height"])


# --------------------------------
# PRINTER NORMALIZATION
# --------------------------------

def normalize_printer(printer: str):
    if not printer:
        return DEFAULT_PRINTER

    printer_key = printer.lower().replace(" ", "_")

    aliases = {
        "flashforge": "adventurer_3",
        "flashforge_adventurer_3": "adventurer_3",
        "adventurer_3": "adventurer_3",
        "adventurer_5m": "adventurer_5m",
        "bambu_x1c": "bambu_x1c",
        "ender_3": "ender_3",
        "prusa_mk4": "prusa_mk4",
    }

    if printer_key in aliases:
        return aliases[printer_key]

    if "adventurer_3" in printer_key or "flashforge" in printer_key:
        return "adventurer_3"

    return printer_key if printer_key in PRINTERS else DEFAULT_PRINTER


def bounding_box(model):
    return model.val().wrapped.BoundingBox()


# --------------------------------
# AUTO FIT
# --------------------------------

def auto_fit(model, printer_key):

    max_x, max_y, max_z = PRINTERS.get(printer_key, PRINTERS[DEFAULT_PRINTER])

    # CORRECT CadQuery bbox usage
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
# PRINT SCORE
# --------------------------------

def printability_score(model, printer_key):
    printer_key = normalize_printer(printer_key)
    max_x, max_y, max_z = PRINTERS[printer_key]
    bbox = bounding_box(model)

    fits = bbox.xlen <= max_x and bbox.ylen <= max_y and bbox.zlen <= max_z
    ratio = (bbox.xlen * bbox.ylen * bbox.zlen) / (max_x * max_y * max_z)

    score = 100

    if not fits:
        score -= 50

    score -= int(ratio * 50)

    return max(0, min(100, score))


# --------------------------------
# HOME
# --------------------------------

@app.get("/")
def home():
    return {"status": "Cadio running"}


# --------------------------------
# GENERATE PIPELINE
# --------------------------------

@app.post("/generate")
def generate(data: Request):
    try:
        printer_key = normalize_printer(data.printer)
        design = ai_design(data.prompt)

        for key in ["width", "height", "depth", "thickness"]:
            if key in design:
                design[key] = float(design[key]) * UNIT_SCALE

        model = build_model(design)

        if data.fit:
            model = auto_fit(model, printer_key)
        else:
            bbox = bounding_box(model)
            print("PRINTER:", printer_key)
            print("BOUNDS:", bbox.xlen, bbox.ylen, bbox.zlen)
            print("SCALE:", 1)

        model = model.clean()
        score = printability_score(model, printer_key)

        file_id = str(uuid.uuid4())
        path = os.path.join(tempfile.gettempdir(), f"{file_id}.stl")

        cq.exporters.export(model, path)

        return {
            "status": "ok",
            "printer": printer_key,
            "design": design,
            "printability_score": score,
            "download_url": f"/download/{file_id}",
        }
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(exc),
            },
        )


# --------------------------------
# DOWNLOAD
# --------------------------------

@app.get("/download/{file_id}")
def download(file_id: str):
    try:
        path = os.path.join(tempfile.gettempdir(), f"{file_id}.stl")

        if not os.path.exists(path):
            return JSONResponse(
                status_code=404,
                content={
                    "status": "error",
                    "message": "File not found",
                },
            )

        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=f"{file_id}.stl",
        )
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(exc),
            },
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
