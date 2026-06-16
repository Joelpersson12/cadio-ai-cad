/** Adam/CADAM-style parameter inspector. */

import { useEffect, useMemo, useState } from "react";
import { useCadStore } from "../stores/cadStore";
import type { MaterialProfile, PrinterProfile } from "../utils/types";
import { downloadExport } from "../utils/api";
import ScalePercentInput from "./ScalePercentInput";

type ParamMeta = {
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

const FALLBACK_MATERIAL_ENTRIES: Array<[string, MaterialProfile]> = [
  [
    "PLA",
    {
      label: "PLA",
      nozzle_temp_c: [200, 215],
      bed_temp_c: [50, 60],
      fan_percent: 100,
      scale_compensation_percent: 100,
      notes: [],
    },
  ],
];

const EXPORT_FORMATS = [
  { value: "stl", label: "STL", hint: "Most slicers" },
  { value: "3mf", label: "3MF", hint: "Modern slicers" },
  { value: "obj", label: "OBJ", hint: "Mesh editors" },
  { value: "amf", label: "AMF", hint: "Legacy printers" },
];

const PARAM_META: Record<string, ParamMeta> = {
  num_batteries: { label: "Num Batteries", min: 1, max: 6, step: 1 },
  battery_slots: { label: "Num Slots", min: 1, max: 6, step: 1 },
  battery_spacing: { label: "Battery Spacing", min: 60, max: 120, step: 1, unit: "mm" },
  holder_length: { label: "Holder Length", min: 55, max: 125, step: 1, unit: "mm" },
  margin_width: { label: "Margin Width", min: 4, max: 25, step: 0.5, unit: "mm" },
  base_thickness: { label: "Base Thickness", min: 3, max: 12, step: 0.5, unit: "mm" },
  core_width: { label: "Core Width", min: 28, max: 54, step: 0.5, unit: "mm" },
  core_height: { label: "Core Height", min: 7, max: 22, step: 0.5, unit: "mm" },
  rail_width: { label: "Rail Width", min: 42, max: 76, step: 0.5, unit: "mm" },
  rail_thickness: { label: "Rail Thickness", min: 2.5, max: 9, step: 0.25, unit: "mm" },
  stop_thickness: { label: "Stop Thickness", min: 3, max: 12, step: 0.5, unit: "mm" },
  screw_diameter: { label: "Screw Diameter", min: 3, max: 8, step: 0.25, unit: "mm" },
  screw_head_diameter: { label: "Screw Head Diameter", min: 6, max: 16, step: 0.25, unit: "mm" },
  latch_y_pos: { label: "Latch Y Pos", min: 8, max: 44, step: 0.5, unit: "mm" },
  latch_width: { label: "Latch Width", min: 8, max: 40, step: 0.5, unit: "mm" },
  width: { label: "Width", min: 20, max: 320, step: 1, unit: "mm" },
  depth: { label: "Depth", min: 20, max: 240, step: 1, unit: "mm" },
  height: { label: "Height", min: 3, max: 260, step: 1, unit: "mm" },
  thickness: { label: "Thickness", min: 1, max: 30, step: 0.5, unit: "mm" },
  angle: { label: "Angle", min: 40, max: 80, step: 0.5, unit: "deg" },
  fillet_radius: { label: "Fillet Radius", min: 0, max: 12, step: 0.25, unit: "mm" },
  chamfer_size: { label: "Chamfer Size", min: 0, max: 12, step: 0.25, unit: "mm" },
  wall_thickness: { label: "Wall Thickness", min: 0.5, max: 12, step: 0.25, unit: "mm" },
  hole_count: { label: "Hole Count", min: 0, max: 12, step: 1 },
  hole_diameter: { label: "Hole Diameter", min: 1, max: 16, step: 0.25, unit: "mm" },
};

const BATTERY_ORDER = [
  "num_batteries",
  "battery_spacing",
  "holder_length",
  "margin_width",
  "base_thickness",
  "core_width",
  "core_height",
  "rail_width",
  "rail_thickness",
  "stop_thickness",
  "screw_diameter",
  "screw_head_diameter",
  "latch_y_pos",
  "latch_width",
];

const DEFAULT_ORDER = [
  "width",
  "depth",
  "height",
  "thickness",
  "angle",
  "fillet_radius",
  "chamfer_size",
  "wall_thickness",
  "hole_count",
  "hole_diameter",
];

function formatValue(value: number, step: number) {
  if (Number.isInteger(step)) return String(Math.round(value));
  return Number(value).toFixed(step < 0.5 ? 2 : 1).replace(/\.0$/, "");
}

function settingValue(value: string | number | boolean | undefined) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function tempRange(value: [number, number] | undefined) {
  if (!value) return "-";
  return `${value[0]}-${value[1]} C`;
}

function ParameterRow({
  paramKey,
  value,
  meta,
  onChange,
}: {
  paramKey: string;
  value: number;
  meta: ParamMeta;
  onChange: (key: string, value: number) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [paramKey, value]);

  const clamp = (next: number) => Math.max(meta.min, Math.min(meta.max, next));
  const commit = (next = draft) => {
    if (!Number.isFinite(next)) return;
    const clamped = clamp(next);
    setDraft(clamped);
    if (Math.abs(clamped - value) > 0.0001) {
      onChange(paramKey, clamped);
    }
  };

  const display = formatValue(draft, meta.step);
  return (
    <div className="group grid grid-cols-[100px_1fr_60px_24px] items-center gap-4 py-2.5">
      <label className="text-[11px] font-bold text-cadio-muted truncate uppercase tracking-tight">{meta.label}</label>
      <input
        type="range"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={Number.isFinite(draft) ? draft : meta.min}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="h-1.5 w-full bg-cadio-border rounded-full appearance-none cursor-pointer accent-cadio-accent transition-all hover:accent-cadio-accent-hover"
      />
      <input
        type="number"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={display}
        onChange={(e) => setDraft(Number(e.target.value))}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="h-8 rounded-md border border-cadio-border bg-cadio-surface px-2 text-center text-[11px] font-bold text-white outline-none focus:border-cadio-accent transition-colors"
      />
      <span className="text-[10px] font-bold text-cadio-muted text-right">{meta.unit ?? ""}</span>
    </div>
  );
}

export default function ObjectInspector() {
  const [exportFormat, setExportFormat] = useState("stl");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const {
    objects,
    selectedObjectId,
    bounds,
    printer,
    printers,
    materials,
    printSettings,
    sessionId,
    patchParam,
    patchAppearance,
    setPrinter,
    setSelectedScalePercent,
    snapSelectedObjects,
    undo,
    redo,
  } = useCadStore();

  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? objects[0];
  const selectedPrinter = printers[printer] as PrinterProfile | undefined;
  const materialKey = printSettings?.material ?? selectedObject?.material ?? "PLA";
  const selectedScalePercent = ((selectedObject?.transform.scale[0] ?? 1) * 100);

  const parameterKeys = useMemo(() => {
    if (!selectedObject) return [];
    const params = selectedObject.parameters;
    const order = "num_batteries" in params || "battery_spacing" in params ? BATTERY_ORDER : DEFAULT_ORDER;
    const ordered = order.filter((key) => key in params);
    const extras = Object.keys(params)
      .filter((key) => key in PARAM_META && !ordered.includes(key))
      .slice(0, 6);
    return [...ordered, ...extras];
  }, [selectedObject]);

  const color = selectedObject?.color ?? "#ffd700";
  const sourceSettings = printSettings?.source_settings;
  const sourceFields = sourceSettings?.fields ?? {};
  const sourceRows = Object.entries(sourceFields).slice(0, 7);
  const materialEntries: Array<[string, MaterialProfile]> = Object.entries(materials).length
    ? Object.entries(materials)
    : FALLBACK_MATERIAL_ENTRIES;

  const handleDownload = async () => {
    if (!sessionId || downloadBusy) return;
    setDownloadBusy(true);
    setExportError("");
    try {
      await downloadExport(sessionId, exportFormat);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-cadio-bg text-cadio-text font-sans border-l border-cadio-border/50 shadow-2xl">
      <div className="flex h-14 items-center justify-between border-b border-cadio-border/50 px-6 bg-cadio-surface/30">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <svg className="w-4 h-4 text-cadio-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Inspector
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void undo()}
            className="p-2 rounded-md text-cadio-muted hover:text-white hover:bg-cadio-surface transition-colors"
            title="Undo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
          </button>
          <button
            onClick={() => void redo()}
            className="p-2 rounded-md text-cadio-muted hover:text-white hover:bg-cadio-surface transition-colors"
            title="Redo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-thin scrollbar-thumb-cadio-border scrollbar-track-transparent">
        {/* Device Setup */}
        <section>
          <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-cadio-muted">Device Configuration</div>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold text-cadio-muted/70">3D Printer Profile</span>
              <select
                value={printer}
                onChange={(e) => void setPrinter(e.target.value)}
                className="w-full rounded-lg border border-cadio-border bg-cadio-surface px-4 py-2.5 text-sm font-semibold text-white outline-none focus:border-cadio-accent transition-all"
              >
                <option value="choose_printer">+ New Device</option>
                {Object.entries(printers).map(([key, p]) =>
                  key === "choose_printer" ? null : (
                    <option value={key} key={key}>
                      {(p as PrinterProfile).name}
                    </option>
                  )
                )}
              </select>
              {selectedPrinter && (
                <div className="mt-2 flex items-center gap-2 text-[10px] font-medium text-cadio-muted">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  {selectedPrinter.build_volume[0]} × {selectedPrinter.build_volume[1]} × {selectedPrinter.build_volume[2]} mm
                </div>
              )}
            </label>
            
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => void snapSelectedObjects("on_plate")}
                disabled={!selectedObjectId}
                className="flex items-center justify-center gap-2 rounded-lg border border-cadio-border bg-cadio-surface px-3 py-2 text-[11px] font-bold text-white hover:bg-cadio-surface-secondary disabled:opacity-30 transition-colors shadow-sm"
              >
                Snap to Plate
              </button>
              <button
                onClick={() => void snapSelectedObjects("center_on_plate")}
                disabled={!selectedObjectId}
                className="flex items-center justify-center gap-2 rounded-lg border border-cadio-border bg-cadio-surface px-3 py-2 text-[11px] font-bold text-white hover:bg-cadio-surface-secondary disabled:opacity-30 transition-colors shadow-sm"
              >
                Center Grid
              </button>
            </div>
          </div>
        </section>

        {/* Geometry Parameters */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted">Geometry Parameters</div>
            <div className="px-1.5 py-0.5 rounded-full bg-cadio-surface border border-cadio-border text-[9px] font-black text-cadio-muted">
              {parameterKeys.length}
            </div>
          </div>
          <div className="rounded-xl border border-cadio-border/30 bg-cadio-surface/20 p-4">
            {selectedObject ? (
              parameterKeys.map((key) => (
                <ParameterRow
                  key={key}
                  paramKey={key}
                  value={Number(selectedObject.parameters[key] ?? PARAM_META[key].min)}
                  meta={PARAM_META[key]}
                  onChange={(paramKey, value) => void patchParam(paramKey, value)}
                />
              ))
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs font-medium text-cadio-muted">Select a part to view parameters</p>
              </div>
            )}
          </div>
        </section>

        {/* Appearance */}
        <section>
          <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-cadio-muted">Material & Appearance</div>
          <div className="space-y-6 rounded-xl border border-cadio-border/30 bg-cadio-surface/20 p-5">
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold text-cadio-muted/70">Material Profile</span>
              <select
                value={materialKey}
                onChange={(e) => void patchAppearance({ material: e.target.value })}
                className="w-full rounded-lg border border-cadio-border bg-cadio-surface px-4 py-2.5 text-sm font-semibold text-white outline-none focus:border-cadio-accent transition-all"
              >
                {materialEntries.map(([key, material]) => (
                  <option value={key} key={key}>
                    {material.label}
                  </option>
                ))}
              </select>
              {materials[materialKey] && (
                <div className="mt-2 flex items-center gap-2 text-[10px] font-medium text-cadio-muted">
                  <svg className="w-3 h-3 text-cadio-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.5-7 3 10 1 15 1 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11c.193-.11.402-.211.626-.303" /></svg>
                  {tempRange(materials[materialKey].nozzle_temp_c)} Nozzle / {tempRange(materials[materialKey].bed_temp_c)} Bed
                </div>
              )}
            </label>
            
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] font-bold text-cadio-muted uppercase tracking-tight">Display Color</span>
              <label className="flex items-center gap-3 rounded-lg border border-cadio-border bg-cadio-surface px-4 py-2 cursor-pointer hover:border-cadio-muted/50 transition-colors">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => void patchAppearance({ color: e.target.value })}
                  className="h-5 w-5 rounded-md border-0 bg-transparent p-0 cursor-pointer"
                />
                <span className="font-mono text-[10px] font-bold uppercase text-white">{color}</span>
              </label>
            </div>
          </div>
        </section>

        {/* Print Analytics */}
        {printSettings && (
          <section>
            <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-cadio-muted">Print Insights</div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-cadio-border/30 bg-cadio-surface/40 p-4">
                  <div className="text-[10px] font-bold text-cadio-muted uppercase mb-1">Scale Rec</div>
                  <div className="text-lg font-black text-white">{printSettings.scale.recommended_scale_percent.toFixed(1)}%</div>
                  <div className="text-[9px] font-bold text-cadio-accent/60 uppercase">Max {printSettings.scale.fit_scale_percent.toFixed(1)}%</div>
                </div>
                <div className="rounded-xl border border-cadio-border/30 bg-cadio-surface/40 p-4">
                  <div className="text-[10px] font-bold text-cadio-muted uppercase mb-1">Layer Height</div>
                  <div className="text-lg font-black text-white">{printSettings.slicer.layer_height_mm}mm</div>
                  <div className="text-[9px] font-bold text-cadio-muted/50 uppercase">Base {printSettings.slicer.first_layer_height_mm}mm</div>
                </div>
              </div>

              <div className="rounded-xl border border-cadio-border/30 bg-cadio-surface/20 p-4 space-y-3">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-cadio-muted uppercase tracking-tight">Precision Scaling</span>
                  <ScalePercentInput
                    value={selectedScalePercent}
                    onCommit={(percent) => void setSelectedScalePercent(percent)}
                    disabled={!selectedObject}
                    className="w-24 h-7 rounded-md"
                  />
                </div>
                <div className="h-px bg-cadio-border/20 mx-1" />
                <div className="space-y-2 text-[10px] font-bold uppercase tracking-tighter">
                  <div className="flex justify-between text-cadio-muted">
                    <span>Extrusion Temp</span>
                    <span className="text-white">{tempRange(printSettings.slicer.nozzle_temp_c)}</span>
                  </div>
                  <div className="flex justify-between text-cadio-muted">
                    <span>Print Velocity</span>
                    <span className="text-white">{printSettings.slicer.print_speed_mm_s} mm/s</span>
                  </div>
                  <div className="flex justify-between text-cadio-muted">
                    <span>Infill Density</span>
                    <span className="text-white">{printSettings.slicer.infill_percent}% ({printSettings.slicer.walls} Walls)</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Export Footer */}
      <div className="border-t border-cadio-border/50 p-6 bg-cadio-surface/30">
        <div className="mb-4">
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-cadio-muted">Output Format</span>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="w-full rounded-lg border border-cadio-border bg-cadio-surface px-4 py-2.5 text-sm font-semibold text-white outline-none focus:border-cadio-accent"
            >
              {EXPORT_FORMATS.map((format) => (
                <option value={format.value} key={format.value}>
                  {format.label} • {format.hint}
                </option>
              ))}
            </select>
          </label>
        </div>
        
        {exportError && (
          <div className="mb-4 rounded-lg bg-cadio-danger/10 border border-cadio-danger/20 p-3 text-[11px] font-medium text-cadio-danger">
            {exportError}
          </div>
        )}
        
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!sessionId || downloadBusy}
          className="relative group w-full h-12 overflow-hidden rounded-xl bg-white font-bold text-cadio-bg transition-all hover:bg-cadio-text disabled:opacity-20 active:scale-95 shadow-lg"
        >
          <div className="relative z-10 flex items-center justify-center gap-2">
            {downloadBusy ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeWidth="2.5" strokeLinecap="round" /></svg>
                Processing
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export {exportFormat.toUpperCase()}
              </>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
