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

from fastapi import APIRouter, File, Form, Header, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
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
    SourceFileSelectRequest,
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
    edit_locked_source_object,
    edit_lock_message,
    get_object,
    get_or_create_session,
    get_or_create_empty_session,
    get_selected_object,
    get_session,
    import_uploaded_mesh,
    is_bottom_plate_prompt,
    is_structural_ai_edit_prompt,
    is_text_label_prompt,
    prepare_generation_target,
    place_object_on_plate,
    rebuild_object,
    remove_object,
    add_object,
    split_object_by_line,
    cut_object_by_line,
    replace_object_with_research_assembly,
    replace_object_with_source_model,
    replace_object_with_template_assembly,
    save_undo_snapshot,
    select_source_file,
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


# Bump this string on every deploy so /api/debug/version proves which code
# is actually live on the Hugging Face Space (build can lag the file sync).
BUILD_MARKER = "2026-06-30T-resize-routes-to-edit"


@router.get("/api/debug/version")
def debug_version() -> dict[str, Any]:
    """Return the live build marker so we can confirm HF actually redeployed."""
    import time as _time
    try:
        from backend.services.account_store import db_backend_status
        db = db_backend_status()
    except Exception as exc:
        db = {"error": str(exc)}
    return {
        "build": BUILD_MARKER,
        "server_time": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
        "database": db,
    }


@router.get("/api/debug/search")
def debug_search(q: str = Query(default="pressure washer hose guide")) -> dict[str, Any]:
    """Debug endpoint: test Printables search + file resolution for a query."""
    try:
        from backend.services.design_providers import PrintablesProvider, resolve_printables_model_files
        from backend.services.prompt_translation import normalize_source_query
        normalized = normalize_source_query(q)
        provider = PrintablesProvider()
        results = provider.search(q, limit=5)
        out = []
        for r in results[:3]:
            files = resolve_printables_model_files(r.url, limit=8)
            out.append({
                "title": r.title,
                "url": r.url,
                "files": [{"name": f.name, "type": f.file_type, "size": f.file_size, "download_url": f.download_url} for f in files],
            })
        return {"query": q, "normalized": normalized, "results_count": len(results), "results": out}
    except Exception as exc:
        return {"query": q, "error": str(exc)}


