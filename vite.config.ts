// One client-side SPA (index.html -> src/main.tsx) for both targets:
//   - web:     `vite build`              -> dist/,       absolute asset paths ("/") so that
//                                           reloading a deep route like /editor/abc still
//                                           finds /assets/... behind an SPA fallback;
//   - desktop: `vite build --mode tauri` -> dist-tauri/, relative asset paths ("./") for the
//                                           tauri:// protocol (tauri.conf.json runs this).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig(({ mode }) => {
  const isTauri = mode === "tauri";
  return {
    base: isTauri ? "./" : "/",
    clearScreen: false,
    // Must come before react(): it regenerates src/routeTree.gen.ts from src/routes/.
    plugins: [tanstackRouter({ target: "react" }), react(), tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port: 3000,
      strictPort: true,
    },
    build: {
      outDir: isTauri ? "dist-tauri" : "dist",
      emptyOutDir: true,
    },
  };
});
