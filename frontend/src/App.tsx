/** Cadio App shell - Shapr3D-inspired layout with mobile support. */

import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { loginCadioAccount, loginWithGoogle } from "./utils/auth";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel, { SourceInfoModal, SourceFilesModal } from "./components/AiPanel";
import ErrorBoundary from "./components/ErrorBoundary";
import ObjectInspector from "./components/ObjectInspector";
import ExampleBrowser from "./components/ExampleBrowser";
import LandingPage from "./components/LandingPage";
import { CadioMark } from "./components/CadioLogo";
import LegalPage from "./components/LegalPage";
import ScalePercentInput from "./components/ScalePercentInput";
import ExportFlowDialog, { ExportFlowContent } from "./components/ExportFlow";
import UpgradeDialog from "./components/UpgradeDialog";
import ProfilePanel, { ProfileAvatar } from "./components/ProfilePanel";
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

// Wayfinding examples for the empty builder — concrete, printable starting
// points so users aren't faced with a blank prompt (AI-wayfinders skill).
const EMPTY_STATE_EXAMPLES: Array<{ label: string; prompt: string; icon: string }> = [
  { label: "Phone stand", prompt: "phone stand", icon: "M7 4h10a1 1 0 011 1v14a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1zm5 13h.01" },
  { label: "Headset stand", prompt: "headset stand", icon: "M4 14v-3a8 8 0 0116 0v3m0 0a2 2 0 01-2 2h-1v-5h1a2 2 0 012 2zm-16 0a2 2 0 002 2h1v-5H6a2 2 0 00-2 2z" },
  { label: "Wall tool holder", prompt: "wall mounted tool holder", icon: "M4 6h16M4 12h16M4 18h10" },
  { label: "Cable organizer", prompt: "cable organizer clip", icon: "M8 7a4 4 0 108 0M8 7v6a4 4 0 008 0V7" },
  { label: "Desk pen holder", prompt: "desk pen holder", icon: "M5 8h14l-1 12H6L5 8zm2-3h10v3H7V5z" },
  { label: "Pegboard hook", prompt: "pegboard hook", icon: "M6 4v10a4 4 0 008 0M6 4H4m2 0h2" },
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
  const { objects, selectedObjectId, materials, printSettings, patchParam, patchAppearance, setSelectedScalePercent, onToggleFeature, printer, printers, setPrinter, onDeleteObject } = useCadStore();
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

          {Object.keys(printers).length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-cadio-muted">Printer</span>
              <select
                value={printer}
                onChange={(e) => void setPrinter(e.target.value)}
                className="h-10 rounded-lg border border-cadio-border bg-cadio-surface px-3 text-sm text-cadio-text outline-none"
              >
                {Object.entries(printers).map(([key, p]) => (
                  <option value={key} key={key}>{p.name}</option>
                ))}
              </select>
            </label>
          )}

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
          {obj.feature_tree.length > 0 && (
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
          )}

          {/* Delete */}
          <div className="border-t border-cadio-border pt-4 pb-2">
            <button
              onClick={() => { void onDeleteObject(); onClose(); }}
              className="w-full h-10 rounded-xl border border-red-500/30 text-sm font-semibold text-red-400 hover:border-red-500/60 hover:bg-red-500/10 transition-all"
            >
              Delete model
            </button>
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

