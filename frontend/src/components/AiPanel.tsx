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
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-lg border border-[#2d2d2f] bg-[#151515] px-3 py-3 shadow-xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Current model</div>
        <div className="mt-1 truncate text-sm font-semibold text-white">{creationTitle(latestPrompt || "New Creation")}</div>
      </div>

      <div className="hidden">
        <div className="h-20 overflow-hidden rounded-t-lg bg-[#3a3a3a]">
          <div className="grid h-full place-items-center text-center text-sm text-[#9d9d9d]">
            <div>
              <div className="mx-auto mb-1 grid h-8 w-8 place-items-center rounded-lg border border-[#555] bg-[#2a2a2a] text-base">
                C
              </div>
              <p>{objects.length ? `${objects.length} editable part${objects.length > 1 ? "s" : ""}` : "No model yet"}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-[#303033] px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="grid h-5 w-5 place-items-center rounded border border-[#555] text-[11px]">◇</span>
            <span className="truncate">{creationTitle(latestPrompt || "New Creation")}</span>
          </div>
        </div>
      </div>

      <div className={latestActions.length ? "rounded-lg border border-[#2d2d2f] bg-[#151515] p-3 text-sm leading-relaxed text-white" : "hidden"}>
        {latestActions.length ? (
          <div className="space-y-1.5">
            {latestActions.map((action) => (
              <p key={action}>{action}</p>
            ))}
          </div>
        ) : (
          <p>
            Describe what you want to print. Cadio will search for source patterns,
            build parametric geometry, and expose the useful dimensions on the right.
          </p>
        )}
      </div>

      {objects.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void switchModel("previous")}
            disabled={isLoading}
            className="rounded-lg border border-[#38383a] bg-[#242424] px-3 py-2 text-xs font-semibold text-white hover:border-[#555] hover:bg-[#2d2d2f] disabled:opacity-40"
          >
            Previous model
          </button>
          <button
            onClick={() => void switchModel("next")}
            disabled={isLoading}
            className="rounded-lg border border-[#28c7df] bg-[#123038] px-3 py-2 text-xs font-semibold text-white hover:bg-[#173a43] disabled:opacity-40"
          >
            Next model
          </button>
        </div>
      )}

      <details className="group rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
          <span>Tools</span>
          <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f] group-open:hidden">
            {QUICK_COMMANDS.length}
          </span>
          <span className="hidden rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f] group-open:inline">
            Close
          </span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => void run(cmd, false)}
              disabled={isLoading}
              className="rounded-lg border border-[#38383a] bg-[#242424] px-3 py-2 text-left text-xs font-semibold text-white hover:border-[#555] hover:bg-[#2d2d2f] disabled:opacity-40"
            >
              {cmd}
            </button>
          ))}
        </div>
      </details>

      <details className="group rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
          <span>Search filters</span>
          <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f]">
            {activeFilters.length ? `${activeFilters.length} active` : "Optional"}
          </span>
        </summary>
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-end">
            {activeFilters.length > 0 && (
              <button
                onClick={() => setActiveFilters([])}
                className="text-[11px] font-semibold text-[#28c7df] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
          <div className="space-y-2">
            {SEARCH_FILTER_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[#68686b]">{group.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.filters.map((filter) => {
                    const active = activeFilters.includes(filter);
                    return (
                      <button
                        key={filter}
                        onClick={() => toggleFilter(filter)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          active
                            ? "border-[#28c7df] bg-[#123038] text-white"
                            : "border-[#343436] bg-[#222] text-[#bdbdbd] hover:border-[#555] hover:text-white"
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
          {activeFilters.length > 0 && (
            <p className="mt-3 truncate text-[11px] text-[#8f8f8f]">
              Query adds: {activeFilters.join(", ")}
            </p>
          )}
        </div>
      </details>

      <form
        onSubmit={handleSubmit}
        className="mt-auto rounded-2xl border border-[#38383a] bg-[#151515] p-3 shadow-2xl"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Keep iterating with Cadio..."
          rows={2}
          disabled={isLoading}
          className="h-16 w-full resize-none bg-transparent px-1 text-sm text-white outline-none placeholder:text-[#858585] disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#202020] text-[#bdbdbd]"
            title="Add image reference"
          >
            ▧
          </button>
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-9 rounded-lg border border-[#333] bg-[#202020] px-3 text-xs font-semibold text-white outline-none"
            >
              {AI_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className="grid h-9 w-9 place-items-center rounded-lg bg-[#3d3d3f] text-white hover:bg-[#505052] disabled:opacity-40"
              title="Generate"
            >
              {isLoading ? "…" : "↑"}
            </button>
          </div>
        </div>
      </form>

      {status && <p className="text-xs text-[#8f8f8f]">{status}</p>}
    </div>
  );
}
