/** Cadio App shell - Shapr3D-inspired layout with mobile support. */

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel from "./components/AiPanel";
import ObjectInspector from "./components/ObjectInspector";
import ExampleBrowser from "./components/ExampleBrowser";
import LandingPage from "./components/LandingPage";
import ScalePercentInput from "./components/ScalePercentInput";
import ExportFlowDialog, { ExportFlowContent } from "./components/ExportFlow";
import SavedModelsPanel from "./components/SavedModelsPanel";
import ShareProjectDialog from "./components/ShareProjectDialog";
import type { ExampleObject } from "./components/ExampleBrowser";
import type { ExpertTool, MaterialProfile, SelectionMode, TransformMode } from "./utils/types";
import { readProjectShareFromHash } from "./utils/projectShare";

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
        <div className="px-5 pb-8">
          <ExportFlowContent onClose={onClose} />
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
  const { objects, selectedObjectId, materials, printSettings, patchParam, patchAppearance, setSelectedScalePercent, onToggleFeature } = useCadStore();
  const obj = objects.find((o) => o.id === selectedObjectId) ?? objects[0];
  const materialEntries: Array<[string, MaterialProfile]> = Object.entries(materials).length
    ? Object.entries(materials)
    : FALLBACK_MATERIAL_ENTRIES;
  const modelScalePercent = ((obj?.transform.scale[0] ?? 1) * 100);

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
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-[#172033] p-2">
                <div>
                  <div className="text-cadio-muted">Model scaling</div>
                  <div className="text-[10px] text-cadio-muted">98,3% works</div>
                </div>
                <ScalePercentInput
                  value={modelScalePercent}
                  onCommit={(percent) => void setSelectedScalePercent(percent)}
                  className="w-28"
                />
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

function MobileModelVariantBar() {
  const { objects, switchSourceModel, status } = useCadStore();
  const [loadingDirection, setLoadingDirection] = useState<"next" | "previous" | null>(null);

  if (!objects.length) return null;

  const switchModel = async (direction: "next" | "previous") => {
    if (loadingDirection) return;
    setLoadingDirection(direction);
    try {
      await switchSourceModel(direction);
    } finally {
      setLoadingDirection(null);
    }
  };

  const loading = Boolean(loadingDirection);

  return (
    <div className="border-t border-cadio-border bg-[#181819]/95 px-3 py-2 backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cadio-muted">Model variants</span>
        <span className="max-w-[45%] truncate text-[11px] text-cadio-muted">{status}</span>
      </div>
      <div className="grid grid-cols-[0.85fr_1.15fr] gap-2">
        <button
          onClick={() => void switchModel("previous")}
          disabled={loading}
          className="h-11 rounded-xl border border-[#333] bg-[#242426] px-3 text-sm font-semibold text-cadio-text disabled:opacity-45"
        >
          {loadingDirection === "previous" ? "Loading..." : "Previous"}
        </button>
        <button
          onClick={() => void switchModel("next")}
          disabled={loading}
          className="h-11 rounded-xl border border-[#28c7df] bg-[#28c7df] px-3 text-sm font-black text-[#081225] shadow-[0_0_18px_rgba(40,199,223,0.22)] disabled:opacity-45"
        >
          {loadingDirection === "next" ? "Loading..." : "Next model"}
        </button>
      </div>
    </div>
  );
}

function isModelBusyStatus(status: string) {
  return /applying|loading|sketching|generating|importing/i.test(status || "");
}

function ModelLoadingOverlay({ status }: { status: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#111]/25 backdrop-blur-[1px]">
      <div className="relative flex h-52 w-52 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-[#28c7df]/20 bg-[radial-gradient(circle,rgba(40,199,223,0.14),rgba(17,17,17,0)_64%)] blur-[1px]" />
        <div className="absolute inset-2 animate-spin rounded-full border border-dashed border-[#28c7df]/70 shadow-[0_0_34px_rgba(40,199,223,0.2)]" />
        <div
          className="absolute inset-8 rounded-[26px] border border-[#facc15]/40 bg-[#facc15]/5"
          style={{ animation: "spin 2.8s linear infinite reverse" }}
        />
        <div className="absolute h-24 w-24 rotate-45 animate-spin rounded-2xl border border-[#28c7df]/75 bg-[linear-gradient(135deg,rgba(40,199,223,0.34),rgba(250,204,21,0.08))] shadow-[0_0_46px_rgba(40,199,223,0.28)]" />
        <div
          className="absolute h-14 w-14 rounded-xl border border-white/35 bg-[#1b1b1c]/90 shadow-[inset_0_0_24px_rgba(40,199,223,0.18),0_0_26px_rgba(250,204,21,0.12)]"
          style={{ transform: "rotateX(62deg) rotateZ(45deg)" }}
        />
        <div className="absolute flex h-32 w-32 items-center justify-center">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className="absolute h-2.5 w-2.5 rounded-full bg-[#28c7df] shadow-[0_0_16px_rgba(40,199,223,0.85)]"
              style={{
                transform: `rotate(${index * 90}deg) translateY(-62px)`,
                opacity: 0.4 + index * 0.16,
                animation: `pulse 1.2s ease-in-out ${index * 0.16}s infinite`,
              }}
            />
          ))}
        </div>
        <div className="absolute -bottom-8 rounded-full border border-[#28c7df]/30 bg-[#181819]/95 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_28px_rgba(40,199,223,0.18)]">
          {status || "Building model..."}
        </div>
      </div>
    </div>
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
    isBusy,
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
    setPrinter,
    runPrompt,
  } = useCadStore();

  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [mobileExamplesOpen, setMobileExamplesOpen] = useState(false);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(true);
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(true);
  const [parametersPanelOpen, setParametersPanelOpen] = useState(true);
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(292);
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(380);
  const [parametersPanelWidth, setParametersPanelWidth] = useState(330);
  const desktopLayoutRef = useRef<HTMLDivElement>(null);

  const handleMobileExampleSelect = async (example: ExampleObject) => {
    await runPrompt(example.prompt);
  };

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  useEffect(() => {
    const shared = readProjectShareFromHash();
    if (!shared?.prompt) return;
    const key = `cadio-share-loaded:${window.location.hash}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    if (shared.printer) {
      void setPrinter(shared.printer);
    }
    void runPrompt(shared.prompt);
  }, [runPrompt, setPrinter]);

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
  const modelBusy = isBusy || isModelBusyStatus(status);
  const workspaceTrackWidth = workspacePanelOpen ? workspacePanelWidth : 52;
  const assistantTrackWidth = assistantPanelOpen ? assistantPanelWidth : 52;
  const parametersTrackWidth = parametersPanelOpen ? parametersPanelWidth : 52;
  const desktopGridColumns = `${workspaceTrackWidth}px 6px ${assistantTrackWidth}px 6px minmax(0,1fr) 6px ${parametersTrackWidth}px`;
  const startPanelResize = (
    panel: "workspace" | "assistant" | "parameters",
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const rect = desktopLayoutRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    if (panel === "workspace") setWorkspacePanelOpen(true);
    if (panel === "assistant") setAssistantPanelOpen(true);
    if (panel === "parameters") setParametersPanelOpen(true);

    const onMove = (moveEvent: MouseEvent) => {
      if (panel === "workspace") {
        setWorkspacePanelWidth(clamp(moveEvent.clientX - rect.left, 72, 460));
      } else if (panel === "assistant") {
        const leftWidth = workspacePanelOpen ? workspacePanelWidth : 52;
        setAssistantPanelWidth(clamp(moveEvent.clientX - rect.left - leftWidth - 6, 72, 520));
      } else {
        setParametersPanelWidth(clamp(rect.right - moveEvent.clientX, 72, 480));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="w-full h-full relative bg-cadio-bg text-cadio-text">
      {/* Desktop layout */}
      <div
        ref={desktopLayoutRef}
        className="hidden h-full w-full overflow-hidden bg-[#171717] text-white transition-[grid-template-columns] duration-300 ease-out md:grid"
        style={{ gridTemplateColumns: desktopGridColumns }}
      >
        <aside className={`flex min-h-0 flex-col border-r border-[#272729] bg-[#181818] ${workspacePanelOpen ? "px-5 py-5" : "items-center px-2 py-3"}`}>
          {workspacePanelOpen ? (
            <>
          <div className="mb-5 rounded-xl border border-[#2d2d2f] bg-[#202020] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#28c7df] text-base font-black text-[#101010]">C</span>
                <div className="min-w-0">
                  <div className="text-sm font-black uppercase tracking-[0.22em] text-white">Cadio</div>
                  <div className="text-[11px] text-[#9a9a9a]">AI CAD workspace</div>
                </div>
              </div>
              <button
                onClick={() => setWorkspacePanelOpen(false)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#333] bg-[#171717] text-xs font-semibold text-[#bdbdbd] hover:border-[#555] hover:text-white"
                title="Collapse workspace panel"
              >
                {"<"}
              </button>
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
            <details className="mb-5 rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
                <span>Easy edits</span>
                <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f]">{EASY_ACTIONS.length}</span>
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
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
            </details>
          ) : (
            <div className="mb-5 space-y-3">
              <details className="rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
                  <span>Sketch tools</span>
                  <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f]">{expertTool}</span>
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2">
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
              </details>
              <details className="rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
                  <span>Selection</span>
                  <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f]">{selectionMode}</span>
                </summary>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-[#333] bg-[#202020] p-1">
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
              </details>
              <details className="rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
                  <span>Transform</span>
                  <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f]">{transformMode}</span>
                </summary>
                <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg border border-[#333] bg-[#202020] p-1">
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
              </details>
              <details className="rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
                  <span>CAD operations</span>
                  <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f]">{operationAmount} mm</span>
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2">
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
                <div className="mt-3 grid grid-cols-2 gap-2">
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
              </details>
            </div>
          )}

          <SavedModelsPanel
            title={projectTitle}
            prompt={latestPrompt}
            sessionId={sessionId}
            printer={printer}
            objects={objects}
            onOpenPrompt={(savedPrompt) => void runPrompt(savedPrompt)}
          />

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
            <div className="mt-3">
              <button onClick={() => void onDeleteObject()} disabled={!selectedObjectId} className="w-full rounded-lg bg-[#2a2a2c] px-2 py-2 text-xs font-semibold text-[#ff8b8b] hover:bg-[#343436] disabled:opacity-35">Delete selected</button>
            </div>
          </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center gap-3">
              <button
                onClick={() => setWorkspacePanelOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-[#28c7df] text-sm font-black text-[#101010] shadow-[0_0_18px_rgba(40,199,223,0.18)]"
                title="Open workspace panel"
              >
                C
              </button>
              <button
                onClick={() => setWorkspacePanelOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#202020] text-xs font-semibold text-[#e6e6e6] hover:border-[#28c7df]"
                title="Open tools"
              >
                T
              </button>
            </div>
          )}
        </aside>
        <div
          className="group relative z-20 cursor-col-resize border-r border-[#242426] bg-[#111]/70"
          onMouseDown={(event) => startPanelResize("workspace", event)}
          title="Drag to resize workspace panel"
        >
          <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3d3d40] transition-colors group-hover:bg-[#28c7df]" />
        </div>

        <section className={`${assistantPanelOpen ? "grid grid-rows-[56px_1fr]" : "flex items-start justify-center px-2 py-3"} min-h-0 border-r border-[#252527] bg-[#202020]`}>
          {assistantPanelOpen ? (
            <>
          <header className="flex items-center justify-between px-5 [&>button:nth-child(2)]:hidden">
            <button
              onClick={() => setAssistantPanelOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold text-[#aaa] hover:bg-[#2b2b2c]"
              title="Collapse AI panel"
            >
              {"<"}
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-lg text-[#aaa] hover:bg-[#2b2b2c]">◫</button>
            <div className="min-w-0 px-4 text-center text-sm font-semibold">
              <div className="truncate">{projectTitle}</div>
              <div className="text-[11px] text-[#858585]">{objects.length} parts</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShareOpen(true)} className="text-sm font-semibold hover:text-[#18a8ff]">Share</button>
              <button onClick={() => setExportOpen(true)} className="text-sm font-semibold hover:text-[#18a8ff]">Export</button>
            </div>
          </header>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">
            <AiPanel />
          </div>
            </>
          ) : (
            <button
              onClick={() => setAssistantPanelOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#202020] text-xs font-semibold text-[#e6e6e6] hover:border-[#28c7df]"
              title="Open AI panel"
            >
              AI
            </button>
          )}
        </section>
        <div
          className="group relative z-20 cursor-col-resize border-r border-[#242426] bg-[#111]/70"
          onMouseDown={(event) => startPanelResize("assistant", event)}
          title="Drag to resize AI panel"
        >
          <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3d3d40] transition-colors group-hover:bg-[#28c7df]" />
        </div>

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
          {modelBusy && <ModelLoadingOverlay status={status} />}
        </main>
        <div
          className="group relative z-20 cursor-col-resize border-l border-[#242426] bg-[#111]/70"
          onMouseDown={(event) => startPanelResize("parameters", event)}
          title="Drag to resize parameters panel"
        >
          <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3d3d40] transition-colors group-hover:bg-[#28c7df]" />
        </div>

        <aside className={`${parametersPanelOpen ? "relative" : "flex items-start justify-center px-2 py-3"} min-h-0 overflow-hidden border-l border-[#303033] bg-[#1d1d1e]`}>
          {parametersPanelOpen ? (
            <>
              <button
                onClick={() => setParametersPanelOpen(false)}
                className="absolute right-3 top-3 z-30 grid h-7 w-7 place-items-center rounded-md border border-[#333] bg-[#171717] text-xs font-semibold text-[#bdbdbd] hover:border-[#555] hover:text-white"
                title="Collapse parameters panel"
              >
                {">"}
              </button>
              <ObjectInspector />
            </>
          ) : (
            <button
              onClick={() => setParametersPanelOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#202020] text-[10px] font-semibold text-[#e6e6e6] hover:border-[#28c7df]"
              title="Open parameters panel"
            >
              P
            </button>
          )}
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
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => setMobileExamplesOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-[#1a2535] text-cadio-accent text-xs font-semibold hover:bg-[#243048]"
            >
              Ideas
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="rounded-lg bg-[#2b2b2d] px-2.5 py-1.5 text-xs font-semibold text-cadio-text"
            >
              Share
            </button>
            <button
              onClick={() => setMobileExportOpen(true)}
              className="rounded-lg bg-[#2b2b2d] px-2.5 py-1.5 text-xs font-semibold text-cadio-text"
            >
              Export
            </button>
            <button
              onClick={() => setMobileEditOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-cadio-accent text-[#081225] text-xs font-semibold"
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
        <div className="relative flex-1 min-h-0">
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
          {modelBusy && <ModelLoadingOverlay status={status} />}
        </div>

        <MobileModelVariantBar />

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

      <ExportFlowDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ShareProjectDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={projectTitle}
        prompt={latestPrompt}
        printer={printer}
        sessionId={sessionId}
        objects={objects}
      />
    </div>
  );
}

// Compact AI bar for mobile bottom
function MobileAiBar() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const { runPrompt, isBusy } = useCadStore();
  const busy = loading || isBusy;

  const handleSend = async () => {
    if (!prompt.trim() || busy) return;
    setLoading(true);
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
    try {
      await runPrompt(prompt.trim());
      setPrompt("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 rounded-2xl border p-1.5 transition-all ${
      busy
        ? "border-[#28c7df]/70 bg-[#101820] shadow-[0_0_28px_rgba(40,199,223,0.24)]"
        : "border-transparent"
    }`}>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void handleSend()}
        placeholder="Ask AI to change the model..."
        className="min-h-11 flex-1 rounded-xl border border-cadio-border bg-[#111827] px-3 py-2 text-base text-cadio-text placeholder:text-cadio-muted focus:border-cadio-accent focus:outline-none"
      />
      <button
        onClick={() => void handleSend()}
        disabled={busy || !prompt.trim()}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cadio-accent text-base font-black text-[#081225] shadow-[0_0_18px_rgba(40,199,223,0.22)] disabled:opacity-40"
      >
        {busy ? "..." : ">"}
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
  const [showBuilder, setShowBuilder] = useState(() => window.location.hash.startsWith("#builder"));

  useEffect(() => {
    const syncFromHash = () => setShowBuilder(window.location.hash.startsWith("#builder"));
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
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
    </>
  );
}
