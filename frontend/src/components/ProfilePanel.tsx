import { useEffect, useState } from "react";
import { getCadioAccount, signOutCadioAccount, getCadioAuthToken, updateCadioAccount } from "../utils/auth";
import { getAccountProfile, createBillingPortalSession } from "../utils/api";
import type { CadioAccount } from "../utils/auth";

const ACCENT = "#2bb8dc";
const BG = "#080c10";

const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", unlimited: "Unlimited" };
const PLAN_COLORS: Record<string, string> = {
  free: "rgba(255,255,255,0.18)",
  pro: ACCENT,
  unlimited: "#a78bfa",
};

function initials(account: CadioAccount) {
  const name = account.name || account.email || "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function ProfileAvatar({
  size = 32,
  onClick,
}: {
  size?: number;
  onClick?: () => void;
}) {
  const [account, setAccount] = useState<CadioAccount | null>(getCadioAccount);

  useEffect(() => {
    const update = () => setAccount(getCadioAccount());
    window.addEventListener("cadio-auth-changed", update);
    return () => window.removeEventListener("cadio-auth-changed", update);
  }, []);

  if (!account) return null;

  const plan = account.plan ?? "free";
  const bg = PLAN_COLORS[plan] ?? PLAN_COLORS.free;

  return (
    <button
      onClick={onClick}
      title="My account"
      className="flex shrink-0 items-center justify-center rounded-full font-bold transition-all hover:scale-105 active:scale-95"
      style={{
        width: size,
        height: size,
        background: bg,
        color: plan === "free" ? "rgba(232,237,242,0.8)" : BG,
        fontSize: size * 0.38,
        boxShadow: plan !== "free" ? `0 0 12px ${bg}66` : undefined,
      }}
    >
      {initials(account)}
    </button>
  );
}

export default function ProfilePanel({
  open,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
}) {
  const [account, setAccount] = useState<CadioAccount | null>(getCadioAccount);
  const [refreshing, setRefreshing] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setAccount(getCadioAccount());
    window.addEventListener("cadio-auth-changed", update);
    return () => window.removeEventListener("cadio-auth-changed", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const token = getCadioAuthToken();
    if (!token) return;
    setRefreshing(true);
    getAccountProfile(token)
      .then(({ account: a }) => { updateCadioAccount(a); setAccount(getCadioAccount()); })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [open]);

  if (!open || !account) return null;

  const plan = account.plan ?? "free";
  const planColor = PLAN_COLORS[plan] ?? PLAN_COLORS.free;
  const isPaid = plan !== "free";
  const canUpgrade = plan !== "unlimited";

  const handlePortal = async () => {
    const token = getCadioAuthToken();
    if (!token) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { url } = await createBillingPortalSession(token);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not open billing portal";
      setPortalError(msg);
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSignOut = () => {
    signOutCadioAccount();
    onClose();
  };

  // Download bar data
  const proLimit = 20;
  const barUsed = account.downloadsUsed ?? 0;
  const barLimit = plan === "pro" ? proLimit : (account.downloadLimit ?? 3);
  const barRemaining = account.downloadsRemaining ?? 0;
  const barPct = Math.min(100, Math.round((barUsed / Math.max(1, barLimit)) * 100));
  const barWarn = barPct > 80;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center px-4 py-6"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(22px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl"
        style={{
          background: "#0d1318",
          border: "1px solid rgba(43,184,220,0.18)",
          maxHeight: "calc(100dvh - 48px)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div
          className="flex items-center gap-4 px-6 py-5"
          style={{
            background: "linear-gradient(135deg, rgba(43,184,220,0.07) 0%, transparent 65%)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-xl font-black"
            style={{
              background: planColor,
              color: plan === "free" ? "rgba(232,237,242,0.85)" : BG,
              boxShadow: isPaid ? `0 0 22px ${planColor}44` : undefined,
            }}
          >
            {initials(account)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-white">{account.name || "Account"}</p>
            <p className="truncate text-sm text-white/40">{account.email || account.phone || "—"}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{ background: planColor, color: plan === "free" ? "rgba(232,237,242,0.9)" : BG }}
              >
                {PLAN_LABELS[plan] ?? plan}
              </span>
              {refreshing && <span className="text-[10px] text-white/25">Refreshing…</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-white/30 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── Subscription ── */}
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">Subscription</p>

            {/* Download meter */}
            <div
              className="rounded-xl p-4 mb-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {plan === "unlimited" ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/55">Downloads</p>
                  <p className="text-sm font-bold" style={{ color: planColor }}>Unlimited</p>
                </div>
              ) : (
                <>
                  <div className="mb-2.5 flex items-center justify-between">
                    <p className="text-sm text-white/55">
                      {plan === "pro" ? "Downloads this month" : "Total downloads"}
                    </p>
                    <p className="text-sm font-bold text-white">
                      {barRemaining} <span className="text-xs font-normal text-white/30">/ {barLimit} left</span>
                    </p>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barPct}%`, background: barWarn ? "#f59e0b" : ACCENT }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Paid: manage/cancel via Stripe portal */}
            {isPaid && (
              <div className="space-y-2">
                <button
                  onClick={handlePortal}
                  disabled={portalLoading}
                  className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-sm font-medium transition-all hover:scale-[1.005] active:scale-[0.998] disabled:opacity-60"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(43,184,220,0.22)",
                    color: "rgba(232,237,242,0.8)",
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="h-4 w-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    {portalLoading ? "Opening portal…" : "Manage subscription"}
                  </span>
                  <svg className="h-4 w-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                {portalError && (
                  <p className="px-1 text-xs text-red-400">{portalError}</p>
                )}
                <p className="px-1 text-[11px] leading-relaxed text-white/25">
                  Cancel, change plan, or update payment info in Stripe's secure billing portal.
                </p>
              </div>
            )}

            {/* Upgrade CTA */}
            {canUpgrade && onUpgrade && (
              <button
                onClick={() => { onClose(); onUpgrade(); }}
                className="mt-3 w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={
                  plan === "free"
                    ? { background: ACCENT, color: BG, boxShadow: "0 4px 24px rgba(43,184,220,0.35)" }
                    : { background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.35)", color: "#a78bfa" }
                }
              >
                {plan === "free" ? "Upgrade to Pro — $9.99/mo" : "Go Unlimited — $24.99/mo"}
              </button>
            )}
          </section>

          <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

          {/* ── Account info ── */}
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">Account</p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="mb-0.5 text-[11px] text-white/30">Email</p>
                <p className="text-sm text-white/70 break-all">{account.email || account.phone || "—"}</p>
              </div>
              {account.name && (
                <>
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
                  <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="mb-0.5 text-[11px] text-white/30">Name</p>
                    <p className="text-sm text-white/70">{account.name}</p>
                  </div>
                </>
              )}
            </div>
          </section>

          <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

          {/* ── Sign out ── */}
          <section className="pb-1">
            <button
              onClick={handleSignOut}
              className="w-full rounded-xl py-3 text-sm font-medium transition-colors hover:text-white/80"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(232,237,242,0.4)",
              }}
            >
              Sign out
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}
