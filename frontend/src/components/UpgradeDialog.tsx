import { useState } from "react";
import { getCadioAuthToken, getCadioAccount, isCadioAuthenticated } from "../utils/auth";

const ACCENT = "#2bb8dc";
const BG = "#080c10";

const PLANS = [
  {
    id: "pro",
    label: "Pro",
    price: "$9",
    period: "/mo",
    tagline: "20 downloads per month",
    features: ["Everything in Free", "20 downloads / month", "STEP export", "Priority AI speed"],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    id: "unlimited",
    label: "Unlimited",
    price: "$19",
    period: "/mo",
    tagline: "Unlimited downloads",
    features: ["Everything in Pro", "Unlimited downloads", "All export formats", "Early feature access"],
    cta: "Go Unlimited",
    highlight: false,
  },
];

async function startCheckout(plan: string): Promise<string> {
  const token = getCadioAuthToken();
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      plan,
      success_url: `${window.location.origin}/app?upgrade=success`,
      cancel_url: `${window.location.origin}/app`,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.status === "error") throw new Error(data.message || "Could not start checkout");
  return data.url as string;
}

export default function UpgradeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const account = getCadioAccount();
  const isAuthed = isCadioAuthenticated();
  const plan = account?.plan ?? "free";
  const downloadsRemaining = account?.downloadsRemaining;

  if (!open) return null;

  const handleUpgrade = async (planId: string) => {
    if (busy) return;
    setErr("");
    setBusy(planId);
    try {
      const url = await startCheckout(planId);
      window.location.href = url;
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not start checkout. Contact support@cadio.net.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center px-4"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(20px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-8 shadow-2xl"
        style={{ background: "#0d1318", border: "1px solid rgba(43,184,220,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: ACCENT }}>Upgrade Cadio</p>
            <h2 className="mt-1 text-2xl font-black text-white">Download more, build more</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/30 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isAuthed && plan === "free" && (
          <p className="mb-6 text-sm text-white/40">
            {downloadsRemaining != null && downloadsRemaining <= 0
              ? "You've used all 3 free downloads."
              : `You have ${downloadsRemaining ?? 0} free download${downloadsRemaining !== 1 ? "s" : ""} remaining.`}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className="rounded-xl p-6"
              style={
                p.highlight
                  ? { background: "rgba(43,184,220,0.06)", border: "1.5px solid rgba(43,184,220,0.32)" }
                  : { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.09)" }
              }
            >
              {p.highlight && (
                <div
                  className="mb-3 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: ACCENT, color: BG }}
                >
                  Popular
                </div>
              )}
              <p className="text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: p.highlight ? ACCENT : "rgba(232,237,242,0.35)" }}>
                {p.label}
              </p>
              <div className="mt-2 flex items-end gap-1.5">
                <span className="text-4xl font-black text-white">{p.price}</span>
                <span className="mb-1 text-sm text-white/30">{p.period}</span>
              </div>
              <p className="mt-1 text-xs text-white/35">{p.tagline}</p>
              <ul className="mt-4 mb-5 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/55">
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: p.highlight ? ACCENT : "rgba(255,255,255,0.25)" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void handleUpgrade(p.id)}
                disabled={!!busy || plan === p.id}
                className="w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.01] disabled:opacity-50"
                style={
                  p.highlight
                    ? { background: ACCENT, color: BG, boxShadow: "0 4px 24px rgba(43,184,220,0.4)" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,237,242,0.7)" }
                }
              >
                {busy === p.id ? "Redirecting…" : plan === p.id ? "Current plan" : p.cta}
              </button>
            </div>
          ))}
        </div>

        {err && (
          <p className="mt-4 rounded-xl px-4 py-2.5 text-xs text-red-300" style={{ background: "rgba(220,50,50,0.08)", border: "1px solid rgba(220,50,50,0.2)" }}>
            {err}
          </p>
        )}

        <p className="mt-5 text-center text-xs text-white/20">
          Payments handled by Stripe · Cancel anytime · Questions?{" "}
          <a href="mailto:support@cadio.net" className="text-[#2bb8dc] hover:text-white transition-colors">support@cadio.net</a>
        </p>
      </div>
    </div>
  );
}
