/** Adam/CADAM-style prompt and iteration panel. */

import { useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useCadStore } from "../stores/cadStore";
import type { CadObject } from "../utils/types";

const AI_MODELS = [
  "Gemini 3.1 Pro",
  "Claude Opus 4.8",
  "GPT-5.5",
  "Gemini 3.5 Flash",
];

type ToolCommand = {
  label: string;
  prompt: string;
  hint: string;
};

type ModelContext = {
  hasModel: boolean;
  text: string;
  isBattery: boolean;
  isPhone: boolean;
  isHeadphone: boolean;
  isCable: boolean;
  isCup: boolean;
  isTool: boolean;
  isBoardMounted: boolean;
  isStorage: boolean;
  isHolder: boolean;
  hasSlots: boolean;
  hasFlatBase: boolean;
};

const STARTER_PROMPTS = [
  "Gridfinity storage bin with labels",
  "IKEA Skadis cable organizer",
  "Wall mounted headphone holder",
  "Foldable phone stand with MagSafe",
];

const SEARCH_FILTER_GROUPS = [
  {
    label: "Object",
    filters: ["holder", "mount", "bracket", "hook", "hanger", "rack", "organizer", "replacement part"],
  },
  {
    label: "Device",
    filters: ["rotating", "vertical", "horizontal", "foldable", "minimal", "magsafe", "charging dock", "adjustable"],
  },
  {
    label: "Mounting",
    filters: ["wall mounted", "desk mount", "clamp mount", "bike mounted", "handlebar", "garage", "wardrobe", "Gridfinity", "Pegboard", "Magnetic"],
  },
  {
    label: "Workshop",
    filters: ["tool board", "Skadis", "screw holes", "counterbore", "heavy duty", "no supports"],
  },
  {
    label: "Print",
    filters: ["popular", "flat print", "strong", "fast print", "FDM", "STL"],
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
  return /^(source-|translated-query:|searched-query:|tip:|model-not-found:|generative-recipe:|generated clean|source-search:|source-match:|source-files:)/i.test(action.trim());
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function inferModelContext(objects: CadObject[], latestPrompt: string): ModelContext {
  const text = [
    latestPrompt,
    ...objects.map((object) =>
      [
        object.name,
        object.primitive,
        object.source_settings?.title,
        object.source_settings?.source,
        object.source_settings?.query,
        Object.keys(object.parameters || {}).join(" "),
      ].filter(Boolean).join(" "),
    ),
  ].join(" ").toLowerCase();
  const parameterKeys = new Set(objects.flatMap((object) => Object.keys(object.parameters || {})));
  const isBattery = includesAny(text, ["battery", "batteri", "akku", "dewalt", "makita", "milwaukee", "ryobi", "bosch"]);
  const isPhone = includesAny(text, ["phone", "iphone", "magsafe", "tablet", "mobil", "telefon", "charger", "charging"]);
  const isHeadphone = includesAny(text, ["headphone", "headset", "helmet", "hörlur", "horlur", "hjalm", "hjälm"]);
  const isCable = includesAny(text, ["cable", "cord", "wire", "kabel", "sladd"]);
  const isCup = includesAny(text, ["cup", "mug", "bottle", "can holder", "mugg", "kopp", "flaska"]);
  const isTool = includesAny(text, ["tool", "wrench", "screwdriver", "bit holder", "verktyg", "mejsel", "nyckel"]);
  const isBoardMounted = includesAny(text, ["skadis", "skådis", "pegboard", "gridfinity", "tool board", "verktygstavla"]);
  const isStorage = includesAny(text, ["bin", "box", "tray", "organizer", "drawer", "storage", "låda", "lada", "förvaring", "forvaring"]);
  const isHolder = includesAny(text, ["holder", "mount", "stand", "bracket", "rack", "hook", "hållare", "hallare", "ställ", "stall", "fäste", "faste"]);
  const hasSlots = isBattery || ["num_batteries", "battery_slots", "battery_spacing", "slots", "slot_spacing"].some((key) => parameterKeys.has(key));
  const hasFlatBase = objects.some((object) => {
    const params = object.parameters || {};
    const width = Number(params.width || 0);
    const depth = Number(params.depth || 0);
    const height = Number(params.height || params.thickness || 0);
    return width >= 20 && depth >= 20 && height <= Math.max(22, Math.min(width, depth) * 0.45);
  });

  return {
    hasModel: objects.length > 0,
    text,
    isBattery,
    isPhone,
    isHeadphone,
    isCable,
    isCup,
    isTool,
    isBoardMounted,
    isStorage,
    isHolder,
    hasSlots,
    hasFlatBase,
  };
}

function command(label: string, prompt: string, hint: string): ToolCommand {
  return { label, prompt, hint };
}

function contextualQuickCommands(objects: CadObject[], latestPrompt: string): ToolCommand[] {
  const ctx = inferModelContext(objects, latestPrompt);
  if (!ctx.hasModel) return [];

  const commands: ToolCommand[] = [];

  if (ctx.isBattery || ctx.hasSlots) {
    commands.push(
      command(
        "Adjust slot spacing",
        "Adjust slot spacing on the current battery holder only; keep the rails, stops, screw holes, and base aligned on the build plate.",
        "Battery rails only",
      ),
      command(
        "Make 3 slots",
        "Set the current battery holder to 3 slots; resize only the existing slots and rail pattern, keep the base on the plate.",
        "Battery holder only",
      ),
      command(
        "Add screw bosses",
        "Add screw bosses to the current battery holder base only; place them on the base surface and preserve the rail geometry.",
        "Base-mounted bosses",
      ),
      command(
        "Add cable cutout",
        "Add one front cable cutout to the current battery holder base only; preserve existing slots, screw holes, and rails.",
        "Front cable relief",
      ),
    );
  }

  if (ctx.isPhone) {
    commands.push(
      command(
        "Add cable channel",
        "Add a centered cable cutout/channel to the current phone stand only; keep the support angle and front lip unchanged.",
        "Charging cable path",
      ),
      command(
        "Make stand stronger",
        "Add support ribs to the current phone stand only; attach them between the base and back support.",
        "Support ribs",
      ),
    );
  }

  if (ctx.isHeadphone) {
    commands.push(
      command(
        "Add wall screw holes",
        "Add two countersunk wall mounting screw holes to the flat back plate or base of the current headphone holder.",
        "Wall mounting",
      ),
      command(
        "Add hanging hook",
        "Add a printable hanging hook/tab to the current headphone holder, attached to the main body and resting on the model surface.",
        "Attached hook",
      ),
      command(
        "Strengthen arm",
        "Add support ribs to the current headphone holder arm only; keep the hook usable and on the build plate.",
        "Arm ribs",
      ),
    );
  }

  if (ctx.isCable || ctx.isBoardMounted) {
    commands.push(
      command(
        "Add cable cutout",
        "Add a clean cable cutout to the current organizer only; place it through the nearest usable wall or front edge.",
        "Cut through wall",
      ),
      command(
        "Add snap clip",
        "Add a small snap clip attached to the current organizer body; keep it printable and aligned to the existing model.",
        "Attached clip",
      ),
    );
  }

  if (ctx.isCup) {
    commands.push(
      command(
        "Add drain hole",
        "Add one centered drain hole to the bottom of the current cup holder; keep the outer walls unchanged.",
        "Bottom hole",
      ),
      command(
        "Make rim stronger",
        "Make the rim and side wall of the current cup holder stronger; preserve the cup opening.",
        "Reinforced rim",
      ),
    );
  }

  if (ctx.isTool || ctx.isBoardMounted) {
    commands.push(
      command(
        "Add mounting holes",
        "Add two countersunk mounting holes to the largest flat base or back plate of the current tool holder only.",
        "Screw holes",
      ),
    );
  }

  if (ctx.isStorage) {
    commands.push(
      command(
        "Add finger scoop",
        "Add a shallow front finger scoop cutout to the current storage bin/tray; preserve the bottom and side walls.",
        "Access cutout",
      ),
    );
  }

  if (ctx.hasFlatBase || ctx.isHolder) {
    commands.push(
      command(
        "Add mounting holes",
        "Add two countersunk mounting holes to the largest flat base of the current model only; do not create new loose parts.",
        "Flat-base holes",
      ),
      command(
        "Make it stronger",
        "Add support ribs to the current model only; attach them to existing faces and keep everything on the build plate.",
        "Attached ribs",
      ),
    );
  }

  commands.push(
    command(
      "Round exposed edges",
      "Fillet exposed outside edges of the current model by 2mm; preserve existing holes, slots, and cutouts.",
      "2mm edge softening",
    ),
  );

  const seen = new Set<string>();
  return commands.filter((item) => {
    const key = item.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export default function AiPanel() {
  const [prompt, setPrompt] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0]);
  const { status, runPrompt, editHistory, objects, switchSourceModel } = useCadStore();
  const blankWorkspace = status === "Blank workspace" && objects.length === 0;

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

  const modelTools = useMemo(
    () => contextualQuickCommands(objects, latestPrompt),
    [objects, latestPrompt],
  );

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
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">
          {objects.length ? "Current model" : blankWorkspace ? "Blank workspace" : "Start here"}
        </div>
        <div className="mt-1 truncate text-sm font-semibold text-white">
          {objects.length ? creationTitle(latestPrompt || "Untitled workspace") : blankWorkspace ? "Manual CAD plate ready" : "Describe anything printable"}
        </div>
        {!objects.length && !blankWorkspace && (
          <p className="mt-2 text-xs leading-5 text-[#a8a8ab]">
            Cadio searches source models first, then opens the best match in an editable CAD workspace.
          </p>
        )}
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
            <span className="truncate">{creationTitle(latestPrompt || "Untitled workspace")}</span>
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

      {!objects.length && !blankWorkspace && (
        <div className="rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Try a prompt</div>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((item) => (
              <button
                key={item}
                onClick={() => void run(item, false)}
                disabled={isLoading}
                className="rounded-full border border-[#343436] bg-[#242424] px-3 py-1.5 text-[11px] font-semibold text-[#d8d8da] hover:border-[#28c7df] hover:text-white disabled:opacity-40"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      <details className="group rounded-lg border border-[#2d2d2f] bg-[#151515] p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#cfcfcf] [&::-webkit-details-marker]:hidden">
          <span>Tools</span>
          <span className="rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f] group-open:hidden">
            {objects.length ? modelTools.length : "Select model"}
          </span>
          <span className="hidden rounded bg-[#242426] px-2 py-1 text-[10px] tracking-normal text-[#8f8f8f] group-open:inline">
            Close
          </span>
        </summary>
        {objects.length ? (
          <div className="mt-3 grid grid-cols-1 gap-2">
            {modelTools.map((cmd) => (
              <button
                key={cmd.label}
                onClick={() => void run(cmd.prompt, false)}
                disabled={isLoading}
                className="rounded-lg border border-[#38383a] bg-[#242424] px-3 py-2 text-left text-xs font-semibold text-white hover:border-[#28c7df] hover:bg-[#2d2d2f] disabled:opacity-40"
              >
                <span className="block">{cmd.label}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-[#8f8f8f]">{cmd.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-[#2d2d2f] bg-[#101010] px-3 py-2 text-xs leading-5 text-[#9f9f9f]">
            Generate, import, or draw a model first. Cadio will then show tools that fit that specific model.
          </p>
        )}
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
          placeholder={objects.length ? "Describe the next edit..." : "Search or generate any printable model..."}
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
            Ref
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
              className="grid h-9 min-w-9 place-items-center rounded-lg bg-[#3d3d3f] px-3 text-xs font-semibold text-white hover:bg-[#505052] disabled:opacity-40"
              title="Generate"
            >
              {isLoading ? "..." : "Go"}
            </button>
          </div>
        </div>
      </form>

      {status && <p className="text-xs text-[#8f8f8f]">{status}</p>}
    </div>
  );
}
