/** AI command panel - left sidebar for natural language CAD editing. */

import { useState } from "react";
import { motion } from "framer-motion";
import { useCadStore } from "../stores/cadStore";

export default function AiPanel() {
  const [prompt, setPrompt] = useState("Create a phone stand");
  const { sessionId, status, runPrompt, syncMesh } = useCadStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      void runPrompt(prompt);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-cadio-text">AI Copilot</h2>
      <p className="text-xs text-cadio-muted truncate">
        Session: {sessionId || "not started"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Try: add holes, fillet edges, make thicker, rotate 90, duplicate..."
          className="w-full min-h-[100px] rounded-lg border border-cadio-border bg-[#121723] text-cadio-text p-3 text-sm resize-y focus:outline-none focus:border-cadio-accent"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.97 }}
          className="w-full rounded-lg bg-cadio-accent text-[#081225] py-2.5 font-semibold text-sm hover:bg-cadio-accent-hover transition-colors"
        >
          Apply AI Command
        </motion.button>
      </form>

      <button
        onClick={() => void syncMesh()}
        className="w-full rounded-lg bg-[#2a3347] text-cadio-text py-2 text-sm hover:bg-[#354058] transition-colors"
      >
        Refresh Model
      </button>

      <div className="text-xs text-cadio-muted mt-1">{status}</div>

      {/* Quick commands */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {[
          "make thicker",
          "add holes",
          "fillet edges",
          "mirror",
          "duplicate",
          "rotate 90",
          "optimize for printing",
        ].map((cmd) => (
          <button
            key={cmd}
            onClick={() => {
              setPrompt(cmd);
              void runPrompt(cmd);
            }}
            className="px-2 py-1 rounded text-xs bg-[#1e2536] text-cadio-muted hover:text-cadio-text hover:bg-[#2a3347] transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}
