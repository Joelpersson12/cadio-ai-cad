/** Cadio App shell - Shapr3D-inspired layout with mobile support. */

import { useEffect, useState } from "react";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel from "./components/AiPanel";
import ObjectInspector from "./components/ObjectInspector";
import ExampleBrowser from "./components/ExampleBrowser";
import LandingPage from "./components/LandingPage";
import type { ExampleObject } from "./components/ExampleBrowser";
import type { ExpertTool, MaterialProfile, SelectionMode, TransformMode } from "./utils/types";
import { exportUrl } from "./utils/api";
import { isCadioAuthenticated, markCadioAuthenticated, requestCadioAuth } from "./utils/auth";

function promptFromHistory(item: Record<string, unknown> | undefined) {
  const value = item?.prompt ?? item?.command ?? item?.input;
  return typeof value === "string" ? value : "";
}

function creationName(prompt: string) {
  if (!prompt.trim()) return "Untitled Project";
  return prompt
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const EASY_ACTIONS = [
  { label: "Taller", prompt: "Make it 20 percent taller" },
  { label: "Wider", prompt: "Make it 20 percent wider" },
  { label: "Thicker", prompt: "Make it thicker and stronger" },
  { label: "Round edges", prompt: "Add rounded corners" },
  { label: "Mount holes", prompt: "Add 4 mounting holes with counterbores" },
  { label: "Print fit", prompt: "Optimize for FDM printing" },
];

const EXPERT_TOOLS: Array<{ id: ExpertTool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "rectangle", label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "line", label: "Line" },
  { id: "hole", label: "Hole" },
];

const SELECTION_MODES: Array<{ id: SelectionMode; label: string }> = [
  { id: "body", label: "Body" },
  { id: "face", label: "Face" },
  { id: "edge", label: "Edge" },
];

const TRANSFORM_MODES: Array<{ id: TransformMode; label: string }> = [
  { id: "off", label: "Off" },
  { id: "translate", label: "Move" },
  { id: "rotate", label: "Rotate" },
  { id: "scale", label: "Scale" },
];

const EXPORT_FORMATS = [
  { value: "stl", label: "STL", hint: "Most slicers" },
  { value: "3mf", label: "3MF", hint: "Modern slicers" },
  { value: "obj", label: "OBJ", hint: "Mesh editors" },
  { value: "amf", label: "AMF", hint: "Legacy printers" },
];

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

