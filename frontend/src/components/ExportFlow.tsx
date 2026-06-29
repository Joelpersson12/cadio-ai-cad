import { useState } from "react";
import { useCadStore } from "../stores/cadStore";
import { downloadExport } from "../utils/api";
import { copyText } from "../utils/projectShare";
import { getCadioAuthToken, getCadioAccount, isCadioAuthenticated, requestCadioAuth, updateCadioAccount } from "../utils/auth";
import ScalePercentInput from "./ScalePercentInput";

const EXPORT_FORMATS = [
  { value: "stl", label: "STL", hint: "Most slicers" },
  { value: "3mf", label: "3MF", hint: "Modern slicers" },
  { value: "step", label: "STEP", hint: "CAD software" },
  { value: "obj", label: "OBJ", hint: "Mesh editors" },
  { value: "amf", label: "AMF", hint: "Legacy printers" },
];

function tempRange(value: [number, number] | undefined) {
  if (!value) return "-";
  return `${value[0]}-${value[1]} C`;
}

export function ExportFlowContent({ onClose, onRequestUpgrade }: { onClose?: () => void; onRequestUpgrade?: () => void }) {
  const {
    sessionId,
    objects,
    printer,
    printers,
    printSettings,
    selectedObjectId,
    setSelectedScalePercent,
  } = useCadStore();
  const [format, setFormat] = useState("stl");
  const [copied, setCopied] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const account = getCadioAccount();
  const isAuthed = isCadioAuthenticated();
  const canDownload = account?.canDownload ?? false;
  const downloadsRemaining = account?.downloadsRemaining;
  const plan = account?.plan ?? "free";
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? objects[0];
  const scalePercent = (selectedObject?.transform.scale[0] ?? 1) * 100;
  const selectedPrinter = printers[printer];
  const source = printSettings?.source_settings;

  const copySettings = async () => {
    if (!printSettings) return;
    const text = [
      `Printer: ${printSettings.printer.name}`,
      `Material: ${printSettings.material_label}`,
      `Scale: ${scalePercent.toFixed(1)}%`,
      `Recommended scale: ${printSettings.scale.recommended_scale_percent.toFixed(1)}%`,
      `Layer height: ${printSettings.slicer.layer_height_mm} mm`,
      `Nozzle: ${tempRange(printSettings.slicer.nozzle_temp_c)}`,
      `Bed: ${tempRange(printSettings.slicer.bed_temp_c)}`,
      `Infill: ${printSettings.slicer.infill_percent}%`,
      `Walls: ${printSettings.slicer.walls}`,
      `Supports: ${printSettings.slicer.support}`,
    ].join("\n");
    const ok = await copyText(text);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const noPrinter = printer === "choose_printer" || !selectedPrinter;

  const handleDownload = async () => {
    if (!sessionId || downloadBusy) return;
    if (noPrinter) {
      setExportError("Choose a printer first — pick your 3D printer at the top so the file is sized and checked for your build plate.");
      return;
    }
    if (!isAuthed) {
      requestCadioAuth();
      onClose?.();
      return;
    }
    if (!canDownload) {
      onRequestUpgrade?.();
      return;
    }
    setExportError("");
    setDownloadBusy(true);
    try {
      const token = getCadioAuthToken();
      await downloadExport(sessionId, format, token);
      // Refresh account after download to update remaining count
      if (account) {
        updateCadioAccount({
          ...account,
          downloadsUsed: (account.downloadsUsed ?? 0) + 1,
          downloadsRemaining: downloadsRemaining != null ? Math.max(0, downloadsRemaining - 1) : null,
          canDownload: downloadsRemaining != null ? downloadsRemaining > 1 : true,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed.";
      if (msg.toLowerCase().includes("login") || msg.toLowerCase().includes("401")) {
        requestCadioAuth();
        onClose?.();
      } else if (msg.includes("free download") || msg.includes("limit") || msg.toLowerCase().includes("upgrade") || msg.includes("402")) {
        onRequestUpgrade?.();
      } else if (msg.toLowerCase().includes("session not found") || msg.includes("404")) {
        setExportError("Session expired — please regenerate your model and try again.");
      } else {
        setExportError(msg);
      }
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Export</h2>
          <p className="mt-1 text-xs text-[#9a9a9d]">
            {objects.length || 0} parts, {selectedPrinter?.name ?? "selected printer"}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg bg-[#2b2b2d] text-sm text-[#bdbdbd] hover:text-white"
            aria-label="Close export"
          >
            x
          </button>
        )}
      </div>

      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#858585]">Format</div>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_FORMATS.map((item) => (
            <button
              key={item.value}
              onClick={() => setFormat(item.value)}
              className={`rounded-xl border px-3 py-3 text-left ${
                format === item.value
                  ? "border-[#28c7df] bg-[#123038]"
                  : "border-[#303033] bg-[#242425] hover:border-[#555]"
              }`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-1 block text-[11px] text-[#9a9a9d]">{item.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[#303033] bg-[#202021] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#858585]">Scaling</div>
            <p className="mt-1 text-xs text-[#9a9a9d]">Type 98,3% when you want shrink compensation.</p>
          </div>
          <ScalePercentInput
            value={scalePercent}
            onCommit={(percent) => void setSelectedScalePercent(percent)}
            disabled={!selectedObject}
            className="w-28"
          />
        </div>
        {printSettings && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#171717] px-3 py-2">
              <div className="text-[#858585]">Recommended</div>
              <div className="mt-1 font-semibold">{printSettings.scale.recommended_scale_percent.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg bg-[#171717] px-3 py-2">
              <div className="text-[#858585]">Fit max</div>
              <div className="mt-1 font-semibold">{printSettings.scale.fit_scale_percent.toFixed(1)}%</div>
            </div>
          </div>
        )}
      </section>

      {printSettings && (
        <section className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-[#303033] bg-[#202021] p-3">
            <div className="text-[#858585]">Material</div>
            <div className="mt-1 font-semibold">{printSettings.material_label}</div>
            <div className="mt-1 text-[#9a9a9d]">
              {tempRange(printSettings.slicer.nozzle_temp_c)} nozzle
            </div>
          </div>
          <div className="rounded-xl border border-[#303033] bg-[#202021] p-3">
            <div className="text-[#858585]">Profile</div>
            <div className="mt-1 font-semibold">{printSettings.slicer.layer_height_mm} mm layer</div>
            <div className="mt-1 text-[#9a9a9d]">{printSettings.slicer.infill_percent}% infill</div>
          </div>
        </section>
      )}

      {source?.has_creator_settings && (
        <section className="rounded-xl border border-[#24464d] bg-[#13272c] p-3 text-xs">
          <div className="font-semibold text-[#b7f3ff]">Creator settings loaded</div>
          <p className="mt-1 text-[#a9cbd1]">
            {source.title || "Printables model"}
            {source.author ? ` by ${source.author}` : ""}
          </p>
        </section>
      )}

      {!isAuthed ? (
        <section className="rounded-xl border border-[#3d2a00] bg-[#1f1500] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffd060]">Sign In Required</div>
              <p className="mt-1 text-xs leading-5 text-[#c8a84a]">
                Create a free account to download models. 3 downloads included.
              </p>
            </div>
            <button
              onClick={() => { requestCadioAuth(); onClose?.(); }}
              className="shrink-0 rounded-lg bg-[#ffd060] px-3 py-1.5 text-[11px] font-bold text-[#1a0d00]"
            >
              Sign In
            </button>
          </div>
        </section>
      ) : !canDownload ? (
        <section className="rounded-xl border border-[#4d1a1a] bg-[#200d0d] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff8080]">Download Limit Reached</div>
              <p className="mt-1 text-xs leading-5 text-[#c07070]">
                {plan === "pro" ? "Monthly limit reached." : "Free downloads used."} Upgrade for more.
              </p>
            </div>
            <button
              onClick={() => onRequestUpgrade?.()}
              className="shrink-0 rounded-lg bg-[#ff8080] px-3 py-1.5 text-[11px] font-bold text-[#1a0000]"
            >
              Upgrade
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-[#1a3a20] bg-[#0d1f10] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6de89a]">
                {plan === "unlimited" ? "Unlimited Plan" : plan === "pro" ? "Pro Plan" : "Free Plan"}
              </div>
              <p className="mt-1 text-xs text-[#4fa86a]">
                {plan === "unlimited"
                  ? "Unlimited downloads"
                  : plan === "pro"
                  ? `${downloadsRemaining ?? 0} downloads left this month`
                  : `${downloadsRemaining ?? 0} of 3 free downloads remaining`}
              </p>
            </div>
            {plan === "free" && (
              <button
                onClick={() => onRequestUpgrade?.()}
                className="shrink-0 rounded-lg border border-[#2bb8dc]/40 px-3 py-1.5 text-[11px] font-semibold text-[#2bb8dc]"
              >
                Upgrade
              </button>
            )}
          </div>
        </section>
      )}

      {exportError && (
        <p className="rounded-lg border border-[#6b2d2d] bg-[#2a1717] px-3 py-2 text-xs text-[#ffb3b3]">
          {exportError}
        </p>
      )}

      {noPrinter && (
        <p className="rounded-lg border border-[#5a4410] bg-[#221a08] px-3 py-2 text-xs text-[#ffd27a]">
          Choose your 3D printer at the top first — Cadio sizes and checks the model for your build plate before download.
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!sessionId || downloadBusy || noPrinter}
          className={`flex h-12 items-center justify-center rounded-xl text-sm font-semibold ${
            !sessionId || downloadBusy || noPrinter
              ? "bg-[#333] text-[#777]"
              : !isAuthed || !canDownload
              ? "bg-[#2a2a2c] text-[#9a9a9d] hover:bg-[#333]"
              : "bg-[#e8e8e8] text-[#171717] hover:bg-white"
          }`}
        >
          {downloadBusy
            ? "Preparing..."
            : noPrinter
            ? "Choose a printer first"
            : !isAuthed
            ? "Sign In to Download"
            : !canDownload
            ? "Upgrade to Download"
            : `Download ${format.toUpperCase()}`}
        </button>
        <button
          onClick={() => void copySettings()}
          disabled={!printSettings}
          className="h-12 rounded-xl border border-[#303033] bg-[#242425] px-4 text-sm font-semibold text-[#e6e6e6] disabled:opacity-35"
        >
          {copied ? "Copied" : "Copy settings"}
        </button>
      </div>
    </div>
  );
}

export default function ExportFlowDialog({
  open,
  onClose,
  onRequestUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onRequestUpgrade?: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#343436] bg-[#1f1f20] p-5 shadow-2xl">
        <ExportFlowContent onClose={onClose} onRequestUpgrade={onRequestUpgrade} />
      </div>
    </div>
  );
}
