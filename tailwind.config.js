/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./frontend/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        cadio: {
          bg: "#0b0f14",
          surface: "#111827",
          "surface-secondary": "#1f2937",
          panel: "#111827",
          border: "#1f2937",
          text: "#f8fafc",
          muted: "#94a3b8",
          accent: "#3b82f6",
          "accent-hover": "#2563eb",
          selected: "#2563eb",
          danger: "#ef4444",
          success: "#10b981",
        },
      },
    },
  },
  plugins: [],
};
