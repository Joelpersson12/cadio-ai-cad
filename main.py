from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import cadquery as cq
import uuid
import os

app = FastAPI()

# CORS (fixar Lovable connection)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# input från Lovable
class Request(BaseModel):
    prompt: str


# enkel AI logik (MVP)
def create_model(prompt: str):

    p = prompt.lower()

    if "phone stand" in p:
        return cq.Workplane("XY").box(80, 10, 120)

    elif "bracket" in p:
        return cq.Workplane("XY").box(60, 20, 10)

    else:
        return cq.Workplane("XY").box(40, 40, 40)


@app.get("/")
def home():
    return {"status": "Cadio AI CAD running"}


@app.post("/generate")
def generate(data: Request):

    model = create_model(data.prompt)

    filename = f"{uuid.uuid4()}.stl"
    path = f"/tmp/{filename}"

    cq.exporters.export(model, path)

    return {
        "status": "generated",
        "prompt": data.prompt,
        "download_url": f"/download/{filename}"
    }


@app.get("/download/{file}")
def download(file: str):
    return FileResponse(f"/tmp/{file}")
