"""FastAPI route definitions for the Cadio API.

All CAD operations go through these endpoints.  WebSocket endpoint
provides real-time scene sync.
"""

from __future__ import annotations

import logging
import re
import traceback
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from backend.models.schema import (
    FeatureToggleRequest,
    GenerateRequest,
    ObjectDeleteRequest,
    ObjectSelectRequest,
    ParameterUpdateRequest,
    ScenePayload,
    TransformUpdateRequest,
)
from backend.services.ai_parser import parse_ai_command
from backend.services.export_service import (
    SUPPORTED_FORMATS,
    export_assembly,
    media_type_for,
)
from backend.services.object_manager import (
    DEFAULT_PRINTER,
    PRINTERS,
    auto_fit_session,
    build_scene_payload,
    duplicate_object,
)
from backend.services.session_manager import (
    acquire_lock,
    add_history,
    bump_version,
    create_object,
    get_object,
    get_or_create_session,
    get_selected_object,
    get_session,
    rebuild_object,
    remove_object,
    add_object,
)
from backend.services.geometry_validator import GeometryValidator
from backend.services.example_discovery import ExampleDiscovery
from backend.services.ws_manager import broadcast, connect, disconnect

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def normalize_printer(value: str) -> str:
    """Normalize a printer name string to a known printer key."""
    key = re.sub(
        r"_+", "_", re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower())
    ).strip("_")
    if key in PRINTERS:
        return key
    lookup: list[tuple[str, str]] = [
        ("p1s", "bambu_p1s"),
        ("a1", "bambu_a1"),
        ("k1", "creality_k1"),
        ("prusa", "prusa_mk4"),
        ("ender", "ender_3"),
        ("x1", "bambu_x1c"),
        ("bambu", "bambu_x1c"),
    ]
    for fragment, printer_key in lookup:
        if fragment in key:
            return printer_key
    return DEFAULT_PRINTER


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"status": "error", "message": message}
    )


# ---------------------------------------------------------------------------
# Health / Printers
# ---------------------------------------------------------------------------


@router.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "cadio-v2"}


@router.get("/api/printers")
def list_printers() -> dict[str, Any]:
    return {"status": "ok", "default": DEFAULT_PRINTER, "printers": PRINTERS}


@router.get("/api/examples/search", response_model=None)
def search_examples(
    prompt: str = Query(..., min_length=1),
    external: bool = True,
) -> dict[str, Any] | JSONResponse:
    """Find template and external inspiration examples for a prompt."""
    try:
        examples = ExampleDiscovery.discover_examples(
            prompt,
            include_external=external,
        )
        return {"status": "ok", "prompt": prompt, **examples}
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# Generate (AI command)
# ---------------------------------------------------------------------------


