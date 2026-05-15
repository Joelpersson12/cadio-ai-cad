/** Cadio App shell - main layout with three-column grid. */

import { useEffect } from "react";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel from "./components/AiPanel";
import ObjectInspector from "./components/ObjectInspector";

export default function App() {
  const {
    sessionId,
    objects,
    selectedObjectId,
    transformMode,
    loadPrinters,
    applyScenePayload,
    onSelectObject,
    onTransformCommit,
  } = useCadStore();

  // Load printers on mount
  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  // WebSocket for real-time sync
  useWebSocket(sessionId || null, applyScenePayload);

  return (
    <div className="w-full h-full grid grid-cols-[300px_1fr_320px] gap-3 p-3 overflow-hidden">
      {/* Left panel - AI Copilot */}
      <aside className="bg-cadio-panel/80 border border-cadio-border rounded-xl p-4 backdrop-blur-sm overflow-y-auto">
        <AiPanel />
      </aside>

      {/* Center - 3D Viewport */}
      <main className="rounded-xl overflow-hidden border border-cadio-border min-h-0">
        <CadViewport
          objects={objects}
          selectedObjectId={selectedObjectId}
          onSelectObject={(id) => void onSelectObject(id)}
          transformMode={transformMode}
          onTransformCommit={(id, t) => void onTransformCommit(id, t)}
        />
      </main>

      {/* Right panel - Inspector */}
      <aside className="bg-cadio-panel/80 border border-cadio-border rounded-xl p-4 backdrop-blur-sm overflow-y-auto">
        <ObjectInspector />
      </aside>
    </div>
  );
}
