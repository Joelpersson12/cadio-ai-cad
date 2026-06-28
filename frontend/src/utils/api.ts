/** HTTP API client for the Cadio backend. */

import type { ScenePayload, PrinterProfile, MaterialProfile } from "./types";
import type { SavedLibrary } from "./savedModels";

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

const REQUEST_TIMEOUT_MS = 90_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let lastError: unknown = null;
  const optionHeaders =
    options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : Array.isArray(options.headers)
        ? Object.fromEntries(options.headers)
        : options.headers || {};
  for (const base of API_FALLBACKS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...optionHeaders },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : { status: "error", message: await res.text() || "Expected JSON API response" };
      if (!res.ok || data.status === "error") {
        lastError = new Error(data.message || "API request failed");
        continue;
      }
      return data as T;
    } catch (err) {
      clearTimeout(timer);
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

export interface AuthPayload {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  agreed_terms?: boolean;
}

export interface AccountProfile {
  accountId: string;
  name?: string;
  email?: string;
  phone?: string;
  plan?: string;
  downloadsUsed?: number;
  downloadLimit?: number;
  downloadsRemaining?: number | null;
  canDownload?: boolean;
}

export async function authLogin(payload: AuthPayload): Promise<{
  status: string;
  token: string;
  account: AccountProfile;
}> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function authGoogleLogin(credential: string): Promise<{
  status: string;
  token: string;
  account: AccountProfile;
}> {
  return request("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function requestPasswordReset(email: string): Promise<{ status: string; message: string }> {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{
  status: string;
  token: string;
  account: AccountProfile;
}> {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function uploadModelFile(sessionId: string, file: File): Promise<ScenePayload> {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("file", file);
  let lastError: unknown = null;
  for (const base of API_FALLBACKS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      // No Content-Type header — the browser sets the multipart boundary.
      const res = await fetch(`${base}/api/import/upload`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) {
        const message = typeof data === "string" ? data : data?.detail || data?.error || "Upload failed";
        throw new Error(message);
      }
      return data as ScenePayload;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed");
}

export async function getAccountProfile(token: string): Promise<{
  status: string;
  account: AccountProfile;
}> {
  return request("/api/account/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function refreshAccountPlan(token: string): Promise<{
  status: string;
  account: AccountProfile;
  stripe?: Record<string, unknown>;
}> {
  return request("/api/account/refresh-plan", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createBillingPortalSession(token: string): Promise<{ status: string; url: string }> {
  return request("/api/stripe/billing-portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function loadAccountSavedLibrary(token: string): Promise<{
  status: string;
  account: AccountProfile;
  library: SavedLibrary;
}> {
  return request("/api/account/saved-models", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function saveAccountSavedLibrary(
  token: string,
  library: SavedLibrary,
): Promise<{
  status: string;
  account: AccountProfile;
  library: SavedLibrary;
}> {
  return request("/api/account/saved-models", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ library }),
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

export async function selectSourceFile(payload: {
  session_id: string;
  file_id: string;
}): Promise<ScenePayload> {
  return request<ScenePayload>("/api/source-model/select-file", {
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
  replace_scene?: boolean;
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

function filenameFromDisposition(value: string | null, fallback: string) {
  if (!value) return fallback;
  const match = value.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

async function downloadFromBase(
  base: string,
  sessionId: string,
  format: string,
  token?: string,
): Promise<void> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${base}/api/export/${sessionId}/${format}`, {
    headers,
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      throw new Error(data.message || "Download failed");
    }
    throw new Error((await res.text()) || "Download failed");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filenameFromDisposition(
    res.headers.get("content-disposition"),
    `cadio-${sessionId}.${format}`,
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function downloadExport(
  sessionId: string,
  format: string,
  token?: string,
): Promise<void> {
  let lastError: unknown = null;
  for (const base of API_FALLBACKS) {
    try {
      await downloadFromBase(base, sessionId, format, token);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Download failed");
}

export { API_BASE };
