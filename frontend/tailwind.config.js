/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cadio: {
          bg: "#1c1c1f",
          panel: "#262628",
          border: "#3a3a3d",
          text: "#f2f2f3",
          muted: "#a7a8ab",
          accent: "#31bce6",
          "accent-hover": "#5bd6f6",
          selected: "#28c4ea",
          danger: "#ff6b6b",
          success: "#4ecdc4",
        },
      },
    },
  },
  plugins: [],
};
