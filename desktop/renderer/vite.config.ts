import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  base: "./",
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
