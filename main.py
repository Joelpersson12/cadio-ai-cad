from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openai import OpenAI
import cadquery as cq
import uuid
import os

# OpenAI client
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

# FastAPI app
app = FastAPI()

# CORS (för Lovable/frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request model
class Request(BaseModel):
    prompt: str


# AI DESIGN FUNCTION
def ai_design(prompt: str):

    try:

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a CAD assistant. "
                        "Return ONLY one of these words: "
                        "phone_stand, bracket, case, box"
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        result = response.choices[0].message.content.strip().lower()

        print("AI RESULT:", result)

        return result

    except Exception as e:

        print("OPENAI ERROR:", e)

        return "box"


# BUILD CAD MODEL
def build_model(design: str):

    try:

        if design == "phone_stand":
            return cq.Workplane("XY").box(80, 10, 120)

        elif design == "bracket":
            return cq.Workplane("XY").box(60, 20, 20)

        elif design == "case":
            return cq.Workplane("XY").box(100, 60, 30)

        else:
            return cq.Workplane("XY").box(40, 40, 40)

    except Exception as e:

        print("CAD ERROR:", e)

        return cq.Workplane("XY").box(40, 40, 40)


# HOME
@app.get("/")
def home():
    return {
        "status": "Cadio AI CAD running"
    }


# GENERATE ENDPOINT
@app.post("/generate")
def generate(data: Request):

    try:

        # AI decides design
        design = ai_design(data.prompt)

        # Build CAD model
        model = build_model(design)

        # Create filename
        file_id = str(uuid.uuid4())

        # STL path
        path = f"/tmp/{file_id}.stl"

        # Export STL
        cq.exporters.export(model, path)

        # Return response
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


# DOWNLOAD STL
@app.get("/download/{file_id}")
def download(file_id: str):

    path = f"/tmp/{file_id}.stl"

    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"{file_id}.stl"
    )
