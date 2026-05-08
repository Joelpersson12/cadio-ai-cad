from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # öppnar för alla origins (dev-läge)
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Request(BaseModel):
    prompt: str

@app.get("/")
def home():
    return {"status": "Cadio API running"}

@app.post("/generate")
def generate(data: Request):
    return {
        "status": "generated",
        "message": data.prompt
    }
