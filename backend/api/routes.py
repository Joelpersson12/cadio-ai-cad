"""FastAPI route definitions for the Cadio API.

All CAD operations go through these endpoints.  WebSocket endpoint
provides real-time scene sync.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import traceback
from typing import Any

from fastapi import APIRouter, Header, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from backend.models.schema import (
    AdMakerRequest,
    AppearanceUpdateRequest,
    AuthRequest,
    FeatureToggleRequest,
    ExpertOperationRequest,
    ForgotPasswordRequest,
    GenerateRequest,
    GoogleAuthRequest,
    ObjectDeleteRequest,
    ObjectSelectRequest,
    ParameterUpdateRequest,
    PrinterUpdateRequest,
    PrimitiveCreateRequest,
    ResetPasswordRequest,
    SavedLibraryRequest,
    ScenePayload,
    SourceModelSwitchRequest,
    TransformUpdateRequest,
)
from backend.services.ai_parser import (
    is_edit_only_prompt,
    parse_ai_command,
)
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
from backend.services.print_profiles import material_profiles_response, normalize_material
from backend.services.account_store import (
    account_from_token,
    consume_download,
    create_password_reset_token,
    get_account_profile,
    load_saved_library,
    login_or_create_account,
    login_or_create_with_google,
    reset_password_with_token,
    save_saved_library,
    upgrade_plan,
)
from backend.services.prompt_translation import normalize_source_query
from backend.services.session_manager import (
    acquire_lock,
    add_history,
    add_hole_to_object,
    add_bottom_plate_from_prompt,
    add_text_label_from_prompt,
    apply_structural_ai_edit_from_prompt,
    apply_expert_operation,
    bump_version,
    center_object_on_plate,
    create_object,
    create_primitive_object,
    get_object,
    get_or_create_session,
    get_or_create_empty_session,
    get_selected_object,
    get_session,
    is_bottom_plate_prompt,
    is_structural_ai_edit_prompt,
    is_text_label_prompt,
    prepare_generation_target,
    place_object_on_plate,
    rebuild_object,
    remove_object,
    add_object,
    split_object_by_line,
    replace_object_with_research_assembly,
    replace_object_with_source_model,
    replace_object_with_template_assembly,
    save_undo_snapshot,
    switch_source_model_variant,
    update_imported_source_dimensions,
    undo_session,
    redo_session,
)
from backend.services.geometry_validator import GeometryValidator
from backend.services.example_discovery import ExampleDiscovery
from backend.services.cad_engine import DEFAULT_PARAMETERS
from backend.services.ws_manager import broadcast, connect, disconnect

logger = logging.getLogger(__name__)

router = APIRouter()

GENERATION_TIMEOUT_SECONDS = int(os.environ.get("GENERATION_TIMEOUT", "45"))


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


def _bearer_token(authorization: str | None) -> str:
    value = (authorization or "").strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return value


# ---------------------------------------------------------------------------
# Health / Account / Printers
# ---------------------------------------------------------------------------


@router.get("/api/health")
def health() -> dict[str, Any]:
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    price_pro = os.environ.get("STRIPE_PRICE_PRO", "")
    price_unlimited = os.environ.get("STRIPE_PRICE_UNLIMITED", "")
    return {
        "status": "ok",
        "service": "cadio-v2",
        "build": "2026-06-23-r3",
        "stripe_key_prefix": stripe_key[:14] if stripe_key else "NOT_SET",
        "stripe_price_pro_prefix": price_pro[:12] if price_pro else "NOT_SET",
        "stripe_price_unlimited_prefix": price_unlimited[:12] if price_unlimited else "NOT_SET",
    }


@router.post("/api/auth/login", response_model=None)
def auth_login(data: AuthRequest) -> dict[str, Any] | JSONResponse:
    try:
        result = login_or_create_account(
            name=data.name,
            email=data.email,
            phone=data.phone,
            password=data.password,
            agreed_terms=data.agreed_terms,
        )
        return {"status": "ok", **result}
    except ValueError as exc:
        return _error(400, str(exc))
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/auth/google", response_model=None)
def auth_google(data: GoogleAuthRequest) -> dict[str, Any] | JSONResponse:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        return _error(503, "Google Sign-In not configured")
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        idinfo = id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            client_id,
        )
        result = login_or_create_with_google(
            google_sub=idinfo["sub"],
            email=idinfo.get("email", ""),
            name=idinfo.get("name", ""),
        )
        return {"status": "ok", **result}
    except ValueError as exc:
        return _error(400, str(exc))
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/auth/forgot-password", response_model=None)
def auth_forgot_password(data: ForgotPasswordRequest) -> dict[str, Any] | JSONResponse:
    try:
        create_password_reset_token(data.email)
        # Always return success to avoid email enumeration
        return {"status": "ok", "message": "If that email is registered, a reset link has been sent"}
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/auth/reset-password", response_model=None)
def auth_reset_password(data: ResetPasswordRequest) -> dict[str, Any] | JSONResponse:
    try:
        result = reset_password_with_token(data.token, data.new_password)
        return {"status": "ok", **result}
    except ValueError as exc:
        return _error(400, str(exc))
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.get("/api/account/me", response_model=None)
def get_account_me(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | JSONResponse:
    try:
        token = _bearer_token(authorization)
        account = get_account_profile(token)
        return {"status": "ok", "account": account}
    except PermissionError as exc:
        return _error(401, str(exc))
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.get("/api/account/saved-models", response_model=None)
def get_account_saved_models(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | JSONResponse:
    try:
        token = _bearer_token(authorization)
        result = load_saved_library(token)
        return {"status": "ok", **result}
    except PermissionError as exc:
        return _error(401, str(exc))
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.put("/api/account/saved-models", response_model=None)
def put_account_saved_models(
    data: SavedLibraryRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | JSONResponse:
    try:
        token = _bearer_token(authorization)
        result = save_saved_library(token, data.library)
        return {"status": "ok", **result}
    except PermissionError as exc:
        return _error(401, str(exc))
    except ValueError as exc:
        return _error(400, str(exc))
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.get("/api/printers")
def list_printers() -> dict[str, Any]:
    return {
        "status": "ok",
        "default": DEFAULT_PRINTER,
        "printers": PRINTERS,
        "materials": material_profiles_response(),
    }


@router.get("/api/materials")
def list_materials() -> dict[str, Any]:
    return {"status": "ok", "materials": material_profiles_response()}


@router.post("/api/printer", response_model=None)
async def update_printer(data: PrinterUpdateRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            # Use the empty-session variant so selecting a printer never
            # fabricates or resurrects default geometry on a blank plate.
            session = get_or_create_empty_session(data.session_id)
            save_undo_snapshot(session)
            session["printer"] = normalize_printer(data.printer)
            bump_version(session)
            payload = build_scene_payload(session, include_mesh=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


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


def _sync_generate(data: GenerateRequest) -> tuple[ScenePayload, str]:
    """Synchronous generation work — runs in a thread pool to avoid blocking the event loop."""
    lock = acquire_lock()
    with lock:
        session = get_or_create_session(data.session_id)
        save_undo_snapshot(session)
        session["printer"] = normalize_printer(data.printer)
        session["fit"] = bool(data.fit)

        prompt = (data.prompt or "").strip().lower()
        command_prompt = f"{prompt} {normalize_source_query(data.prompt)}".strip().lower()

        # Special commands
        if "duplicate" in command_prompt:
            duplicate_object(session)
            actions = ["duplicate selected object"]
        elif "delete object" in command_prompt or "remove object" in command_prompt:
            selected_id = session["selected_object_id"]
            if remove_object(session, selected_id):
                actions = ["delete selected object"]
            else:
                actions = ["cannot delete only object"]
        elif any(kw in command_prompt for kw in ("new object", "add object", "new part")):
            obj = create_object(f"part_{len(session['object_order']) + 1}")
            add_object(session, obj)
            session["selected_object_id"] = obj["id"]
            actions = ["create new object"]
        elif session["object_order"] and is_bottom_plate_prompt(data.prompt):
            actions = add_bottom_plate_from_prompt(session, data.prompt)
        elif session["object_order"] and is_text_label_prompt(data.prompt):
            actions = add_text_label_from_prompt(session, data.prompt)
        elif is_structural_ai_edit_prompt(data.prompt):
            if not session["object_order"]:
                obj = create_object("part_1")
                add_object(session, obj)
                session["selected_object_id"] = obj["id"]
            actions = apply_structural_ai_edit_from_prompt(session, data.prompt)
            if not actions:
                actions = ["edit skipped: command was not specific enough"]
        else:
            edit_only = is_edit_only_prompt(data.prompt)
            if edit_only:
                if not session["object_order"]:
                    obj = create_object("part_1")
                    add_object(session, obj)
                    session["selected_object_id"] = obj["id"]
                elif not session.get("selected_object_id") or session["selected_object_id"] not in session["objects"]:
                    session["selected_object_id"] = session["object_order"][0]
                    obj = get_selected_object(session)
                else:
                    obj = get_selected_object(session)
            else:
                obj = prepare_generation_target(
                    session,
                    f"generated_{len(session['edit_history']) + 1}",
                )
            source_actions = [] if edit_only else replace_object_with_source_model(session, obj, data.prompt)
            if source_actions:
                actions = source_actions
            else:
                parsed = parse_ai_command(data.prompt, session, obj)
                previous_parameters = dict(obj.get("parameters", {}))
                obj["parameters"] = parsed["parameters"]
                obj["feature_tree"] = parsed["feature_tree"]
                obj["transform"] = parsed["transform"]
                changed_keys = {
                    key
                    for key, value in parsed["parameters"].items()
                    if previous_parameters.get(key) != value
                }
                if not update_imported_source_dimensions(obj, changed_keys):
                    rebuild_object(obj)

                assembly_actions = replace_object_with_template_assembly(
                    session,
                    obj,
                    None if edit_only else parsed.get("template"),
                    parsed["parameters"],
                )
                research_brief = parsed.get("research_brief")
                if research_brief and not edit_only:
                    examples = research_brief.get("source_examples", [])
                    if examples:
                        session["source_info"] = examples[:3]

                research_actions = []
                if not assembly_actions and not edit_only:
                    research_actions = replace_object_with_research_assembly(
                        session,
                        obj,
                        research_brief,
                        parsed["parameters"],
                    )
                if assembly_actions or research_actions:
                    actions = parsed["actions"] + assembly_actions + research_actions
                else:
                    # Validate generated geometry
                    validation = GeometryValidator.validate(obj["shape"])
                    if not validation.is_valid:
                        logger.warning(f"Generated model failed validation: {validation.issues}")
                        actions = parsed["actions"] + [f"Warning: {issue}" for issue in validation.issues]
                    else:
                        actions = parsed["actions"]
                        if validation.warnings:
                            actions += [f"Note: {w}" for w in validation.warnings]

                    obj["validation"] = validation.to_dict()

            if not edit_only and obj.get("id") in session["objects"]:
                session["selected_object_id"] = ""

        if session.get("fit"):
            auto_fit_session(session)

        bump_version(session)
        add_history(session, data.prompt, actions)
        payload = build_scene_payload(
            session, include_mesh=True, model_updated=True
        )

    return payload, session["session_id"]


@router.post("/api/generate", response_model=None)
async def generate(data: GenerateRequest) -> ScenePayload | JSONResponse:
    try:
        payload, session_id = await asyncio.wait_for(
            asyncio.to_thread(_sync_generate, data),
            timeout=GENERATION_TIMEOUT_SECONDS,
        )
        await broadcast(session_id, payload.model_dump())
        return payload
    except asyncio.TimeoutError:
        logger.warning(
            "Generation timed out after %ds for prompt: %r",
            GENERATION_TIMEOUT_SECONDS,
            data.prompt,
        )
        return _error(504, f"Generation timed out after {GENERATION_TIMEOUT_SECONDS}s. Please try a simpler prompt.")
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

            save_undo_snapshot(session)
            allowed_params = set(DEFAULT_PARAMETERS) | set(obj["parameters"])
            changed_keys: set[str] = set()
            for key, value in data.parameters.items():
                if key in allowed_params:
                    obj["parameters"][key] = float(value)
                    changed_keys.add(key)
                    imported_source = obj.get("primitive") == "imported_source_mesh" or bool(obj.get("imported_source_mesh"))
                    if obj.get("manual") and not imported_source and key == "thickness":
                        obj["parameters"]["height"] = float(value)
                    if obj.get("manual") and not imported_source and key == "height":
                        obj["parameters"]["thickness"] = float(value)
            if not update_imported_source_dimensions(obj, changed_keys):
                rebuild_object(obj)

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

            save_undo_snapshot(session)
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


@router.post("/api/object/primitive", response_model=None)
async def create_primitive(data: PrimitiveCreateRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_or_create_session(data.session_id)
            save_undo_snapshot(session)
            if data.replace_scene:
                session["objects"] = {}
                session["object_order"] = []
                session["selected_object_id"] = ""
            if data.primitive.strip().lower() == "hole" and session.get("selected_object_id") and session["object_order"]:
                obj = get_selected_object(session)
                diameter = max(0.5, float(data.radius or max(data.size or [5.0]) / 2.0) * 2.0)
                actions = add_hole_to_object(obj, data.center, diameter)
                bump_version(session)
                add_history(session, "expert-hole", actions)
                payload = build_scene_payload(
                    session, include_mesh=True, model_updated=True
                )
                await broadcast(session["session_id"], payload.model_dump())
                return payload

            if data.primitive.strip().lower() == "line" and session.get("selected_object_id") and session["object_order"]:
                obj = get_selected_object(session)
                actions = split_object_by_line(session, obj, data.center, data.size)
                bump_version(session)
                add_history(session, "expert-line-split", actions)
                payload = build_scene_payload(
                    session, include_mesh=True, model_updated=True
                )
                await broadcast(session["session_id"], payload.model_dump())
                return payload

            obj = create_primitive_object(
                primitive=data.primitive,
                name=data.name or data.primitive,
                center=data.center,
                size=data.size,
                height=data.height,
                radius=data.radius,
            )
            add_object(session, obj)
            session["selected_object_id"] = obj["id"]
            if session.get("fit"):
                auto_fit_session(session)
            bump_version(session)
            add_history(
                session,
                f"expert-{data.primitive}",
                [f"created {data.primitive} from sketch"],
            )
            payload = build_scene_payload(
                session, include_mesh=True, model_updated=True
            )

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/source-model/switch", response_model=None)
async def switch_source_model(data: SourceModelSwitchRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            save_undo_snapshot(session)
            actions = switch_source_model_variant(session, data.direction)
            bump_version(session)
            add_history(session, f"{data.direction}-source-model", actions)
            payload = build_scene_payload(session, include_mesh=True, model_updated=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/appearance", response_model=None)
async def update_appearance(
    data: AppearanceUpdateRequest,
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

            save_undo_snapshot(session)
            if data.material is not None:
                obj["material"] = normalize_material(str(data.material))
            if data.color is not None and re.fullmatch(r"#[0-9a-fA-F]{6}", data.color):
                obj["color"] = data.color

            bump_version(session)
            add_history(session, "appearance-update", [obj.get("material", ""), obj.get("color", "")])
            payload = build_scene_payload(session, include_mesh=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/object/operation", response_model=None)
async def apply_operation(data: ExpertOperationRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            obj = get_object(session, data.object_id)
            if obj is None:
                return _error(404, "Object not found")

            save_undo_snapshot(session)
            actions = apply_expert_operation(
                obj,
                operation=data.operation,
                amount=data.amount,
                target=data.target,
            )
            bump_version(session)
            add_history(session, f"expert-{data.operation}", actions)
            payload = build_scene_payload(
                session, include_mesh=True, model_updated=True
            )

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


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
            save_undo_snapshot(session)
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

            save_undo_snapshot(session)
            t = obj["transform"]
            if data.position and len(data.position) == 3:
                t.position = [float(v) for v in data.position]
            if data.rotation and len(data.rotation) == 3:
                t.rotation = [float(v) for v in data.rotation]
            if data.scale and len(data.scale) == 3:
                t.scale = [max(0.001, float(v)) for v in data.scale]
            snap = (data.snap or "").strip().lower().replace("-", "_")
            if snap in {"plate", "on_plate", "build_plate"}:
                place_object_on_plate(obj)
            elif snap in {"center", "center_plate", "center_on_plate"}:
                center_object_on_plate(obj)

            bump_version(session)
            payload = build_scene_payload(session, include_mesh=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload

    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/undo", response_model=None)
async def undo(data: dict[str, str]) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.get("session_id", ""))
            if session is None:
                return _error(404, "Session not found")
            if not undo_session(session):
                return _error(400, "Nothing to undo")
            payload = build_scene_payload(session, include_mesh=True, model_updated=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


@router.post("/api/redo", response_model=None)
async def redo(data: dict[str, str]) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.get("session_id", ""))
            if session is None:
                return _error(404, "Session not found")
            if not redo_session(session):
                return _error(400, "Nothing to redo")
            payload = build_scene_payload(session, include_mesh=True, model_updated=True)

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
def export_model(
    session_id: str,
    fmt: str,
    authorization: str | None = Header(default=None),
) -> FileResponse | JSONResponse:
    try:
        token = _bearer_token(authorization)
        if not token:
            return _error(401, "Login required to download files.")

        fmt_key = fmt.strip().lower()
        if fmt_key not in SUPPORTED_FORMATS:
            return _error(400, f"Unsupported format. Supported: {SUPPORTED_FORMATS}")

        lock = acquire_lock()
        with lock:
            session = get_session(session_id)
            if session is None:
                return _error(404, "Session not found")
            path = export_assembly(session, fmt_key)

        # Consume one download credit after exporting (raises on limit)
        try:
            consume_download(token)
        except PermissionError as exc:
            return _error(401, str(exc))
        except ValueError as exc:
            return _error(402, str(exc))

        return FileResponse(
            path,
            media_type=media_type_for(fmt_key),
            filename=f"cadio-{session_id}.{fmt_key}",
        )
    except Exception as exc:
        traceback.print_exc()
        return _error(500, str(exc))


# ---------------------------------------------------------------------------
# Stripe
# ---------------------------------------------------------------------------


@router.post("/api/stripe/checkout", response_model=None)
def stripe_checkout(
    data: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | JSONResponse:
    import os
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not stripe_key:
        return _error(503, "Payment processing not configured")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = stripe_key
        token = _bearer_token(authorization)
        account = account_from_token(token)
        if account is None:
            return _error(401, "Login required")
        plan = str(data.get("plan", "pro")).lower()
        price_ids = {
            "pro": os.environ.get("STRIPE_PRICE_PRO", ""),
            "unlimited": os.environ.get("STRIPE_PRICE_UNLIMITED", ""),
        }
        price_id = price_ids.get(plan, "")
        if not price_id:
            return _error(400, f"Unknown plan: {plan}. Set STRIPE_PRICE_PRO and STRIPE_PRICE_UNLIMITED env vars.")
        if not price_id.startswith("price_"):
            return _error(400, f"Invalid price ID format (must start with 'price_'): {price_id[:16]}...")
        logger.info("Stripe checkout: plan=%s price_id=%r key_prefix=%s", plan, price_id, stripe_key[:14])
        try:
            session = stripe_lib.checkout.Session.create(
                mode="subscription",
                ui_mode="embedded_page",
                customer_email=account.get("email") or None,
                line_items=[{"price": price_id, "quantity": 1}],
                metadata={"account_id": account["accountId"], "plan": plan},
                return_url="https://cadio.net/?upgrade=success&session_id={CHECKOUT_SESSION_ID}",
            )
            return {"status": "ok", "client_secret": session.client_secret}
        except Exception as se:
            param = getattr(se, 'param', None)
            msg = getattr(se, 'user_message', None) or str(se)
            logger.error("Stripe error type=%s param=%s msg=%s", type(se).__name__, param, msg)
            return _error(400, f"[{type(se).__name__}] param={param}: {msg}")
    except Exception as exc:
        traceback.print_exc()
        return _error(500, f"{type(exc).__name__}: {exc}")


@router.post("/api/stripe/webhook", response_model=None)
async def stripe_webhook(request: Request) -> dict[str, Any] | JSONResponse:
    import json
    import os
    import hashlib

    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    if not stripe_key or not webhook_secret:
        return _error(503, "Stripe not configured")

    try:
        import stripe as stripe_lib

        stripe_lib.api_key = stripe_key

        body = await request.body()
        sig = request.headers.get("stripe-signature", "")

        stripe_lib.Webhook.construct_event(body, sig, webhook_secret)

        event = json.loads(body.decode("utf-8"))
        event_type = event.get("type", "")

        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            metadata = session.get("metadata", {})
            account_id = metadata.get("account_id", "")
            plan = metadata.get("plan", "pro")

            if account_id:
                upgrade_plan(
                    account_id,
                    plan,
                    stripe_customer_id=session.get("customer", ""),
                    stripe_subscription_id=session.get("subscription", ""),
                )

        elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
            sub = event["data"]["object"]

            price_id = sub["items"]["data"][0]["price"]["id"]
            plan = "unlimited" if price_id == os.environ.get("STRIPE_PRICE_UNLIMITED", "") else "pro"

            customer_id = sub.get("customer", "")
            customer = stripe_lib.Customer.retrieve(customer_id)
            email = customer["email"] if "email" in customer else ""

            if email:
                account_id = "acct_" + hashlib.sha256(
                    f"email:{email.strip().lower()}".encode("utf-8")
                ).hexdigest()[:24]

                upgrade_plan(
                    account_id,
                    plan,
                    stripe_customer_id=customer_id,
                    stripe_subscription_id=sub.get("id", ""),
                )

        elif event_type == "customer.subscription.deleted":
            sub = event["data"]["object"]
            metadata = sub.get("metadata", {})
            account_id = metadata.get("account_id", "")

            if account_id:
                upgrade_plan(account_id, "free")

        return {"status": "ok"}

    except Exception as exc:
        traceback.print_exc()
        return _error(400, str(exc))


@router.post("/api/stripe/billing-portal", response_model=None)
def stripe_billing_portal(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | JSONResponse:
    import os
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not stripe_key:
        return _error(503, "Payment processing not configured")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = stripe_key
        token = _bearer_token(authorization)
        if not token:
            return _error(401, "Login required")

        # Fetch stripe_customer_id directly — it's not in the public account profile.
        from backend.services import account_store as _as
        with _as._connect() as conn:
            row = conn.execute(
                """
                SELECT accounts.stripe_customer_id
                FROM sessions
                JOIN accounts ON accounts.id = sessions.account_id
                WHERE sessions.token = ?
                """,
                (token,),
            ).fetchone()
        stripe_customer_id = row["stripe_customer_id"] if row else ""

        if not stripe_customer_id:
            return _error(400, "No billing account found — contact support if you have an active subscription")

        return_url = os.environ.get("FRONTEND_URL", "https://cadio.net") + "/"
        portal = stripe_lib.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=return_url,
        )
        return {"status": "ok", "url": portal.url}
    except Exception as exc:
        traceback.print_exc()
        return _error(500, f"{type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# AdForge AI – Ad copy generation
# ---------------------------------------------------------------------------

import json as _json


@router.post("/api/admaker/generate")
async def admaker_generate(body: AdMakerRequest) -> JSONResponse:
    """Generate compelling ad copy for a product using Groq."""
    from openai import OpenAI

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return _error(503, "Groq API key not configured — add GROQ_API_KEY to environment")

    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")

    system_prompt = (
        "You are an expert advertising copywriter who creates high-converting ad copy. "
        "Always return valid JSON only, no markdown, no extra text."
    )
    user_prompt = f"""Create ad copy for the following product:

Product name: {body.product_name}
Description: {body.description}
Target audience: {body.target_audience}
Tone: {body.tone}
Platform: {body.platform}
Ad goal: {body.goal}

Return a JSON object with exactly these keys:
- headlines: array of exactly 3 short, punchy headlines (max 10 words each)
- subheadlines: array of exactly 3 supporting lines (max 20 words each)
- ctas: array of exactly 3 call-to-action button texts (max 5 words each)
- body_copy: one paragraph of ad body copy (40-60 words)
- hashtags: array of exactly 8 relevant hashtags without the # symbol
- hook: one ultra-short attention-grabbing opening line for a video reel (max 10 words, make it surprising or provocative)
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.85,
            max_tokens=800,
        )
        content = response.choices[0].message.content or "{}"
        data = _json.loads(content)
        return JSONResponse(content={"status": "ok", "data": data})
    except Exception as exc:
        logger.error("AdMaker generate error: %s", exc)
        return _error(500, f"Generation failed: {exc}")


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
