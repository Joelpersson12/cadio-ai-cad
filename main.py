from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import cadquery as cq
import uuid
from openai import OpenAI

client = OpenAI(api_key="DIN_OPENAI_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Request(BaseModel):
    prompt: str


def ai_design(prompt: str):

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "Return only one: phone_stand, bracket, box, case"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return response.choices[0].message.content.strip()


def build_model(design: str):

    if design == "phone_stand":
        return cq.Workplane("XY").box(80, 10, 120)

    if design == "bracket":
        return cq.Workplane("XY").box(60, 20, 20)

    if design == "case":
        return cq.Workplane("XY").box(100, 60, 30)

    return cq.Workplane("XY").box(40, 40, 40)


@app.get("/")
def home():
    return {"status": "Cadio AI CAD running"}


@app.post("/generate")
def generate(data: Request):

    design = ai_design(data.prompt)
    model = build_model(design)

    file_id = str(uuid.uuid4())
    path = f"/tmp/{file_id}.stl"

    cq.exporters.export(model, path)

    return {
        "status": "generated",
        "design": design,
        "download_url": f"/download/{file_id}"
    }


@app.get("/download/{file_id}")
def download(file_id: str):
    return FileResponse(f"/tmp/{file_id}.stl")
