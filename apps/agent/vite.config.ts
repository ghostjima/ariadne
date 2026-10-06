import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { serviceWorker } from "./vite-sw.ts";

// Served from GitHub Pages under /ariadne/agent/, beside the desk at
// /ariadne/; the Service Worker's scope is this base, so it controls the
// agent's pages and none of the desk's. ARIADNE_BENCH=1 also builds the
// throughput bench page (bench.html), which the app itself never ships.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/ariadne/agent/" : "/",
  plugins: [react(), serviceWorker()],
  // Stoa is linked from the sibling repository during development and has
  // its own node_modules, and the engine has its own in the workspace:
  // without dedupe the app would run two copies of React (and of XState,
  // which the engine's machines are built with) and fail with "Invalid hook
  // call".
  resolve: { dedupe: ["react", "react-dom", "react-aria-components", "xstate"] },
  build: process.env.ARIADNE_BENCH
    ? { outDir: "dist-bench", rolldownOptions: { input: { index: "index.html", bench: "bench.html" } } }
    : {},
  server: {
    port: 5183,
    strictPort: true,
    // What the dev server may serve beyond this app: the workspace (the
    // engine's build among it), and the linked Stoa packages and their
    // dependencies. Not the whole parent folder, which would hand the other
    // repositories' files (ignored ones included) to anything that can
    // reach the server.
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), "../../../stoa/packages", "../../../stoa/node_modules"],
    },
  },
  preview: { port: 4177, strictPort: true },
});
