import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback } from "react";
import { API_BASE } from "../utils/api";
import { getCadioAuthToken } from "../utils/auth";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

interface CheckoutModalProps {
  plan: string;
  onClose: () => void;
}

export default function CheckoutModal({ plan, onClose }: CheckoutModalProps) {
  const fetchClientSecret = useCallback(async () => {
    const token = getCadioAuthToken();
    const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok || data.status === "error") throw new Error(data.message || "Checkout failed");
    return data.client_secret as string;
  }, [plan]);

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
        <div className="p-2">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </div>
  );
}
