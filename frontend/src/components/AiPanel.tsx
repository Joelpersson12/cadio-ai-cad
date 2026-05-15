/** AI command panel - left sidebar for natural language CAD editing. */

import { useState } from "react";
import { useCadStore } from "../stores/cadStore";
import { healthCheck, generateSimple } from "../utils/api";

interface AiPanelProps {
  onApiResponse: (response: unknown) => void;
}

export default function AiPanel({ onApiResponse }: AiPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const { status, runPrompt } = useCadStore();

  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return;
    
    setIsLoading(true);
    try {
      const response = await generateSimple(prompt);
      onApiResponse(response);
      // Also run through the store for 3D updates
      void runPrompt(prompt);
    } catch (error) {
      onApiResponse({ error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setIsLoading(true);
    setHealthStatus(null);
    try {
      const response = await healthCheck();
      onApiResponse(response);
      setHealthStatus(response.status === "ok" ? "healthy" : "unhealthy");
    } catch (error) {
      onApiResponse({ error: error instanceof Error ? error.message : "Connection failed" });
      setHealthStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleGenerate();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">AI Copilot</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Describe what you want to create
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
        {/* Prompt Input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Create a phone stand with rounded edges..."
            className="w-full min-h-[140px] rounded-lg border border-border bg-input text-foreground p-4 text-sm resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleGenerate()}
            disabled={isLoading || !prompt.trim()}
            className="w-full rounded-lg bg-primary text-primary-foreground py-3 font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate CAD
              </>
            )}
          </button>

          <button
            onClick={() => void handleHealthCheck()}
            disabled={isLoading}
            className="w-full rounded-lg bg-secondary text-secondary-foreground py-3 font-medium text-sm hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Health Check
            {healthStatus && (
              <span className={`ml-1 w-2 h-2 rounded-full ${
                healthStatus === "healthy" ? "bg-success" : "bg-destructive"
              }`} />
            )}
          </button>
        </div>

        {/* Quick Commands */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Quick Commands
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              "phone stand",
              "box with holes",
              "rounded cube",
              "cylinder",
              "bracket",
              "gear",
            ].map((cmd) => (
              <button
                key={cmd}
                onClick={() => setPrompt(cmd)}
                className="px-3 py-1.5 rounded-md text-xs bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors capitalize"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        {status && (
          <div className="mt-auto pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Status: <span className="text-foreground">{status}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
