from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import cadquery as cq
import uuid

# --------------------------------
# FASTAPI
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
# REQUEST MODELS
# --------------------------------

class Request(BaseModel):
    prompt: str


class UpdateRequest(BaseModel):
    type: str
    width: float = 100
    height: float = 100
    depth: float = 100
    thickness: float = 8

# --------------------------------
# AI DESIGN DETECTION
# --------------------------------

def ai_design(prompt: str):

    prompt_lower = prompt.lower()

    # ----------------------------
    # HEADSET STAND
    # ----------------------------

    if "headset" in prompt_lower:

        return {
            "type": "headset_stand",
            "height": 240,
            "width": 120,
            "depth": 120,
            "thickness": 8
        }

    # ----------------------------
    # PHONE STAND
    # ----------------------------

    elif "phone" in prompt_lower:

        return {
            "type": "phone_stand",
            "height": 120,
            "width": 80,
            "depth": 70,
            "thickness": 8
        }

    # ----------------------------
    # BRACKET
    # ----------------------------

    elif "bracket" in prompt_lower:

        return {
            "type": "bracket",
            "width": 60,
            "height": 60,
            "depth": 20,
            "thickness": 8
        }

    # ----------------------------
    # CASE
    # ----------------------------

    elif "case" in prompt_lower:

        return {
            "type": "case",
            "width": 100,
            "height": 30,
            "depth": 60,
            "thickness": 3
        }

    # ----------------------------
    # DEFAULT BOX
    # ----------------------------

    else:

        return {
            "type": "box",
            "width": 40,
            "height": 40,
            "depth": 40,
            "thickness": 4
        }

# --------------------------------
# CAD MODEL BUILDER
# --------------------------------

def build_model(design):

    try:

        model_type = design.get("type")

        # ----------------------------
        # HEADSET STAND
        # ----------------------------

        if model_type == "headset_stand":

            height = design.get("height", 240)
            width = design.get("width", 120)
            thickness = design.get("thickness", 8)

            base = (
                cq.Workplane("XY")
                .box(width, width, thickness)
            )

            stand = (
                cq.Workplane("XY")
                .transformed(offset=(0, 0, height / 2))
                .box(thickness, thickness, height)
            )

            top_hook = (
                cq.Workplane("XY")
                .transformed(offset=(0, 0, height))
                .box(width / 2, thickness, thickness)
            )

            return (
                base
                .union(stand)
                .union(top_hook)
            )

        # ----------------------------
        # PHONE STAND
        # ----------------------------

        elif model_type == "phone_stand":

            width = design.get("width", 80)
            height = design.get("height", 120)
            depth = design.get("depth", 70)
            thickness = design.get("thickness", 8)

            base = (
                cq.Workplane("XY")
                .box(width, depth, thickness)
            )

            back = (
                cq.Workplane("XY")
                .transformed(offset=(0, -20, height / 2))
                .box(width, thickness, height)
            )

            return (
                base
                .union(back)
            )

        # ----------------------------
        # BRACKET
        # ----------------------------

        elif model_type == "bracket":

            width = design.get("width", 60)
            height = design.get("height", 60)
            depth = design.get("depth", 20)

            vertical = (
                cq.Workplane("XY")
                .box(depth, depth, height)
            )

            horizontal = (
                cq.Workplane("XY")
                .transformed(offset=(width / 2, 0, depth / 2))
                .box(width, depth, depth)
            )

            return (
                vertical
                .union(horizontal)
            )

        # ----------------------------
        # CASE
        # ----------------------------

        elif model_type == "case":

            width = design.get("width", 100)
            depth = design.get("depth", 60)
            height = design.get("height", 30)

            outer = (
                cq.Workplane("XY")
                .box(width, depth, height)
            )

            inner = (
                cq.Workplane("XY")
                .transformed(offset=(0, 0, 2))
                .box(width - 6, depth - 6, height - 4)
            )

            return outer.cut(inner)

        # ----------------------------
        # DEFAULT BOX
        # ----------------------------

        else:

            width = design.get("width", 40)
            depth = design.get("depth", 40)
            height = design.get("height", 40)

            return (
                cq.Workplane("XY")
                .box(width, depth, height)
            )

    except Exception as e:

        print("CAD ERROR:", e)

        return cq.Workplane("XY").box(40, 40, 40)

# --------------------------------
# HOME
# --------------------------------

@app.get("/")
def home():

    return {
        "status": "Cadio AI CAD running"
    }

# --------------------------------
# GENERATE MODEL
# --------------------------------

@app.post("/generate")
def generate(data: Request):

    try:

        # AI design
        design = ai_design(data.prompt)

        print("PROMPT:")
        print(data.prompt)

        print("DESIGN:")
        print(design)

        # Build model
        model = build_model(design)

        # Create file id
        file_id = str(uuid.uuid4())

        # STL path
        path = f"/tmp/{file_id}.stl"

        # Export STL
        cq.exporters.export(model, path)

        return {
            "status": "generated",
            "design": design,
            "download_url": f"/download/{file_id}"
        }

    except Exception as e:

        print("GENERATE ERROR:", e)

        return {
            "status": "error",
            "message": str(e)
        }

# --------------------------------
# LIVE MODEL UPDATE
# --------------------------------

@app.post("/update-model")
def update_model(data: UpdateRequest):

    try:

        design = {
            "type": data.type,
            "width": data.width,
            "height": data.height,
            "depth": data.depth,
            "thickness": data.thickness
        }

        model = build_model(design)

        file_id = str(uuid.uuid4())

        path = f"/tmp/{file_id}.stl"

        cq.exporters.export(model, path)

        return {
            "status": "updated",
            "design": design,
            "download_url": f"/download/{file_id}"
        }

    except Exception as e:

        return {
            "status": "error",
            "message": str(e)
        }

# --------------------------------
# DOWNLOAD STL
# --------------------------------

@app.get("/download/{file_id}")
def download(file_id: str):

    path = f"/tmp/{file_id}.stl"

    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"{file_id}.stl"
    )
