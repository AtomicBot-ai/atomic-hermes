import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

function readDotEnvValue(name: string): string {
  try {
    const envFile = path.resolve(__dirname, "..", ".env");
    if (!fs.existsSync(envFile)) return "";
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(new RegExp(`^\\s*(?:VITE_)?${name}=(.+)$`));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* best-effort */ }
  return "";
}

function resolvePosthogKey(): string {
  if (process.env.POSTHOG_API_KEY) return process.env.POSTHOG_API_KEY;
  return readDotEnvValue("POSTHOG_API_KEY");
}

function resolveAtomicBackendUrl(): string {
  if (process.env.VITE_ATOMIC_BACKEND_URL) return process.env.VITE_ATOMIC_BACKEND_URL;
  return readDotEnvValue("ATOMIC_BACKEND_URL");
}

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  base: "./",
  define: {
    __POSTHOG_API_KEY__: JSON.stringify(resolvePosthogKey()),
    "import.meta.env.VITE_ATOMIC_BACKEND_URL": JSON.stringify(
      resolveAtomicBackendUrl(),
    ),
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
