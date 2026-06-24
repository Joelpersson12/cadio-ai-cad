"""Pydantic models for the Cadio API request/response contracts."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Printer profiles
# ---------------------------------------------------------------------------


class PrinterProfile(BaseModel):
    name: str
    build_volume: tuple[float, float, float]


# ---------------------------------------------------------------------------
# Transform / Feature / Object
# ---------------------------------------------------------------------------


class Transform(BaseModel):
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    scale: list[float] = Field(default_factory=lambda: [1.0, 1.0, 1.0])


class Feature(BaseModel):
    id: str
    type: str
    enabled: bool = True


class MeshPayload(BaseModel):
    positions: list[float]
    indices: list[int]


class CadObjectOut(BaseModel):
    id: str
    name: str
    parameters: dict[str, float]
    feature_tree: list[Feature]
    transform: Transform
    material: str = "PLA"
    color: str = "#4fc3f7"
    mesh: MeshPayload | None = None


# ---------------------------------------------------------------------------
# Print assistant
# ---------------------------------------------------------------------------


class PrintAssistantResult(BaseModel):
    warnings: list[str] = Field(default_factory=list)
    checks: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    printability_score: int = 100


# ---------------------------------------------------------------------------
# Session payload (full scene state sent to frontend)
# ---------------------------------------------------------------------------


class ScenePayload(BaseModel):
    status: str = "ok"
    session_id: str
    version: int
    selected_object_id: str
    objects: list[CadObjectOut]
    object_order: list[str]
    bounds: dict[str, float]
    printer: str
    scene_token: str
    print_assistant: PrintAssistantResult
    print_settings: dict[str, Any] = Field(default_factory=dict)
    printability_score: int
    edit_history: list[dict[str, Any]]
    updated_at: str
    model_updated: bool = False
    source_info: list[Any] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    session_id: str | None = None
    prompt: str = ""
    printer: str = "choose_printer"
    fit: bool = True


class AuthRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    password: str | None = None
    agreed_terms: bool = False


class SavedLibraryRequest(BaseModel):
    library: dict[str, Any]


class ParameterUpdateRequest(BaseModel):
    session_id: str
    object_id: str | None = None
    parameters: dict[str, float]


class PrinterUpdateRequest(BaseModel):
    session_id: str
    printer: str


class AppearanceUpdateRequest(BaseModel):
    session_id: str
    object_id: str | None = None
    material: str | None = None
    color: str | None = None


class FeatureToggleRequest(BaseModel):
    session_id: str
    object_id: str | None = None
    feature_id: str
    enabled: bool


class ObjectSelectRequest(BaseModel):
    session_id: str
    object_id: str


class ObjectDeleteRequest(BaseModel):
    session_id: str
    object_id: str


class TransformUpdateRequest(BaseModel):
    session_id: str
    object_id: str
    position: list[float] | None = None
    rotation: list[float] | None = None
    scale: list[float] | None = None
    snap: str | None = None


class SourceModelSwitchRequest(BaseModel):
    session_id: str
    direction: str = "next"


class PrimitiveCreateRequest(BaseModel):
    session_id: str | None = None
    primitive: str
    name: str | None = None
    center: list[float] = Field(default_factory=lambda: [0.0, 0.0])
    size: list[float] = Field(default_factory=lambda: [40.0, 30.0])
    height: float = 8.0
    radius: float | None = None
    replace_scene: bool = False


class ExpertOperationRequest(BaseModel):
    session_id: str
    object_id: str
    operation: str
    amount: float = 2.0
    target: str = "body"


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token (JWT) from frontend


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ---------------------------------------------------------------------------
# AdForge AI - Ad maker
# ---------------------------------------------------------------------------


class AdMakerRequest(BaseModel):
    product_name: str
    description: str
    target_audience: str
    tone: str = "professional"
    platform: str = "instagram"
    goal: str = "sales"
