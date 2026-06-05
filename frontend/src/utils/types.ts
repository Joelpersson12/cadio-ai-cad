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
  material: string;
  color: string;
  mesh?: MeshPayload | null;
}

export interface PrintAssistantResult {
  warnings: string[];
  checks: string[];
  hints: string[];
  printability_score: number;
}

export interface MaterialProfile {
  label: string;
  nozzle_temp_c: [number, number];
  bed_temp_c: [number, number];
  fan_percent: number;
  scale_compensation_percent: number;
  notes: string[];
}

export interface PrintSettings {
  material: string;
  material_label: string;
  printer: {
    key: string;
    name: string;
    build_volume: [number, number, number];
    enclosed: boolean;
  };
  scale: {
    fits_without_scaling: boolean;
    fit_scale_percent: number;
    recommended_scale_percent: number;
    material_compensation_percent: number;
    max_model_size_mm: [number, number, number];
  };
  slicer: {
    profile_source: string;
    layer_height_mm: number;
    first_layer_height_mm: number;
    nozzle_temp_c: [number, number];
    bed_temp_c: [number, number];
    fan_percent: number;
    print_speed_mm_s: number;
    outer_wall_speed_mm_s: number;
    infill_percent: number;
    walls: number;
    top_bottom_layers: number;
    support: string;
    adhesion: string;
    source_overrides: string[];
  };
  source_settings: {
    source?: string;
    source_url?: string;
    title?: string;
    author?: string;
    fields?: Record<string, string | number | boolean>;
    notes?: string[];
    has_creator_settings?: boolean;
  };
  warnings: string[];
  notes: string[];
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
  print_settings: PrintSettings;
  printability_score: number;
  edit_history: Array<Record<string, unknown>>;
  updated_at: string;
  model_updated: boolean;
}

export interface PrinterProfile {
  name: string;
  build_volume: [number, number, number];
}

export type TransformMode = "off" | "translate" | "rotate" | "scale";

export type ExpertTool = "select" | "rectangle" | "circle" | "hole" | "line";
export type SelectionMode = "body" | "face" | "edge";
