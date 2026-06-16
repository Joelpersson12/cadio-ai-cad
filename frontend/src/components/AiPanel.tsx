/** Adam/CADAM-style prompt and iteration panel. */

import { useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useCadStore } from "../stores/cadStore";

const AI_MODELS = [
  "Gemini 3.1 Pro",
  "Claude Opus 4.8",
  "GPT-5.5",
  "Gemini 3.5 Flash",
];

const QUICK_COMMANDS = [
  "Create wall mount",
  "Add hanging hook",
  "Adjust slot spacing",
  "Make 3 slots",
  "Add screw bosses",
  "Add cable cutout",
  "Add snap clip",
  "Make it stronger",
];

const SEARCH_FILTER_GROUPS = [
  {
    label: "Device",
    filters: ["rotating", "vertical", "horizontal", "foldable", "minimal", "magsafe", "charging dock"],
  },
  {
    label: "Mounting",
    filters: ["wall mounted", "desk mount", "clamp mount", "Gridfinity", "Pegboard", "Magnetic"],
  },
  {
    label: "Print",
    filters: ["popular", "flat print", "no supports", "screw holes", "counterbore", "strong"],
  },
];

function creationTitle(prompt: string) {
  const text = prompt.trim();
  if (!text) return "Untitled creation";
  return text
    .split(/\s+/)
    .slice(0, 5)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isTechnicalAction(action: string) {
  return /^(source-|translated-query:|generative-recipe:|generated clean|source-search:|source-match:|source-files:)/i.test(action.trim());
}

export default function AiPanel() {
  const [prompt, setPrompt] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0]);
  const { status, runPrompt, editHistory, objects, switchSourceModel } = useCadStore();

  const latestPrompt = useMemo(() => {
    const latest = editHistory[editHistory.length - 1];
    const value = latest?.prompt ?? latest?.command ?? latest?.input;
    return typeof value === "string" ? value : "";
  }, [editHistory]);

  const latestActions = useMemo(() => {
    const latest = editHistory[editHistory.length - 1];
    const actions = latest?.actions;
    return Array.isArray(actions)
      ? actions.map(String).filter((action) => !isTechnicalAction(action)).slice(0, 2)
      : [];
  }, [editHistory]);

  const filteredPrompt = (text: string) => {
    const cleaned = text.trim();
    if (!activeFilters.length) return cleaned;
    return `${cleaned}, ${activeFilters.join(", ")}`;
  };

  const toggleFilter = (filter: string) => {
    setActiveFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter],
    );
  };

  const run = async (text: string, includeFilters = true) => {
    const cleaned = text.trim();
    if (!cleaned || isLoading) return;
    const query = includeFilters ? filteredPrompt(cleaned) : cleaned;
    setIsLoading(true);
    setPrompt("");
    try {
      await runPrompt(query);
    } finally {
      setIsLoading(false);
    }
  };

  const switchModel = async (direction: "next" | "previous") => {
    if (isLoading || !objects.length) return;
    setIsLoading(true);
    try {
      await switchSourceModel(direction);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    await run(prompt);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 p-4 bg-cadio-bg">
      {/* Workspace Context */}
      <div className="rounded-xl border border-cadio-border/50 bg-cadio-surface p-4 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted mb-2">Workspace</div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-cadio-accent animate-pulse" />
          <div className="truncate text-sm font-semibold text-white">
            {creationTitle(latestPrompt || "New Project")}
          </div>
        </div>
      </div>

      {/* AI Assistant Output */}
      <div className={latestActions.length ? "rounded-xl border border-cadio-border/50 bg-cadio-surface p-4 shadow-sm" : "hidden"}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted mb-3">AI Suggestions</div>
        <div className="space-y-2 text-sm leading-relaxed text-cadio-text">
          {latestActions.map((action) => (
            <div key={action} className="flex gap-2">
              <span className="text-cadio-accent font-bold">›</span>
              <p>{action}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Model Variations */}
      {objects.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => void switchModel("previous")}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 rounded-lg border border-cadio-border bg-cadio-surface px-4 py-2.5 text-xs font-bold text-cadio-text transition-all hover:bg-cadio-surface-secondary disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            Previous
          </button>
          <button
            onClick={() => void switchModel("next")}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 rounded-lg border border-cadio-accent/20 bg-cadio-accent/10 px-4 py-2.5 text-xs font-bold text-cadio-accent transition-all hover:bg-cadio-accent/20 disabled:opacity-30"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}

      {/* Tools Section */}
      <details className="group rounded-xl border border-cadio-border/50 bg-cadio-surface overflow-hidden">
        <summary className="flex cursor-pointer items-center justify-between p-4 text-xs font-bold uppercase tracking-widest text-cadio-muted hover:text-white transition-colors">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>
            <span>CAD Library</span>
          </div>
          <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 gap-2 border-t border-cadio-border/30 pt-4">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => void run(cmd, false)}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-cadio-bg/50 px-3 py-2 text-left text-xs font-medium text-cadio-muted hover:bg-cadio-bg hover:text-white transition-all disabled:opacity-30"
            >
              <span className="text-cadio-accent/40 group-hover:text-cadio-accent transition-colors">#</span>
              {cmd}
            </button>
          ))}
        </div>
      </details>

      {/* Search Filters */}
      <details className="group rounded-xl border border-cadio-border/50 bg-cadio-surface overflow-hidden">
        <summary className="flex cursor-pointer items-center justify-between p-4 text-xs font-bold uppercase tracking-widest text-cadio-muted hover:text-white transition-colors">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            <span>Precision Filters</span>
          </div>
          <div className="flex items-center gap-2">
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-cadio-accent px-1.5 py-0.5 text-[10px] text-white font-bold">
                {activeFilters.length}
              </span>
            )}
            <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </div>
        </summary>
        <div className="px-4 pb-4 border-t border-cadio-border/30 pt-4">
          <div className="space-y-4">
            {SEARCH_FILTER_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-cadio-muted/60">{group.label}</div>
                <div className="flex flex-wrap gap-2">
                  {group.filters.map((filter) => {
                    const active = activeFilters.includes(filter);
                    return (
                      <button
                        key={filter}
                        onClick={() => toggleFilter(filter)}
                        className={`rounded-md border px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                          active
                            ? "border-cadio-accent bg-cadio-accent/10 text-cadio-accent shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                            : "border-cadio-border bg-cadio-bg/50 text-cadio-muted hover:border-cadio-muted/50 hover:text-white"
                        }`}
                      >
                        {filter}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* Prompt Form */}
      <form
        onSubmit={handleSubmit}
        className="mt-auto relative rounded-2xl border border-cadio-border/50 bg-cadio-surface shadow-2xl transition-all focus-within:border-cadio-accent/50 focus-within:ring-4 focus-within:ring-cadio-accent/5"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe model changes..."
          rows={3}
          disabled={isLoading}
          className="w-full resize-none bg-transparent p-4 text-sm text-white outline-none placeholder:text-cadio-muted/50 disabled:opacity-50 font-medium"
        />
        
        <div className="flex items-center justify-between p-3 border-t border-cadio-border/30 bg-cadio-bg/20">
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-8 rounded-md border border-cadio-border bg-cadio-bg px-2 text-[10px] font-bold text-cadio-muted outline-none transition-colors hover:border-cadio-muted/50 focus:ring-1 focus:ring-cadio-accent"
            >
              {AI_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="flex h-8 items-center gap-2 rounded-md bg-white px-4 text-[11px] font-bold text-cadio-bg shadow-sm transition-all hover:bg-cadio-text disabled:opacity-30 disabled:hover:scale-100 active:scale-95"
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeWidth="2" strokeLinecap="round" /></svg>
            ) : (
              <>
                Generate
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 12h14M12 5l7 7-7 7" /></svg>
              </>
            )}
          </button>
        </div>
      </form>

      {status && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-1 w-1 rounded-full bg-cadio-accent animate-pulse" />
          <p className="text-[10px] font-medium text-cadio-muted tracking-wide truncate">{status}</p>
        </div>
      )}
    </div>
  );
}
