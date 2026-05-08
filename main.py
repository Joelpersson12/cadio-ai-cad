from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openai import OpenAI
import cadquery as cq
import uuid
import os
import json

# -----------------------------
# OPENAI
# -----------------------------

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

# -----------------------------
# FASTAPI
# -----------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# REQUEST MODEL
# -----------------------------

class Request(BaseModel):
    prompt: str

# -----------------------------
# AI PARAMETRIC DESIGN
# -----------------------------

def ai_design(prompt: str):

    try:

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """
You are an AI CAD designer.

Return ONLY valid JSON.

Examples:

{
  "type": "headset_stand",
  "height": 240,
  "width": 120,
  "thickness": 8
}

{
  "type": "phone_stand",
  "height": 120,
  "width": 80,
  "angle": 30
}

{
  "type": "box",
  "size": 40
}
"""
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        result = response.choices[0].message.content.strip()

        print("AI RESPONSE:")
        print(result)

        return json.loads(result)

    except Exception as e:

        print("AI ERROR:", e)

        return {
            "type": "box",
            "size": 40
        }

# -----------------------------
# BUILD CAD MODEL
# -----------------------------

def build_model(design):

    try:

        model_type = design.get("type")

        # --------------------------------
        # HEADSET STAND
        # --------------------------------

        if model_type == "headset_stand":

            height = design.get("height", 240)
            width = design.get("width", 120)
            thickness = design.get("thickness", 8)

            # Base
            base = (
                cq.Workplane("XY")
                .box(width, width, thickness)
            )

            # Vertical stand
            stand = (
                cq.Workplane("XY")
                .transformed(offset=(0, 0, height / 2))
                .box(thickness, thickness, height)
            )

            return base.union(stand)

        # --------------------------------
        # PHONE STAND
        # --------------------------------

        elif model_type == "phone_stand":

            width = design.get("width", 80)
            height = design.get("height", 120)
            thickness = design.get("thickness", 8)

            return (
                cq.Workplane("XY")
                .box(width, thickness, height)
            )

        # --------------------------------
        # SIMPLE CASE
        # --------------------------------

        elif model_type == "case":

            width = design.get("width", 100)
            depth = design.get("depth", 60)
            height = design.get("height", 30)

            return (
                cq.Workplane("XY")
                .box(width, depth, height)
            )

        # --------------------------------
        # BRACKET
        # --------------------------------

        elif model_type == "bracket":

            width = design.get("width", 60)
            depth = design.get("depth", 20)
            height = design.get("height", 60)

            vertical = (
                cq.Workplane("XY")
                .box(depth, depth, height)
            )

            horizontal = (
                cq.Workplane("XY")
                .transformed(offset=(width / 2, 0, depth / 2))
                .box(width, depth, depth)
            )

            return vertical.union(horizontal)

        # --------------------------------
        # DEFAULT BOX
        # --------------------------------

        else:

            size = design.get("size", 40)

            return (
                cq.Workplane("XY")
                .box(size, size, size)
            )

    except Exception as e:

        print("CAD ERROR:", e)

        return cq.Workplane("XY").box(40, 40, 40)

# -----------------------------
# HOME
# -----------------------------

@app.get("/")
def home():

    return {
        "status": "Cadio AI CAD running"
    }

# -----------------------------
# GENERATE CAD
# -----------------------------

@app.post("/generate")
def generate(data: Request):

    try:

        # AI creates parameters
        design = ai_design(data.prompt)

        print("DESIGN:")
        print(design)

        # Build CAD model
        model = build_model(design)

        # Create file id
        file_id = str(uuid.uuid4())

        # STL path
        path = f"/tmp/{file_id}.stl"

        # Export STL
        cq.exporters.export(model, path)

        return {
            "status": "generated",
            "prompt": data.prompt,
            "design": design,
            "download_url": f"/download/{file_id}"
        }

    except Exception as e:

        print("GENERATE ERROR:", e)

        return {
            "status": "error",
            "message": str(e)
        }

# -----------------------------
# DOWNLOAD STL
# -----------------------------

@app.get("/download/{file_id}")
def download(file_id: str):

    path = f"/tmp/{file_id}.stl"

    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"{file_id}.stl"
    )
