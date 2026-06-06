const CADIO_AUTH_KEY = "cadio_auth_ready";
const CADIO_ACCOUNT_KEY = "cadio_account_profile_v1";

export interface CadioAccount {
  name?: string;
  email?: string;
  phone?: string;
  accountId: string;
}

function normalizeAccountId(email?: string, phone?: string) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPhone = (phone || "").replace(/[^\d+]/g, "");
  return cleanEmail || cleanPhone || "guest";
}

export function isCadioAuthenticated() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CADIO_AUTH_KEY) === "true";
}

export function getCadioAccount(): CadioAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CADIO_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CadioAccount>;
    const accountId = normalizeAccountId(parsed.email, parsed.phone);
    if (accountId === "guest") return null;
    return {
      name: parsed.name || "",
      email: parsed.email || "",
      phone: parsed.phone || "",
      accountId,
    };
  } catch {
    return null;
  }
}

export function markCadioAuthenticated(account?: { name?: string; email?: string; phone?: string }) {
  if (typeof window === "undefined") return;
  const accountId = normalizeAccountId(account?.email, account?.phone);
  window.localStorage.setItem(CADIO_AUTH_KEY, "true");
  if (accountId !== "guest") {
    window.localStorage.setItem(CADIO_ACCOUNT_KEY, JSON.stringify({
      name: account?.name || "",
      email: account?.email || "",
      phone: account?.phone || "",
      accountId,
    }));
  }
  window.dispatchEvent(new Event("cadio-auth-changed"));
}

export function requestCadioAuth() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cadio-auth-required"));
}
