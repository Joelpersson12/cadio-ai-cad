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
import LegalPage from "./components/LegalPage";
import ScalePercentInput from "./components/ScalePercentInput";
import ExportFlowDialog, { ExportFlowContent } from "./components/ExportFlow";
import SavedModelsPanel from "./components/SavedModelsPanel";
import ShareProjectDialog from "./components/ShareProjectDialog";
import SiteFooter from "./components/SiteFooter";
import CadioLogo from "./components/CadioLogo";
import type { ExampleObject } from "./components/ExampleBrowser";
import type { ExpertTool, MaterialProfile, SelectionMode, TransformMode } from "./utils/types";
import { readProjectShareFromHash } from "./utils/projectShare";
import { initAnalytics, trackPageView } from "./utils/analytics";

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

const FEEDBACK_MAILTO = "mailto:support@cadio.net?subject=Cadio%20Feedback";
const DEFAULT_TITLE = "Cadio - AI CAD for 3D Printing";
const DEFAULT_DESCRIPTION = "Search, remix, edit, and generate printable 3D models with AI.";
const CANONICAL_DOMAIN = "https://cadio.net";

type StaticPage = "terms" | "privacy" | "cookies" | "contact";

function staticPageFromPath(pathname: string): StaticPage | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/terms") return "terms";
  if (path === "/privacy") return "privacy";
  if (path === "/cookies") return "cookies";
  if (path === "/contact") return "contact";
  return null;
}

function setOrCreateMeta(selector: string, create: () => HTMLMetaElement | HTMLLinkElement, value: string) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  if (element instanceof HTMLMetaElement) {
    element.content = value;
  } else {
    element.href = value;
  }
}

