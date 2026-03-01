import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "hls.js": ["hls.js"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
