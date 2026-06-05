/** Cadio App shell - Shapr3D-inspired layout with mobile support. */

import { useEffect, useState } from "react";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel from "./components/AiPanel";
import ObjectInspector from "./components/ObjectInspector";
import ExampleBrowser from "./components/ExampleBrowser";
import type { ExampleObject } from "./components/ExampleBrowser";

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
    undo,
    redo,
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

  const latestPrompt = promptFromHistory(editHistory[editHistory.length - 1]);
  const projectTitle = creationName(latestPrompt);
  const creations = editHistory
    .slice(-5)
    .reverse()
    .map((item, index) => ({
      id: `${index}-${promptFromHistory(item)}`,
      title: creationName(promptFromHistory(item)),
    }));

  return (
    <div className="w-full h-full relative bg-cadio-bg text-cadio-text">
      {/* Desktop layout */}
      <div className="hidden md:grid h-full w-full grid-cols-[272px_380px_minmax(0,1fr)_330px] overflow-hidden bg-[#171717] text-white">
        <aside className="flex min-h-0 flex-col border-r border-[#272729] bg-[#171717] px-6 py-5">
          <div className="mb-7 flex items-center gap-2">
            <span className="text-[34px] font-black leading-none tracking-[-0.06em] text-white">cadio</span>
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[#20a7ff] text-xs font-black text-[#111]">C</span>
          </div>
          <button
            onClick={() => void runPrompt("new part")}
            className="mb-7 flex h-10 items-center justify-center gap-2 rounded-full border border-[#18a8ff] px-4 text-sm font-semibold text-white hover:bg-[#0e2633]"
          >
            <span className="text-xl leading-none">+</span>
            New Creation
          </button>
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-[#858585]">
              <span className="text-lg">▦</span>
              Creations
            </div>
            <div className="ml-3 border-l border-[#3a3a3a] pl-3">
              {(creations.length ? creations : [{ id: "empty", title: "Dewalt Battery Holder 3D..." }]).map((creation) => (
                <button
                  key={creation.id}
                  className="block w-full truncate py-2 text-left text-xs text-[#8d8d8d] hover:text-white"
                >
                  {creation.title}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto space-y-5 text-sm text-[#7f7f7f]">
            <button className="block hover:text-white">GitHub</button>
            <button className="block hover:text-white">Discord</button>
            <div className="flex items-center gap-3 pt-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#28a6ff] to-[#b94cff]" />
              <div>
                <div className="font-semibold text-white">Joel Persson</div>
                <div className="text-xs">fgdgfdggdgd@gmail.com</div>
              </div>
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
            <button className="text-sm font-semibold hover:text-[#18a8ff]">Share</button>
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
          <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
            <button
              onClick={() => setExpertMode(!expertMode)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                expertMode ? "bg-white text-[#171717]" : "bg-[#262626] text-white hover:bg-[#333]"
              }`}
            >
              Modeling
            </button>
            <button onClick={() => setTransformMode("translate")} className="rounded-full bg-[#262626] px-3 py-1.5 text-xs text-white hover:bg-[#333]">
              Move
            </button>
            <button onClick={() => setTransformMode("rotate")} className="rounded-full bg-[#262626] px-3 py-1.5 text-xs text-white hover:bg-[#333]">
              Rotate
            </button>
            <button onClick={() => setTransformMode("off")} className="rounded-full bg-[#262626] px-3 py-1.5 text-xs text-white hover:bg-[#333]">
              Off
            </button>
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
          />
        </main>

        <aside className="min-h-0 overflow-hidden border-l border-[#303033] bg-[#1d1d1e]">
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
            selectedObjectIds={selectedObjectIds}
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
        {loading ? "..." : ">"}
      </button>
    </div>
  );
}
