import { useEffect, useState } from "react";

export function parseScalePercent(value: string) {
  const normalized = value.replace("%", "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0.1, Math.min(1000, parsed));
}

export function formatScalePercent(value: number) {
  return (Math.round(value * 10) / 10)
    .toFixed(1)
    .replace(/\.0$/, "")
    .replace(".", ",");
}

export default function ScalePercentInput({
  value,
  onCommit,
  disabled = false,
  className = "",
}: {
  value: number;
  onCommit: (percent: number) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(formatScalePercent(value));

  useEffect(() => {
    setDraft(formatScalePercent(value));
  }, [value]);

  const commit = () => {
    const parsed = parseScalePercent(draft);
    if (parsed === null) {
      setDraft(formatScalePercent(value));
      return;
    }
    setDraft(formatScalePercent(parsed));
    void onCommit(parsed);
  };

  return (
    <label className={`relative block ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="h-9 w-full rounded-lg border border-[#3a3a3c] bg-[#111827] px-3 pr-8 text-right text-sm font-semibold text-white outline-none focus:border-cadio-accent disabled:opacity-45"
        aria-label="Model scale percent"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9a9a9a]">%</span>
    </label>
  );
}