// Mobile examples sheet for inspiration
function MobileExamplesSheet({
  open,
  onClose,
  onSelectExample,
}: {
  open: boolean;
  onClose: () => void;
  onSelectExample: (example: ExampleObject) => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSelect = async (example: ExampleObject) => {
    setIsLoading(true);
    try {
      await onSelectExample(example);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#16202e] border-t border-cadio-border rounded-t-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "80dvh", overflowY: "auto" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-cadio-border" />
        </div>

        <div className="px-4 pb-8 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-cadio-text">Get Inspired</h3>
          <ExampleBrowser
            onSelectExample={handleSelect}
            isLoading={isLoading}
          />
        </div>
      </div>
    </>
  );
}

function MobileExportSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { sessionId, printSettings, objects } = useCadStore();
  const [format, setFormat] = useState("stl");

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-cadio-border bg-[#1f1f20] transition-transform duration-300 md:hidden ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "70dvh", overflowY: "auto" }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-cadio-border" />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-8">
          <div>
            <h3 className="text-sm font-semibold text-cadio-text">Export</h3>
            <p className="mt-1 text-xs text-cadio-muted">
              {objects.length || 0} parts
              {printSettings ? `, ${printSettings.scale.recommended_scale_percent.toFixed(1)}% suggested scale` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_FORMATS.map((item) => (
              <button
                key={item.value}
                onClick={() => setFormat(item.value)}
                className={`rounded-xl border px-3 py-3 text-left ${
                  format === item.value
                    ? "border-cadio-accent bg-[#14323a] text-white"
                    : "border-cadio-border bg-[#282829] text-cadio-text"
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-[11px] text-cadio-muted">{item.hint}</span>
              </button>
            ))}
          </div>
          <a
            href={sessionId ? exportUrl(sessionId, format) : "#"}
            download={sessionId ? `cadio-${sessionId}.${format}` : undefined}
            onClick={(event) => {
              if (!sessionId) return;
              if (isCadioAuthenticated()) return;
              event.preventDefault();
              requestCadioAuth();
            }}
            className={`flex h-12 items-center justify-center rounded-xl text-sm font-semibold ${
              sessionId ? "bg-[#e8e8e8] text-[#171717]" : "bg-[#333] text-[#777]"
            }`}
          >
            Download {format.toUpperCase()}
          </a>
        </div>
      </div>
    </>
  );
}

// Mobile bottom sheet for editing
function MobileEditSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { objects, selectedObjectId, materials, printSettings, patchParam, patchAppearance, onToggleFeature } = useCadStore();
  const obj = objects.find((o) => o.id === selectedObjectId) ?? objects[0];
  const materialEntries: Array<[string, MaterialProfile]> = Object.entries(materials).length
    ? Object.entries(materials)
    : FALLBACK_MATERIAL_ENTRIES;

  if (!obj) return null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#16202e] border-t border-cadio-border rounded-t-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "70dvh", overflowY: "auto" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-cadio-border" />
        </div>

        <div className="px-5 pb-8 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-cadio-text">Edit Model</h3>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-cadio-muted">Material</span>
              <select
                value={printSettings?.material ?? obj.material}
                onChange={(e) => void patchAppearance({ material: e.target.value })}
                className="h-10 rounded-lg border border-cadio-border bg-[#111827] px-3 text-sm text-cadio-text outline-none"
              >
                {materialEntries.map(([key, material]) => (
                  <option value={key} key={key}>
                    {material.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-cadio-muted">Color</span>
              <input
                type="color"
                value={obj.color}
                onChange={(e) => void patchAppearance({ color: e.target.value })}
                className="h-10 w-full rounded-lg border border-cadio-border bg-[#111827] p-1"
              />
            </label>
          </div>

          {printSettings && (
            <div className="rounded-xl border border-cadio-border bg-[#111827] p-3 text-xs text-cadio-text">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">Print setup</span>
                <span className="text-cadio-accent">{printSettings.scale.recommended_scale_percent.toFixed(1)}% scale</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-cadio-muted">
                <span>Layer {printSettings.slicer.layer_height_mm} mm</span>
                <span>Infill {printSettings.slicer.infill_percent}%</span>
                <span>Nozzle {printSettings.slicer.nozzle_temp_c[0]}-{printSettings.slicer.nozzle_temp_c[1]} C</span>
                <span>Bed {printSettings.slicer.bed_temp_c[0]}-{printSettings.slicer.bed_temp_c[1]} C</span>
              </div>
              {printSettings.source_settings?.has_creator_settings && (
                <p className="mt-2 text-cadio-accent">Creator settings loaded from Printables</p>
              )}
            </div>
          )}

          {/* Parameters */}
          {Object.entries(obj.parameters).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex justify-between">
                <label className="text-xs text-cadio-muted capitalize">
                  {key.replace(/_/g, " ")}
                </label>
                <span className="text-xs text-cadio-accent">{Number(value).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={key === "angle" ? 25 : key.includes("count") ? 0 : 1}
                max={
                  key === "angle"
                    ? 85
                    : key.includes("count")
                    ? 8
                    : key === "thickness" || key === "wall_thickness"
                    ? 30
                    : 300
                }
                step={key.includes("count") ? 1 : 0.5}
                value={Number(value)}
                onChange={(e) => void patchParam(key, parseFloat(e.target.value))}
                className="w-full accent-cadio-accent h-2"
              />
            </div>
          ))}

          {/* Features */}
          <div className="border-t border-cadio-border pt-3">
            <p className="text-xs text-cadio-muted mb-3 uppercase tracking-wider">Features</p>
            <div className="grid grid-cols-2 gap-2">
              {obj.feature_tree.map((f) => (
                <button
                  key={f.id}
                  onClick={() => void onToggleFeature(f.id, !f.enabled)}
                  className={`py-2.5 px-3 rounded-lg text-xs font-medium transition-all ${
                    f.enabled
                      ? "bg-cadio-accent text-[#081225]"
                      : "bg-[#1a2535] text-cadio-muted hover:text-cadio-text"
                  }`}
                >
                  {f.type.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function WorkspaceApp() {
  const {
    sessionId,
    objects,
    selectedObjectId,
    selectedObjectIds,
    transformMode,
    bounds,
    printers,
    printer,
    status,
    expertMode,
    expertTool,
    selectionMode,
    sketchHeight,
    operationAmount,
    editHistory,
    loadPrinters,
    applyScenePayload,
    onSelectObject,
    onTransformCommit,
    setTransformMode,
    setExpertMode,
    setExpertTool,
    setSelectionMode,
    setSketchHeight,
    setOperationAmount,
    createPrimitive,
    applyExpertOperation,
    selectAllObjects,
    onDeleteObject,
    snapSelectedObjects,
    undo,
    redo,
    runPrompt,
  } = useCadStore();

  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [mobileExamplesOpen, setMobileExamplesOpen] = useState(false);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);

  const handleMobileExampleSelect = async (example: ExampleObject) => {
    await runPrompt(example.prompt);
  };

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  useWebSocket(sessionId || null, applyScenePayload);

  // Get printer build volume
  const printerProfile = printers[printer];
  const printerVolume: [number, number, number] = printerProfile
    ? [
        printerProfile.build_volume[0],
        printerProfile.build_volume[1],
        printerProfile.build_volume[2],
      ]
    : [220, 220, 250];

  const latestPrompt = promptFromHistory(editHistory[editHistory.length - 1]);
  const projectTitle = creationName(latestPrompt);
  const creations = editHistory
    .slice(-5)
    .reverse()
    .map((item, index) => ({
      id: `${index}-${promptFromHistory(item)}`,
      title: creationName(promptFromHistory(item)),
    }));
  const selectedCount = selectedObjectIds.length || (selectedObjectId ? 1 : 0);

  return (
    <div className="w-full h-full relative bg-cadio-bg text-cadio-text">
      {/* Desktop layout */}
      <div className="hidden md:grid h-full w-full grid-cols-[292px_380px_minmax(0,1fr)_330px] overflow-hidden bg-[#171717] text-white">
        <aside className="flex min-h-0 flex-col border-r border-[#272729] bg-[#181818] px-5 py-5">
          <div className="mb-5 rounded-xl border border-[#2d2d2f] bg-[#202020] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#28c7df] text-base font-black text-[#101010]">C</span>
              <div>
                <div className="text-sm font-black uppercase tracking-[0.22em] text-white">Cadio</div>
                <div className="text-[11px] text-[#9a9a9a]">AI CAD workspace</div>
              </div>
            </div>
          </div>
          <button
            onClick={() => void runPrompt("new part")}
            className="mb-5 flex h-10 items-center justify-center gap-2 rounded-lg border border-[#2aa8c4] bg-[#123038] px-4 text-sm font-semibold text-white hover:bg-[#173a43]"
          >
            <span className="text-xl leading-none">+</span>
            New Creation
          </button>
          <button
            onClick={() => setShowMeasurements((value) => !value)}
            className={`mb-5 flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
              showMeasurements
                ? "border-[#facc15] bg-[#3a3214] text-[#ffe58a]"
                : "border-[#303033] bg-[#222] text-[#e6e6e6] hover:border-[#facc15] hover:text-white"
            }`}
            title="Show real model measurements"
          >
            <span className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[11px]">mm</span>
            Measure
          </button>
          <div className="mb-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#858585]">Mode</div>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#333] bg-[#202020] p-1">
              <button
                onClick={() => setExpertMode(false)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  !expertMode ? "bg-[#e5e5e5] text-[#181818]" : "text-[#a8a8a8] hover:bg-[#2d2d2f] hover:text-white"
                }`}
              >
                Easy
              </button>
              <button
                onClick={() => setExpertMode(true)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  expertMode ? "bg-[#28c7df] text-[#101010]" : "text-[#a8a8a8] hover:bg-[#2d2d2f] hover:text-white"
                }`}
              >
                Expert
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#878787]">
              {expertMode
                ? "Manual sketching, edge selection, transforms, and CAD operations."
                : "Guided edits for quick printable changes without manual CAD tools."}
            </p>
          </div>

          {!expertMode ? (
            <div className="mb-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#858585]">Easy edits</div>
              <div className="grid grid-cols-2 gap-2">
                {EASY_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => void runPrompt(action.prompt)}
                    className="rounded-lg border border-[#303033] bg-[#222] px-3 py-2 text-left text-xs font-semibold text-[#e6e6e6] hover:border-[#28c7df] hover:text-white"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-5 space-y-4">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#858585]">Sketch tools</div>
                <div className="grid grid-cols-2 gap-2">
                  {EXPERT_TOOLS.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setExpertTool(tool.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
                        expertTool === tool.id
                          ? "border-[#28c7df] bg-[#213940] text-white"
                          : "border-[#303033] bg-[#222] text-[#a8a8a8] hover:text-white"
                      }`}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#858585]">Selection</div>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#333] bg-[#202020] p-1">
                  {SELECTION_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setSelectionMode(mode.id)}
                      className={`rounded-md px-2 py-2 text-xs font-semibold ${
                        selectionMode === mode.id ? "bg-[#e5e5e5] text-[#181818]" : "text-[#9f9f9f] hover:bg-[#2d2d2f] hover:text-white"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#858585]">Transform</div>
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-[#333] bg-[#202020] p-1">
                  {TRANSFORM_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setTransformMode(mode.id)}
                      className={`rounded-md px-2 py-2 text-[11px] font-semibold ${
                        transformMode === mode.id ? "bg-[#28c7df] text-[#101010]" : "text-[#9f9f9f] hover:bg-[#2d2d2f] hover:text-white"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void snapSelectedObjects("on_plate")}
                    disabled={!selectedObjectId}
                    className="rounded-lg border border-[#303033] bg-[#222] px-3 py-2 text-left text-xs font-semibold text-[#e6e6e6] hover:border-[#28c7df] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    On plate
                  </button>
                  <button
                    onClick={() => void snapSelectedObjects("center_on_plate")}
                    disabled={!selectedObjectId}
                    className="rounded-lg border border-[#303033] bg-[#222] px-3 py-2 text-left text-xs font-semibold text-[#e6e6e6] hover:border-[#28c7df] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Center on plate
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] uppercase tracking-[0.16em] text-[#858585]">
                  Height
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={sketchHeight}
                    onChange={(e) => setSketchHeight(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-[#303033] bg-[#111827] px-3 text-xs text-white outline-none"
                  />
                </label>
                <label className="text-[11px] uppercase tracking-[0.16em] text-[#858585]">
                  Amount
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={operationAmount}
                    onChange={(e) => setOperationAmount(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-[#303033] bg-[#111827] px-3 text-xs text-white outline-none"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["extrude", "fillet", "chamfer", "shell"].map((operation) => (
                  <button
                    key={operation}
                    onClick={() => void applyExpertOperation(operation)}
                    disabled={!selectedObjectId}
                    className="rounded-lg border border-[#303033] bg-[#222] px-3 py-2 text-left text-xs font-semibold capitalize text-[#e6e6e6] hover:border-[#28c7df] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {operation}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3 flex items-center gap-2 text-sm text-[#858585] [&>span:first-child]:hidden">
              <span className="text-lg">▦</span>
              Workspace
            </div>
            <div className="space-y-1">
              {(creations.length ? creations : [{ id: "empty", title: "Start with a prompt" }]).map((creation) => (
                <button
                  key={creation.id}
                  className="block w-full truncate rounded-lg px-3 py-2 text-left text-xs text-[#9d9d9d] hover:bg-[#222] hover:text-white"
                >
                  {creation.title}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-[#2d2d2f] bg-[#202020] p-3">
            <div className="flex items-center justify-between text-xs text-[#a8a8a8]">
              <span>{selectedCount ? `${selectedCount} selected` : "Nothing selected"}</span>
              <button onClick={selectAllObjects} className="font-semibold text-[#28c7df] hover:text-white">
                Select all
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button onClick={() => void undo()} className="rounded-lg bg-[#2a2a2c] px-2 py-2 text-xs font-semibold hover:bg-[#343436]">Undo</button>
              <button onClick={() => void redo()} className="rounded-lg bg-[#2a2a2c] px-2 py-2 text-xs font-semibold hover:bg-[#343436]">Redo</button>
              <button onClick={() => void onDeleteObject()} disabled={!selectedObjectId} className="rounded-lg bg-[#2a2a2c] px-2 py-2 text-xs font-semibold text-[#ff8b8b] hover:bg-[#343436] disabled:opacity-35">Delete</button>
            </div>
          </div>
        </aside>

        <section className="grid min-h-0 grid-rows-[56px_1fr] border-r border-[#252527] bg-[#202020]">
          <header className="flex items-center justify-between px-5">
            <button className="grid h-8 w-8 place-items-center rounded-lg text-[#aaa] hover:bg-[#2b2b2c]">◫</button>
            <div className="min-w-0 px-4 text-center text-sm font-semibold">
              <div className="truncate">{projectTitle}</div>
              <div className="text-[11px] text-[#858585]">{objects.length} parts</div>
            </div>
            <button className="text-sm font-semibold hover:text-[#18a8ff]">Export</button>
          </header>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">
            <AiPanel />
          </div>
        </section>

        <main className="relative min-h-0 overflow-hidden bg-[#3a3a3a]">
          <div className="absolute right-4 top-3 z-10 flex items-center gap-2 text-xs text-white/90">
            <span>{printerProfile?.name ?? "Printer"}</span>
            <span className="rounded bg-[#2c2c2d] px-2 py-1">
              {printerVolume[0]} x {printerVolume[1]} x {printerVolume[2]} mm
            </span>
            <span className="rounded bg-[#2c2c2d] px-2 py-1 text-[#67d6f5]">{status || "Ready"}</span>
          </div>
          <div className="absolute left-4 top-3 z-10 rounded-lg border border-[#4b4b4d] bg-[#252525]/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
            <div className="font-semibold text-white">{expertMode ? "Expert CAD" : "Easy Edit"}</div>
            <div className="text-[11px] text-[#a7a7a7]">
              {expertMode ? `${expertTool} / ${selectionMode} / ${transformMode}` : "AI-guided printable edits"}
            </div>
          </div>
          <CadViewport
            objects={objects}
            selectedObjectId={selectedObjectId}
            selectedObjectIds={selectedObjectIds}
            onSelectObject={(id) => void onSelectObject(id)}
            transformMode={transformMode}
            onTransformCommit={(id, t) => void onTransformCommit(id, t)}
            printerVolume={printerVolume}
            bounds={bounds}
            expertMode={expertMode}
            expertTool={expertTool}
            selectionMode={selectionMode}
            sketchHeight={sketchHeight}
            operationAmount={operationAmount}
            onSetExpertMode={setExpertMode}
            onSetExpertTool={setExpertTool}
            onSetSelectionMode={setSelectionMode}
            onSetSketchHeight={setSketchHeight}
            onSetOperationAmount={setOperationAmount}
            onApplyExpertOperation={(op, amount, objectId) => void applyExpertOperation(op, amount, objectId)}
            onCreatePrimitive={(payload) => void createPrimitive(payload)}
            showMeasurements={showMeasurements}
          />
        </main>

        <aside className="min-h-0 overflow-hidden border-l border-[#303033] bg-[#1d1d1e]">
          <ObjectInspector />
        </aside>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden flex h-[100dvh] w-full flex-col bg-[#202022]">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-cadio-border bg-cadio-panel/95 px-4 py-2 backdrop-blur-sm">
          <div className="min-w-0">
            <span className="block text-sm font-bold tracking-widest text-cadio-text">CADIO</span>
            <span className="block truncate text-[11px] text-cadio-muted">{projectTitle}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setMobileExamplesOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[#1a2535] text-cadio-accent text-xs font-semibold hover:bg-[#243048]"
            >
              Ideas
            </button>
            <button
              onClick={() => setMobileExportOpen(true)}
              className="rounded-lg bg-[#2b2b2d] px-3 py-1.5 text-xs font-semibold text-cadio-text"
            >
              Export
            </button>
            <button
              onClick={() => setMobileEditOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-cadio-accent text-[#081225] text-xs font-semibold"
            >
              Edit
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-cadio-border bg-[#1f1f20]/95 px-3 py-2">
          {TRANSFORM_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setTransformMode(mode.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
                transformMode === mode.id ? "bg-cadio-accent text-[#101010]" : "bg-[#2b2b2d] text-cadio-text"
              }`}
            >
              {mode.label}
            </button>
          ))}
          <button
            onClick={selectAllObjects}
            disabled={!objects.length}
            className="shrink-0 rounded-lg bg-[#2b2b2d] px-3 py-2 text-xs font-semibold text-cadio-text disabled:opacity-35"
          >
            Select all
          </button>
          <button
            onClick={() => setShowMeasurements((value) => !value)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
              showMeasurements ? "bg-[#facc15] text-[#171717]" : "bg-[#2b2b2d] text-cadio-text"
            }`}
          >
            mm
          </button>
          <button
            onClick={() => void snapSelectedObjects("on_plate")}
            disabled={!objects.length}
            className="shrink-0 rounded-lg bg-[#2b2b2d] px-3 py-2 text-xs font-semibold text-cadio-text disabled:opacity-35"
          >
            On plate
          </button>
          <button
            onClick={() => void snapSelectedObjects("center_on_plate")}
            disabled={!objects.length}
            className="shrink-0 rounded-lg bg-[#2b2b2d] px-3 py-2 text-xs font-semibold text-cadio-text disabled:opacity-35"
          >
            Center
          </button>
          <button
            onClick={() => void onDeleteObject()}
            disabled={!selectedObjectId}
            className="shrink-0 rounded-lg bg-[#2b2b2d] px-3 py-2 text-xs font-semibold text-[#ff8b8b] disabled:opacity-35"
          >
            Delete
          </button>
        </div>

        {/* Viewport - takes most space */}
        <div className="flex-1 min-h-0">
          <CadViewport
            objects={objects}
            selectedObjectId={selectedObjectId}
            selectedObjectIds={selectedObjectIds}
            onSelectObject={(id) => void onSelectObject(id)}
            transformMode={transformMode}
            onTransformCommit={(id, t) => void onTransformCommit(id, t)}
            printerVolume={printerVolume}
            bounds={bounds}
            expertMode={false}
            mobileMode
            showMeasurements={showMeasurements}
          />
        </div>

        {/* Bottom AI input bar */}
        <div className="border-t border-cadio-border bg-cadio-panel/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-sm">
          <MobileAiBar />
        </div>
      </div>

      {/* Mobile examples sheet */}
      <MobileExamplesSheet
        open={mobileExamplesOpen}
        onClose={() => setMobileExamplesOpen(false)}
        onSelectExample={handleMobileExampleSelect}
      />

      <MobileExportSheet
        open={mobileExportOpen}
        onClose={() => setMobileExportOpen(false)}
      />

      {/* Mobile edit sheet */}
      <MobileEditSheet
        open={mobileEditOpen}
        onClose={() => setMobileEditOpen(false)}
      />
    </div>
  );
}

// Compact AI bar for mobile bottom
function MobileAiBar() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const { runPrompt } = useCadStore();

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      await runPrompt(prompt.trim());
      setPrompt("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void handleSend()}
        placeholder="Ask AI to change the model..."
        className="flex-1 bg-[#111827] border border-cadio-border rounded-lg px-3 py-2 text-sm text-cadio-text placeholder:text-cadio-muted focus:outline-none focus:border-cadio-accent"
      />
      <button
        onClick={() => void handleSend()}
        disabled={loading || !prompt.trim()}
        className="px-4 py-2 rounded-lg bg-cadio-accent text-[#081225] text-sm font-semibold disabled:opacity-40"
      >
        {loading ? "..." : ">"}
      </button>
    </div>
  );
}

function AuthRequiredDialog({
  open,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[#343436] bg-[#1f1f20] p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Logga in for nedladdning</h2>
            <p className="mt-1 text-xs leading-5 text-[#a8a8ab]">
              Gratispaketet ger 1 nedladdningsbar generering. Alla paket har samma CAD-upplevelse.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2b2b2d] text-sm text-[#bdbdbd] hover:text-white"
            aria-label="Close"
          >
            x
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onAuthenticated();
          }}
        >
          <input
            type="email"
            placeholder="E-post"
            className="h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm text-white outline-none placeholder:text-[#777] focus:border-[#2bb8dc]"
          />
          <input
            type="password"
            placeholder="Losenord"
            className="h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm text-white outline-none placeholder:text-[#777] focus:border-[#2bb8dc]"
          />
          <button className="h-11 w-full rounded-lg bg-[#e8e8e8] text-sm font-semibold text-[#151515] hover:bg-white">
            Logga in
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [showBuilder, setShowBuilder] = useState(() => window.location.hash === "#builder");
  const [authRequiredOpen, setAuthRequiredOpen] = useState(false);

  useEffect(() => {
    const syncFromHash = () => setShowBuilder(window.location.hash === "#builder");
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
  }, []);

  useEffect(() => {
    const openAuth = () => setAuthRequiredOpen(true);
    window.addEventListener("cadio-auth-required", openAuth);
    return () => window.removeEventListener("cadio-auth-required", openAuth);
  }, []);

  const startBuilding = () => {
    if (window.location.hash !== "#builder") {
      window.history.pushState(null, "", "#builder");
    }
    setShowBuilder(true);
  };

  return (
    <>
      {showBuilder ? <WorkspaceApp /> : <LandingPage onStartBuilding={startBuilding} />}
      <AuthRequiredDialog
        open={authRequiredOpen}
        onClose={() => setAuthRequiredOpen(false)}
        onAuthenticated={() => {
          markCadioAuthenticated();
          setAuthRequiredOpen(false);
        }}
      />
    </>
  );
}
