import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

function resolvePosthogKey(): string {
  if (process.env.POSTHOG_API_KEY) return process.env.POSTHOG_API_KEY;
  try {
    const envFile = path.resolve(__dirname, "..", ".env");
    if (!fs.existsSync(envFile)) return "";
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(/^\s*(?:VITE_)?POSTHOG_API_KEY=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* best-effort */ }
  return "";
}

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  base: "./",
  define: {
    __POSTHOG_API_KEY__: JSON.stringify(resolvePosthogKey()),
  },
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
  resolve: {
    alias: {
      "@store": path.resolve(__dirname, "src/store"),
      "@shared": path.resolve(__dirname, "src/ui/shared"),
      "@styles": path.resolve(__dirname, "src/ui/styles"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@ipc": path.resolve(__dirname, "src/ipc"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@analytics": path.resolve(__dirname, "src/analytics"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "monaco-editor": ["monaco-editor"],
          "monaco-react": ["@monaco-editor/react"],
        },
      },
    },
  },
});
