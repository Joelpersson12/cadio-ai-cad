"""Cadio AI CAD Platform - Application entry point.

Mounts the API router, serves the built frontend, and configures
CORS and caching middleware.
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.api.routes import router

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Cadio AI CAD Platform", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# ---------------------------------------------------------------------------
# Frontend static files
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


@app.middleware("http")
async def no_cache_api(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Disable caching for API and root routes."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") or path == "/":
        response.headers["Cache-Control"] = (
            "no-store, no-cache, must-revalidate, max-age=0"
        )
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# Mount frontend assets if the build exists
if (FRONTEND_DIST / "assets").exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="frontend-assets",
    )


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422, content={"status": "error", "message": str(exc)}
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500, content={"status": "error", "message": str(exc)}
    )


# ---------------------------------------------------------------------------
# SPA fallback routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse, response_model=None)
def serve_root() -> FileResponse | HTMLResponse:
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(
            str(index),
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    return HTMLResponse(
        "<h1>Cadio API</h1><p>Frontend not built. Run: cd frontend && npm run build</p>"
    )


@app.get("/{full_path:path}", response_class=HTMLResponse, response_model=None)
def serve_spa(full_path: str) -> FileResponse | JSONResponse:
    # Don't catch API routes
    if full_path.startswith("api/") or full_path.startswith("ws/"):
        return JSONResponse(
            status_code=404, content={"status": "error", "message": "Not found"}
        )
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(
            str(index),
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    return JSONResponse(
        status_code=404, content={"status": "error", "message": "Not found"}
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
