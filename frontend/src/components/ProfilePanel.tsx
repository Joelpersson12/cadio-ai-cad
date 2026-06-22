import { useEffect, useState } from "react";
import { getCadioAccount, signOutCadioAccount, getCadioAuthToken, updateCadioAccount } from "../utils/auth";
import { getAccountProfile } from "../utils/api";
import type { CadioAccount } from "../utils/auth";

const ACCENT = "#2bb8dc";
const BG = "#080c10";

const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", unlimited: "Unlimited" };
const PLAN_COLORS: Record<string, string> = {
  free: "rgba(255,255,255,0.12)",
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
  const canUpgrade = plan !== "unlimited";

  const handleSignOut = () => {
    signOutCadioAccount();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center px-4"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(20px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl"
        style={{ background: "#0d1318", border: "1px solid rgba(43,184,220,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
              style={{ background: planColor, color: plan === "free" ? "rgba(232,237,242,0.85)" : BG }}
            >
              {initials(account)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{account.name || "Account"}</p>
              <p className="truncate text-xs text-white/40">{account.email || account.phone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Plan info */}
        <div className="px-6 py-5">
          <div className="mb-4 flex items-center justify-between rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Current plan</p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: planColor, color: plan === "free" ? "rgba(232,237,242,0.9)" : BG }}
                >
                  {PLAN_LABELS[plan] ?? plan}
                </span>
                {refreshing && <span className="text-[10px] text-white/20">Refreshing…</span>}
              </div>
            </div>

            {plan === "free" && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Downloads</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {account.downloadsRemaining ?? 0} <span className="text-white/30 font-normal">/ {account.downloadLimit ?? 3} left</span>
                </p>
              </div>
            )}

            {plan === "pro" && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">This month</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {account.downloadsRemaining ?? 0} <span className="text-white/30 font-normal">left</span>
                </p>
              </div>
            )}

            {plan === "unlimited" && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Downloads</p>
                <p className="mt-1 text-sm font-bold" style={{ color: planColor }}>Unlimited</p>
              </div>
            )}
          </div>

          {canUpgrade && onUpgrade && (
            <button
              onClick={() => { onClose(); onUpgrade(); }}
              className="mb-3 w-full rounded-xl py-2.5 text-sm font-bold transition-all hover:scale-[1.01]"
              style={{ background: ACCENT, color: BG, boxShadow: "0 4px 20px rgba(43,184,220,0.35)" }}
            >
              {plan === "free" ? "Upgrade to Pro" : "Go Unlimited"}
            </button>
          )}

          <button
            onClick={handleSignOut}
            className="w-full rounded-xl py-2.5 text-sm font-medium text-white/40 transition-colors hover:text-white/70"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
