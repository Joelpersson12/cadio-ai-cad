/** Object inspector panel - parameters, features, hierarchy, transforms. */

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useCadStore } from "../stores/cadStore";
import type { PrinterProfile, TransformMode } from "../utils/types";
import { exportUrl } from "../utils/api";

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  const [draft, setDraft] = useState(String(Number.isFinite(value) ? value : 0));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(Number.isFinite(value) ? value : 0));
    }
  }, [focused, value]);

  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next)) {
      onChange(next);
    } else {
      setDraft(String(Number.isFinite(value) ? value : 0));
    }
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-cadio-muted">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(String(Number.isFinite(value) ? value : 0));
            e.currentTarget.blur();
          }
        }}
        className="rounded-lg border border-cadio-border bg-[#121723] text-cadio-text px-3 py-1.5 text-sm focus:outline-none focus:border-cadio-accent"
      />
    </label>
  );
}

export default function ObjectInspector() {
  const {
    objects,
    selectedObjectId,
    bounds,
    printer,
    printers,
    printAssistant,
    sessionId,
    transformMode,
    setTransformMode,
    onSelectObject,
    onDeleteObject,
    patchParam,
    patchAppearance,
    onToggleFeature,
    onTransformCommit,
    setPrinter,
  } = useCadStore();

  const selectedObject = objects.find((o) => o.id === selectedObjectId);
  const selectedPrinter = printers[printer] as PrinterProfile | undefined;
  const params = selectedObject?.parameters ?? {};
  const features = selectedObject?.feature_tree ?? [];
  const transform = selectedObject?.transform;

  const patchTransformVector = (
    key: "position" | "rotation" | "scale",
    index: number,
    value: number,
  ) => {
    if (!selectedObject || !transform) return;
    const next = [...transform[key]] as [number, number, number];
    next[index] = value;
    void onTransformCommit(selectedObject.id, { [key]: next });
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* Object hierarchy */}
      <h2 className="text-lg font-semibold text-cadio-text">Scene</h2>
      <div className="flex flex-col gap-1">
        {objects.map((o) => (
          <motion.button
            key={o.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => void onSelectObject(o.id)}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
              o.id === selectedObjectId
                ? "bg-cadio-accent text-[#081225] font-semibold"
                : "bg-[#1e2536] text-cadio-muted hover:bg-[#2a3347]"
            }`}
          >
            {o.name}
          </motion.button>
        ))}
      </div>

      {/* Transform tools */}
      <h3 className="text-sm font-semibold text-cadio-text mt-2">Transform</h3>
      <div className="grid grid-cols-4 gap-1.5">
        {(["off", "translate", "rotate", "scale"] as TransformMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setTransformMode(mode)}
            className={`px-2 py-1.5 rounded-lg text-xs capitalize transition-colors ${
              transformMode === mode
                ? "bg-cadio-accent text-[#111] font-semibold"
                : "bg-[#333336] text-cadio-muted hover:bg-[#44454a]"
            }`}
          >
            {mode === "translate" ? "Move" : mode}
          </button>
        ))}
      </div>
      <button
        onClick={() => void onDeleteObject()}
        className="w-full rounded-lg bg-[#333336] text-cadio-danger py-1.5 text-xs hover:bg-[#403033] transition-colors"
      >
        Delete Selected
      </button>

      {transform && (
        <div className="flex flex-col gap-2 rounded-lg border border-cadio-border bg-[#202023] p-2">
          <p className="text-xs text-cadio-muted uppercase tracking-wider">Position</p>
          <div className="grid grid-cols-3 gap-1.5">
            {["X", "Y", "Z"].map((axis, i) => (
              <NumberInput
                key={`pos-${axis}`}
                label={axis}
                value={transform.position[i] ?? 0}
                onChange={(v) => patchTransformVector("position", i, v)}
                step={1}
                min={-500}
              />
            ))}
          </div>
          <p className="text-xs text-cadio-muted uppercase tracking-wider">Rotation</p>
          <div className="grid grid-cols-3 gap-1.5">
            {["X", "Y", "Z"].map((axis, i) => (
              <NumberInput
                key={`rot-${axis}`}
                label={axis}
                value={transform.rotation[i] ?? 0}
                onChange={(v) => patchTransformVector("rotation", i, v)}
                step={5}
                min={-360}
              />
            ))}
          </div>
          <p className="text-xs text-cadio-muted uppercase tracking-wider">Scale</p>
          <div className="grid grid-cols-3 gap-1.5">
            {["X", "Y", "Z"].map((axis, i) => (
              <NumberInput
                key={`scale-${axis}`}
                label={axis}
                value={transform.scale[i] ?? 1}
                onChange={(v) => patchTransformVector("scale", i, Math.max(0.05, v))}
                step={0.1}
                min={0.05}
              />
            ))}
          </div>
        </div>
      )}

      {/* Parameters */}
      <h3 className="text-sm font-semibold text-cadio-text mt-2">Parameters</h3>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-cadio-muted">Printer</span>
        <select
          value={printer}
          onChange={(e) => void setPrinter(e.target.value)}
          className="rounded-lg border border-cadio-border bg-[#121723] text-cadio-text px-3 py-1.5 text-sm focus:outline-none"
        >
          {Object.entries(printers).map(([key, p]) => (
            <option value={key} key={key}>
              {(p as PrinterProfile).name}
            </option>
          ))}
        </select>
      </label>
      <NumberInput label="Width" value={params.width ?? 0} onChange={(v) => void patchParam("width", v)} />
      <NumberInput label="Depth" value={params.depth ?? 0} onChange={(v) => void patchParam("depth", v)} />
      <NumberInput label="Height" value={params.height ?? 0} onChange={(v) => void patchParam("height", v)} />
      <NumberInput label="Thickness" value={params.thickness ?? 0} onChange={(v) => void patchParam("thickness", v)} />
      <NumberInput label="Fillet Radius" value={params.fillet_radius ?? 0} onChange={(v) => void patchParam("fillet_radius", v)} step={0.5} />
      <NumberInput label="Hole Count" value={params.hole_count ?? 0} onChange={(v) => void patchParam("hole_count", v)} />
      <NumberInput label="Wall Thickness" value={params.wall_thickness ?? 0} onChange={(v) => void patchParam("wall_thickness", v)} step={0.2} />

      <h3 className="text-sm font-semibold text-cadio-text mt-2">Material</h3>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-cadio-muted">Material</span>
        <select
          value={selectedObject?.material ?? "PLA"}
          onChange={(e) => void patchAppearance({ material: e.target.value })}
          className="rounded-lg border border-cadio-border bg-[#202023] text-cadio-text px-3 py-1.5 text-sm focus:outline-none"
        >
          {["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "PVA", "Resin"].map((material) => (
            <option key={material} value={material}>{material}</option>
          ))}
        </select>
        {selectedPrinter && (
          <span className="text-[11px] text-cadio-muted">
            {selectedPrinter.build_volume[0]} x {selectedPrinter.build_volume[1]} x {selectedPrinter.build_volume[2]} mm
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-cadio-muted">Color</span>
        <input
          type="color"
          value={selectedObject?.color ?? "#b8babd"}
          onChange={(e) => void patchAppearance({ color: e.target.value })}
          className="h-10 rounded-lg border border-cadio-border bg-[#121723] px-2 py-1"
        />
      </label>

      {/* Feature tree */}
      <h3 className="text-sm font-semibold text-cadio-text mt-2">Features</h3>
      <div className="flex flex-col gap-1.5">
        {features.map((f) => (
          <label key={f.id} className="flex items-center gap-2 text-cadio-muted text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={f.enabled}
              onChange={(e) => void onToggleFeature(f.id, e.target.checked)}
              className="accent-cadio-accent"
            />
            <span>{f.type.replace(/_/g, " ")}</span>
          </label>
        ))}
      </div>

      {/* Print assistant */}
      <h3 className="text-sm font-semibold text-cadio-text mt-2">Print Analysis</h3>
      {printAssistant.warnings.map((w) => (
        <p key={w} className="text-xs text-cadio-danger">! {w}</p>
      ))}
      {printAssistant.checks.map((c) => (
        <p key={c} className="text-xs text-cadio-success">+ {c}</p>
      ))}
      {printAssistant.hints.map((h) => (
        <p key={h} className="text-xs text-cadio-muted">* {h}</p>
      ))}
      <p className="text-xs text-cadio-muted">
        Score: {printAssistant.printability_score}/100
      </p>

      {/* Scene info */}
      <h3 className="text-sm font-semibold text-cadio-text mt-2">Info</h3>
      <p className="text-xs text-cadio-muted">Objects: {objects.length}</p>
      <p className="text-xs text-cadio-muted">
        Bounds: {bounds.x?.toFixed(1)} x {bounds.y?.toFixed(1)} x{" "}
        {bounds.z?.toFixed(1)} mm
      </p>

      {/* Export */}
      <h3 className="text-sm font-semibold text-cadio-text mt-2">Export</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {["stl", "3mf", "obj", "amf"].map((fmt) => (
          <a
            key={fmt}
            href={sessionId ? exportUrl(sessionId, fmt) : "#"}
            className={`flex items-center justify-center rounded-lg py-1.5 text-xs uppercase font-semibold transition-colors ${
              sessionId
                ? "bg-[#273046] text-cadio-text hover:bg-[#354058]"
                : "bg-[#1a1f2e] text-cadio-muted cursor-not-allowed"
            }`}
          >
            {fmt}
          </a>
        ))}
      </div>
    </div>
  );
}
