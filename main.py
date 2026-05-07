main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Request(BaseModel):
    prompt: str

@app.post("/generate")
def generate(data: Request):
    return {
        "status": "ok",
        "prompt": data.prompt,
        "message": "backend works"
    }
