from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openai import OpenAI
import cadquery as cq
import uuid
import os
import json

# --------------------------------
# OPENAI CLIENT
# --------------------------------

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

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
# REQUEST MODEL
# --------------------------------

class Request(BaseModel):
    prompt: str

# --------------------------------
# AI DESIGN FUNCTION
# --------------------------------

def ai_design(prompt: str):

    try:

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
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
  "thickness": 8,
  "angle": 30
}

{
  "type": "bracket",
  "width": 60,
  "height": 60,
  "depth": 20
}

{
  "type": "case",
  "width": 100,
  "height": 30,
  "depth": 60
}
"""
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        result = response.choices[0].message.content

        print("AI RESPONSE:")
        print(result)

        return json.loads(result)

    except Exception as e:

        print("AI ERROR:", e)

        return {
            "type": "box",
            "size": 40
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

            return base.union(stand).union(top_hook)

        # ----------------------------
        # PHONE STAND
        # ----------------------------

        elif model_type == "phone_stand":

            width = design.get("width", 80)
            height = design.get("height", 120)
            thickness = design.get("thickness", 8)

            back = (
                cq.Workplane("XY")
                .transformed(offset=(0, 0, height / 2))
                .box(width, thickness, height)
            )

            base = (
                cq.Workplane("XY")
                .box(width, height / 2, thickness)
            )

            return back.union(base)

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

            return vertical.union(horizontal)

        # ----------------------------
        # CASE
        # ----------------------------

        elif model_type == "case":

            width = design.get("width", 100)
            depth = design.get("depth", 60)
            height = design.get("height", 30)

            return (
                cq.Workplane("XY")
                .box(width, depth, height)
            )

        # ----------------------------
        # DEFAULT BOX
        # ----------------------------

        else:

            size = design.get("size", 40)

            return (
                cq.Workplane("XY")
                .box(size, size, size)
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
# GENERATE ENDPOINT
# --------------------------------

@app.post("/generate")
def generate(data: Request):

    try:

        # AI design
        design = ai_design(data.prompt)

        print("DESIGN:")
        print(design)

        # Build CAD model
        model = build_model(design)

        # Create unique file id
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