function updatePageMetadata(pathname: string, showBuilder: boolean) {
  const page = staticPageFromPath(pathname);
  const titleByPage: Record<StaticPage, string> = {
    terms: "Terms of Service - Cadio",
    privacy: "Privacy Policy - Cadio",
    cookies: "Cookie Policy - Cadio",
    contact: "Contact Cadio",
  };
  const path = page ? pathname.replace(/\/+$/, "") : "/";
  const canonical = `${CANONICAL_DOMAIN}${path === "/" ? "/" : path}`;
  document.title = page ? titleByPage[page] : showBuilder ? "Cadio Workspace - AI CAD for 3D Printing" : DEFAULT_TITLE;
  setOrCreateMeta("meta[name='description']", () => {
    const meta = document.createElement("meta");
    meta.name = "description";
    return meta;
  }, DEFAULT_DESCRIPTION);
  setOrCreateMeta("link[rel='canonical']", () => {
    const link = document.createElement("link");
    link.rel = "canonical";
    return link;
  }, canonical);
  setOrCreateMeta("meta[property='og:url']", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", "og:url");
    return meta;
  }, canonical);
}

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
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-cadio-bg/40 backdrop-blur-md">
      <div className="relative flex h-64 w-64 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-cadio-accent/20 bg-[radial-gradient(circle,rgba(59,130,246,0.15),transparent_70%)]" />
        <div className="absolute inset-4 animate-spin rounded-full border border-dashed border-cadio-accent/40 shadow-[0_0_40px_rgba(59,130,246,0.1)]" />
        <div
          className="absolute inset-12 rounded-[32px] border border-white/10 bg-white/5"
          style={{ animation: "spin 3s linear infinite reverse" }}
        />
        <div className="absolute h-28 w-28 rotate-45 animate-pulse rounded-2xl border border-cadio-accent bg-cadio-accent/5 shadow-[0_0_50px_rgba(59,130,246,0.3)]" />
        
        <div className="absolute -bottom-12 flex flex-col items-center gap-3">
          <div className="px-6 py-2.5 rounded-full border border-cadio-border/50 bg-cadio-surface/90 shadow-2xl backdrop-blur-xl">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white animate-pulse">
              {status || "Engineering Geometry..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceApp({ onHome }: { onHome: () => void }) {
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
    startBlankCreation,
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
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(260);
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(360);
  const [parametersPanelWidth, setParametersPanelWidth] = useState(320);
  const desktopLayoutRef = useRef<HTMLDivElement>(null);

  const handleMobileExampleSelect = async (example: ExampleObject) => {
    await runPrompt(example.prompt);
  };

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  useEffect(() => {
    const openExport = () => setExportOpen(true);
    window.addEventListener("cadio-open-export", openExport);
    return () => window.removeEventListener("cadio-open-export", openExport);
  }, []);

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
  const selectedCount = selectedObjectIds.length || (selectedObjectId ? 1 : 0);
  const modelBusy = isBusy || isModelBusyStatus(status);
  const workspaceTrackWidth = workspacePanelOpen ? workspacePanelWidth : 56;
  const assistantTrackWidth = assistantPanelOpen ? assistantPanelWidth : 56;
  const parametersTrackWidth = parametersPanelOpen ? parametersPanelWidth : 56;
  const desktopGridColumns = `${workspaceTrackWidth}px 4px ${assistantTrackWidth}px 4px minmax(0,1fr) 4px ${parametersTrackWidth}px`;
  
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
        setWorkspacePanelWidth(clamp(moveEvent.clientX - rect.left, 80, 400));
      } else if (panel === "assistant") {
        const leftWidth = workspacePanelOpen ? workspacePanelWidth : 56;
        setAssistantPanelWidth(clamp(moveEvent.clientX - rect.left - leftWidth - 4, 80, 480));
      } else {
        setParametersPanelWidth(clamp(rect.right - moveEvent.clientX, 80, 440));
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
    <div className="w-full h-[100dvh] relative bg-cadio-bg text-cadio-text font-sans overflow-hidden">
      {/* Desktop layout */}
      <div
        ref={desktopLayoutRef}
        className="hidden h-full w-full md:grid"
        style={{ gridTemplateColumns: desktopGridColumns }}
      >
        {/* Workspace Panel */}
        <aside className={`flex min-h-0 flex-col border-r border-cadio-border/50 bg-cadio-surface transition-all ${workspacePanelOpen ? "px-5 py-6" : "items-center px-2 py-6"}`}>
          {workspacePanelOpen ? (
            <>
          <div className="mb-8 flex items-center justify-between">
            <CadioLogo subtitle="" onClick={onHome} />
            <button
              onClick={() => setWorkspacePanelOpen(false)}
              className="p-1.5 rounded-md hover:bg-cadio-border/50 text-cadio-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>
          </div>
          
          <div className="space-y-2 mb-8">
            <button
              onClick={startBlankCreation}
              className="w-full flex h-11 items-center gap-3 rounded-lg border border-cadio-border bg-cadio-bg/50 px-4 text-xs font-bold text-white transition-all hover:bg-cadio-bg hover:border-cadio-accent/50 group"
            >
              <svg className="w-4 h-4 text-cadio-accent group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
              New Workspace
            </button>
            <button
              onClick={() => setShowMeasurements((v) => !value)}
              className={`w-full flex h-11 items-center gap-3 rounded-lg border px-4 text-xs font-bold transition-all ${
                showMeasurements
                  ? "border-cadio-accent bg-cadio-accent/10 text-cadio-accent shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                  : "border-cadio-border bg-cadio-bg/50 text-cadio-muted hover:bg-cadio-bg hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
              Precision Measure
            </button>
          </div>

          <div className="mb-8">
            <div className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted mb-4 px-1">Editor Mode</div>
            <div className="flex p-1 gap-1 rounded-xl bg-cadio-bg/80 border border-cadio-border/50">
              <button
                onClick={() => setExpertMode(false)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  !expertMode ? "bg-white text-cadio-bg shadow-sm" : "text-cadio-muted hover:text-white"
                }`}
              >
                Easy
              </button>
              <button
                onClick={() => setExpertMode(true)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  expertMode ? "bg-cadio-accent text-white shadow-lg shadow-cadio-accent/20" : "text-cadio-muted hover:text-white"
                }`}
              >
                Expert
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-6 scrollbar-none">
            {expertMode && (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                <section>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted mb-3 px-1">Active Selection</div>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-cadio-border/50 bg-cadio-bg/50 p-1">
                    {SELECTION_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setSelectionMode(mode.id)}
                        className={`py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${
                          selectionMode === mode.id ? "bg-cadio-surface text-white shadow-sm border border-cadio-border" : "text-cadio-muted hover:text-white"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </section>
                
                <section>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted mb-3 px-1">Transform Mode</div>
                  <div className="grid grid-cols-4 gap-1 rounded-lg border border-cadio-border/50 bg-cadio-bg/50 p-1">
                    {TRANSFORM_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setTransformMode(mode.id)}
                        className={`py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${
                          transformMode === mode.id ? "bg-cadio-accent text-white" : "text-cadio-muted hover:text-white"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </section>
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
          </div>

          <div className="mt-8 pt-6 border-t border-cadio-border/30">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-cadio-muted px-1 mb-4">
              <span>Selection</span>
              <span>{selectedCount} Active</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={selectAllObjects} className="h-9 rounded-lg border border-cadio-border bg-cadio-bg/50 text-[10px] font-bold text-white hover:bg-cadio-bg transition-colors">Select All</button>
              <button onClick={() => void onDeleteObject()} disabled={!selectedObjectId} className="h-9 rounded-lg border border-red-500/20 bg-red-500/5 text-[10px] font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-20 transition-colors">Delete</button>
            </div>
          </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center gap-4">
              <button onClick={onHome} className="h-10 w-10 flex items-center justify-center rounded-xl bg-cadio-accent text-white shadow-lg shadow-cadio-accent/20">C</button>
              <div className="w-full h-px bg-cadio-border/50" />
              <button onClick={() => setWorkspacePanelOpen(true)} className="p-2.5 rounded-lg hover:bg-cadio-border/50 text-cadio-muted transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          )}
        </aside>
        
        {/* Resize Handle */}
        <div
          className="group relative z-20 cursor-col-resize bg-cadio-bg transition-all hover:bg-cadio-accent/20"
          onMouseDown={(event) => startPanelResize("workspace", event)}
        >
          <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cadio-border group-hover:bg-cadio-accent transition-colors" />
        </div>

        {/* AI Assistant Panel */}
        <section className={`${assistantPanelOpen ? "grid grid-rows-[64px_1fr]" : "flex items-start justify-center px-2 py-6"} min-h-0 border-r border-cadio-border/50 bg-cadio-surface transition-all`}>
          {assistantPanelOpen ? (
            <>
          <header className="flex items-center justify-between px-6 border-b border-cadio-border/30">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setAssistantPanelOpen(false)}
                className="p-1.5 rounded-md hover:bg-cadio-border/50 text-cadio-muted transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white tracking-tight">{projectTitle}</div>
                <div className="text-[10px] font-medium text-cadio-muted">{objects.length} components generated</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setShareOpen(true)} className="text-[11px] font-bold text-cadio-muted hover:text-white transition-colors uppercase tracking-widest">Share</button>
              <button onClick={() => setExportOpen(true)} className="px-4 py-1.5 rounded-lg bg-white text-cadio-bg text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]">Export</button>
            </div>
          </header>
          <div className="min-h-0 overflow-y-auto">
            <AiPanel />
          </div>
            </>
          ) : (
            <button
              onClick={() => setAssistantPanelOpen(true)}
              className="p-2.5 rounded-lg border border-cadio-border bg-cadio-surface text-[10px] font-bold text-cadio-muted transition-all hover:border-cadio-accent hover:text-white"
            >
              AI
            </button>
          )}
        </section>
        
        <div
          className="group relative z-20 cursor-col-resize bg-cadio-bg transition-all hover:bg-cadio-accent/20"
          onMouseDown={(event) => startPanelResize("assistant", event)}
        >
          <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cadio-border group-hover:bg-cadio-accent transition-colors" />
        </div>

        {/* Viewport View */}
        <main className="relative min-h-0 overflow-hidden bg-cadio-bg">
          {/* Viewport Overlays */}
          <div className="absolute right-6 top-6 z-10 flex items-center gap-3">
             <div className="px-4 py-2 rounded-xl border border-cadio-border/50 bg-cadio-surface/80 backdrop-blur-xl shadow-2xl flex items-center gap-3">
               <div className="flex flex-col">
                 <span className="text-[9px] font-black text-cadio-muted uppercase tracking-tighter leading-none mb-1">Active Printer</span>
                 <span className="text-xs font-bold text-white leading-none">{printerProfile?.name ?? "Standard"}</span>
               </div>
               <div className="h-4 w-px bg-cadio-border" />
               <span className="text-[10px] font-black text-cadio-accent uppercase tracking-widest animate-pulse">{status || "Ready"}</span>
             </div>
          </div>
          
          <div className="absolute left-6 top-6 z-10 rounded-xl border border-cadio-border/50 bg-cadio-surface/80 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-xl shadow-2xl">
            {expertMode ? "Manual CAD Mode" : "AI Assisted Design"}
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
            onApplyExpertOperation={(op, amount, objectId, target) => void applyExpertOperation(op, amount, objectId, target)}
            onCreatePrimitive={(payload) => void createPrimitive(payload)}
            showMeasurements={showMeasurements}
          />
          {modelBusy && <ModelLoadingOverlay status={status} />}
        </main>

        <div
          className="group relative z-20 cursor-col-resize bg-cadio-bg transition-all hover:bg-cadio-accent/20"
          onMouseDown={(event) => startPanelResize("parameters", event)}
        >
          <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cadio-border group-hover:bg-cadio-accent transition-colors" />
        </div>

        {/* Inspector Panel */}
        <aside className={`${parametersPanelOpen ? "relative" : "flex items-start justify-center px-2 py-6"} min-h-0 overflow-hidden bg-cadio-surface transition-all`}>
          {parametersPanelOpen ? (
            <>
              <button
                onClick={() => setParametersPanelOpen(false)}
                className="absolute left-3 top-3 z-30 p-1.5 rounded-md hover:bg-cadio-border/50 text-cadio-muted transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>
              <ObjectInspector />
            </>
          ) : (
            <button
              onClick={() => setParametersPanelOpen(true)}
              className="p-2.5 rounded-lg border border-cadio-border bg-cadio-surface text-[10px] font-bold text-cadio-muted transition-all hover:border-cadio-accent hover:text-white"
            >
              PROPS
            </button>
          )}
        </aside>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden flex h-[100dvh] w-full flex-col bg-cadio-bg overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-cadio-border/50 bg-cadio-surface/95 px-4 py-3 backdrop-blur-xl">
          <button type="button" onClick={onHome} className="flex items-center gap-3 min-w-0 text-left group">
            <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-cadio-accent text-white shadow-lg shadow-cadio-accent/20">C</div>
            <div className="min-w-0">
              <span className="block text-[10px] font-black tracking-widest text-cadio-muted uppercase leading-none mb-1">Cadio</span>
              <span className="block truncate text-xs font-bold text-white leading-none">{projectTitle}</span>
            </div>
          </button>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setMobileExportOpen(true)}
              className="px-4 py-2 rounded-lg bg-white text-cadio-bg text-[10px] font-black uppercase tracking-wider shadow-lg"
            >
              Export
            </button>
            <button
              onClick={() => setMobileEditOpen(true)}
              className="p-2 rounded-lg border border-cadio-border bg-cadio-surface text-cadio-muted"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </button>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="flex gap-2 overflow-x-auto border-b border-cadio-border/30 bg-cadio-bg/95 px-4 py-2.5 scrollbar-none">
          {TRANSFORM_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setTransformMode(mode.id)}
              className={`shrink-0 h-9 rounded-lg px-4 text-[10px] font-bold uppercase tracking-wider transition-all ${
                transformMode === mode.id ? "bg-cadio-accent text-white shadow-lg shadow-cadio-accent/20" : "bg-cadio-surface border border-cadio-border text-cadio-muted"
              }`}
            >
              {mode.label}
            </button>
          ))}
          <div className="w-px bg-cadio-border/50 mx-1" />
          <button
            onClick={() => setShowMeasurements((v) => !v)}
            className={`shrink-0 h-9 rounded-lg px-4 text-[10px] font-bold uppercase tracking-wider transition-all ${
              showMeasurements ? "bg-white text-cadio-bg" : "bg-cadio-surface border border-cadio-border text-cadio-muted"
            }`}
          >
            Measure
          </button>
        </div>

        {/* Viewport */}
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
        <div className="border-t border-cadio-border/50 bg-cadio-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl">
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
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const syncLocation = () => {
      setShowBuilder(window.location.hash.startsWith("#builder"));
      setPathname(window.location.pathname);
    };
    const syncFromHash = syncLocation;
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  useEffect(() => {
    updatePageMetadata(pathname, showBuilder);
    trackPageView(window.location.pathname + window.location.hash);
  }, [pathname, showBuilder]);

  const startBuilding = () => {
    if (window.location.pathname !== "/" || window.location.hash !== "#builder") {
      window.history.pushState(null, "", "/#builder");
    }
    setPathname("/");
    setShowBuilder(true);
  };

  const goHome = () => {
    if (window.location.pathname !== "/" || window.location.hash) {
      window.history.pushState(null, "", "/");
    }
    setPathname("/");
    setShowBuilder(false);
  };

  const staticPage = staticPageFromPath(pathname);
  if (staticPage && !showBuilder) {
    return <LegalPage page={staticPage} onStartBuilding={startBuilding} />;
  }

  return (
    <>
      {showBuilder ? <WorkspaceApp onHome={goHome} /> : <LandingPage onStartBuilding={startBuilding} />}
    </>
  );
}