@router.post("/api/generate", response_model=None)
async def generate(data: GenerateRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_or_create_session(data.session_id)
            session["printer"] = normalize_printer(data.printer)
            session["fit"] = bool(data.fit)

            prompt = (data.prompt or "").strip().lower()

            # Special commands
            if "duplicate" in prompt:
                duplicate_object(session)
                actions = ["duplicate selected object"]
            elif "delete object" in prompt:
                selected_id = session["selected_object_id"]
                if remove_object(session, selected_id):
                    actions = ["delete selected object"]
                else:
                    actions = ["cannot delete only object"]
            elif any(kw in prompt for kw in ("new object", "add object", "new part")):
                obj = create_object(f"part_{len(session['object_order']) + 1}")
                add_object(session, obj)
                session["selected_object_id"] = obj["id"]
                actions = ["create new object"]
            else:
                obj = get_selected_object(session)
                parsed = parse_ai_command(data.prompt, session, obj)
                obj["parameters"] = parsed["parameters"]
                obj["feature_tree"] = parsed["feature_tree"]
                obj["transform"] = parsed["transform"]
                rebuild_object(obj)
                
                # Validate generated geometry
                validation = GeometryValidator.validate(obj["shape"])
                if not validation.is_valid:
                    logger.warning(f"Generated model failed validation: {validation.issues}")
                    # Add validation info to actions
                    actions = parsed["actions"] + [f"Warning: {issue}" for issue in validation.issues]
                else:
                    actions = parsed["actions"]
                    if validation.warnings:
                        actions += [f"Note: {w}" for w in validation.warnings]
                
                # Store validation metrics
                obj["validation"] = validation.to_dict()

            if session.get("fit"):
                auto_fit_session(session)

            bump_version(session)
            add_history(session, data.prompt, actions)
            payload = build_scene_payload(
                session, include_mesh=True, model_updated=True
            )

        # Broadcast outside lock
        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# Parameters
# ---------------------------------------------------------------------------


@router.post("/api/parameters", response_model=None)
async def update_parameters(
    data: ParameterUpdateRequest,
) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            obj = get_object(session, data.object_id)
            if obj is None:
                return _error(404, "Object not found")

            for key, value in data.parameters.items():
                if key in obj["parameters"]:
                    obj["parameters"][key] = float(value)
            rebuild_object(obj)

            if session.get("fit"):
                auto_fit_session(session)

            bump_version(session)
            add_history(session, "parameter-update", list(data.parameters.keys()))
            payload = build_scene_payload(
                session, include_mesh=True, model_updated=True
            )

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# Feature toggle
# ---------------------------------------------------------------------------


@router.post("/api/feature/toggle", response_model=None)
async def toggle_feature(data: FeatureToggleRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            obj = get_object(session, data.object_id)
            if obj is None:
                return _error(404, "Object not found")

            found = False
            for feature in obj["feature_tree"]:
                fid = feature.id if hasattr(feature, "id") else feature.get("id")
                ftype = (
                    feature.type if hasattr(feature, "type") else feature.get("type")
                )
                if fid == data.feature_id or ftype == data.feature_id:
                    if hasattr(feature, "enabled"):
                        feature.enabled = data.enabled
                    else:
                        feature["enabled"] = data.enabled
                    found = True
                    break

            if not found:
                return _error(404, "Feature not found")

            rebuild_object(obj)
            bump_version(session)
            add_history(session, "feature-toggle", [data.feature_id, str(data.enabled)])
            payload = build_scene_payload(
                session, include_mesh=True, model_updated=True
            )

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# Object selection / deletion / transform
# ---------------------------------------------------------------------------


@router.post("/api/object/select", response_model=None)
async def select_object(data: ObjectSelectRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            if data.object_id not in session["objects"]:
                return _error(404, "Object not found")
            session["selected_object_id"] = data.object_id
            bump_version(session)
            payload = build_scene_payload(session, include_mesh=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/object/delete", response_model=None)
async def delete_object(data: ObjectDeleteRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            if not remove_object(session, data.object_id):
                return _error(400, "Cannot delete last object")
            bump_version(session)
            add_history(session, "delete-object", [data.object_id])
            payload = build_scene_payload(
                session, include_mesh=True, model_updated=True
            )

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/object/transform", response_model=None)
async def update_transform(
    data: TransformUpdateRequest,
) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            obj = get_object(session, data.object_id)
            if obj is None:
                return _error(404, "Object not found")

            t = obj["transform"]
            if data.position and len(data.position) == 3:
                t.position = [float(v) for v in data.position]
            if data.rotation and len(data.rotation) == 3:
                t.rotation = [float(v) for v in data.rotation]
            if data.scale and len(data.scale) == 3:
                t.scale = [max(0.001, float(v)) for v in data.scale]

            bump_version(session)
            payload = build_scene_payload(session, include_mesh=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# Session retrieval
# ---------------------------------------------------------------------------


@router.get("/api/session/{session_id}", response_model=None)
def get_session_info(session_id: str) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(session_id)
            if session is None:
                return _error(404, "Session not found")
            return build_scene_payload(session, include_mesh=False)
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.get("/api/session/{session_id}/mesh", response_model=None)
def get_session_mesh(session_id: str) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(session_id)
            if session is None:
                return _error(404, "Session not found")
            return build_scene_payload(session, include_mesh=True)
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@router.get("/api/export/{session_id}/{fmt}", response_model=None)
def export_model(session_id: str, fmt: str) -> FileResponse | JSONResponse:
    try:
        fmt_key = fmt.strip().lower()
        if fmt_key not in SUPPORTED_FORMATS:
            return _error(400, f"Unsupported format. Supported: {SUPPORTED_FORMATS}")

        lock = acquire_lock()
        with lock:
            session = get_session(session_id)
            if session is None:
                return _error(404, "Session not found")
            path = export_assembly(session, fmt_key)

        return FileResponse(
            path,
            media_type=media_type_for(fmt_key),
            filename=f"cadio-{session_id}.{fmt_key}",
        )
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(ws: WebSocket, session_id: str) -> None:
    await connect(ws, session_id)
    try:
        while True:
            # Keep connection alive; client can send pings
            data = await ws.receive_text()
            # Echo back as heartbeat acknowledgment
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await disconnect(ws, session_id)
