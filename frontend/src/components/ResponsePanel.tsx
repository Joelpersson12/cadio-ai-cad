/** Response panel - displays JSON responses from the backend API. */

interface ResponsePanelProps {
  response: unknown;
}

export default function ResponsePanel({ response }: ResponsePanelProps) {
  const formatJson = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">API Response</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Raw JSON from backend
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
      <div className="flex-1 overflow-y-auto p-5">
        {response ? (
          <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-words bg-muted/50 rounded-lg p-4 border border-border">
            {formatJson(response)}
          </pre>
        ) : (
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
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
            <p className="text-sm font-medium">No response yet</p>
            <p className="text-xs mt-1 text-center max-w-[200px]">
              Use the AI Copilot panel to generate CAD models or check the API health
            </p>
          </div>
        )}
      </div>

      {/* API Info Footer */}
      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span>Connected to backend</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
          cadio-ai-cad-production.up.railway.app
        </p>
      </div>
    </div>
  );
}
