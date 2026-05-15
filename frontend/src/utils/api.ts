/** HTTP API client for the Cadio backend. */

const API_BASE = (
  import.meta.env.VITE_API_BASE || "https://cadio-ai-cad-production.up.railway.app"
).replace(/\/+$/, "");

// Generation modes
export type GenerateMode = "text" | "image" | "hybrid";

// Response format from /generate endpoint
export interface GenerateResponse {
  mesh: {
    vertices: [number, number, number][];
    faces: [number, number, number][];
  };
  bbox: {
    x: number;
    y: number;
    z: number;
  };
  source: "text" | "image";
  scaled: boolean;
}

// Health check endpoint
export async function healthCheck(): Promise<{ status: string; message?: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  const data = await res.json();
  return data;
}

// Generate endpoint - creates CAD model from prompt/image
export async function generate(payload: {
  prompt: string;
  image?: string; // base64 encoded image
  mode: GenerateMode;
  printer: string;
  fit: boolean;
}): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Request failed: ${res.status}`);
  }
  
  const data = await res.json();
  return data;
}

export { API_BASE };
