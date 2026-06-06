import type { CadObject } from "./types";

export interface ProjectShareData {
  title: string;
  prompt: string;
  printer: string;
  sessionId: string;
  objectCount: number;
}

export function buildProjectShareData({
  title,
  prompt,
  printer,
  sessionId,
  objects,
}: {
  title: string;
  prompt: string;
  printer: string;
  sessionId: string;
  objects: CadObject[];
}): ProjectShareData {
  return {
    title: title.trim() || "Cadio project",
    prompt: prompt.trim(),
    printer,
    sessionId,
    objectCount: objects.length,
  };
}

export function buildProjectShareUrl(data: ProjectShareData) {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  if (data.prompt) params.set("prompt", data.prompt);
  if (data.printer) params.set("printer", data.printer);
  if (data.title) params.set("title", data.title);
  url.hash = `builder?${params.toString()}`;
  return url.toString();
}

export function readProjectShareFromHash() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#builder?")) return null;
  const params = new URLSearchParams(hash.slice("#builder?".length));
  const prompt = params.get("prompt") || "";
  const printer = params.get("printer") || "";
  const title = params.get("title") || "";
  if (!prompt && !printer && !title) return null;
  return { prompt, printer, title };
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  return false;
}
