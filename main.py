from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
        "message": f"You generated: {data.prompt}"
    }
