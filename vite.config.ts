import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backend = "http://127.0.0.1:43181";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": backend,
      "/demo-yapi": backend
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
