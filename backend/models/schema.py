"""Pydantic schemas for API requests/responses."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Core scene schemas
# ---------------------------------------------------------------------------


class MeshPayload(BaseModel):
    positions: list[float]
    normals: list[float]
    indices: list[int]


class Transform(BaseModel):
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    scale: list[float] = Field(default_factory=lambda: [1.0, 1.0, 1.0])


class Feature(BaseModel):
    id: str
    name: str
    type: str
    enabled: bool
    parameters: dict[str, Any] = Field(default_factory=dict)


class SourceSettings(BaseModel):
    title: str = ""
    author: str = ""
    url: str = ""
    license: str = ""
    source: str = ""
    index: int = 0
    total: int = 0
    query: str = ""
    recommended_material: str = "PLA"
    estimated_print_time_min: int | None = None


class CadObjectOut(BaseModel):
    id: str
    name: str
    primitive: str
    parameters: dict[str, Any]
    transform: Transform
    material: str
    color: str
    visible: bool = True
    locked: bool = False
    mesh: MeshPayload | None = None
    features: list[Feature] = Field(default_factory=list)
    source_settings: SourceSettings | None = None


class PrintAssistantResult(BaseModel):
    warnings: list[str]
    checks: list[str]
    hints: list[str]
    printability_score: int


class ScenePayload(BaseModel):
    status: Literal["ok"] = "ok"
    session_id: str
    version: int
    scene_token: str
    objects: list[CadObjectOut]
    object_order: list[str]
    selected_object_id: str
    bounds: dict[str, float]
    printer: str
    print_assistant: PrintAssistantResult
    print_settings: dict[str, Any] = Field(default_factory=dict)
    printability_score: int
    edit_history: list[dict[str, Any]]
    updated_at: str
    model_updated: bool = False


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


class AccountProfileRequest(BaseModel):
    token: str | None = None


class SaveModelRequest(BaseModel):
    token: str | None = None
    session_id: str
    title: str = "Untitled model"
    prompt: str = ""
    tags: list[str] = Field(default_factory=list)


class DeleteSavedModelRequest(BaseModel):
    token: str | None = None
    model_id: str


class DownloadRequest(BaseModel):
    token: str | None = None
    session_id: str
    model_title: str = "Untitled model"


class UpdateParamRequest(BaseModel):
    session_id: str
    object_id: str | None = None
    parameters: dict[str, float]


class UpdateAppearanceRequest(BaseModel):
    session_id: str
    object_id: str | None = None
    material: str | None = None
    color: str | None = None


class ToggleFeatureRequest(BaseModel):
    session_id: str
    object_id: str
    feature_id: str
    enabled: bool


class SelectObjectRequest(BaseModel):
    session_id: str
    object_id: str


class TransformObjectRequest(BaseModel):
    session_id: str
    object_id: str
    position: list[float] | None = None
    rotation: list[float] | None = None
    scale: list[float] | None = None
    snap: str | None = None


class DuplicateObjectRequest(BaseModel):
    session_id: str
    object_id: str | None = None


class DeleteObjectRequest(BaseModel):
    session_id: str
    object_id: str


class PrinterUpdateRequest(BaseModel):
    session_id: str
    printer: str


class UndoRedoRequest(BaseModel):
    session_id: str


class ExportRequest(BaseModel):
    session_id: str
    format: Literal["stl", "obj", "3mf", "amf"] = "stl"


class SwitchSourceRequest(BaseModel):
    session_id: str
    direction: Literal["next", "previous"]


class CreatePrimitiveRequest(BaseModel):
    session_id: str | None = None
    primitive: Literal["rectangle", "circle", "hole", "line"]
    name: str = "sketch"
    center: list[float] = Field(default_factory=lambda: [0.0, 0.0])
    size: list[float] = Field(default_factory=lambda: [40.0, 30.0])
    radius: float | None = None
    height: float = 8.0
    replace_scene: bool = False


class ExpertOperationRequest(BaseModel):
    session_id: str
    object_id: str
    operation: Literal["fillet", "chamfer", "shell", "split"]
    amount: float = 2.0
    target: str = "body"


class ShareProjectRequest(BaseModel):
    session_id: str
    title: str = "Untitled Project"
    prompt: str = ""
    printer: str = ""


class ImportStlRequest(BaseModel):
    session_id: str | None = None
    name: str = "Imported STL"
    stl_base64: str
    replace_scene: bool = False
