/** Cadio App shell - Shapr3D-inspired layout with mobile support. */

import { useEffect, useState } from "react";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel from "./components/AiPanel";
import ObjectInspector from "./components/ObjectInspector";
import ExampleBrowser from "./components/ExampleBrowser";
import LandingPage from "./components/LandingPage";
import { CadioMark } from "./components/CadioLogo";
import LegalPage from "./components/LegalPage";
import ScalePercentInput from "./components/ScalePercentInput";
import ExportFlowDialog, { ExportFlowContent } from "./components/ExportFlow";
import UpgradeDialog from "./components/UpgradeDialog";
import SavedModelsPanel from "./components/SavedModelsPanel";
import ShareProjectDialog from "./components/ShareProjectDialog";
import SiteFooter from "./components/SiteFooter";
import type { ExampleObject } from "./components/ExampleBrowser";
import type { MaterialProfile, SelectionMode, TransformMode } from "./utils/types";
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
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-cadio-bg border-t border-cadio-border rounded-t-2xl transition-transform duration-300 ${
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
  onRequestUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onRequestUpgrade?: () => void;
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
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-cadio-border bg-cadio-bg transition-transform duration-300 md:hidden ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "70dvh", overflowY: "auto" }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-cadio-border" />
        </div>
        <div className="px-5 pb-8">
          <ExportFlowContent onClose={onClose} onRequestUpgrade={onRequestUpgrade} />
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
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-cadio-bg border-t border-cadio-border rounded-t-2xl transition-transform duration-300 ${
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
                className="h-10 rounded-lg border border-cadio-border bg-cadio-surface px-3 text-sm text-cadio-text outline-none"
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
                className="h-10 w-full rounded-lg border border-cadio-border bg-cadio-surface p-1"
              />
            </label>
          </div>

          {printSettings && (
            <div className="rounded-xl border border-cadio-border bg-cadio-surface p-3 text-xs text-cadio-text shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold uppercase tracking-tight text-cadio-muted">Print Setup</span>
                <span className="text-cadio-accent font-black">{printSettings.scale.recommended_scale_percent.toFixed(1)}%</span>
              </div>
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-cadio-bg/50 p-2 border border-cadio-border/30">
                <div>
                  <div className="text-cadio-muted font-bold">Scaling</div>
                </div>
                <ScalePercentInput
                  value={modelScalePercent}
                  onCommit={(percent) => void setSelectedScalePercent(percent)}
                  className="w-24 h-7"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-cadio-muted font-medium">
                <span>Layer {printSettings.slicer.layer_height_mm} mm</span>
                <span>Infill {printSettings.slicer.infill_percent}%</span>
              </div>
            </div>
          )}

          {/* Parameters */}
          {Object.entries(obj.parameters).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold uppercase tracking-tight text-cadio-muted truncate max-w-[70%]">
                  {key.replace(/_/g, " ")}
                </label>
                <span className="text-[10px] font-black text-cadio-accent">{Number(value).toFixed(1)}</span>
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
                className="w-full accent-cadio-accent h-1.5 bg-cadio-border rounded-full appearance-none cursor-pointer"
              />
            </div>
          ))}

          {/* Features */}
          <div className="border-t border-cadio-border pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted mb-3">Feature Tree</p>
            <div className="grid grid-cols-2 gap-2">
              {obj.feature_tree.map((f) => (
                <button
                  key={f.id}
                  onClick={() => void onToggleFeature(f.id, !f.enabled)}
                  className={`py-2 px-3 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    f.enabled
                      ? "bg-cadio-accent text-white shadow-lg shadow-cadio-accent/20"
                      : "bg-cadio-surface border border-cadio-border text-cadio-muted"
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
    <div className="border-t border-cadio-border/50 bg-cadio-surface/95 px-4 py-3 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-cadio-muted">Model variations</span>
        <span className="max-w-[50%] truncate text-[9px] font-bold text-cadio-accent uppercase tracking-wider">{status}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => void switchModel("previous")}
          disabled={loading}
          className="h-11 rounded-xl border border-cadio-border bg-cadio-bg/50 px-4 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-30"
        >
          {loadingDirection === "previous" ? "..." : "Previous"}
        </button>
        <button
          onClick={() => void switchModel("next")}
          disabled={loading}
          className="h-11 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-widest text-cadio-bg transition-all active:scale-95 shadow-lg disabled:opacity-30"
        >
          {loadingDirection === "next" ? "..." : "Next model"}
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
    <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-12 bg-cadio-bg/30 backdrop-blur-[2px]">
      <div className="flex items-center gap-3 rounded-xl border border-cadio-border/50 bg-cadio-surface/90 px-5 py-3 shadow-2xl backdrop-blur-xl">
        <svg className="h-4 w-4 animate-spin text-cadio-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-medium text-white">{status || "Generating geometry…"}</span>
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
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

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

  return (
    <div className="w-full h-[100dvh] relative bg-cadio-bg text-cadio-text font-sans overflow-hidden">
      {/* ── Desktop layout — fullscreen viewport with floating overlays ── */}
      <div className="hidden md:block relative h-full w-full bg-cadio-bg">

        {/* Viewport — fills entire space */}
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

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-5 pointer-events-none">
          {/* Logo + home */}
          <button onClick={onHome} className="pointer-events-auto flex items-center gap-2 rounded-xl bg-cadio-surface/80 border border-cadio-border/50 px-3 py-2 backdrop-blur-sm hover:border-cadio-accent/40 transition-colors">
            <span className="text-cadio-accent flex-shrink-0"><CadioMark size={22} /></span>
            <span className="h-4 w-px bg-cadio-border/60" />
            <span className="text-sm font-medium text-cadio-text max-w-[160px] truncate">{projectTitle}</span>
          </button>

          {/* Status pill — center */}
          {(isBusy || status) && (
            <div className="pointer-events-none flex items-center gap-2 rounded-full border border-cadio-border/50 bg-cadio-surface/80 px-4 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cadio-accent" />
              <span className="text-xs text-cadio-muted">{status || "Working…"}</span>
            </div>
          )}

          {/* Printer + Export */}
          <div className="pointer-events-auto flex items-center gap-3">
            <span className="text-xs text-cadio-muted">{printerProfile?.name ?? "Standard"}</span>
            <button onClick={() => setShareOpen(true)} className="text-xs font-medium text-cadio-muted hover:text-cadio-text transition-colors">Share</button>
            <button onClick={() => setExportOpen(true)} className="h-8 rounded-lg bg-cadio-accent px-4 text-xs font-bold text-cadio-bg hover:bg-cadio-accent-hover transition-colors">Export</button>
          </div>
        </div>

        {/* Left icon strip */}
        <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 flex flex-col gap-2">
          {[
            { icon: "M12 4v16m8-8H4", label: "New", action: startBlankCreation },
            { icon: "M4 6h16M4 12h16M4 18h7", label: "Projects", action: () => setLeftDrawerOpen(v => !v) },
            { icon: expertMode ? "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v10m0 0H5m4 0h10m0 0v6a2 2 0 01-2 2H9m10-8v6" : "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", label: expertMode ? "Expert" : "Easy", action: () => setExpertMode(!expertMode) },
            { icon: "M3 6l3 1m0 0l-3 9a5 5 0 006 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5 5 0 006 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3", label: "Measure", action: () => setShowMeasurements(v => !v) },
          ].map(({ icon, label, action }) => (
            <button key={label} onClick={action} title={label}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-cadio-border/50 bg-cadio-surface/80 text-cadio-muted backdrop-blur-sm transition-all hover:border-cadio-accent/40 hover:text-cadio-text">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={icon} /></svg>
            </button>
          ))}
        </div>

        {/* Right inspector toggle */}
        <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2">
          <button onClick={() => setRightDrawerOpen(v => !v)} title="Inspector"
            className={`flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-sm transition-all ${rightDrawerOpen ? "border-cadio-accent/50 bg-cadio-accent/10 text-cadio-accent" : "border-cadio-border/50 bg-cadio-surface/80 text-cadio-muted hover:border-cadio-accent/40 hover:text-cadio-text"}`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </button>
        </div>

        {/* Bottom AI bar */}
        <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-6">
          <div className="w-full max-w-2xl rounded-2xl border border-cadio-border/60 bg-cadio-surface/90 shadow-2xl backdrop-blur-xl">
            <AiPanel floating />
          </div>
        </div>

        {/* Left drawer */}
        <div className={`absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-cadio-border/50 bg-cadio-surface/95 backdrop-blur-xl transition-transform duration-300 ${leftDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-14 items-center justify-between border-b border-cadio-border/30 px-5">
            <p className="text-sm font-semibold text-cadio-text">Workspace</p>
            <button onClick={() => setLeftDrawerOpen(false)} className="rounded-md p-1.5 text-cadio-muted hover:text-cadio-text">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Mode toggle */}
          <div className="border-b border-cadio-border/30 px-4 py-3">
            <div className="flex rounded-lg border border-cadio-border/40 bg-cadio-bg/60 p-0.5">
              <button onClick={() => setExpertMode(false)} className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all ${!expertMode ? "bg-cadio-surface text-cadio-text shadow-sm" : "text-cadio-muted hover:text-cadio-text"}`}>Easy</button>
              <button onClick={() => setExpertMode(true)} className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all ${expertMode ? "bg-cadio-accent text-cadio-bg" : "text-cadio-muted hover:text-cadio-text"}`}>Expert</button>
            </div>
          </div>

          {/* Expert tools */}
          {expertMode && (
            <div className="border-b border-cadio-border/30 px-4 py-3 space-y-3">
              <div>
                <p className="mb-2 text-[11px] font-semibold text-cadio-muted">Select</p>
                <div className="flex gap-1">
                  {SELECTION_MODES.map(m => (
                    <button key={m.id} onClick={() => setSelectionMode(m.id)}
                      className={`flex-1 rounded-md py-2 text-[11px] font-medium transition-all ${selectionMode === m.id ? "bg-cadio-surface border border-cadio-border text-cadio-text" : "text-cadio-muted hover:text-cadio-text"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold text-cadio-muted">Transform</p>
                <div className="flex gap-1">
                  {TRANSFORM_MODES.map(m => (
                    <button key={m.id} onClick={() => setTransformMode(m.id)}
                      className={`flex-1 rounded-md py-2 text-[11px] font-medium transition-all ${transformMode === m.id ? "bg-cadio-accent text-cadio-bg" : "text-cadio-muted hover:text-cadio-text"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Saved models */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none px-4 py-3">
            <SavedModelsPanel title={projectTitle} prompt={latestPrompt} sessionId={sessionId} printer={printer} objects={objects} onOpenPrompt={p => void runPrompt(p)} />
          </div>

          {/* Selection */}
          <div className="border-t border-cadio-border/30 px-4 py-3">
            {selectedCount > 0 && <p className="mb-2 text-[11px] text-cadio-muted">{selectedCount} selected</p>}
            <div className="flex gap-2">
              <button onClick={selectAllObjects} className="flex-1 h-8 rounded-lg border border-cadio-border/50 text-xs text-cadio-muted hover:text-cadio-text transition-colors">Select all</button>
              <button onClick={() => void onDeleteObject()} disabled={!selectedObjectId} className="flex-1 h-8 rounded-lg border border-red-500/20 text-xs text-red-400/70 hover:border-red-500/40 hover:text-red-400 disabled:opacity-25 transition-colors">Delete</button>
            </div>
          </div>
        </div>

        {/* Right drawer — ObjectInspector */}
        <div className={`absolute inset-y-0 right-0 z-30 w-80 border-l border-cadio-border/50 bg-cadio-surface/95 backdrop-blur-xl transition-transform duration-300 ${rightDrawerOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex h-14 items-center justify-between border-b border-cadio-border/30 px-5">
            <p className="text-sm font-semibold text-cadio-text">Inspector</p>
            <button onClick={() => setRightDrawerOpen(false)} className="rounded-md p-1.5 text-cadio-muted hover:text-cadio-text">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="h-full overflow-y-auto pb-14 scrollbar-none">
            <ObjectInspector />
          </div>
        </div>

        {/* Backdrop for drawers */}
        {(leftDrawerOpen || rightDrawerOpen) && (
          <div className="absolute inset-0 z-[25] bg-black/20" onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }} />
        )}
      </div>

      {/* Mobile layout */}
      <div className="md:hidden flex h-[100dvh] w-full flex-col bg-cadio-bg overflow-hidden">
        {/* Top bar */}
        <div className="flex h-14 items-center justify-between border-b border-cadio-border/30 bg-cadio-surface/90 px-4 backdrop-blur-xl">
          <button type="button" onClick={onHome} className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cadio-accent text-sm font-bold text-white">C</div>
            <span className="truncate text-sm font-semibold text-white">{projectTitle}</span>
          </button>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setMobileExportOpen(true)} className="h-8 rounded-lg bg-white px-4 text-xs font-bold text-cadio-bg">Export</button>
            <button onClick={() => setMobileEditOpen(true)} className="rounded-lg border border-cadio-border/50 p-2 text-cadio-muted transition-colors hover:text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </button>
          </div>
        </div>

        {/* Quick toolbar */}
        <div className="flex gap-2 overflow-x-auto border-b border-cadio-border/30 bg-cadio-bg/90 px-4 py-2 scrollbar-none">
          {TRANSFORM_MODES.map((mode) => (
            <button key={mode.id} onClick={() => setTransformMode(mode.id)}
              className={`h-8 shrink-0 rounded-lg px-3 text-xs font-medium transition-all ${transformMode === mode.id ? "bg-cadio-accent text-white" : "border border-cadio-border/50 bg-cadio-surface text-cadio-muted hover:text-white"}`}>
              {mode.label}
            </button>
          ))}
          <div className="mx-1 w-px bg-cadio-border/40" />
          <button onClick={() => setShowMeasurements((v) => !v)}
            className={`h-8 shrink-0 rounded-lg px-3 text-xs font-medium transition-all ${showMeasurements ? "bg-white text-cadio-bg" : "border border-cadio-border/50 bg-cadio-surface text-cadio-muted hover:text-white"}`}>
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
        onRequestUpgrade={() => { setMobileExportOpen(false); setUpgradeOpen(true); }}
      />

      {/* Mobile edit sheet */}
      <MobileEditSheet
        open={mobileEditOpen}
        onClose={() => setMobileEditOpen(false)}
      />

      <ExportFlowDialog open={exportOpen} onClose={() => setExportOpen(false)} onRequestUpgrade={() => { setExportOpen(false); setUpgradeOpen(true); }} />
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
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
        ? "border-cadio-accent/70 bg-cadio-accent/10 shadow-[0_0_28px_rgba(59,130,246,0.24)]"
        : "border-transparent"
    }`}>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void handleSend()}
        placeholder="Ask AI to change the model..."
        className="min-h-11 flex-1 rounded-xl border border-cadio-border bg-cadio-surface px-3 py-2 text-base text-cadio-text placeholder:text-cadio-muted focus:border-cadio-accent focus:outline-none"
      />
      <button
        onClick={() => void handleSend()}
        disabled={busy || !prompt.trim()}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cadio-accent text-base font-black text-white shadow-lg disabled:opacity-40"
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
      <div className="w-full max-w-sm rounded-2xl border border-cadio-border/50 bg-cadio-surface p-6 text-white shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Authentication Required</h2>
            <p className="mt-1 text-xs font-medium text-cadio-muted">
              Sign in to export and download your models.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-cadio-border/50 text-cadio-muted"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onAuthenticated();
          }}
        >
          <input
            type="email"
            placeholder="Email address"
            className="h-11 w-full rounded-lg border border-cadio-border bg-cadio-bg px-3 text-sm text-white outline-none focus:border-cadio-accent"
          />
          <input
            type="password"
            placeholder="Password"
            className="h-11 w-full rounded-lg border border-cadio-border bg-cadio-bg px-3 text-sm text-white outline-none focus:border-cadio-accent"
          />
          <button className="h-11 w-full rounded-lg bg-white font-bold text-cadio-bg hover:bg-cadio-text transition-all">
            Continue to Download
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
    return <LegalPage page={staticPage} onStartBuilding={startBuilding} onNavigate={(p) => { window.history.pushState({}, "", `/${p}`); setPathname(`/${p}`); }} />;
  }

  return (
    <>
      {showBuilder ? <WorkspaceApp onHome={goHome} /> : <LandingPage onStartBuilding={startBuilding} />}
    </>
  );
}
