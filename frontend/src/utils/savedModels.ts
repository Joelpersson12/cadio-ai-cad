import type { CadObject } from "./types";

const STORAGE_KEY = "cadio_saved_models_v1";

export interface SavedModel {
  id: string;
  folderId: string;
  title: string;
  prompt: string;
  sessionId: string;
  printer: string;
  objectCount: number;
  sourceTitle?: string;
  sourceUrl?: string;
  savedAt: string;
}

export interface SavedFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface SavedLibrary {
  folders: SavedFolder[];
  models: SavedModel[];
}

function defaultLibrary(): SavedLibrary {
  const now = new Date().toISOString();
  return {
    folders: [{ id: "favorites", name: "Favorites", createdAt: now }],
    models: [],
  };
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSavedLibrary(): SavedLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLibrary();
    const parsed = JSON.parse(raw) as SavedLibrary;
    if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.models)) {
      return defaultLibrary();
    }
    if (!parsed.folders.length) parsed.folders = defaultLibrary().folders;
    return parsed;
  } catch {
    return defaultLibrary();
  }
}

export function saveSavedLibrary(library: SavedLibrary) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

export function createSavedFolder(library: SavedLibrary, name: string): SavedLibrary {
  const cleanName = name.trim();
  if (!cleanName) return library;
  const existing = library.folders.find((folder) => folder.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return library;
  return {
    ...library,
    folders: [...library.folders, { id: uid("folder"), name: cleanName, createdAt: new Date().toISOString() }],
  };
}

export function removeSavedModel(library: SavedLibrary, modelId: string): SavedLibrary {
  return {
    ...library,
    models: library.models.filter((model) => model.id !== modelId),
  };
}

function sourceInfo(objects: CadObject[]) {
  for (const object of objects) {
    const sourceModel = (object as CadObject & {
      source_model?: {
        matched_example?: { title?: string; url?: string };
        prompt?: string;
      };
    }).source_model;
    const matched = sourceModel?.matched_example;
    if (matched?.title || matched?.url || sourceModel?.prompt) {
      return {
        title: matched?.title || sourceModel?.prompt,
        url: matched?.url,
      };
    }
  }
  return {};
}

export function saveCurrentModelToLibrary({
  library,
  folderId,
  title,
  prompt,
  sessionId,
  printer,
  objects,
}: {
  library: SavedLibrary;
  folderId: string;
  title: string;
  prompt: string;
  sessionId: string;
  printer: string;
  objects: CadObject[];
}): SavedLibrary {
  const folder = library.folders.find((item) => item.id === folderId) ?? library.folders[0];
  const source = sourceInfo(objects);
  const model: SavedModel = {
    id: uid("model"),
    folderId: folder.id,
    title: title.trim() || source.title || "Saved model",
    prompt: prompt.trim() || source.title || title.trim() || "Saved model",
    sessionId,
    printer,
    objectCount: objects.length,
    sourceTitle: source.title,
    sourceUrl: source.url,
    savedAt: new Date().toISOString(),
  };
  return {
    ...library,
    models: [model, ...library.models].slice(0, 120),
  };
}
