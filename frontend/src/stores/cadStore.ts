/** Zustand store for Cadio application state. */

import { create } from "zustand";
import type {
  CadObject,
  PrintAssistantResult,
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
  createPrimitive as apiCreatePrimitive,
  applyExpertOperation as apiApplyExpertOperation,
  listPrinters as apiListPrinters,
} from "../utils/api";

const SESSION_KEY = "cadio_session_id";

interface CadState {
  // Session
  sessionId: string;
  version: number;
  sceneToken: string;

  // Scene
  objects: CadObject[];
  objectOrder: string[];
  selectedObjectId: string;
  bounds: { x: number; y: number; z: number };

  // Print
  printer: string;
  printers: Record<string, PrinterProfile>;
  printAssistant: PrintAssistantResult;

  // UI
  status: string;
  transformMode: TransformMode;
  expertMode: boolean;
  expertTool: ExpertTool;
  selectionMode: SelectionMode;
  sketchHeight: number;
  operationAmount: number;
  editHistory: Array<Record<string, unknown>>;

  // Actions
  setTransformMode: (mode: TransformMode) => void;
  setExpertMode: (enabled: boolean) => void;
  setExpertTool: (tool: ExpertTool) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setSketchHeight: (height: number) => void;
  setOperationAmount: (amount: number) => void;
  applyScenePayload: (payload: ScenePayload) => void;
  loadPrinters: () => Promise<void>;
  syncMesh: (sid?: string) => Promise<void>;
  runPrompt: (prompt: string) => Promise<void>;
  patchParam: (key: string, value: number) => Promise<void>;
  patchAppearance: (appearance: { material?: string; color?: string }) => Promise<void>;
  onToggleFeature: (featureId: string, enabled: boolean) => Promise<void>;
  onSelectObject: (objectId: string) => Promise<void>;
  onDeleteObject: () => Promise<void>;
  onTransformCommit: (
    objectId: string,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    },
  ) => Promise<void>;
  createPrimitive: (payload: {
    primitive: ExpertTool;
    center: [number, number];
    size: [number, number];
    radius?: number;
  }) => Promise<void>;
  applyExpertOperation: (operation: string, amountOverride?: number) => Promise<void>;
  setPrinter: (printer: string) => void;
}

export const useCadStore = create<CadState>((set, get) => ({
  // Initial state
  sessionId: localStorage.getItem(SESSION_KEY) || "",
  version: 0,
  sceneToken: "",
  objects: [],
  objectOrder: [],
  selectedObjectId: "",
  bounds: { x: 0, y: 0, z: 0 },
  printer: "adventurer_3",
  printers: {},
  printAssistant: {
    warnings: [],
    checks: [],
    hints: [],
    printability_score: 0,
  },
  status: "Ready",
  transformMode: "off",
  expertMode: false,
  expertTool: "select",
  selectionMode: "body",
  sketchHeight: 8,
  operationAmount: 2,
  editHistory: [],

  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  setTransformMode: (mode) => set({ transformMode: mode }),
  setExpertMode: (enabled) => set({ expertMode: enabled, expertTool: enabled ? get().expertTool : "select" }),
  setExpertTool: (tool) => set({ expertTool: tool }),
  setSelectionMode: (mode) => set({ selectionMode: mode }),
  setSketchHeight: (height) => set({ sketchHeight: Math.max(0.5, height) }),
  setOperationAmount: (amount) => set({ operationAmount: Math.max(0, amount) }),
  setPrinter: (printer) => set({ printer }),

  applyScenePayload: (payload) => {
    if (payload.session_id) {
      localStorage.setItem(SESSION_KEY, payload.session_id);
    }
    set({
      sessionId: payload.session_id,
      version: payload.version,
      sceneToken: payload.scene_token,
      objects: payload.objects,
      objectOrder: payload.object_order,
      selectedObjectId: payload.selected_object_id,
      bounds: payload.bounds,
      printer: payload.printer,
      printAssistant: payload.print_assistant,
      editHistory: payload.edit_history,
    });
  },

  // ---------------------------------------------------------------------------
  // Async actions
  // ---------------------------------------------------------------------------

  loadPrinters: async () => {
    try {
      const data = await apiListPrinters();
      set({ printers: data.printers });
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
    set({ status: "Applying AI command..." });
    try {
      const data = await apiGenerate({
        session_id: sessionId || undefined,
        prompt,
        printer,
        fit: true,
      });
      get().applyScenePayload(data);
      set({ status: `Updated v${data.version}` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  patchParam: async (key: string, value: number) => {
    const { sessionId, selectedObjectId } = get();
    if (!sessionId || !selectedObjectId) return;
    try {
      const data = await apiUpdateParams({
        session_id: sessionId,
        object_id: selectedObjectId,
        parameters: { [key]: value },
      });
      get().applyScenePayload(data);
      set({ status: `Param: ${key}` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  onToggleFeature: async (featureId: string, enabled: boolean) => {
    const { sessionId, selectedObjectId } = get();
    if (!sessionId || !selectedObjectId) return;
    try {
      const data = await apiToggleFeature({
        session_id: sessionId,
        object_id: selectedObjectId,
        feature_id: featureId,
        enabled,
      });
      get().applyScenePayload(data);
      set({ status: `Feature ${featureId} ${enabled ? "on" : "off"}` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  onSelectObject: async (objectId: string) => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const data = await apiSelectObject({
        session_id: sessionId,
        object_id: objectId,
      });
      get().applyScenePayload(data);
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

  patchAppearance: async (appearance) => {
    const { sessionId, selectedObjectId } = get();
    if (!sessionId || !selectedObjectId) return;
    try {
      const data = await apiUpdateAppearance({
        session_id: sessionId,
        object_id: selectedObjectId,
        ...appearance,
      });
      get().applyScenePayload(data);
      set({ status: "Appearance updated" });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  createPrimitive: async ({ primitive, center, size, radius }) => {
    const { sessionId, sketchHeight } = get();
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
      });
      get().applyScenePayload(data);
      set({ status: `Created ${primitive}` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },

  applyExpertOperation: async (operation, amountOverride) => {
    const { sessionId, selectedObjectId, selectionMode, operationAmount } = get();
    if (!sessionId || !selectedObjectId) return;
    set({ status: `Applying ${operation}...` });
    try {
      const data = await apiApplyExpertOperation({
        session_id: sessionId,
        object_id: selectedObjectId,
        operation,
        amount: amountOverride ?? operationAmount,
        target: selectionMode,
      });
      get().applyScenePayload(data);
      set({ status: `${operation} applied` });
    } catch (err) {
      set({ status: err instanceof Error ? err.message : "Error" });
    }
  },
}));