@router.get("/api/debug/pipeline")
def debug_pipeline(q: str = Query(default="pressure washer hose guide")) -> dict[str, Any]:
    """Trace the full source->mesh pipeline so we can see exactly where it fails
    on the live server (search, file resolution, signed link, STL fetch, parse).
    """
    import time as _time
    from urllib.parse import quote_plus as _qp
    from urllib.request import Request as _Req, urlopen as _open

    trace: dict[str, Any] = {"query": q, "build": BUILD_MARKER}

    # 0a2) Call the REAL Printables provider directly so we see whether the
    #      deployed search code returns results (and any exception), decoupled
    #      from the cross-provider fan-out below.
    try:
        import traceback as _tb
        from backend.services.design_providers import PrintablesProvider
        prov = PrintablesProvider()
        try:
            hits = prov._search_api(q, 5)
            trace["printables_provider"] = {
                "api_count": len(hits),
                "top": [{"title": h.title, "likes": h.likes, "downloads": h.downloads, "url": h.url} for h in hits[:3]],
            }
        except Exception:
            trace["printables_provider"] = {"error": _tb.format_exc()[-600:]}
    except Exception as exc:
        trace["printables_provider"] = {"import_error": str(exc)}

    # 0) Raw search-page capture: see WHAT each site actually returns to the
    #    server (real model markup vs. a Cloudflare/captcha block page vs. a
    #    changed page structure). This pinpoints why parsers return 0 results.
    def _raw_probe(url: str) -> dict[str, Any]:
        try:
            req = _Req(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/json,*/*",
                "Accept-Language": "en-US,en;q=0.9",
            })
            t0 = _time.time()
            with _open(req, timeout=12.0) as res:
                body = res.read(200000).decode("utf-8", errors="replace")
            low = body.lower()
            return {
                "status": getattr(res, "status", 200),
                "ms": int((_time.time() - t0) * 1000),
                "length": len(body),
                "content_type": res.headers.get("content-type"),
                "has_printtype": "printtype" in low,
                "has_sveltekit_fetched": "data-sveltekit-fetched" in low,
                "blocked_markers": [m for m in ("just a moment", "cloudflare", "captcha", "cf-chl", "access denied", "enable javascript") if m in low],
                "head": body[:300],
            }
        except Exception as exc:
            return {"error": str(exc)}

    trace["raw"] = {
        "printables_html": _raw_probe(f"https://www.printables.com/search/models?q={_qp(q)}"),
        "printables_api": _raw_probe(f"https://api.printables.com/graphql/?query=%7B__typename%7D"),
        "thingiverse_html": _raw_probe(f"https://www.thingiverse.com/search?q={_qp(q)}&type=things"),
    }

    # 0b) Introspect the Printables GraphQL API + try candidate search queries,
    #     so we can rebuild search on their stable API (their HTML no longer
    #     embeds results). Returns the search field names + a sample response.
    def _gql(payload: dict[str, Any]) -> dict[str, Any]:
        import json as _json
        try:
            req = _Req(
                "https://api.printables.com/graphql/",
                data=_json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Origin": "https://www.printables.com",
                    "Referer": "https://www.printables.com/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                },
                method="POST",
            )
            with _open(req, timeout=12.0) as res:
                return {"status": getattr(res, "status", 200), "body": res.read(8000).decode("utf-8", errors="replace")}
        except Exception as exc:
            body = ""
            try:
                body = exc.read(4000).decode("utf-8", errors="replace")  # type: ignore[attr-defined]
            except Exception:
                pass
            return {"error": str(exc), "body": body}

    gql_trace: dict[str, Any] = {}
    # Compact list of every root Query field name with its arg names, so we can
    # spot the real search field (and any required args searchPrints2 needs).
    fields_probe = _gql({
        "query": "{ __schema { queryType { fields { name args { name } } } } }"
    })
    body = fields_probe.get("body", "")
    try:
        import json as _json2
        parsed = _json2.loads(body)
        all_fields = parsed["data"]["__schema"]["queryType"]["fields"]
        gql_trace["search_like_fields"] = [
            {"name": f["name"], "args": [a["name"] for a in f.get("args", [])]}
            for f in all_fields
            if any(tok in f["name"].lower() for tok in ("search", "print", "model", "discover", "explore"))
        ]
        gql_trace["all_field_names"] = [f["name"] for f in all_fields]
    except Exception as exc:
        gql_trace["fields_error"] = str(exc)
        gql_trace["fields_raw"] = body[:2000]

    # Test searchPrints2 against several queries to learn whether it does free
    # text search at all (vs. the specific phrase simply having no matches).
    def _search_probe(qs: str, with_filters: bool) -> dict[str, Any]:
        filt = "ordering:rating,printType:print," if with_filters else ""
        gq = (
            "query S($q:String!){searchPrints2(" + filt +
            "query:$q,limit:5,offset:0){items{... on PrintType{id name slug likesCount downloadCount}}}}"
        )
        res = _gql({"query": gq, "variables": {"q": qs}})
        body = res.get("body", "")
        try:
            import json as _json3
            items = _json3.loads(body).get("data", {}).get("searchPrints2", {}).get("items", [])
            return {"q": qs, "count": len(items), "titles": [it.get("name") for it in items[:3]], "raw": body[:200] if not items else None}
        except Exception:
            return {"q": qs, "raw": body[:300], "error": res.get("error")}

    gql_trace["search_tests"] = [
        _search_probe("pressure washer hose guide", True),
        _search_probe("pressure washer", True),
        _search_probe("phone stand", True),
        _search_probe("phone stand", False),
        _search_probe("hose holder", True),
    ]
    trace["printables_gql"] = gql_trace

    # Thingiverse API status: host reachability (no token), token presence, and
    # a real provider search + file resolve when a token is configured.
    tv: dict[str, Any] = {}
    tv["reachable_probe"] = _raw_probe("https://api.thingiverse.com/search/phone%20stand/?type=things")
    try:
        from backend.services.design_providers import (
            _thingiverse_token,
            ThingiverseProvider,
            resolve_thingiverse_model_files,
        )
        tv["token_present"] = bool(_thingiverse_token())
        if _thingiverse_token():
            hits = ThingiverseProvider().search(q, 5)
            tv["search_count"] = len(hits)
            tv["top"] = [{"title": h.title, "likes": h.likes, "downloads": h.downloads, "url": h.url} for h in hits[:3]]
            if hits:
                files = resolve_thingiverse_model_files(hits[0].url, 12)
                tv["files"] = [{"name": f.name, "type": f.file_type, "size": f.file_size, "has_url": bool(f.download_url)} for f in files]
    except Exception:
        import traceback as _tb2
        tv["error"] = _tb2.format_exc()[-500:]
    trace["thingiverse"] = tv

    # MakerWorld API status: token presence + raw probe of each candidate
    # endpoint (status + body head) so we can see which one actually returns
    # models from the server, then build search on it.
    mw: dict[str, Any] = {}
    try:
        from backend.services.design_providers import (
            _makerworld_token,
            _makerworld_search_endpoints,
            MakerworldProvider,
        )
        mw["token_present"] = bool(_makerworld_token())
        mw["endpoint_probes"] = []
        for url in _makerworld_search_endpoints(q, 5):
            mw["endpoint_probes"].append({"url": url[:90], **_raw_probe(url)})
        hits = MakerworldProvider().search(q, 5)
        mw["search_count"] = len(hits)
        mw["top"] = [{"title": h.title, "likes": h.likes, "downloads": h.downloads, "url": h.url} for h in hits[:3]]
    except Exception:
        import traceback as _tb3
        mw["error"] = _tb3.format_exc()[-500:]
    trace["makerworld"] = mw

    # 1) Cross-provider search (what the real generation path uses).
    try:
        from backend.services.provider_extensions import get_extended_provider_registry
        registry = get_extended_provider_registry()
        per_provider: dict[str, Any] = {}
        for name, prov in registry.providers.items():
            try:
                t0 = _time.time()
                hits = prov.search(q, limit=5) if prov.is_available() else []
                per_provider[name] = {
                    "available": prov.is_available(),
                    "count": len(hits),
                    "ms": int((_time.time() - t0) * 1000),
                    "top": [{"title": h.title, "likes": h.likes, "downloads": h.downloads, "url": h.url} for h in hits[:2]],
                }
            except Exception as exc:
                per_provider[name] = {"error": str(exc)}
        trace["providers"] = per_provider

        ranked = registry.search_all(q, limit=8)
        trace["search_all"] = [
            {"title": r.title, "source": r.source, "likes": r.likes, "downloads": r.downloads, "url": r.url}
            for r in ranked
        ]
        # License capture per result (verifies attribution/editability detection).
        trace["licenses"] = [
            {
                "title": r.title,
                "source": r.source,
                "author": getattr(r, "author", ""),
                "license": (r.license or {}).get("name") if getattr(r, "license", None) else None,
                "code": (r.license or {}).get("code") if getattr(r, "license", None) else None,
                "editable": (r.license or {}).get("editable") if getattr(r, "license", None) else None,
                "verified": (r.license or {}).get("verified") if getattr(r, "license", None) else None,
            }
            for r in ranked
        ]
    except Exception as exc:
        trace["search_error"] = str(exc)
        return trace

    # 2) For the best Printables result, resolve files + try to actually download.
    try:
        from backend.services.design_providers import (
            resolve_printables_model_files,
            printables_fresh_download_url,
        )
        printables_hits = [r for r in ranked if r.source == "printables"]
        if not printables_hits:
            trace["download"] = "no printables results to import"
            return trace
        target = printables_hits[0]
        trace["target"] = {"title": target.title, "url": target.url}
        files = resolve_printables_model_files(target.url, limit=12)
        trace["files"] = [
            {"name": f.name, "type": f.file_type, "size": f.file_size,
             "model_id": f.model_id, "id": f.id, "download_url": f.download_url}
            for f in files
        ]
        stl_files = [f for f in files if f.file_type in ("stl", "obj")]
        if not stl_files:
            trace["download"] = "no STL/OBJ files listed on model page"
            return trace

        def _probe(url: str) -> dict[str, Any]:
            if not url:
                return {"url": url, "skipped": True}
            try:
                req = _Req(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "*/*", "Referer": "https://www.printables.com/",
                })
                with _open(req, timeout=15.0) as res:
                    data = res.read(4096)
                    return {"url": url[:120], "status": getattr(res, "status", 200),
                            "content_type": res.headers.get("content-type"),
                            "content_length": res.headers.get("content-length"),
                            "first_bytes": data[:16].hex()}
            except Exception as exc:
                return {"url": url[:120], "error": str(exc)}

        f0 = stl_files[0]
        result: dict[str, Any] = {"file": f0.name}
        result["guessed_url_probe"] = _probe(f0.download_url or "")
        signed = printables_fresh_download_url(f0.model_id, f0.id)
        result["signed_link"] = signed[:120] if signed else None
        if signed:
            result["signed_url_probe"] = _probe(signed)
        # Full import attempt through the real importer.
        try:
            from backend.services.stl_importer import import_stl_from_url
            url_to_try = signed or f0.download_url or ""
            mesh = import_stl_from_url(url_to_try) if url_to_try else None
            result["mesh"] = {"verts": len(mesh.verts), "tris": len(mesh.tris)} if mesh else None
        except Exception as exc:
            result["mesh_error"] = str(exc)
        trace["download"] = result
    except Exception as exc:
        trace["download_error"] = str(exc)

    # 3) Verify the generalized importer against the top Thingiverse result
    #    (zips are unpacked, OBJ parsed) so non-Printables import can be checked.
    try:
        from backend.services.design_providers import resolve_source_model_files
        from backend.services.stl_importer import import_mesh_from_url

        tv_hits = [r for r in ranked if r.source == "thingiverse"]
        if tv_hits:
            tv = tv_hits[0]
            tv_files = resolve_source_model_files(tv.url, "thingiverse", limit=12)
            tv_result: dict[str, Any] = {
                "title": tv.title,
                "url": tv.url,
                "files": [{"name": f.name, "type": f.file_type, "has_url": bool(f.download_url)} for f in tv_files[:8]],
            }
            importable = [f for f in tv_files if f.file_type in ("stl", "obj", "zip", "3mf") and f.download_url]
            if importable:
                pick = importable[0]
                mesh = import_mesh_from_url(pick.download_url or "", file_name=pick.name)
                tv_result["imported_file"] = pick.name
                tv_result["mesh"] = {"verts": len(mesh.verts), "tris": len(mesh.tris)} if mesh else None
            else:
                tv_result["mesh"] = "no importable files"
            trace["thingiverse_import"] = tv_result
    except Exception as exc:
        trace["thingiverse_import_error"] = str(exc)
    return trace


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


