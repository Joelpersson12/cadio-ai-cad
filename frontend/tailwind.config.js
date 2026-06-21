/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cadio: {
          bg: "#141618",
          surface: "#1e2226",
          panel: "#1e2226",
          border: "#2c3238",
          text: "#e8eaed",
          muted: "#8a9099",
          accent: "#2bb8dc",
          "accent-hover": "#4dcae8",
          selected: "#2bb8dc",
          danger: "#e05a5a",
          success: "#4ecdc4",
        },
      },
    },
  },
  plugins: [],
};
