import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../utils/api";
import { getCadioAuthToken } from "../utils/auth";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

const PLAN_LABELS: Record<string, { name: string; price: string }> = {
  pro: { name: "Pro", price: "$9.99 / month" },
  unlimited: { name: "Unlimited", price: "$24.99 / month" },
};

interface CheckoutModalProps {
  plan: string;
  onClose: () => void;
}

export default function CheckoutModal({ plan, onClose }: CheckoutModalProps) {
  const [consented, setConsented] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const planInfo = PLAN_LABELS[plan] ?? { name: plan, price: "" };

  useEffect(() => {
    if (!confirmed) return;
    if (!STRIPE_KEY) {
      setError("Payment not configured. Contact support@cadio.net.");
      return;
    }
    setLoading(true);
    const token = getCadioAuthToken();
    fetch(`${API_BASE}/api/stripe/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "error" || !data.client_secret) {
          throw new Error(data.message || `No client_secret returned.`);
        }
        setClientSecret(data.client_secret);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to start checkout");
      })
      .finally(() => setLoading(false));
  }, [confirmed, plan]);

  const fetchClientSecret = useCallback(() => Promise.resolve(clientSecret!), [clientSecret]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full rounded-2xl overflow-hidden shadow-2xl"
        style={{ maxWidth: 520, maxHeight: "92vh", overflowY: "auto", background: "#fff" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-4 z-10 text-2xl font-bold leading-none"
          style={{ color: "#888" }}
          aria-label="Close"
        >
          ×
        </button>

        {/* ── Pre-consent step ── */}
        {!confirmed && (
          <div className="p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Cadio subscription</p>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{planInfo.name}</h2>
            <p className="text-gray-500 text-sm mb-6">{planInfo.price} — renews automatically each month</p>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 mb-6 text-sm text-gray-700 space-y-2">
              <p>✓ Access starts immediately after payment</p>
              <p>✓ Cancel anytime — cancellation takes effect at period end</p>
              <p>✓ Billed monthly until cancelled</p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-6">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
              />
              <span className="text-xs text-gray-600 leading-5">
                I agree to Cadio's{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  Privacy Policy
                </a>
                . I request that the service starts immediately upon payment and
                I acknowledge that I thereby{" "}
                <strong>waive my 14-day right of withdrawal</strong> (EU Consumer Rights
                Directive, Art. 16m) as the digital service will have commenced.
                I understand that the subscription renews automatically each month
                until I cancel.
              </span>
            </label>

            <button
              disabled={!consented}
              onClick={() => setConfirmed(true)}
              className="w-full rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-40"
              style={{ background: consented ? "#2bb8dc" : "#ccc", color: "#fff" }}
            >
              Continue to payment →
            </button>
            <p className="mt-4 text-center text-[10px] text-gray-400">
              Secure payment by Stripe · Your card details are never stored by Cadio
            </p>
          </div>
        )}

        {/* ── Stripe checkout step ── */}
        {confirmed && (
          <div className="p-2 min-h-32">
            {loading && (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                Loading checkout…
              </div>
            )}
            {error && (
              <div className="p-6 text-center">
                <p className="font-semibold text-red-600 mb-2">Checkout error</p>
                <p className="text-sm text-gray-600 break-words">{error}</p>
              </div>
            )}
            {!loading && !error && clientSecret && stripePromise && (
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