@router.post("/api/account/refresh-plan", response_model=None)
def account_refresh_plan(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | JSONResponse:
    """Force a Stripe re-check and restore the user's paid plan if found."""
    try:
        from backend.services.account_store import refresh_account_plan
        token = _bearer_token(authorization)
        result = refresh_account_plan(token)
        return {"status": "ok", **result}
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

        # License guard: refuse AI edits of imported models whose license
        # forbids derivatives (e.g. CC BY-ND, All Rights Reserved). A fresh
        # generation/replacement is still allowed so users can move on.
        locked_obj = edit_locked_source_object(session)
        is_edit_request = (
            is_structural_ai_edit_prompt(data.prompt)
            or is_bottom_plate_prompt(data.prompt)
            or is_text_label_prompt(data.prompt)
            or is_edit_only_prompt(data.prompt)
        )

        # Special commands
        if locked_obj is not None and is_edit_request:
            actions = [edit_lock_message(locked_obj)]
        elif "duplicate" in command_prompt:
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
                    # Don't clobber attribution already set by the source-import
                    # path (which pairs source_info with a resolved source_files
                    # list). Only fill in from the research brief when empty.
                    if examples and not session.get("source_info"):
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
# Local file import (drag & drop)
# ---------------------------------------------------------------------------

MAX_UPLOAD_BYTES = 48 * 1024 * 1024


@router.post("/api/import/upload", response_model=None)
async def import_upload(
    session_id: str = Form(default=""),
    file: UploadFile = File(...),
) -> ScenePayload | JSONResponse:
    """Import a mesh file the user dragged into the workspace (STL / OBJ / ZIP)."""
    try:
        data = await file.read()
        if not data:
            return _error(400, "Empty file")
        if len(data) > MAX_UPLOAD_BYTES:
            return _error(413, "File too large (max 48 MB)")

        lock = acquire_lock()
        with lock:
            # Create a session on the fly when the user drops a file onto a fresh,
            # empty workspace (there's no session yet at that point).
            session = get_or_create_empty_session(session_id or None)
            save_undo_snapshot(session)
            messages = import_uploaded_mesh(session, data, file.filename or "model")
            if not any(m.startswith("imported ") for m in messages):
                return _error(400, messages[0] if messages else "Could not import file")
            bump_version(session)
            add_history(session, "import-upload", [file.filename or "model"])
            payload = build_scene_payload(session, include_mesh=True, model_updated=True)

        await broadcast(session["session_id"], payload.model_dump())
        return payload
    except Exception as exc:
        traceback.print_exc()
        return _error(500, f"{type(exc).__name__}: {exc}")


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
            # Refuse sketch tools (hole/cut/split/box/...) on models whose license
            # forbids derivatives — don't silently draw geometry on them.
            locked_obj = edit_locked_source_object(session)
            if locked_obj is not None and not data.replace_scene:
                payload = build_scene_payload(session, include_mesh=True, model_updated=False)
                payload.source_info = session.get("source_info", [])
                return JSONResponse(status_code=409, content={"error": edit_lock_message(locked_obj), "locked": True})
            if data.replace_scene:
                session["objects"] = {}
                session["object_order"] = []
                session["selected_object_id"] = ""
            # Auto-select the last object when none is selected (cleared after AI generation).
            # Without this, hole/split/cut all fall through to create_primitive_object.
            if not session.get("selected_object_id") and session.get("object_order"):
                session["selected_object_id"] = session["object_order"][-1]

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

            if data.primitive.strip().lower() == "cut" and session.get("selected_object_id") and session["object_order"]:
                obj = get_selected_object(session)
                actions = cut_object_by_line(session, obj, data.center, data.size)
                bump_version(session)
                add_history(session, "expert-cut", actions)
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


@router.post("/api/source-model/select-file", response_model=None)
async def select_source_model_file(data: SourceFileSelectRequest) -> ScenePayload | JSONResponse:
    try:
        lock = acquire_lock()
        with lock:
            session = get_session(data.session_id)
            if session is None:
                return _error(404, "Session not found")
            save_undo_snapshot(session)
            actions = select_source_file(session, data.file_id, mode=data.mode)
            bump_version(session)
            add_history(session, "select-source-file", actions)
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

            locked_obj = edit_locked_source_object(session)
            if locked_obj is not None:
                return JSONResponse(status_code=409, content={"error": edit_lock_message(locked_obj), "locked": True})

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
