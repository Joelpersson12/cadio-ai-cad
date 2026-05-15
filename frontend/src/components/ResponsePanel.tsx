/** Response panel - displays JSON responses and model info from the backend API. */

import type { GenerateResponse } from "../utils/api";

interface ResponsePanelProps {
  response: GenerateResponse | { error: string } | { status: string; message?: string } | null;
}

function isGenerateResponse(obj: unknown): obj is GenerateResponse {
  return obj !== null && typeof obj === "object" && "mesh" in obj && "bbox" in obj;
}

function isErrorResponse(obj: unknown): obj is { error: string } {
  return obj !== null && typeof obj === "object" && "error" in obj;
}

export default function ResponsePanel({ response }: ResponsePanelProps) {
  const formatJson = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  // Extract model info if it's a generate response
  const modelInfo = response && isGenerateResponse(response) ? response : null;
  const errorInfo = response && isErrorResponse(response) ? response : null;

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Inspector</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Model info and API response
          </p>
        </div>
        {response && (
          <button
            onClick={() => navigator.clipboard.writeText(formatJson(response))}
            className="p-2 rounded-md hover:bg-muted transition-colors group"
            title="Copy to clipboard"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 text-muted-foreground group-hover:text-foreground"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        )}
      </div>

      {/* Response Content */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* Model Info Section */}
        {modelInfo && (
          <div className="flex flex-col gap-4">
            {/* Bounding Box */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Bounding Box
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">X</p>
                  <p className="text-lg font-semibold text-foreground">{modelInfo.bbox.x.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">mm</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Y</p>
                  <p className="text-lg font-semibold text-foreground">{modelInfo.bbox.y.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">mm</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Z</p>
                  <p className="text-lg font-semibold text-foreground">{modelInfo.bbox.z.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">mm</p>
                </div>
              </div>
            </div>

            {/* Printer */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Printer
              </h3>
              <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3 border border-border">
                {modelInfo.printer}
              </p>
            </div>

            {/* Scaling Status */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Scaling
              </h3>
              <div className={`rounded-lg p-3 border ${
                modelInfo.scaled 
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500" 
                  : "bg-green-500/10 border-green-500/30 text-green-500"
              }`}>
                <div className="flex items-center gap-2">
                  {modelInfo.scaled ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span className="text-sm font-medium">Model was scaled to fit printer</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-sm font-medium">Model fits without scaling</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Mesh Stats */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Mesh Statistics
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Vertices</p>
                  <p className="text-lg font-semibold text-foreground">
                    {modelInfo.mesh.vertices.length}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Faces</p>
                  <p className="text-lg font-semibold text-foreground">
                    {modelInfo.mesh.faces.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {errorInfo && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <p className="text-sm font-medium">Error</p>
                <p className="text-xs mt-1 opacity-80">{errorInfo.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Raw JSON */}
        {response && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Raw JSON Response
            </h3>
            <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-words bg-muted/50 rounded-lg p-4 border border-border max-h-[300px] overflow-y-auto">
              {formatJson(response)}
            </pre>
          </div>
        )}

        {/* Empty State */}
        {!response && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-12 h-12 mb-4 opacity-50"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <p className="text-sm font-medium">No model generated</p>
            <p className="text-xs mt-1 text-center max-w-[200px]">
              Enter a prompt and click Generate Model to create a 3D mesh
            </p>
          </div>
        )}
      </div>

      {/* API Info Footer */}
      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Connected to backend</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
          cadio-ai-cad-production.up.railway.app
        </p>
      </div>
    </div>
  );
}
