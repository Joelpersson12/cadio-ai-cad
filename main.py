import os
import uuid
import traceback

import cadquery as cq
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------
# MEMORY STATE (THIS IS THE KEY FIX)
# --------------------------------

SESSION_MODELS = {}

# --------------------------------
# PRINTERS
# --------------------------------

PRINTERS = {
    "adventurer_3": (150, 150, 150),
    "adventurer_5m": (220, 220, 250),
    "creator_pro_2": (200, 148, 150),
    "bambu_x1c": (256, 256, 256),
}

DEFAULT_PRINTER = "adventurer_3"

# --------------------------------
# SIMPLE AI PARSER
# --------------------------------

def ai_design(prompt: str):
    p = (prompt or "").lower()

    if "phone" in p:
        return "phone"
    if "headset" in p:
        return "headset"
    if "bracket" in p:
        return "bracket"
    if "case" in p:
        return "case"

    return "box"

# --------------------------------
# MODEL GENERATOR (STATEFUL CORE)
# --------------------------------

def build_model(shape):

    if shape == "phone":
        base = cq.Workplane("XY").box(80, 70, 8)
        back = cq.Workplane("XY").transformed(offset=(0, -10, 60)).box(80, 8, 120)
        return base.union(back)

    if shape == "headset":
        base = cq.Workplane("XY").box(120, 120, 8)
        arm = cq.Workplane("XY").transformed(offset=(0, 0, 120)).box(8, 8, 240)
        return base.union(arm)

    if shape == "bracket":
        v = cq.Workplane("XY").box(60, 60, 80)
        h = cq.Workplane("XY").transformed(offset=(30, 0, 30)).box(60, 60, 20)
        return v.union(h)

    if shape == "case":
        outer = cq.Workplane("XY").box(100, 60, 30)
        inner = cq.Workplane("XY").box(94, 54, 26)
        return outer.cut(inner)

    return cq.Workplane("XY").box(40, 40, 40)

# --------------------------------
# UPDATE ENGINE (FUSION-LIKE CORE)
# --------------------------------

def update_model(session_id, prompt):

    shape = ai_design(prompt)
    model = build_model(shape)

    SESSION_MODELS[session_id] = model

    return model

# --------------------------------
# BBOX
# --------------------------------

def bbox(model):
    return model.val().BoundingBox()

# --------------------------------
# API
# --------------------------------

@app.get("/")
def home():
    return {"status": "Fusion AI CAD running"}

@app.post("/generate")
async def generate(request: Request):

    try:
        data = await request.json()

        prompt = data.get("prompt", "")
        session_id = data.get("session_id", str(uuid.uuid4()))

        model = update_model(session_id, prompt)

        b = bbox(model)

        return {
            "status": "ok",
            "session_id": session_id,

            # 🔥 THIS IS THE KEY: FRONTEND SHOULD USE THIS STATE
            "bounds": {"x": b.xlen, "y": b.ylen, "z": b.zlen},

            "model_ready": True,
            "view_mode": "live_edit"
        }

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)},
        )

# --------------------------------
# EXPORT (OPTIONAL)
# --------------------------------

@app.get("/export/{session_id}")
def export(session_id: str):

    if session_id not in SESSION_MODELS:
        return {"error": "no model"}

    model = SESSION_MODELS[session_id]

    path = f"/tmp/{session_id}.stl"
    cq.exporters.export(model, path)

    return {"download": path}

# --------------------------------
# RUN
# --------------------------------

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
