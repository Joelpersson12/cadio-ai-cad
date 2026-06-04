/** AI command panel - Shapr3D-inspired design with mobile support. */

import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCadStore } from "../stores/cadStore";

const QUICK_COMMANDS = [
  "Make it taller",
  "Make it wider",
  "Add rounded corners",
  "Add mounting holes",
  "Make it thicker",
  "Mirror geometry",
  "Optimize for printing",
  "Duplicate object",
];

const EXAMPLE_OBJECTS = [
  "Create a phone stand",
  "Create a headphone stand",
  "Create a pen holder",
  "Create a monitor stand",
  "Create a cable organizer",
  "Create a tablet stand",
];

export default function AiPanel() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const { status, runPrompt } = useCadStore();

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || isLoading) return;
    setIsLoading(true);
    setHistory((h) => [text, ...h.slice(0, 9)]);
    setPrompt("");
    try {
      await runPrompt(text);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuick = async (cmd: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setHistory((h) => [cmd, ...h.slice(0, 9)]);
    try {
      await runPrompt(cmd);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cadio-accent animate-pulse" />
        <h2 className="text-sm font-semibold text-cadio-text tracking-wide uppercase">
          AI Copilot
        </h2>
      </div>

      {/* Example objects */}
      <div>
        <p className="text-xs text-cadio-muted mb-2 uppercase tracking-wider">Start with</p>
        <div className="flex flex-col gap-1">
          {EXAMPLE_OBJECTS.map((ex) => (
            <button
              key={ex}
              onClick={() => void handleQuick(ex)}
              disabled={isLoading}
              className="text-left px-3 py-2 rounded-lg bg-[#1a2535] text-cadio-text text-xs hover:bg-[#243048] hover:text-cadio-accent transition-all disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-cadio-border" />

      {/* Prompt input */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <p className="text-xs text-cadio-muted uppercase tracking-wider">Describe changes</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Make it 50% taller and add holes..."
          rows={3}
          disabled={isLoading}
          className="w-full rounded-lg border border-cadio-border bg-[#111827] text-cadio-text p-3 text-sm resize-none focus:outline-none focus:border-cadio-accent transition-colors disabled:opacity-50"
        />
        <motion.button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          whileTap={{ scale: 0.97 }}
          className="w-full rounded-lg bg-cadio-accent text-[#081225] py-2.5 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-[#081225]/30 border-t-[#081225] rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            "Apply Command ↵"
          )}
        </motion.button>
      </form>

      {/* Quick edits */}
      <div>
        <p className="text-xs text-cadio-muted mb-2 uppercase tracking-wider">Quick edits</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => void handleQuick(cmd)}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-md text-xs bg-[#1a2535] text-cadio-muted hover:text-cadio-text hover:bg-[#243048] transition-all disabled:opacity-40"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-cadio-accent bg-cadio-accent/10 rounded-lg px-3 py-2"
          >
            {status}
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-auto">
          <p className="text-xs text-cadio-muted mb-2 uppercase tracking-wider">Recent</p>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => void handleQuick(h)}
                disabled={isLoading}
                className="text-left px-2.5 py-1.5 rounded text-xs text-cadio-muted hover:text-cadio-text hover:bg-[#1a2535] transition-all disabled:opacity-40 truncate"
              >
                ↩ {h}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}