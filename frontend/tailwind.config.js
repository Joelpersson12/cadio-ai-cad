/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cadio: {
          bg: "#0f1117",
          panel: "#181d28",
          border: "#2b3242",
          text: "#d9e2f2",
          muted: "#96a1b9",
          accent: "#5aa1ff",
          "accent-hover": "#78b3ff",
          selected: "#ffd166",
          danger: "#ff6b6b",
          success: "#4ecdc4",
        },
      },
    },
  },
  plugins: [],
};
