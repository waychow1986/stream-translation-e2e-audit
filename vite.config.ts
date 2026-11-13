import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/client", emptyOutDir: false },
  server: {
    port: 4173,
    proxy: { "/api": "http://127.0.0.1:8080" }
  }
});
