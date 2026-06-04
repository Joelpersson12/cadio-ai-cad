/** Shared TypeScript types mirroring the backend Pydantic models. */

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface Feature {
  id: string;
  type: string;
  enabled: boolean;
}

export interface MeshPayload {
  positions: number[];
  indices: number[];
}

export interface CadObject {
  id: string;
  name: string;
  parameters: Record<string, number>;
  feature_tree: Feature[];
  transform: Transform;
  mesh?: MeshPayload | null;
}

export interface PrintAssistantResult {
  warnings: string[];
  checks: string[];
  hints: string[];
  printability_score: number;
}

export interface ScenePayload {
  status: string;
  session_id: string;
  version: number;
  selected_object_id: string;
  objects: CadObject[];
  object_order: string[];
  bounds: { x: number; y: number; z: number };
  printer: string;
  scene_token: string;
  print_assistant: PrintAssistantResult;
  printability_score: number;
  edit_history: Array<Record<string, unknown>>;
  updated_at: string;
  model_updated: boolean;
}

export interface PrinterProfile {
  name: string;
  build_volume: [number, number, number];
}

export type TransformMode = "translate" | "rotate" | "scale";

export type ExpertTool = "select" | "rectangle" | "circle" | "hole";
export type SelectionMode = "body" | "face" | "edge";
