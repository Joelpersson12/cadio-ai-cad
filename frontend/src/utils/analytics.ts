const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

declare global {
  interface Window {
    plausible?: (eventName: string, options?: { props?: Record<string, string | number | boolean> }) => void;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

function appendScript(src: string, attributes: Record<string, string> = {}) {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.defer = true;
  script.src = src;
  for (const [key, value] of Object.entries(attributes)) {
    script.setAttribute(key, value);
  }
  document.head.appendChild(script);
}

export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if (plausibleDomain) {
    appendScript("https://plausible.io/js/script.js", {
      "data-domain": plausibleDomain,
    });
  }

  if (gaMeasurementId) {
    appendScript(`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", gaMeasurementId, { send_page_view: false });
  }
}

export function trackPageView(path = window.location.pathname + window.location.hash) {
  if (typeof window === "undefined") return;

  if (plausibleDomain && window.plausible) {
    window.plausible("pageview", { props: { path } });
  }

  if (gaMeasurementId && window.gtag) {
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: path,
    });
  }
}
