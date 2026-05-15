/** Cadio App shell - main layout with three-column grid. */

import { useEffect, useState } from "react";
import { useCadStore } from "./stores/cadStore";
import { useWebSocket } from "./hooks/useWebSocket";
import CadViewport from "./components/CadViewport";
import AiPanel from "./components/AiPanel";
import ResponsePanel from "./components/ResponsePanel";

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

  const [apiResponse, setApiResponse] = useState<unknown>(null);

  // Load printers on mount
  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  // WebSocket for real-time sync
  useWebSocket(sessionId || null, applyScenePayload);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-primary-foreground"
            >
              <path d="M12 3L2 9l10 6 10-6-10-6z" />
              <path d="M2 17l10 6 10-6" />
              <path d="M2 13l10 6 10-6" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Cadio</h1>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            AI CAD
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {sessionId ? `Session: ${sessionId.slice(0, 8)}...` : "No active session"}
        </p>
      </header>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-[320px_1fr_380px] gap-4 p-4 overflow-hidden min-h-0">
        {/* Left panel - AI Copilot */}
        <aside className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
          <AiPanel onApiResponse={setApiResponse} />
        </aside>

        {/* Center - 3D Viewport */}
        <main className="rounded-xl overflow-hidden border border-border min-h-0 bg-card">
          <CadViewport
            objects={objects}
            selectedObjectId={selectedObjectId}
            onSelectObject={(id) => void onSelectObject(id)}
            transformMode={transformMode}
            onTransformCommit={(id, t) => void onTransformCommit(id, t)}
          />
        </main>

        {/* Right panel - Response */}
        <aside className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
          <ResponsePanel response={apiResponse} />
        </aside>
      </div>
    </div>
  );
}
