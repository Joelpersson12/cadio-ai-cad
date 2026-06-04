/** HTTP API client for the Cadio backend. */

import type { ScenePayload, PrinterProfile } from "./types";

const API_BASE = (
  import.meta.env.VITE_API_BASE || window.location.origin
).replace(/\/+$/, "");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok || data.status === "error") {
    throw new Error(data.message || "API request failed");
  }
  return data as T;
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
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/object/transform", {
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
}> {
  return request("/api/printers");
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
