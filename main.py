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
# STATE (THIS IS THE CORE OF "FUSION FEEL")
# --------------------------------

MODELS = {}

# --------------------------------
# AI PARSER (SIMPLE BUT STABLE)
# --------------------------------

def ai_to_shape(prompt: str):
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
# MODEL GENERATION (PARAMETRIC CORE)
# --------------------------------

def build(shape):

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
# SESSION UPDATE (THIS IS "FUSION BEHAVIOR")
# --------------------------------

def update(session_id: str, prompt: str):

    shape = ai_to_shape(prompt)
    model = build(shape)

    # overwrite SAME model (this is key difference vs STL system)
    MODELS[session_id] = model

    return model

# --------------------------------
# BBOX
# --------------------------------

def bbox(model):
    return model.val().BoundingBox()

# --------------------------------
# API: LIVE MODEL (NOT FILE GENERATION)
# --------------------------------

@app.post("/generate")
async def generate(req: Request):

    try:
        data = await req.json()

        prompt = data.get("prompt", "")
        session_id = data.get("session_id") or str(uuid.uuid4())

        model = update(session_id, prompt)
        b = bbox(model)

        return {
            "status": "ok",
            "session_id": session_id,

            # THIS IS WHAT FRONTEND SHOULD RENDER LIVE
            "model_state": "updated",

            "bounds": {
                "x": b.xlen,
                "y": b.ylen,
                "z": b.zlen
            }
        }

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)},
        )

# --------------------------------
# EXPORT (ONLY WHEN USER WANTS)
# --------------------------------

@app.get("/export/{session_id}")
def export(session_id: str):

    if session_id not in MODELS:
        return {"error": "no model"}

    path = f"/tmp/{session_id}.stl"
    cq.exporters.export(MODELS[session_id], path)

    return {"download": path}

# --------------------------------
# RUN
# --------------------------------

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
