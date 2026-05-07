main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"status": "Cadio API running"}

@app.post("/generate")
def generate():
    return {
        "status": "ok",
        "message": "works"
    }
