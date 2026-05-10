const RAW_API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;
const API_BASE = RAW_API_BASE.replace(/\/+$/, "");

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json();
  if (!res.ok || data.status === "error") {
    throw new Error(data.message || "API request failed");
  }
  return data;
}

export async function generate(payload) {
  return api("/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateParameters(payload) {
  return api("/parameters", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function toggleFeature(payload) {
  return api("/feature/toggle", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getMesh(sessionId) {
  return api(`/session/${sessionId}/mesh`);
}

export async function selectObject(payload) {
  return api("/object/select", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteObject(payload) {
  return api("/object/delete", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateObjectTransform(payload) {
  return api("/object/transform", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listPrinters() {
  return api("/printers");
}

export function exportUrl(sessionId, format) {
  return `${API_BASE}/export/${sessionId}/${format}`;
}

export { API_BASE };
