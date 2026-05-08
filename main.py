from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

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
