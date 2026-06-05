/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./frontend/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cadio: {
          bg: "#202022",
          panel: "#282829",
          border: "#3b3b3f",
          text: "#f3f3f4",
          muted: "#a7a8ac",
          accent: "#2bb8dc",
          "accent-hover": "#69d9f5",
          selected: "#27c2e8",
          danger: "#ff6b6b",
          success: "#4ecdc4",
        },
      },
    },
  },
  plugins: [],
};
