const CADIO_AUTH_KEY = "cadio_auth_ready";

export function isCadioAuthenticated() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CADIO_AUTH_KEY) === "true";
}

export function markCadioAuthenticated() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CADIO_AUTH_KEY, "true");
  window.dispatchEvent(new Event("cadio-auth-changed"));
}

export function requestCadioAuth() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cadio-auth-required"));
}
