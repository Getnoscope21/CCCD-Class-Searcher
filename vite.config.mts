import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "frontend",
  plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
  test: { include: ["src/**/*.test.ts", "../src/**/*.test.ts"] },
});
