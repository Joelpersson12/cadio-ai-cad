/** Zustand store for Cadio application state. */

import { create } from "zustand";
import type {
  CadObject,
  MaterialProfile,
  PrintAssistantResult,
  PrintSettings,
  PrinterProfile,
  ScenePayload,
  ExpertTool,
  SelectionMode,
  TransformMode,
} from "../utils/types";
import {
  generate as apiGenerate,
  getMesh,
  updateParameters as apiUpdateParams,
  updateAppearance as apiUpdateAppearance,
  toggleFeature as apiToggleFeature,
  selectObject as apiSelectObject,
  deleteObject as apiDeleteObject,
  updateObjectTransform as apiUpdateTransform,
  switchSourceModel as apiSwitchSourceModel,
  selectSourceFile as apiSelectSourceFile,
  uploadModelFile as apiUploadModelFile,
  createPrimitive as apiCreatePrimitive,
  applyExpertOperation as apiApplyExpertOperation,
  listPrinters as apiListPrinters,
  updatePrinter as apiUpdatePrinter,
  undo as apiUndo,
  redo as apiRedo,
} from "../utils/api";

const SESSION_KEY = "cadio_session_id";

// Pre-generated demo models, keyed by prompt. Each lives in its own server
// session so they can be cached and shown instantly without regenerating.
const demoCache = new Map<string, ScenePayload>();
const MIN_BUSY_MS = 650;

async function waitForMinimumBusy(startedAt: number) {
  const remaining = MIN_BUSY_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, remaining);
    });
  }
}

interface CadState {
  // Session
  sessionId: string;
  version: number;
  sceneToken: string;

  // Scene
  objects: CadObject[];
  objectOrder: string[];
  selectedObjectId: string;
  selectedObjectIds: string[];
  bounds: { x: number; y: number; z: number };

  // Print
  printer: string;
  printers: Record<string, PrinterProfile>;
  materials: Record<string, MaterialProfile>;
  printAssistant: PrintAssistantResult;
  printSettings: PrintSettings | null;

  // UI
  status: string;
  isBusy: boolean;
  transformMode: TransformMode;
  expertMode: boolean;
  expertTool: ExpertTool;
  selectionMode: SelectionMode;
  sketchHeight: number;
  operationAmount: number;
  editHistory: Array<Record<string, unknown>>;
  sourceInfo: import("../utils/types").SourceExample[];
  sourceFiles: import("../utils/types").SourceFileOption[];
  notice: string | null;

