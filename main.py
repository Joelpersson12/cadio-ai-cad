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
# UNIT SYSTEM
# --------------------------------

# CadQuery units are unitless, so this app treats 1 CadQuery unit as 1 mm.
# Do not add another unit conversion layer here. auto_fit is the only scaler.


# --------------------------------
# PRINTER DATABASE (mm)
# --------------------------------

PRINTERS = {
    "adventurer_3": {
        "name": "Flashforge Adventurer 3",
        "brand": "Flashforge",
        "build_volume": (150, 150, 150),
    },
    "adventurer_5m": {
        "name": "Flashforge Adventurer 5M",
        "brand": "Flashforge",
        "build_volume": (220, 220, 250),
    },
    "creator_pro_2": {
        "name": "Flashforge Creator Pro 2",
        "brand": "Flashforge",
        "build_volume": (200, 148, 150),
    },
    "bambu_x1c": {
        "name": "Bambu Lab X1C",
        "brand": "Bambu Lab",
        "build_volume": (256, 256, 256),
    },
    "ender_3": {
        "name": "Creality Ender 3",
        "brand": "Creality",
        "build_volume": (220, 220, 250),
    },
    "prusa_mk4": {
        "name": "Prusa MK4",
        "brand": "Prusa",
        "build_volume": (250, 210, 220),
    },
}

DEFAULT_PRINTER = "adventurer_3"

PRINTER_ALIASES = {
    "adventurer_3": "adventurer_3",
    "flashforge_adventurer_3": "adventurer_3",
    "flashforge_adventurer3": "adventurer_3",
    "flashforge_adventurer_3_150x150x150_mm": "adventurer_3",
    "adventurer_5m": "adventurer_5m",
    "flashforge_adventurer_5m": "adventurer_5m",
    "flashforge_adventurer5m": "adventurer_5m",
    "flashforge_adventurer_5m_220x220x250_mm": "adventurer_5m",
    "creator_pro_2": "creator_pro_2",
    "flashforge_creator_pro_2": "creator_pro_2",
    "flashforge_creatorpro2": "creator_pro_2",
    "flashforge_creator_pro_2_200x148x150_mm": "creator_pro_2",
    "bambu_x1c": "bambu_x1c",
    "bambu_lab_x1c": "bambu_x1c",
    "x1c": "bambu_x1c",
    "ender_3": "ender_3",
    "creality_ender_3": "ender_3",
    "prusa_mk4": "prusa_mk4",
    "original_prusa_mk4": "prusa_mk4",
}


class GenerateRequest(BaseModel):
    prompt: str
    printer: str = DEFAULT_PRINTER
    fit: bool = True


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: FastAPIRequest,
    exc: RequestValidationError,
):
    print("VALIDATION ERROR:", exc)
    return JSONResponse(
        status_code=422,
        content={"status": "error", "message": str(exc)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: FastAPIRequest, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": str(exc)},
    )


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


def clean_model(model):
    workplane = as_workplane(model)
    return as_workplane(workplane.clean())


def build_model(d):
    t = d["type"]

    if t == "headset_stand":
        base = cq.Workplane("XY").box(d["width"], d["depth"], d["thickness"])
        stand = (
            cq.Workplane("XY")
            .transformed(offset=(0, 0, d["height"] / 2))
            .box(d["thickness"], d["thickness"], d["height"])
        )
        return as_workplane(base.union(stand))

    if t == "phone_stand":
        base = cq.Workplane("XY").box(d["width"], d["depth"], d["thickness"])
        back = (
            cq.Workplane("XY")
            .transformed(offset=(0, -10, d["height"] / 2))
            .box(d["width"], d["thickness"], d["height"])
        )
        return as_workplane(base.union(back))

    if t == "bracket":
        v = cq.Workplane("XY").box(d["depth"], d["depth"], d["height"])
        h = (
            cq.Workplane("XY")
            .transformed(offset=(d["width"] / 2, 0, d["depth"] / 2))
            .box(d["width"], d["depth"], d["depth"])
        )
        return as_workplane(v.union(h))

    if t == "case":
        outer = cq.Workplane("XY").box(d["width"], d["depth"], d["height"])
        inner = (
            cq.Workplane("XY")
            .transformed(offset=(0, 0, 2))
            .box(d["width"] - 6, d["depth"] - 6, d["height"] - 4)
        )
        return as_workplane(outer.cut(inner))

    return as_workplane(cq.Workplane("XY").box(d["width"], d["depth"], d["height"]))


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

    scale = min(
        printer_x / bbox.xlen,
        printer_y / bbox.ylen,
        printer_z / bbox.zlen,
        1,
    )

    print("PRINTER:", printer_key)
    print("BOUNDS:", bbox.xlen, bbox.ylen, bbox.zlen)
    print("SCALE:", scale)

    if scale < 1:
        return as_workplane(workplane.scale(scale))

    return workplane


def printability_score(model, printer_key):
    workplane = as_workplane(model)
    printer_key = normalize_printer(printer_key)
    max_x, max_y, max_z = printer_volume(printer_key)
    bbox = bounding_box(workplane)

    fits = bbox.xlen <= max_x and bbox.ylen <= max_y and bbox.zlen <= max_z
    ratio = (bbox.xlen * bbox.ylen * bbox.zlen) / (max_x * max_y * max_z)

    score = 100

    if not fits:
        score -= 50

    score -= int(ratio * 50)

    return max(0, min(100, score))


@app.get("/")
def home():
    return {"status": "Cadio running"}


@app.get("/printers")
def list_printers():
    return {
        "status": "ok",
        "default": DEFAULT_PRINTER,
        "printers": [
            {
                "key": key,
                "name": value["name"],
                "brand": value["brand"],
                "build_volume": value["build_volume"],
            }
            for key, value in PRINTERS.items()
        ],
    }


@app.post("/generate")
def generate(data: GenerateRequest):
    try:
        printer_key = normalize_printer(data.printer)
        design = ai_design(data.prompt)

        for key in ["width", "height", "depth", "thickness"]:
            if key in design:
                design[key] = float(design[key])

        model = build_model(design)
        original_bbox = bounding_box(model)

        if data.fit:
            model = auto_fit(model, printer_key)
        else:
            print("PRINTER:", printer_key)
            print("BOUNDS:", original_bbox.xlen, original_bbox.ylen, original_bbox.zlen)
            print("SCALE:", 1)

        model = clean_model(model)
        final_bbox = bounding_box(model)
        score = printability_score(model, printer_key)

        file_id = str(uuid.uuid4())
        path = os.path.join(tempfile.gettempdir(), f"{file_id}.stl")

        cq.exporters.export(model, path)

        return {
            "status": "ok",
            "printer": printer_key,
            "printer_name": PRINTERS[printer_key]["name"],
            "printer_build_volume": PRINTERS[printer_key]["build_volume"],
            "design": design,
            "bounds_mm": {
                "x": final_bbox.xlen,
                "y": final_bbox.ylen,
                "z": final_bbox.zlen,
            },
            "printability_score": score,
            "download_url": f"/download/{file_id}",
        }

    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc)},
        )


@app.get("/download/{file_id}")
def download(file_id: str):
    try:
        path = os.path.join(tempfile.gettempdir(), f"{file_id}.stl")

        if not os.path.exists(path):
            return JSONResponse(
                status_code=404,
                content={"status": "error", "message": "File not found"},
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
            content={"status": "error", "message": str(exc)},
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
