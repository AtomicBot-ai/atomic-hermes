import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@store": path.resolve(__dirname, "renderer/src/store"),
      "@shared": path.resolve(__dirname, "renderer/src/ui/shared"),
      "@styles": path.resolve(__dirname, "renderer/src/ui/styles"),
      "@ui": path.resolve(__dirname, "renderer/src/ui"),
      "@ipc": path.resolve(__dirname, "renderer/src/ipc"),
      "@lib": path.resolve(__dirname, "renderer/src/lib"),
      "@analytics": path.resolve(__dirname, "renderer/src/analytics"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
