/** Clean AI prompt panel — minimal, focused on the prompt input. */

import { useMemo, useRef, useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useCadStore } from "../stores/cadStore";
import type { SourceExample } from "../utils/types";

const SOURCE_LABELS: Record<string, string> = {
  printables: "Printables",
  makerworld: "MakerWorld",
  thingiverse: "Thingiverse",
  thangs: "Thangs",
};

/** Returns the resolved license editability + display for a source. */
export function sourceLicense(src: SourceExample | undefined) {
  const lic = src?.license;
  const name = lic?.name || src?.license_name || "License not confirmed";
  const editable = lic ? lic.editable : src?.license_editable ?? false;
  const verified = lic?.verified ?? false;
  return { lic, name, editable, verified };
}

function PermissionBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={
        ok
          ? { background: "rgba(52,199,89,0.12)", color: "#34c759" }
          : { background: "rgba(255,69,58,0.12)", color: "#ff6961" }
      }
    >
      {ok ? "✔" : "✖"} {label}
    </span>
  );
}

export function SourceInfoModal({ sources, onClose }: { sources: SourceExample[]; onClose: () => void }) {
  if (!sources.length) return null;
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center px-4 py-6"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: "#0d1318", border: "1px solid rgba(43,184,220,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/7" style={{ background: "#0d1318" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-white/30">Source &amp; license</p>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          {sources.slice(0, 3).map((src, i) => {
            const { lic, name, editable, verified } = sourceLicense(src);
            const label = SOURCE_LABELS[src.source] ?? src.source;
            return (
              <div key={i} className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white leading-snug">{src.title}</p>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(43,184,220,0.15)", color: "#2bb8dc" }}>
                    {label}
                  </span>
                </div>

                {src.author && (
                  <p className="text-[11px] text-white/40">by {src.author}</p>
                )}

                {/* License block — always shown so the user knows their rights */}
                <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">License</span>
                    {lic?.url ? (
                      <a href={lic.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-cadio-accent hover:underline">
                        {name}
                      </a>
                    ) : (
                      <span className="text-[11px] font-semibold text-white/70">{name}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <PermissionBadge ok={!(lic?.requires_attribution ?? true)} label="No attribution needed" />
                    <PermissionBadge ok={lic?.allow_commercial ?? false} label="Commercial use" />
                    <PermissionBadge ok={editable} label="Editing / remix" />
                  </div>
                  {!editable && (
                    <p className="text-[11px] leading-relaxed text-[#ff9f0a]">
                      ⚠ Due to the license of this model, it is not editable. You can view and download the original, but Cadio will not modify it.
                    </p>
                  )}
                  {(lic?.requires_attribution ?? true) && (
                    <p className="text-[10px] leading-relaxed text-white/40">
                      You must credit the original creator{src.author ? ` (${src.author})` : ""} and link back to the source when sharing.
                    </p>
                  )}
                  {!verified && (
                    <p className="text-[10px] leading-relaxed text-white/40">
                      Cadio could not confirm this license automatically — please verify it on the source page before commercial use.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[11px] text-white/30">
                  {(src.likes ?? 0) > 0 && <span>♥ {src.likes?.toLocaleString()}</span>}
                  {(src.downloads ?? 0) > 0 && <span>↓ {src.downloads?.toLocaleString()}</span>}
                </div>
                {src.url && (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-cadio-accent hover:underline"
                  >
                    View original on {label}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            );
          })}
          <p className="text-[10px] leading-relaxed text-white/30">
            Models are sourced from public 3D-printing sites. Always respect the original creator's license. Cadio shows this information so you can comply — see our Terms for details.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourceFilesModal({
  files,
  onSelect,
  onClose,
  busy = false,
}: {
  files: import("../utils/types").SourceFileOption[];
  onSelect: (fileId: string) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  if (!files.length) return null;
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center px-4 py-6"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: "#0d1318", border: "1px solid rgba(43,184,220,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/7" style={{ background: "#0d1318" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/30">Choose a file</p>
            <p className="mt-0.5 text-[11px] text-white/40">This model has several files — pick which to place on the build plate.</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4 space-y-2">
          {files.map((f) => {
            const isAssembly = f.id === "__all__";
            return (
              <button
                key={f.id}
                disabled={busy || f.active}
                onClick={() => onSelect(f.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                  f.active
                    ? "border border-cadio-accent/40 bg-cadio-accent/10"
                    : "border border-white/7 bg-white/[0.03] hover:border-cadio-accent/30 hover:bg-white/[0.06]"
                } disabled:cursor-default`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 ${isAssembly ? "text-cadio-accent" : "text-white/40"}`}>
                    {isAssembly ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{f.name}</p>
                    <p className="text-[11px] text-white/35">
                      {isAssembly
                        ? `${f.part_count ?? ""} parts`
                        : [f.file_type?.toUpperCase(), formatFileSize(f.file_size)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                {f.active ? (
                  <span className="shrink-0 rounded-full bg-cadio-accent/15 px-2 py-0.5 text-[10px] font-bold text-cadio-accent">On plate</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-semibold text-cadio-accent">Place →</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const QUICK_COMMANDS = [
  "Add mounting holes",
  "Round all edges",
  "Make it stronger",
  "Add a snap clip",
  "Add cable cutout",
  "Optimize for FDM",
];

const FILTER_CHIPS = [
  "wall mount", "desk mount", "no supports", "flat print",
  "Gridfinity", "Pegboard", "counterbore", "strong",
];

function isTechnicalAction(action: string) {
  return /^(source-|translated-query:|generative-recipe:|generated clean|source-search:|source-match:|source-files:)/i.test(action.trim());
}

export default function AiPanel({ floating = false }: { floating?: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSourceInfo, setShowSourceInfo] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { status, runPrompt, editHistory, objects, switchSourceModel, sourceInfo } = useCadStore();

  const latestActions = useMemo(() => {
    const latest = editHistory[editHistory.length - 1];
    const actions = latest?.actions;
    return Array.isArray(actions)
      ? actions.map(String).filter((a) => !isTechnicalAction(a)).slice(0, 3)
      : [];
  }, [editHistory]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [prompt]);

  const run = async (text: string, _useFilters = true) => {
    // Filters are already inserted into the prompt text by the chips, so the
    // prompt is used as-is (no hidden re-appending).
    const query = text.trim();
    if (!query || isLoading) return;
    setIsLoading(true);
    setPrompt("");
    setActiveFilters([]);
    try { await runPrompt(query); }
    finally { setIsLoading(false); }
  };

  const switchModel = async (dir: "next" | "previous") => {
    if (isLoading || !objects.length) return;
    setIsLoading(true);
    try { await switchSourceModel(dir); }
    finally { setIsLoading(false); }
  };

  const handleSubmit = (e?: FormEvent) => { e?.preventDefault(); void run(prompt); };
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
  };

  // Clicking a filter chip inserts (or removes) the phrase in the prompt box so
  // the change is visible. It's also tracked in activeFilters for highlighting.
  const toggleFilter = (f: string) => {
    setActiveFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
    setPrompt((prev) => {
      const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (prev.toLowerCase().includes(f.toLowerCase())) {
        return prev
          .replace(new RegExp(`\\s*,?\\s*${escaped}`, "i"), "")
          .replace(/^\s*,\s*/, "")
          .trim();
      }
      return prev.trim() ? `${prev.trim()}, ${f}` : f;
    });
  };

  // Floating mode: compact inline layout (no outer wrapper with bg — handled by parent)
  if (floating) {
    return (
      <div className="flex flex-col">
        {/* Filters toggle */}
        <div className="border-t border-cadio-border/30 px-4 py-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] font-semibold text-cadio-muted transition-colors hover:text-cadio-text"
          >
            <span className="flex items-center gap-2">
              Filters
              {activeFilters.length > 0 && (
                <span className="rounded-full bg-cadio-accent px-1.5 py-px text-[10px] font-bold text-cadio-bg leading-none">
                  {activeFilters.length}
                </span>
              )}
            </span>
            <svg className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showFilters && (
            <div className="mt-2 flex flex-wrap gap-2 pb-1">
              {FILTER_CHIPS.map((f) => {
                const active = activeFilters.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() => toggleFilter(f)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-all ${
                      active
                        ? "border-cadio-accent/40 bg-cadio-accent/10 text-cadio-accent"
                        : "border-cadio-border/50 bg-cadio-bg/60 text-cadio-muted hover:text-cadio-text"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Prompt input */}
        <div className="border-t border-cadio-border/30 p-3">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-cadio-border/60 bg-cadio-bg/60 transition-all focus-within:border-cadio-accent/40 focus-within:ring-2 focus-within:ring-cadio-accent/10"
          >
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKey}
              placeholder={objects.length > 0 ? "Describe a change…" : "Describe what to build…"}
              disabled={isLoading}
              rows={2}
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-cadio-text placeholder:text-cadio-muted/50 outline-none disabled:opacity-40"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              {activeFilters.length > 0 ? (
                <p className="text-[10px] text-cadio-accent/70 truncate max-w-[180px]">
                  +{activeFilters.join(", ")}
                </p>
              ) : (
                <p className="text-[10px] text-cadio-muted/40">↵ to generate</p>
              )}
              <button
                type="submit"
                disabled={!prompt.trim() || isLoading}
                className="flex h-8 items-center gap-2 rounded-lg bg-cadio-accent px-4 text-[11px] font-bold text-cadio-bg transition-all hover:bg-cadio-accent-hover disabled:opacity-30 active:scale-95"
              >
                {isLoading ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4" strokeWidth="2" strokeLinecap="round" /></svg>
                ) : (
                  <>Generate <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 12h14M12 5l7 7-7 7" /></svg></>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-cadio-bg">

      {/* Source info modal */}
      {showSourceInfo && sourceInfo.length > 0 && (
        <SourceInfoModal sources={sourceInfo} onClose={() => setShowSourceInfo(false)} />
      )}

      {/* AI output — last actions */}
      {latestActions.length > 0 && (
        <div className="border-b border-cadio-border/30 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-cadio-muted">Last generation</p>
            {sourceInfo.length > 0 && (
              <button
                onClick={() => setShowSourceInfo(true)}
                title="View source inspiration"
                className="flex items-center gap-1 rounded-lg border border-cadio-border/40 bg-cadio-bg/60 px-2 py-1 text-[10px] text-cadio-muted transition-colors hover:border-cadio-accent/40 hover:text-cadio-accent"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Source
              </button>
            )}
          </div>
          <div className="space-y-2">
            {latestActions.map((a) => (
              <div key={a} className="flex items-start gap-2 text-sm text-cadio-text/80">
                <span className="mt-0.5 text-cadio-accent shrink-0">›</span>
                <p className="leading-snug">{a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model variation */}
      {objects.length > 0 && (
        <div className="flex gap-2 border-b border-cadio-border/30 px-5 py-3">
          <button
            onClick={() => void switchModel("previous")}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cadio-border/60 bg-cadio-surface py-2 text-xs font-medium text-cadio-muted transition-colors hover:border-cadio-border hover:text-cadio-text disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            Previous
          </button>
          <button
            onClick={() => void switchModel("next")}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cadio-border/60 bg-cadio-surface py-2 text-xs font-medium text-cadio-muted transition-colors hover:border-cadio-border hover:text-cadio-text disabled:opacity-30"
          >
            Next
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}

      {/* Quick commands */}
      <div className="border-b border-cadio-border/30 px-5 py-4">
        <p className="mb-3 text-[11px] font-semibold text-cadio-muted">Quick edits</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => void run(cmd, false)}
              disabled={isLoading}
              className="rounded-md border border-cadio-border/50 bg-cadio-surface px-3 py-1.5 text-xs text-cadio-text/70 transition-colors hover:border-cadio-border hover:text-cadio-text disabled:opacity-30"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Filters — collapsible */}
      <div className="border-b border-cadio-border/30 px-5 py-3">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex w-full items-center justify-between text-[11px] font-semibold text-cadio-muted transition-colors hover:text-cadio-text"
        >
          <span className="flex items-center gap-2">
            Filters
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-cadio-accent px-1.5 py-px text-[10px] font-bold text-cadio-bg leading-none">
                {activeFilters.length}
              </span>
            )}
          </span>
          <svg className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showFilters && (
          <div className="mt-3 flex flex-wrap gap-2">
            {FILTER_CHIPS.map((f) => {
              const active = activeFilters.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggleFilter(f)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-all ${
                    active
                      ? "border-cadio-accent/40 bg-cadio-accent/10 text-cadio-accent"
                      : "border-cadio-border/50 bg-cadio-surface text-cadio-muted hover:text-cadio-text"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Prompt input — pinned to bottom */}
      <div className="mt-auto p-4">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-cadio-border/60 bg-cadio-surface transition-all focus-within:border-cadio-accent/40 focus-within:ring-2 focus-within:ring-cadio-accent/10"
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            placeholder={objects.length > 0 ? "Describe a change…" : "Describe what to build…"}
            disabled={isLoading}
            rows={2}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-cadio-text placeholder:text-cadio-muted/50 outline-none disabled:opacity-40"
          />
          <div className="flex items-center justify-between px-3 pb-3">
            {activeFilters.length > 0 ? (
              <p className="text-[10px] text-cadio-accent/70 truncate max-w-[180px]">
                +{activeFilters.join(", ")}
              </p>
            ) : (
              <p className="text-[10px] text-cadio-muted/40">↵ to generate</p>
            )}
            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className="flex h-8 items-center gap-2 rounded-lg bg-cadio-accent px-4 text-[11px] font-bold text-cadio-bg transition-all hover:bg-cadio-accent-hover disabled:opacity-30 active:scale-95"
            >
              {isLoading ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4" strokeWidth="2" strokeLinecap="round" /></svg>
              ) : (
                <>Generate <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 12h14M12 5l7 7-7 7" /></svg></>
              )}
            </button>
          </div>
        </form>

        {status && (
          <div className="mt-2.5 flex items-center gap-2 px-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cadio-accent animate-pulse shrink-0" />
            <p className="truncate text-[11px] text-cadio-muted">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}
