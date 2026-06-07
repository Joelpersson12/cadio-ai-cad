import { useEffect, useState, type FormEvent } from "react";
import { useCadStore } from "../stores/cadStore";
import {
  downloadExport,
  getAccountProfile,
  type AccountProfile,
} from "../utils/api";
import {
  getCadioAccount,
  getCadioAuthToken,
  loginCadioAccount,
  updateCadioAccount,
} from "../utils/auth";
import { copyText } from "../utils/projectShare";
import ScalePercentInput from "./ScalePercentInput";

const EXPORT_FORMATS = [
  { value: "stl", label: "STL", hint: "Most slicers" },
  { value: "3mf", label: "3MF", hint: "Modern slicers" },
  { value: "obj", label: "OBJ", hint: "Mesh editors" },
  { value: "amf", label: "AMF", hint: "Legacy printers" },
];

function tempRange(value: [number, number] | undefined) {
  if (!value) return "-";
  return `${value[0]}-${value[1]} C`;
}

export function ExportFlowContent({ onClose }: { onClose?: () => void }) {
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
  const [account, setAccount] = useState<AccountProfile | null>(() => getCadioAccount());
  const [authToken, setAuthToken] = useState(() => getCadioAuthToken());
  const [authBusy, setAuthBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? objects[0];
  const scalePercent = (selectedObject?.transform.scale[0] ?? 1) * 100;
  const selectedPrinter = printers[printer];
  const source = printSettings?.source_settings;
  const downloadsUsed = account?.downloadsUsed ?? 0;
  const downloadLimit = account?.downloadLimit ?? 1;
  const downloadsRemaining = account?.downloadsRemaining === null
    ? null
    : account?.downloadsRemaining ?? Math.max(0, downloadLimit - downloadsUsed);
  const canDownload = Boolean(
    account?.canDownload ?? (account ? downloadsRemaining === null || downloadsRemaining > 0 : false),
  );

  const refreshAccount = async (token = authToken) => {
    if (!token) return;
    const result = await getAccountProfile(token);
    updateCadioAccount(result.account);
    setAccount(result.account);
    setAuthToken(token);
  };

  useEffect(() => {
    const syncAuth = () => {
      const token = getCadioAuthToken();
      setAuthToken(token);
      setAccount(getCadioAccount());
      if (token) {
        void refreshAccount(token).catch(() => undefined);
      }
    };
    syncAuth();
    window.addEventListener("cadio-auth-changed", syncAuth);
    return () => window.removeEventListener("cadio-auth-changed", syncAuth);
  }, []);

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

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setExportError("");
    setAuthBusy(true);
    try {
      const nextAccount = await loginCadioAccount({
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        password: String(form.get("password") || ""),
      });
      setAccount(nextAccount);
      setAuthToken(getCadioAuthToken());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not log in.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!sessionId || downloadBusy) return;
    const token = authToken || getCadioAuthToken();
    if (!token) {
      setExportError("Log in with email and password to download your free generated file.");
      return;
    }
    if (!canDownload) {
      setExportError("Your free download has already been used. Upgrade options are coming soon.");
      return;
    }
    setExportError("");
    setDownloadBusy(true);
    try {
      await downloadExport(sessionId, format, token);
      await refreshAccount(token);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Download failed.");
      await refreshAccount(token).catch(() => undefined);
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

      <section className="rounded-xl border border-[#303033] bg-[#202021] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#858585]">Account</div>
            {account ? (
              <p className="mt-1 text-xs text-[#bdbdbd]">
                Signed in as {account.email || account.name || "Cadio user"}
              </p>
            ) : (
              <p className="mt-1 text-xs text-[#bdbdbd]">
                Build and edit for free. Log in only when you download.
              </p>
            )}
          </div>
          {account && (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              canDownload ? "bg-[#123038] text-[#b7f3ff]" : "bg-[#3a241f] text-[#ffb199]"
            }`}>
              {downloadsRemaining === null ? "Unlimited" : `${downloadsRemaining} left`}
            </span>
          )}
        </div>
        {account ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#171717] px-3 py-2">
              <div className="text-[#858585]">Plan</div>
              <div className="mt-1 font-semibold capitalize">{account.plan || "free"}</div>
            </div>
            <div className="rounded-lg bg-[#171717] px-3 py-2">
              <div className="text-[#858585]">Downloads</div>
              <div className="mt-1 font-semibold">
                {downloadsUsed}/{downloadLimit < 0 ? "unlimited" : downloadLimit}
              </div>
            </div>
          </div>
        ) : (
          <form className="mt-3 grid gap-2" onSubmit={handleAuthSubmit}>
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="h-10 rounded-lg border border-[#343436] bg-[#111] px-3 text-sm text-white outline-none placeholder:text-[#777] focus:border-[#2bb8dc]"
            />
            <input
              name="password"
              type="password"
              minLength={4}
              required
              placeholder="Password"
              className="h-10 rounded-lg border border-[#343436] bg-[#111] px-3 text-sm text-white outline-none placeholder:text-[#777] focus:border-[#2bb8dc]"
            />
            <button
              disabled={authBusy}
              className="h-10 rounded-lg bg-[#2bb8dc] text-sm font-semibold text-[#101010] disabled:cursor-wait disabled:opacity-60"
            >
              {authBusy ? "Signing in..." : "Log in / create account"}
            </button>
          </form>
        )}
        {account && !canDownload && (
          <p className="mt-3 rounded-lg border border-[#4b332c] bg-[#211817] px-3 py-2 text-xs leading-5 text-[#ffb199]">
            Your included download has been used. Paid plan upgrades are coming soon.
          </p>
        )}
      </section>

      {exportError && (
        <p className="rounded-lg border border-[#6b2d2d] bg-[#2a1717] px-3 py-2 text-xs text-[#ffb3b3]">
          {exportError}
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!sessionId || downloadBusy || (Boolean(account) && !canDownload)}
          className={`flex h-12 items-center justify-center rounded-xl text-sm font-semibold ${
            sessionId && (!account || canDownload)
              ? "bg-[#e8e8e8] text-[#171717] hover:bg-white"
              : "bg-[#333] text-[#777]"
          }`}
        >
          {downloadBusy ? "Preparing..." : `Download ${format.toUpperCase()}`}
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

export default function ExportFlowDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#343436] bg-[#1f1f20] p-5 shadow-2xl">
        <ExportFlowContent onClose={onClose} />
      </div>
    </div>
  );
}
