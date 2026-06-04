/** Cadio App shell - Shapr3D-inspired layout with mobile support. */

import { useEffect, useState } from "react";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel from "./components/AiPanel";
import ObjectInspector from "./components/ObjectInspector";
import ExampleBrowser from "./components/ExampleBrowser";
import type { ExampleObject } from "./components/ExampleBrowser";

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
        style={{ maxHeight: "80vh", overflowY: "auto" }}
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

// Mobile bottom sheet for editing
function MobileEditSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { objects, selectedObjectId, patchParam, onToggleFeature } = useCadStore();
  const obj = objects.find((o) => o.id === selectedObjectId);

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
        style={{ maxHeight: "70vh", overflowY: "auto" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-cadio-border" />
        </div>

        <div className="px-5 pb-8 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-cadio-text">Edit Model</h3>

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

export default function App() {
  const {
    sessionId,
    objects,
    selectedObjectId,
    transformMode,
    bounds,
    printers,
    printer,
    expertMode,
    expertTool,
    selectionMode,
    sketchHeight,
    operationAmount,
    loadPrinters,
    applyScenePayload,
    onSelectObject,
    onTransformCommit,
    setExpertMode,
    setExpertTool,
    setSelectionMode,
    setSketchHeight,
    setOperationAmount,
    createPrimitive,
    applyExpertOperation,
    runPrompt,
  } = useCadStore();

  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [mobileExamplesOpen, setMobileExamplesOpen] = useState(false);

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

  return (
    <div className="w-full h-full relative">
      {/* Desktop layout */}
      <div className="hidden md:grid w-full h-full grid-cols-[300px_1fr_320px] gap-3 p-3 overflow-hidden">
        {/* Left - AI Panel */}
        <aside className="bg-cadio-panel/80 border border-cadio-border rounded-xl p-4 backdrop-blur-sm overflow-y-auto">
          <AiPanel />
        </aside>

        {/* Center - Viewport */}
        <main className="rounded-xl overflow-hidden border border-cadio-border min-h-0">
          <CadViewport
            objects={objects}
            selectedObjectId={selectedObjectId}
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
            onApplyExpertOperation={(op) => void applyExpertOperation(op)}
            onCreatePrimitive={(payload) => void createPrimitive(payload)}
          />
        </main>

        {/* Right - Inspector */}
        <aside className="bg-cadio-panel/80 border border-cadio-border rounded-xl p-4 backdrop-blur-sm overflow-y-auto">
          <ObjectInspector />
        </aside>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden w-full h-full flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-cadio-panel/90 border-b border-cadio-border backdrop-blur-sm">
          <span className="text-sm font-bold text-cadio-text tracking-widest">CADIO</span>
          <div className="flex gap-2">
            <button
              onClick={() => setMobileExamplesOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[#1a2535] text-cadio-accent text-xs font-semibold hover:bg-[#243048]"
            >
              Ideas
            </button>
            <button
              onClick={() => setMobileEditOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-cadio-accent text-[#081225] text-xs font-semibold"
            >
              Edit
            </button>
          </div>
        </div>

        {/* Viewport - takes most space */}
        <div className="flex-1 min-h-0">
          <CadViewport
            objects={objects}
            selectedObjectId={selectedObjectId}
            onSelectObject={(id) => void onSelectObject(id)}
            transformMode={transformMode}
            onTransformCommit={(id, t) => void onTransformCommit(id, t)}
            printerVolume={printerVolume}
            bounds={bounds}
            expertMode={false}
          />
        </div>

        {/* Bottom AI input bar */}
        <div className="bg-cadio-panel/90 border-t border-cadio-border backdrop-blur-sm px-3 py-2">
          <MobileAiBar />
        </div>
      </div>

      {/* Mobile examples sheet */}
      <MobileExamplesSheet
        open={mobileExamplesOpen}
        onClose={() => setMobileExamplesOpen(false)}
        onSelectExample={handleMobileExampleSelect}
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
        {loading ? "..." : "→"}
      </button>
    </div>
  );
}
