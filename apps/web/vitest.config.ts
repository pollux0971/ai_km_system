import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // E01-S022: next/font/local only works inside Next's own build pipeline — see
      // src/test/next-font-local-mock.ts for why this needs a test-only stand-in.
      "next/font/local": path.resolve(__dirname, "./src/test/next-font-local-mock.ts"),
    },
  },
});
