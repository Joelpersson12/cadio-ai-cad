/** HTTP API client for the Cadio backend. */

import type { ScenePayload, PrinterProfile, MaterialProfile } from "./types";

const REMOTE_API_BASE = "https://cadio-ai-cad-production.up.railway.app";

function cleanBase(value: string) {
  return value.replace(/\/+$/, "");
}

function isLovableHost() {
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com") ||
    host.includes("lovable")
  );
}

function defaultApiBase() {
  if (isLovableHost()) {
    return REMOTE_API_BASE;
  }
  return window.location.origin;
}

const API_BASE = cleanBase(import.meta.env.VITE_API_BASE || defaultApiBase());
const API_FALLBACKS = Array.from(
  new Set(
    [
      API_BASE,
      cleanBase(window.location.origin),
      REMOTE_API_BASE,
    ].filter(Boolean),
  ),
);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let lastError: unknown = null;
  for (const base of API_FALLBACKS) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : { status: res.ok ? "ok" : "error", message: await res.text() };
      if (!res.ok || data.status === "error") {
        lastError = new Error(data.message || "API request failed");
        continue;
      }
      return data as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("API request failed");
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export async function generate(payload: {
  session_id?: string;
  prompt: string;
  printer: string;
  fit: boolean;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateParameters(payload: {
  session_id: string;
  object_id?: string;
  parameters: Record<string, number>;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/parameters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function toggleFeature(payload: {
  session_id: string;
  object_id?: string;
  feature_id: string;
  enabled: boolean;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/feature/toggle", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMesh(sessionId: string): Promise<ScenePayload> {
  return request<ScenePayload>(
    `/api/session/${sessionId}/mesh?_=${Date.now()}`,
  );
}

export async function selectObject(payload: {
  session_id: string;
  object_id: string;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/object/select", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteObject(payload: {
  session_id: string;
  object_id: string;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/object/delete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateObjectTransform(payload: {
  session_id: string;
  object_id: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  snap?: "on_plate" | "center_on_plate";
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/object/transform", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function switchSourceModel(payload: {
  session_id: string;
  direction: "next" | "previous";
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/source-model/switch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppearance(payload: {
  session_id: string;
  object_id?: string;
  material?: string;
  color?: string;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/appearance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createPrimitive(payload: {
  session_id?: string;
  primitive: string;
  name?: string;
  center: [number, number];
  size: [number, number];
  height: number;
  radius?: number;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/object/primitive", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function applyExpertOperation(payload: {
  session_id: string;
  object_id: string;
  operation: string;
  amount: number;
  target: string;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/object/operation", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPrinters(): Promise<{
  status: string;
  default: string;
  printers: Record<string, PrinterProfile>;
  materials: Record<string, MaterialProfile>;
}> {
  return request("/api/printers");
}

export async function listMaterials(): Promise<{
  status: string;
  materials: Record<string, MaterialProfile>;
}> {
  return request("/api/materials");
}

export async function updatePrinter(payload: {
  session_id: string;
  printer: string;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/printer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function undo(payload: { session_id: string }): Promise<ScenePayload> {
  return request<ScenePayload>("/api/undo", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function redo(payload: { session_id: string }): Promise<ScenePayload> {
  return request<ScenePayload>("/api/redo", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function exportUrl(sessionId: string, format: string): string {
  return `${API_BASE}/api/export/${sessionId}/${format}`;
}

export { API_BASE };
