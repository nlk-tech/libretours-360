import { createRouter } from "@tanstack/react-router";
import { createHashHistory } from "@tanstack/history";
import { routeTree } from "./routeTree.gen";

// In Tauri/desktop or file:// protocol, use hash-based routing.
// The browser history API doesn't work with custom protocols like tauri://.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    history: (isTauri || isFileProtocol ? createHashHistory() : undefined) as any,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
