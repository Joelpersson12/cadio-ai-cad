/** Adam/CADAM-style parameter inspector. */

import { useEffect, useMemo, useState } from "react";
import { useCadStore } from "../stores/cadStore";
import type { PrinterProfile } from "../utils/types";
import { exportUrl } from "../utils/api";

type ParamMeta = {
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

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
    <div className="grid grid-cols-[82px_1fr_58px_26px] items-center gap-3 py-2">
      <label className="text-xs leading-tight text-[#b9b9b9]">{meta.label}</label>
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
        className="h-2 w-full accent-[#245b70]"
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
        className="h-7 rounded-lg border-0 bg-[#2b2b2c] px-2 text-center text-xs font-semibold text-white outline-none"
      />
      <span className="text-xs text-[#9f9f9f]">{meta.unit ?? ""}</span>
    </div>
  );
}

export default function ObjectInspector() {
  const {
    objects,
    selectedObjectId,
    bounds,
    printer,
    printers,
    sessionId,
    patchParam,
    patchAppearance,
    setPrinter,
    snapSelectedObjects,
    undo,
    redo,
  } = useCadStore();

  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? objects[0];
  const selectedPrinter = printers[printer] as PrinterProfile | undefined;

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

  return (
    <div className="flex h-full flex-col bg-[#1d1d1e] text-white">
      <div className="flex h-14 items-center justify-between border-b border-[#303033] px-6">
        <h2 className="text-lg font-semibold">Parameters</h2>
        <button
          onClick={() => window.location.reload()}
          className="grid h-8 w-8 place-items-center rounded-lg text-[#bdbdbd] hover:bg-[#2a2a2b] hover:text-white"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-5 flex gap-2">
          <button onClick={() => void undo()} className="rounded-lg bg-[#2a2a2b] px-3 py-2 text-xs font-semibold hover:bg-[#343436]">
            Undo
          </button>
          <button onClick={() => void redo()} className="rounded-lg bg-[#2a2a2b] px-3 py-2 text-xs font-semibold hover:bg-[#343436]">
            Redo
          </button>
        </div>

        <label className="mb-5 block">
          <span className="mb-2 block text-xs text-[#a9a9a9]">Printer</span>
          <select
            value={printer}
            onChange={(e) => void setPrinter(e.target.value)}
            className="w-full rounded-lg border border-[#333] bg-[#252526] px-3 py-2 text-sm text-white outline-none"
          >
            {Object.entries(printers).map(([key, p]) => (
              <option value={key} key={key}>
                {(p as PrinterProfile).name}
              </option>
            ))}
          </select>
          {selectedPrinter && (
            <span className="mt-1 block text-[11px] text-[#898989]">
              {selectedPrinter.build_volume[0]} x {selectedPrinter.build_volume[1]} x {selectedPrinter.build_volume[2]} mm
            </span>
          )}
        </label>

        <section className="border-t border-[#303033] py-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Placement</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void snapSelectedObjects("on_plate")}
              disabled={!selectedObjectId}
              className="rounded-lg bg-[#2a2a2b] px-3 py-2 text-xs font-semibold hover:bg-[#343436] disabled:opacity-35"
            >
              On plate
            </button>
            <button
              onClick={() => void snapSelectedObjects("center_on_plate")}
              disabled={!selectedObjectId}
              className="rounded-lg bg-[#2a2a2b] px-3 py-2 text-xs font-semibold hover:bg-[#343436] disabled:opacity-35"
            >
              Center on plate
            </button>
          </div>
        </section>

        <section className="border-t border-[#303033] py-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Dimensions</h3>
            <span className="text-[10px] text-[#858585]">{parameterKeys.length}</span>
          </div>
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
            <p className="text-sm text-[#9f9f9f]">Create or select a model to edit parameters.</p>
          )}
        </section>

        <section className="border-t border-[#303033] py-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Colors</h3>
            <span className="text-[10px] text-[#858585]">1</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#b9b9b9]">Holder</span>
            <label className="flex items-center gap-2 rounded-lg bg-[#2a2a2b] px-3 py-2">
              <input
                type="color"
                value={color}
                onChange={(e) => void patchAppearance({ color: e.target.value })}
                className="h-5 w-5 rounded-full border-0 bg-transparent p-0"
              />
              <span className="font-mono text-xs uppercase text-white">{color}</span>
            </label>
          </div>
        </section>

        <section className="border-t border-[#303033] py-5 text-xs text-[#9f9f9f]">
          <p>Bounds: {bounds.x?.toFixed(1)} x {bounds.y?.toFixed(1)} x {bounds.z?.toFixed(1)} mm</p>
          <p>Parts: {objects.length}</p>
        </section>
      </div>

      <div className="border-t border-[#303033] p-5">
        <a
          href={sessionId ? exportUrl(sessionId, "stl") : "#"}
          className={`flex h-12 items-center justify-center rounded-lg text-sm font-semibold ${
            sessionId ? "bg-[#e8e8e8] text-[#171717] hover:bg-white" : "bg-[#333] text-[#777]"
          }`}
        >
          ⇩ STL
        </a>
      </div>
    </div>
  );
}