function DesktopModelVariantBar() {
  const { objects, switchSourceModel } = useCadStore();
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
    <div className="pointer-events-auto absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-cadio-border/50 bg-cadio-surface/85 px-1.5 py-1.5 shadow-xl backdrop-blur-md">
      <button
        onClick={() => void switchModel("previous")}
        disabled={loading}
        title="Previous model variation"
        className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-cadio-muted transition-all hover:bg-cadio-border/40 hover:text-white disabled:opacity-40"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        {loadingDirection === "previous" ? "…" : "Previous"}
      </button>
      <span className="select-none text-[9px] font-black uppercase tracking-widest text-cadio-muted/70">Variations</span>
      <button
        onClick={() => void switchModel("next")}
        disabled={loading}
        title="Next model variation"
        className="flex h-8 items-center gap-1.5 rounded-full bg-cadio-accent px-3 text-xs font-bold text-cadio-bg transition-all hover:bg-cadio-accent-hover disabled:opacity-40"
      >
        {loadingDirection === "next" ? "…" : "Next model"}
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
      </button>
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

function WorkspaceApp({ onHome, initialPrompt, onInitialPromptConsumed }: { onHome: () => void; initialPrompt?: string | null; onInitialPromptConsumed?: () => void }) {
  const {
    sessionId,
    objects,
    selectedObjectId,
    selectedObjectIds,
    transformMode,
    bounds,
    printers,
    printer,
    printSettings,
    scaleAllToFit,
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
    sourceInfo,
    sourceFiles,
    selectSourceFile,
    importLocalFile,
    notice,
    setNotice,
  } = useCadStore();

  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [showMobileSourceInfo, setShowMobileSourceInfo] = useState(false);
  const [showDesktopSourceInfo, setShowDesktopSourceInfo] = useState(false);
  const [showSourceFiles, setShowSourceFiles] = useState(false);
  const [pulseFiles, setPulseFiles] = useState(false);
  const [emptyDismissed, setEmptyDismissed] = useState(false);
  const sourceFilesSig = useRef("");
  const [mobileExamplesOpen, setMobileExamplesOpen] = useState(false);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [demoLabel, setDemoLabel] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleMobileExampleSelect = async (example: ExampleObject) => {
    await runPrompt(example.prompt);
  };

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  // Re-show the empty-state welcome whenever the plate becomes occupied again
  // (so dismissing it once doesn't hide it forever for the next new model).
  useEffect(() => {
    if (objects.length > 0) setEmptyDismissed(false);
    else setDemoLabel(null); // cleared plate (New/Home) — no longer a demo
  }, [objects.length]);

  // "See demo" from the landing page lands here with a prompt to auto-generate
  // so the visitor immediately sees a real model instead of a blank plate.
  // We tag it with a "Demo: <name>" badge, cleared as soon as the user makes
  // their own model.
  const demoRanRef = useRef(false);
  useEffect(() => {
    if (initialPrompt && !demoRanRef.current) {
      demoRanRef.current = true;
      const label = initialPrompt.replace(/\b\w/g, (c) => c.toUpperCase());
      setDemoLabel(label);
      void runPrompt(initialPrompt);
      onInitialPromptConsumed?.();
    }
  }, [initialPrompt, runPrompt, onInitialPromptConsumed]);

  // Drop the demo badge the moment the user generates something of their own.
  useEffect(() => {
    const clear = () => setDemoLabel(null);
    window.addEventListener("cadio-user-prompt", clear);
    return () => window.removeEventListener("cadio-user-prompt", clear);
  }, []);

  // When a NEW multi-file model is imported, pulse the "files to choose" button
  // to draw attention instead of popping a big modal in the user's face.
  useEffect(() => {
    const ids = sourceFiles.filter((f) => f.id !== "__all__").map((f) => f.id).sort().join(",");
    const multi = sourceFiles.filter((f) => f.id !== "__all__").length > 1;
    if (ids && ids !== sourceFilesSig.current && multi) {
      setPulseFiles(true);
      const t = setTimeout(() => setPulseFiles(false), 6000);
      sourceFilesSig.current = ids;
      return () => clearTimeout(t);
    }
    sourceFilesSig.current = ids;
  }, [sourceFiles]);

  useEffect(() => {
    const openExport = () => setExportOpen(true);
    window.addEventListener("cadio-open-export", openExport);
    return () => window.removeEventListener("cadio-open-export", openExport);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!selectedObjectId) return;
      void onDeleteObject();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedObjectId, onDeleteObject]);

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
  // Prefer the imported model's real name (e.g. "Headset Stand") over the last
  // (often technical) prompt like "select-source-file".
  const projectTitle = sourceInfo[0]?.title?.trim() || creationName(latestPrompt);
  const printerDims = printer !== "choose_printer" && printers[printer]?.build_volume
    ? `${printers[printer].build_volume[0]} × ${printers[printer].build_volume[1]} × ${printers[printer].build_volume[2]} mm`
    : "";
  const selectedCount = selectedObjectIds.length || (selectedObjectId ? 1 : 0);
  const modelBusy = isBusy || isModelBusyStatus(status);

  // Per-printer "model too big" warning (backend computes the fit scale).
  const fitInfo = printSettings?.scale;
  const tooBig = !!(objects.length && fitInfo && !fitInfo.fits_without_scaling);
  const fitPct = fitInfo ? Math.max(1, Math.floor(fitInfo.fit_scale_percent)) : 100;
  const bv = printSettings?.printer?.build_volume;
  // The printer name can be the unselected placeholder ("+ Choose Printer"),
  // which reads oddly as "Too big for + Choose Printer". Fall back to a neutral
  // phrase whenever there's no real printer chosen.
  const rawPrinterName = printSettings?.printer?.name ?? "";
  const hasRealPrinter = !!rawPrinterName && !rawPrinterName.trim().startsWith("+") && !/choose/i.test(rawPrinterName);
  const tooBigTitle = hasRealPrinter
    ? `Too big for your ${rawPrinterName}${bv ? ` (${bv[0]}×${bv[1]}×${bv[2]} mm)` : ""}`
    : `Too big for the build plate${bv ? ` (${bv[0]}×${bv[1]}×${bv[2]} mm)` : ""}`;
  const TooBigBanner = tooBig ? (
    <div className="pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-xl border px-4 py-2 shadow-lg backdrop-blur-sm" style={{ background: "rgba(30,18,4,0.92)", borderColor: "rgba(255,159,10,0.45)" }}>
      <svg className="h-5 w-5 shrink-0 text-[#ff9f0a]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
      <div className="min-w-0 text-xs leading-snug">
        <p className="font-bold text-[#ffcf80]">{tooBigTitle}</p>
        <p className="text-white/55">Your model is {Math.round(bounds.x)}×{Math.round(bounds.y)}×{Math.round(bounds.z)} mm. Scale to {fitPct}% to fit the build plate.</p>
      </div>
      <button
        onClick={() => void scaleAllToFit(fitPct)}
        disabled={isBusy}
        className="shrink-0 rounded-lg bg-[#ff9f0a] px-3 py-1.5 text-xs font-bold text-[#1a1205] transition-colors hover:bg-[#ffb838] disabled:opacity-50"
      >
        Scale to fit
      </button>
    </div>
  ) : null;

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types || []).includes("Files");
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void importLocalFile(file);
  };

  return (
    <div
      className="w-full h-[100dvh] relative bg-cadio-bg text-cadio-text font-sans overflow-hidden"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(e) => {
        // Must preventDefault on every dragover for the browser to allow a drop.
        if (hasFiles(e)) {
          e.preventDefault();
          if (!dragActive) setDragActive(true);
        }
      }}
    >
      {/* Drag-and-drop import overlay — captures the drop itself (pointer-events
          auto) so the file never falls through to the 3D canvas underneath. */}
      {dragActive && (
        <div
          className="absolute inset-0 z-[250] grid place-items-center"
          style={{ background: "rgba(8,12,16,0.86)", backdropFilter: "blur(8px)" }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDragLeave={(e) => {
            // Only hide when the pointer actually leaves the overlay (not when
            // moving over the inner card).
            if (e.currentTarget === e.target) setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <div className="pointer-events-none flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-16 py-12 text-center" style={{ borderColor: "rgba(43,184,220,0.6)", background: "rgba(43,184,220,0.06)" }}>
            <svg className="h-14 w-14 text-cadio-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
            <div>
              <p className="text-xl font-bold text-white">Drop to import</p>
              <p className="mt-1 text-sm text-white/50">STL, OBJ or ZIP — placed straight on your build plate</p>
            </div>
          </div>
        </div>
      )}
      {/* Global notice popup (e.g. non-editable model) */}
      {notice && (
        <div
          className="fixed inset-0 z-[300] grid place-items-center px-4"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)" }}
          onClick={() => setNotice(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl"
            style={{ background: "#0d1318", border: "1px solid rgba(255,159,10,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(255,159,10,0.12)" }}>
              <svg className="h-6 w-6 text-[#ff9f0a]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <p className="text-sm font-medium leading-relaxed text-white/80">{notice}</p>
            <button
              onClick={() => setNotice(null)}
              className="mt-5 w-full rounded-lg bg-cadio-accent py-2.5 text-sm font-semibold text-cadio-bg hover:bg-cadio-accent-hover transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {/* ── Desktop layout — fullscreen viewport with floating overlays ── */}
      <div className="hidden md:block relative h-full w-full bg-cadio-bg">

        {/* Viewport — fills entire space */}
        <ErrorBoundary label="viewport">
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
        </ErrorBoundary>
        {modelBusy && <ModelLoadingOverlay status={status} />}

        {/* Empty-state wayfinding — guide first-time users with real examples
            instead of a blank prompt. Dismissible. */}
        {objects.length === 0 && !modelBusy && !emptyDismissed && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
            <div
              className="pointer-events-auto relative w-full max-w-2xl rounded-3xl border border-white/10 bg-cadio-surface/60 p-8 text-center backdrop-blur-2xl"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 80px -30px rgba(0,0,0,0.85)" }}
            >
              <button
                onClick={() => setEmptyDismissed(true)}
                title="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cadio-accent/12 text-cadio-accent">
                <CadioMark size={26} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">What do you want to make?</h2>
              <p className="mt-2 text-sm text-white/50">Describe it in the box below, or start from an example — Cadio finds a real model and makes it printable.</p>
              <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {EMPTY_STATE_EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => void runPrompt(ex.prompt)}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-left transition-all hover:border-cadio-accent/50 hover:bg-cadio-accent/[0.06]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-cadio-muted transition-colors group-hover:text-cadio-accent">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={ex.icon} /></svg>
                    </span>
                    <span className="text-xs font-semibold text-white/80 group-hover:text-white">{ex.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setEmptyDismissed(true)}
                className="mt-5 text-xs font-medium text-white/40 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
              >
                Skip — I'll type my own
              </button>
            </div>
          </div>
        )}

        {showDesktopSourceInfo && sourceInfo.length > 0 && (
          <SourceInfoModal sources={sourceInfo} onClose={() => setShowDesktopSourceInfo(false)} />
        )}
        {showSourceFiles && sourceFiles.length > 0 && (
          <SourceFilesModal
            files={sourceFiles}
            source={sourceInfo[0]}
            busy={isBusy}
            onSelect={(fileId) => { if (fileId === "__all__") setShowSourceFiles(false); void selectSourceFile(fileId); }}
            onClose={() => setShowSourceFiles(false)}
          />
        )}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-5 pointer-events-none">
          {/* Logo + home + source/file controls (top, side by side) */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button onClick={onHome} className="flex items-center gap-2 rounded-xl bg-cadio-surface/80 border border-cadio-border/50 px-3 py-2 backdrop-blur-sm hover:border-cadio-accent/40 transition-colors">
              <span className="text-cadio-accent flex-shrink-0"><CadioMark size={22} /></span>
              <span className="h-4 w-px bg-cadio-border/60" />
              <span className="text-sm font-medium text-cadio-text max-w-[140px] truncate">{projectTitle}</span>
            </button>
            {demoLabel && (
              <span
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold backdrop-blur-sm"
                style={{ borderColor: "rgba(43,184,220,0.5)", background: "rgba(43,184,220,0.12)", color: "#7fe3f6" }}
                title="This is a demo model — generate your own to replace it"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-cadio-accent" />
                Demo: {demoLabel}
              </span>
            )}
            {sourceInfo.length > 0 && (
              <button
                onClick={() => setShowDesktopSourceInfo(true)}
                title="Where this model is from and what you may do with it"
                className="flex items-center gap-1.5 rounded-xl border border-cadio-accent/40 bg-cadio-surface/80 px-3 py-2 text-cadio-accent backdrop-blur-sm transition-all hover:bg-cadio-accent/10"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-xs font-semibold">Source</span>
              </button>
            )}
            {sourceFiles.length > 1 && (
              <button
                onClick={() => { setShowSourceFiles(true); setPulseFiles(false); }}
                title="Choose which model file to place on the build plate"
                className={`flex items-center gap-1.5 rounded-xl border bg-cadio-surface/80 px-3 py-2 backdrop-blur-sm transition-all ${
                  pulseFiles ? "animate-pulse border-cadio-accent text-cadio-accent ring-2 ring-cadio-accent/50" : "border-cadio-accent/40 text-cadio-text hover:border-cadio-accent hover:text-cadio-accent"
                }`}
                style={pulseFiles ? { boxShadow: "0 0 0 4px rgba(43,184,220,0.18), 0 0 22px rgba(43,184,220,0.35)" } : undefined}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
                <span className="text-xs font-bold">Change model<span className="ml-1 font-normal text-cadio-muted">· {sourceFiles.filter((f) => f.id !== "__all__").length}</span></span>
              </button>
            )}
          </div>

          {/* Status pill — center */}
          {(isBusy || status) && (
            <div className="pointer-events-none flex items-center gap-2 rounded-full border border-cadio-border/50 bg-cadio-surface/80 px-4 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cadio-accent" />
              <span className="text-xs text-cadio-muted">{status || "Working…"}</span>
            </div>
          )}

          {/* Printer + Export */}
          <div className="pointer-events-auto flex items-center gap-3">
            <ProfileAvatar size={30} onClick={() => setProfileOpen(true)} />
            {Object.keys(printers).length > 0 ? (
              <select
                value={printer}
                onChange={(e) => void setPrinter(e.target.value)}
                className="h-7 rounded-md border border-cadio-border/40 bg-cadio-surface/70 px-2 text-xs text-cadio-muted backdrop-blur-sm outline-none hover:border-cadio-accent/40 transition-colors cursor-pointer"
              >
                {Object.entries(printers).map(([key, p]) => (
                  <option value={key} key={key}>{p.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-cadio-muted">{printerProfile?.name ?? "Standard"}</span>
            )}
            {printerDims && (
              <span className="hidden lg:inline whitespace-nowrap rounded-md border border-cadio-border/40 bg-cadio-surface/50 px-2 py-1 text-[11px] font-medium text-cadio-muted backdrop-blur-sm">
                {printerDims}
              </span>
            )}
            <button onClick={() => setShareOpen(true)} className="text-xs font-medium text-cadio-muted hover:text-cadio-text transition-colors">Share</button>
            <button
              onClick={() => setExportOpen(true)}
              className="h-8 rounded-lg bg-cadio-accent px-4 text-xs font-bold text-cadio-bg hover:bg-cadio-accent-hover transition-all hover:scale-[1.03] active:scale-[0.97]"
              style={{ boxShadow: "0 0 24px -8px rgba(43,184,220,0.7)" }}
            >
              Export
            </button>
          </div>
        </div>

        {/* Model variations (Next / Previous source model) */}
        <DesktopModelVariantBar />

        {/* Per-printer "too big" warning */}
        {tooBig && (
          <div className="pointer-events-none absolute inset-x-0 top-[68px] z-20 flex justify-center px-4">
            {TooBigBanner}
          </div>
        )}

        {/* Left tool strip — labelled so it's clear what each button does */}
        <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 flex flex-col gap-2">
          {[
            { icon: "M12 4v16m8-8H4", label: "New", action: startBlankCreation, active: false },
            { icon: "M4 6h16M4 12h16M4 18h7", label: "Projects", action: () => setLeftDrawerOpen(v => !v), active: leftDrawerOpen },
            { icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", label: "Edit", action: () => { const next = !expertMode; setExpertMode(next); setRightDrawerOpen(next); }, active: expertMode },
            { icon: "M3 6l3 1m0 0l-3 9a5 5 0 006 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5 5 0 006 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3", label: "Measure", action: () => setShowMeasurements(v => !v), active: showMeasurements },
          ].map(({ icon, label, action, active }) => (
            <button key={label} onClick={action} title={label}
              className={`flex h-10 w-32 items-center gap-3 rounded-xl border px-3 backdrop-blur-sm transition-all ${active ? "border-cadio-accent/50 bg-cadio-accent/10 text-cadio-accent" : "border-cadio-border/50 bg-cadio-surface/80 text-cadio-muted hover:border-cadio-accent/40 hover:text-cadio-text"}`}>
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={icon} /></svg>
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
        </div>

        {/* Inspector is opened by the Edit button (left strip) — no separate toggle. */}

        {/* Bottom AI bar — outer wrapper is click-through so it never blocks the
            viewport buttons sitting in the same band; the panel itself is not. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-6">
          <div
            className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-cadio-surface/90 backdrop-blur-2xl"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 70px -24px rgba(0,0,0,0.8), 0 0 50px -32px rgba(43,184,220,0.55)" }}
          >
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

          {/* Edit tools toggle */}
          <div className="border-b border-cadio-border/30 px-4 py-3">
            <button
              onClick={() => setExpertMode(!expertMode)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${expertMode ? "border-cadio-accent/40 bg-cadio-accent/10 text-cadio-accent" : "border-cadio-border/40 bg-cadio-bg/60 text-cadio-text hover:border-cadio-accent/30"}`}
            >
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Edit tools
              </span>
              <span className={`text-[10px] font-bold ${expertMode ? "text-cadio-accent" : "text-cadio-muted"}`}>{expertMode ? "ON" : "OFF"}</span>
            </button>
          </div>

          {/* Printer */}
          {Object.keys(printers).length > 0 && (
            <div className="border-b border-cadio-border/30 px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cadio-muted">Printer</p>
              <select
                value={printer}
                onChange={(e) => void setPrinter(e.target.value)}
                className="w-full h-9 rounded-lg border border-cadio-border/40 bg-cadio-bg/60 px-2.5 text-sm text-cadio-text outline-none"
              >
                {Object.entries(printers).map(([key, p]) => (
                  <option value={key} key={key}>{p.name}</option>
                ))}
              </select>
              {printerDims && (
                <p className="mt-1.5 text-[11px] text-cadio-muted/70">Build volume: {printerDims}</p>
              )}
            </div>
          )}

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
            <ProfileAvatar size={30} onClick={() => setProfileOpen(true)} />
            <button onClick={() => setMobileExportOpen(true)} className="h-8 rounded-lg bg-white px-4 text-xs font-bold text-cadio-bg">Export</button>
            <button onClick={() => setMobileEditOpen(true)} className="rounded-lg border border-cadio-border/50 p-2 text-cadio-muted transition-colors hover:text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </button>
          </div>
        </div>

        {/* Quick toolbar */}
        <div className="flex gap-2 overflow-x-auto border-b border-cadio-border/30 bg-cadio-bg/90 px-4 py-2 scrollbar-none">
          <button onClick={() => setExpertMode(!expertMode)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all ${expertMode ? "bg-cadio-accent text-cadio-bg" : "border border-cadio-border/50 bg-cadio-surface text-cadio-muted hover:text-white"}`}>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            Edit
          </button>
          <div className="mx-1 w-px bg-cadio-border/40" />
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

        {/* Per-printer "too big" warning (mobile) */}
        {tooBig && (
          <div className="flex justify-center border-b border-cadio-border/30 bg-cadio-bg/90 px-3 py-2">
            {TooBigBanner}
          </div>
        )}

        {/* Viewport */}
        <div className="relative flex-1 min-h-0">
          <ErrorBoundary label="viewport">
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
            mobileMode
            showMeasurements={showMeasurements}
          />
          </ErrorBoundary>
          {modelBusy && <ModelLoadingOverlay status={status} />}
          {objects.length === 0 && !modelBusy && !emptyDismissed && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-5">
              <div className="pointer-events-auto relative w-full rounded-2xl border border-white/10 bg-cadio-surface/60 p-5 text-center backdrop-blur-2xl">
                <button onClick={() => setEmptyDismissed(true)} title="Close" className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h2 className="text-lg font-bold text-white">What do you want to make?</h2>
                <p className="mt-1 text-xs text-white/50">Pick an example or describe it below.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {EMPTY_STATE_EXAMPLES.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => void runPrompt(ex.prompt)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-cadio-accent/50 hover:text-white"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {sourceInfo.length > 0 && (
            <button
              onClick={() => setShowMobileSourceInfo(true)}
              className="absolute bottom-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-cadio-border/60 bg-cadio-surface/80 text-cadio-muted shadow-lg backdrop-blur-sm hover:border-cadio-accent/50 hover:text-cadio-accent transition-all"
              title="Source info"
            >
              <span className="text-sm font-bold leading-none">i</span>
            </button>
          )}
          {showMobileSourceInfo && sourceInfo.length > 0 && (
            <SourceInfoModal sources={sourceInfo} onClose={() => setShowMobileSourceInfo(false)} />
          )}
          {sourceFiles.length > 1 && (
            <button
              onClick={() => { setShowSourceFiles(true); setPulseFiles(false); }}
              className={`absolute bottom-3 left-14 z-10 flex h-9 items-center gap-1.5 rounded-full border px-3.5 shadow-lg backdrop-blur-sm transition-all ${
                pulseFiles ? "animate-pulse border-cadio-accent text-cadio-accent ring-2 ring-cadio-accent/50 bg-cadio-surface" : "border-cadio-accent/40 bg-cadio-surface/80 text-cadio-text hover:border-cadio-accent"
              }`}
              title="Change model file"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
              <span className="text-xs font-bold">Change<span className="ml-1 font-normal text-cadio-muted">· {sourceFiles.filter((f) => f.id !== "__all__").length}</span></span>
            </button>
          )}
          {showSourceFiles && sourceFiles.length > 0 && (
            <SourceFilesModal
              files={sourceFiles}
              source={sourceInfo[0]}
              busy={isBusy}
              onSelect={(fileId) => { if (fileId === "__all__") setShowSourceFiles(false); void selectSourceFile(fileId); }}
              onClose={() => setShowSourceFiles(false)}
            />
          )}
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
      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} onUpgrade={() => { setProfileOpen(false); setUpgradeOpen(true); }} />
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
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-cadio-border/50 bg-cadio-surface p-6 text-white shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Sign In to Download</h2>
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
          onSubmit={async (event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            setErr(""); setBusy(true);
            try {
              await loginCadioAccount({
                email: String(fd.get("email") || ""),
                password: String(fd.get("password") || ""),
              });
              onAuthenticated();
            } catch (ex) {
              setErr(ex instanceof Error ? ex.message : "Sign in failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            name="email"
            type="email"
            placeholder="Email address"
            required
            className="h-11 w-full rounded-lg border border-cadio-border bg-cadio-bg px-3 text-sm text-white outline-none focus:border-cadio-accent"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="h-11 w-full rounded-lg border border-cadio-border bg-cadio-bg px-3 text-sm text-white outline-none focus:border-cadio-accent"
          />
          {err && (
            <p className="rounded-lg px-3 py-2 text-xs text-red-300" style={{ background: "rgba(220,50,50,0.08)", border: "1px solid rgba(220,50,50,0.2)" }}>
              {err}
            </p>
          )}
          <button
            disabled={busy}
            className="h-11 w-full rounded-lg bg-white font-bold text-cadio-bg hover:bg-cadio-text transition-all disabled:opacity-50"
          >
            {busy ? "…" : "Continue to Download"}
          </button>
        </form>
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-cadio-border/50" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-cadio-muted">or</span>
          <div className="h-px flex-1 bg-cadio-border/50" />
        </div>
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (res) => {
              if (!res.credential) return;
              setErr(""); setBusy(true);
              try {
                await loginWithGoogle(res.credential);
                onAuthenticated();
              } catch (ex) {
                setErr(ex instanceof Error ? ex.message : "Google sign-in failed.");
              } finally {
                setBusy(false);
              }
            }}
            onError={() => setErr("Google sign-in failed.")}
            theme="filled_black"
            size="large"
            text="signin_with"
            shape="rectangular"
          />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [showBuilder, setShowBuilder] = useState(() => window.location.hash.startsWith("#builder"));
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [demoPrompt, setDemoPrompt] = useState<string | null>(null);

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

  const seeDemo = () => {
    // Rotate through the showcase prompts so repeat visitors see variety.
    const demos = [
      "cable organizer",
      "headset stand",
      "wall tool holder",
      "phone stand",
      "desk pen holder",
      "pegboard hook",
    ];
    setDemoPrompt(demos[Math.floor(Math.random() * demos.length)]);
    startBuilding();
  };

  const goHome = () => {
    useCadStore.getState().startBlankCreation();
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
      {showBuilder ? (
        <WorkspaceApp onHome={goHome} initialPrompt={demoPrompt} onInitialPromptConsumed={() => setDemoPrompt(null)} />
      ) : (
        <LandingPage onStartBuilding={startBuilding} onSeeDemo={seeDemo} />
      )}
    </>
  );
}