  // Actions
  setTransformMode: (mode: TransformMode) => void;
  setExpertMode: (enabled: boolean) => void;
  setExpertTool: (tool: ExpertTool) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setSketchHeight: (height: number) => void;
  setOperationAmount: (amount: number) => void;
  applyScenePayload: (payload: ScenePayload) => void;
  startBlankCreation: () => void;
  loadPrinters: () => Promise<void>;
  syncMesh: (sid?: string) => Promise<void>;
  runPrompt: (prompt: string) => Promise<void>;
  patchParam: (key: string, value: number) => Promise<void>;
  patchAppearance: (appearance: { material?: string; color?: string }) => Promise<void>;
  onToggleFeature: (featureId: string, enabled: boolean) => Promise<void>;
  onSelectObject: (objectId: string) => Promise<void>;
  selectAllObjects: () => void;
  onDeleteObject: () => Promise<void>;
  onTransformCommit: (
    objectId: string,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    },
  ) => Promise<void>;
  setSelectedScalePercent: (percent: number) => Promise<void>;
  scaleAllToFit: (percent: number) => Promise<void>;
  snapSelectedObjects: (snap: "on_plate" | "center_on_plate") => Promise<void>;
  switchSourceModel: (direction: "next" | "previous") => Promise<void>;
  selectSourceFile: (fileId: string, mode?: "swap" | "add") => Promise<void>;
  importLocalFile: (file: File) => Promise<void>;
  prefetchDemoModels: (prompts: string[]) => void;
  showDemoModel: (prompt: string) => Promise<void>;
  setNotice: (notice: string | null) => void;
  createPrimitive: (payload: {
    primitive: ExpertTool;
    center: [number, number];
    size: [number, number];
    radius?: number;
  }) => Promise<void>;
  applyExpertOperation: (
    operation: string,
    amountOverride?: number,
    objectIdOverride?: string,
    targetOverride?: string,
  ) => Promise<void>;
  setPrinter: (printer: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useCadStore = create<CadState>((set, get) => ({
  // Initial state
  sessionId: localStorage.getItem(SESSION_KEY) || "",
  version: 0,
  sceneToken: "",
  objects: [],
  objectOrder: [],
  selectedObjectId: "",
  selectedObjectIds: [],
  bounds: { x: 0, y: 0, z: 0 },
  printer: "choose_printer",
  printers: {},
  materials: {},
  printAssistant: {
    warnings: [],
    checks: [],
    hints: [],
    printability_score: 0,
  },
  printSettings: null,
  status: "Ready",
  isBusy: false,
  transformMode: "off",
  expertMode: false,
  expertTool: "select",
  selectionMode: "body",
  sketchHeight: 8,
  operationAmount: 2,
  editHistory: [],
  sourceInfo: [],
  sourceFiles: [],
  notice: null,

  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  setTransformMode: (mode) => set({ transformMode: mode }),
  setExpertMode: (enabled) => set({ expertMode: enabled, expertTool: enabled ? get().expertTool : "select" }),
  setExpertTool: (tool) => set({ expertTool: tool }),
  setSelectionMode: (mode) => set({ selectionMode: mode }),
  setSketchHeight: (height) => set({ sketchHeight: Math.max(0.5, height) }),
  setOperationAmount: (amount) => set({ operationAmount: Math.max(0, amount) }),
  startBlankCreation: () => {
    localStorage.removeItem(SESSION_KEY);
    set({
      sessionId: "",
      version: 0,
      sceneToken: "",
      objects: [],
      objectOrder: [],
      selectedObjectId: "",
      selectedObjectIds: [],
      bounds: { x: 0, y: 0, z: 0 },
      printAssistant: {
        warnings: [],
        checks: [],
        hints: [],
        printability_score: 0,
      },
      printSettings: null,
      status: "Blank workspace",
      isBusy: false,
      transformMode: "off",
      expertTool: "select",
      selectionMode: "body",
      editHistory: [],
    });
  },
  setPrinter: async (printer) => {
    const { sessionId } = get();
    set({ printer });
    if (!sessionId) return;
    try {
      const data = await apiUpdatePrinter({ session_id: sessionId, printer });
      set({
        version: data.version,
        sceneToken: data.scene_token,
        printer: data.printer,
        printAssistant: data.print_assistant,
        printSettings: data.print_settings,
        editHistory: data.edit_history,
      });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  selectAllObjects: () => {
    const ids = get().objects.map((object) => object.id);
    set({ selectedObjectIds: ids, selectedObjectId: ids[0] || "" });
  },

  applyScenePayload: (payload) => {
    if (payload.session_id) {
      localStorage.setItem(SESSION_KEY, payload.session_id);
    }
    const current = get();
    const payloadIds = new Set(payload.objects.map((object) => object.id));
    const preservedSelection = current.selectedObjectIds.filter((id) => payloadIds.has(id));
    const keepMultiSelection = preservedSelection.length > 1;
    const nextSelectedObjectId = keepMultiSelection
      ? (preservedSelection.includes(current.selectedObjectId) ? current.selectedObjectId : preservedSelection[0])
      : payload.selected_object_id;
    set({
      sessionId: payload.session_id,
      version: payload.version,
      sceneToken: payload.scene_token,
      objects: payload.objects,
      objectOrder: payload.object_order,
      selectedObjectId: nextSelectedObjectId,
      selectedObjectIds: keepMultiSelection ? preservedSelection : payload.selected_object_id ? [payload.selected_object_id] : [],
      bounds: payload.bounds,
      printer: payload.printer,
      printAssistant: payload.print_assistant,
      printSettings: payload.print_settings,
      editHistory: payload.edit_history,
      sourceInfo: payload.source_info ?? [],
      sourceFiles: payload.source_files ?? [],
    });
  },

  // ---------------------------------------------------------------------------
  // Async actions
  // ---------------------------------------------------------------------------

  loadPrinters: async () => {
    try {
      const data = await apiListPrinters();
      set({ printers: data.printers, materials: data.materials ?? {} });
    } catch {
      // Silently fail
    }
  },

  syncMesh: async (sid?: string) => {
    const sessionId = sid || get().sessionId;
    if (!sessionId) return;
    try {
      const data = await getMesh(sessionId);
      get().applyScenePayload(data);
    } catch {
      // Silently fail
    }
  },

  runPrompt: async (prompt: string) => {
    const { sessionId, printer } = get();
    const startedAt = Date.now();
    set({ status: "Generating model...", isBusy: true });
    try {
      const data = await apiGenerate({
        session_id: sessionId || undefined,
        prompt,
        printer,
        fit: true,
      });
      get().applyScenePayload(data);
      await waitForMinimumBusy(startedAt);
      set({ status: `Updated v${data.version}`, isBusy: false });
    } catch (err) {
      await waitForMinimumBusy(startedAt);
      set({ status: err instanceof Error ? err.message : "Error", isBusy: false });
    }
  },

  patchParam: async (key: string, value: number) => {
    const { sessionId, selectedObjectId, objects } = get();
    const targetObjectId = selectedObjectId || objects[0]?.id || "";
    if (!sessionId || !targetObjectId) return;
    try {
      const data = await apiUpdateParams({
        session_id: sessionId,
        object_id: targetObjectId,
        parameters: { [key]: value },
      });
      get().applyScenePayload(data);
      set({ status: `Param: ${key}` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  onToggleFeature: async (featureId: string, enabled: boolean) => {
    const { sessionId, selectedObjectId, selectedObjectIds, objects } = get();
    const fallbackObjectId = objects[0]?.id || "";
    const targets = selectedObjectIds.length > 1 ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : fallbackObjectId ? [fallbackObjectId] : [];
    if (!sessionId || !targets.length) return;
    try {
      let data: ScenePayload | null = null;
      for (const objectId of targets) {
        data = await apiToggleFeature({
          session_id: sessionId,
          object_id: objectId,
          feature_id: featureId,
          enabled,
        });
      }
      if (data) {
        get().applyScenePayload(data);
        const valid = targets.filter((id) => data?.objects.some((object) => object.id === id));
        set({ selectedObjectIds: valid, selectedObjectId: valid.includes(selectedObjectId) ? selectedObjectId : valid[0] || "" });
      }
      set({ status: `Feature ${featureId} ${enabled ? "on" : "off"}` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  onSelectObject: async (objectId: string) => {
    const { sessionId } = get();
    if (!sessionId) return;
    set({ selectedObjectId: objectId, selectedObjectIds: [objectId] });
    try {
      const data = await apiSelectObject({
        session_id: sessionId,
        object_id: objectId,
      });
      get().applyScenePayload(data);
      set({ selectedObjectIds: [objectId] });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  onDeleteObject: async () => {
    const { sessionId, selectedObjectId } = get();
    if (!sessionId || !selectedObjectId) return;
    try {
      const data = await apiDeleteObject({
        session_id: sessionId,
        object_id: selectedObjectId,
      });
      get().applyScenePayload(data);
      set({ status: "Object deleted" });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  onTransformCommit: async (objectId, transform) => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const data = await apiUpdateTransform({
        session_id: sessionId,
        object_id: objectId,
        ...transform,
      });
      get().applyScenePayload(data);
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  setSelectedScalePercent: async (percent) => {
    const { sessionId, selectedObjectId, selectedObjectIds, objects } = get();
    const fallbackObjectId = objects[0]?.id || "";
    const targets = selectedObjectIds.length > 0 ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : fallbackObjectId ? [fallbackObjectId] : [];
    if (!sessionId || !targets.length) return;
    const safePercent = Math.max(0.1, Math.min(1000, percent));
    const scale = safePercent / 100;
    try {
      let data: ScenePayload | null = null;
      for (const objectId of targets) {
        data = await apiUpdateTransform({
          session_id: sessionId,
          object_id: objectId,
          scale: [scale, scale, scale],
        });
      }
      if (data) {
        get().applyScenePayload(data);
      }
      set({ status: `Scale ${safePercent.toFixed(1)}%` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  scaleAllToFit: async (percent) => {
    const { sessionId, objects } = get();
    if (!sessionId || !objects.length) return;
    const scale = Math.max(0.01, Math.min(10, percent / 100));
    set({ status: `Scaling to ${percent.toFixed(0)}%...`, isBusy: true });
    try {
      let data: ScenePayload | null = null;
      for (const object of objects) {
        data = await apiUpdateTransform({ session_id: sessionId, object_id: object.id, scale: [scale, scale, scale] });
      }
      if (data) get().applyScenePayload(data);
      set({ status: `Scaled to fit (${percent.toFixed(0)}%)`, isBusy: false });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error", isBusy: false });
    }
  },

  snapSelectedObjects: async (snap) => {
    const { sessionId, selectedObjectId, selectedObjectIds, objects } = get();
    const fallbackObjectId = objects[0]?.id || "";
    const targets = selectedObjectIds.length > 0 ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : fallbackObjectId ? [fallbackObjectId] : [];
    if (!sessionId || !targets.length) return;
    try {
      let data: ScenePayload | null = null;
      for (const objectId of targets) {
        data = await apiUpdateTransform({
          session_id: sessionId,
          object_id: objectId,
          snap,
        });
      }
      if (data) {
        get().applyScenePayload(data);
        const stillPresent = targets.filter((id) => data?.objects.some((object) => object.id === id));
        set({
          selectedObjectIds: stillPresent,
          selectedObjectId: stillPresent.includes(selectedObjectId) ? selectedObjectId : stillPresent[0] || "",
          status: snap === "center_on_plate" ? "Centered on plate" : "Placed on plate",
        });
      }
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  switchSourceModel: async (direction) => {
    const { sessionId } = get();
    if (!sessionId) return;
    const startedAt = Date.now();
    set({ status: direction === "next" ? "Loading next model..." : "Loading previous model...", isBusy: true });
    try {
      const data = await apiSwitchSourceModel({
        session_id: sessionId,
        direction,
      });
      get().applyScenePayload(data);
      await waitForMinimumBusy(startedAt);
      set({ status: `Updated v${data.version}`, isBusy: false });
    } catch (err) {
      await waitForMinimumBusy(startedAt);
      set({ status: err instanceof Error ? err.message : "Error", isBusy: false });
    }
  },

  selectSourceFile: async (fileId, mode = "swap") => {
    const { sessionId } = get();
    if (!sessionId) return;
    const startedAt = Date.now();
    set({ status: mode === "add" ? "Adding part..." : "Loading file...", isBusy: true });
    try {
      const data = await apiSelectSourceFile({ session_id: sessionId, file_id: fileId, mode });
      get().applyScenePayload(data);
      await waitForMinimumBusy(startedAt);
      set({ status: `Updated v${data.version}`, isBusy: false });
    } catch (err) {
      await waitForMinimumBusy(startedAt);
      set({ status: err instanceof Error ? err.message : "Error", isBusy: false });
    }
  },

  prefetchDemoModels: (prompts) => {
    // Generate each demo model into its own server session ahead of time and
    // cache the payload, so navigating between demos is instant. Sequential and
    // fire-and-forget so it never blocks the UI or clobbers the visible model.
    void (async () => {
      const { printer } = get();
      for (const prompt of prompts) {
        if (demoCache.has(prompt)) continue;
        try {
          const data = await apiGenerate({ prompt, printer, fit: true });
          demoCache.set(prompt, data);
        } catch {
          // ignore — showDemoModel will generate on demand if needed
        }
      }
    })();
  },

  showDemoModel: async (prompt) => {
    const cached = demoCache.get(prompt);
    if (cached) {
      get().applyScenePayload(cached);
      set({ status: `Updated v${cached.version}`, isBusy: false });
      return;
    }
    const { printer } = get();
    const startedAt = Date.now();
    set({ status: "Generating model...", isBusy: true });
    try {
      const data = await apiGenerate({ prompt, printer, fit: true });
      demoCache.set(prompt, data);
      get().applyScenePayload(data);
      await waitForMinimumBusy(startedAt);
      set({ status: `Updated v${data.version}`, isBusy: false });
    } catch (err) {
      await waitForMinimumBusy(startedAt);
      set({ status: err instanceof Error ? err.message : "Error", isBusy: false });
    }
  },

  importLocalFile: async (file) => {
    // No session-id guard: dropping a file onto a fresh, empty workspace is the
    // common case, and the backend creates a session on the fly.
    const { sessionId } = get();
    const startedAt = Date.now();
    set({ status: `Importing ${file.name}...`, isBusy: true });
    try {
      const data = await apiUploadModelFile(sessionId, file);
      get().applyScenePayload(data);
      await waitForMinimumBusy(startedAt);
      set({ status: `Imported ${file.name}`, isBusy: false });
    } catch (err) {
      await waitForMinimumBusy(startedAt);
      set({ status: err instanceof Error ? err.message : "Import failed", isBusy: false });
    }
  },

  patchAppearance: async (appearance) => {
    const { sessionId, selectedObjectId, objects } = get();
    const targetObjectIds = selectedObjectId
      ? [selectedObjectId]
      : objects.length > 1
      ? objects.map((object) => object.id)
      : [objects[0]?.id || ""];
    if (!sessionId || !targetObjectIds[0]) return;
    try {
      let data: ScenePayload | null = null;
      for (const objectId of targetObjectIds) {
        data = await apiUpdateAppearance({
          session_id: sessionId,
          object_id: objectId,
          ...appearance,
        });
      }
      if (data) get().applyScenePayload(data);
      set({ status: "Appearance updated" });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  setNotice: (notice) => set({ notice }),

  createPrimitive: async ({ primitive, center, size, radius }) => {
    const { sessionId, sketchHeight, objects, sourceInfo } = get();
    const lic = sourceInfo[0]?.license;
    if (objects.length > 0 && lic && lic.verified && lic.editable === false) {
      set({ notice: `Due to the license of this model (${lic.name}), it is not editable. Start a new model to use the tools.` });
      return;
    }
    set({ status: `Sketching ${primitive}...` });
    try {
      const data = await apiCreatePrimitive({
        session_id: sessionId || undefined,
        primitive,
        name: primitive === "hole" ? "hole guide" : primitive,
        center,
        size,
        radius,
        height: sketchHeight,
        replace_scene: objects.length === 0,
      });
      get().applyScenePayload(data);
      set({ status: `Created ${primitive}`, isBusy: false });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error", isBusy: false });
    }
  },

  applyExpertOperation: async (operation, amountOverride, objectIdOverride, targetOverride) => {
    const { sessionId, selectedObjectId, selectionMode, operationAmount, sourceInfo } = get();
    const objectId = objectIdOverride || selectedObjectId;
    if (!sessionId || !objectId) return;
    const lic = sourceInfo[0]?.license;
    if (lic && lic.verified && lic.editable === false) {
      set({ notice: `Due to the license of this model (${lic.name}), it is not editable. Start a new model to use the tools.` });
      return;
    }
    set({ status: `Applying ${operation}...` });
    try {
      const data = await apiApplyExpertOperation({
        session_id: sessionId,
        object_id: objectId,
        operation,
        amount: amountOverride ?? operationAmount,
        target: targetOverride || selectionMode,
      });
      get().applyScenePayload(data);
      set({ status: `${operation} applied`, isBusy: false });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error", isBusy: false });
    }
  },

  undo: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const data = await apiUndo({ session_id: sessionId });
      get().applyScenePayload(data);
      set({ status: "Undo" });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Nothing to undo" });
    }
  },

  redo: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const data = await apiRedo({ session_id: sessionId });
      get().applyScenePayload(data);
      set({ status: "Redo" });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Nothing to redo" });
    }
  },
}));
