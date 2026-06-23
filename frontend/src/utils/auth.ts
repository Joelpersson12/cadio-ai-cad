import { authLogin, authGoogleLogin, requestPasswordReset, resetPassword, type AuthPayload, type AccountProfile } from "./api";

const CADIO_AUTH_KEY = "cadio_auth_ready";
const CADIO_ACCOUNT_KEY = "cadio_account_profile_v1";
const CADIO_AUTH_TOKEN_KEY = "cadio_auth_token_v1";

export interface CadioAccount {
  name?: string;
  email?: string;
  phone?: string;
  accountId: string;
  plan?: string;
  downloadsUsed?: number;
  downloadLimit?: number;
  downloadsRemaining?: number | null;
  canDownload?: boolean;
}

function normalizeAccountId(email?: string, phone?: string) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPhone = (phone || "").replace(/[^\d+]/g, "");
  return cleanEmail || cleanPhone || "guest";
}

function storeAccount(account: Partial<CadioAccount>, token?: string) {
  const accountId = account.accountId || normalizeAccountId(account.email, account.phone);
  window.localStorage.setItem(CADIO_AUTH_KEY, "true");
  if (accountId !== "guest") {
    window.localStorage.setItem(CADIO_ACCOUNT_KEY, JSON.stringify({
      name: account.name || "",
      email: account.email || "",
      phone: account.phone || "",
      accountId,
      plan: account.plan || "free",
      downloadsUsed: account.downloadsUsed ?? 0,
      downloadLimit: account.downloadLimit ?? 3,
      downloadsRemaining: account.downloadsRemaining ?? 3,
      canDownload: account.canDownload ?? true,
    }));
  }
  if (token) {
    window.localStorage.setItem(CADIO_AUTH_TOKEN_KEY, token);
  }
  window.dispatchEvent(new Event("cadio-auth-changed"));
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
      plan: parsed.plan || "free",
      downloadsUsed: parsed.downloadsUsed ?? 0,
      downloadLimit: parsed.downloadLimit ?? 3,
      downloadsRemaining: parsed.downloadsRemaining ?? 3,
      canDownload: parsed.canDownload ?? true,
    };
  } catch {
    return null;
  }
}

export function getCadioAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(CADIO_AUTH_TOKEN_KEY) || "";
}

export async function loginCadioAccount(payload: AuthPayload): Promise<AccountProfile> {
  const result = await authLogin(payload);
  storeAccount(result.account, result.token);
  return result.account;
}

export async function loginWithGoogle(credential: string): Promise<AccountProfile> {
  const result = await authGoogleLogin(credential);
  storeAccount(result.account, result.token);
  return result.account;
}

export function updateCadioAccount(account: AccountProfile) {
  if (typeof window === "undefined") return;
  storeAccount(account);
}

export function markCadioAuthenticated(account?: { name?: string; email?: string; phone?: string }) {
  if (typeof window === "undefined") return;
  storeAccount(account || {});
}

export function requestCadioAuth() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cadio-auth-required"));
}

export function signOutCadioAccount() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CADIO_AUTH_KEY);
  window.localStorage.removeItem(CADIO_ACCOUNT_KEY);
  window.localStorage.removeItem(CADIO_AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event("cadio-auth-changed"));
}

export async function sendPasswordReset(email: string): Promise<void> {
  await requestPasswordReset(email);
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<AccountProfile> {
  const result = await resetPassword(token, newPassword);
  storeAccount(result.account, result.token);
  return result.account;
}
