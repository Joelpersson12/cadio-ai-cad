import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../utils/api";
import { getCadioAuthToken } from "../utils/auth";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

interface CheckoutModalProps {
  plan: string;
  onClose: () => void;
}

export default function CheckoutModal({ plan, onClose }: CheckoutModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!STRIPE_KEY) {
      setError("VITE_STRIPE_PUBLISHABLE_KEY is not set — redeploy with publishable key configured.");
      setLoading(false);
      return;
    }
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
          throw new Error(data.message || `No client_secret returned. Response: ${JSON.stringify(data)}`);
        }
        setClientSecret(data.client_secret);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to start checkout");
      })
      .finally(() => setLoading(false));
  }, [plan]);

  const fetchClientSecret = useCallback(() => Promise.resolve(clientSecret!), [clientSecret]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full rounded-2xl overflow-hidden shadow-2xl"
        style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "#fff" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-4 z-10 text-2xl font-bold leading-none"
          style={{ color: "#666" }}
          aria-label="Close"
        >
          ×
        </button>
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
      </div>
    </div>
  );
}
