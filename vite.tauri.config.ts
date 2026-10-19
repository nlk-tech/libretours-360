// Tauri build config: a plain client-side SPA (index.html -> src/main.tsx) written to
// dist-tauri/, which tauri.conf.json bundles. The TanStack Start config in vite.config.ts
// builds an SSR server into .output/ instead, which the desktop app cannot use.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "./",
  clearScreen: false,
  plugins: [react(), tailwindcss(), tsconfigPaths({ root: "." })],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "dist-tauri",
    emptyOutDir: true,
  },
});
