import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  server: {
    port: 5173
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
