import { useMemo, useState } from "react";
import type { CadObject } from "../utils/types";
import { buildProjectShareData, buildProjectShareUrl, copyText } from "../utils/projectShare";

export default function ShareProjectDialog({
  open,
  onClose,
  title,
  prompt,
  printer,
  sessionId,
  objects,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  prompt: string;
  printer: string;
  sessionId: string;
  objects: CadObject[];
}) {
  const [copied, setCopied] = useState<"link" | "prompt" | null>(null);
  const data = useMemo(
    () => buildProjectShareData({ title, prompt, printer, sessionId, objects }),
    [objects, printer, prompt, sessionId, title],
  );
  const link = useMemo(() => buildProjectShareUrl(data), [data]);

  const copy = async (kind: "link" | "prompt", value: string) => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[76] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#343436] bg-[#1f1f20] p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Share project</h2>
            <p className="mt-1 text-xs leading-5 text-[#a8a8ab]">
              Link opens Cadio and rebuilds from the same prompt. Full cloud project sync can connect to auth later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2b2b2d] text-sm text-[#bdbdbd] hover:text-white"
            aria-label="Close share"
          >
            x
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#858585]">Project link</span>
            <textarea
              readOnly
              value={link}
              rows={3}
              className="w-full resize-none rounded-xl border border-[#303033] bg-[#111827] px-3 py-2 text-xs text-[#e8e8e8] outline-none"
            />
          </label>
          <button
            onClick={() => void copy("link", link)}
            className="h-11 w-full rounded-xl bg-[#e8e8e8] text-sm font-semibold text-[#171717] hover:bg-white"
          >
            {copied === "link" ? "Link copied" : "Copy project link"}
          </button>
          <button
            onClick={() => void copy("prompt", prompt || title)}
            disabled={!prompt && !title}
            className="h-10 w-full rounded-xl border border-[#303033] bg-[#242425] text-sm font-semibold text-[#e6e6e6] disabled:opacity-35"
          >
            {copied === "prompt" ? "Prompt copied" : "Copy prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}
