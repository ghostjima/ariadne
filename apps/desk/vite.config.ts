import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { firstPaintScript } from "@ghostjima/stoa-react/first-paint";
import { PREFERENCES } from "./src/preferences";
import { serviceWorker } from "./vite-sw";

// Served from GitHub Pages under /ariadne/. The Service Worker that streams
// the assistant's run is served at the base path, so its scope is the
// desk. ARIADNE_BENCH=1 also builds the assistant's throughput bench page
// (bench.html), which the desk itself never ships.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/ariadne/" : "/",
  plugins: [
    react(),
    serviceWorker(),
    // Before anything is drawn: lang, dir and the theme, from the link or
    // the last visit, the same way useAppPreferences reads them. At the end
    // of the head: still before the body is drawn, and after the charset,
    // which must come within the document's first bytes.
    { name: "first-paint", transformIndexHtml: () => [{ tag: "script", children: firstPaintScript(PREFERENCES), injectTo: "head" }] },
  ],
  // Stoa is linked from the sibling repository during development and has
  // its own node_modules, and the engines have their own in the workspace:
  // without dedupe the app would run two copies of React (and of XState,
  // which the run engine's machines are built with) and fail with "Invalid
  // hook call".
  resolve: { dedupe: ["react", "react-dom", "react-aria-components", "xstate"] },
  worker: { format: "es" },
  // Source maps beside the bundle: the code is open, and a reader of the
  // page can follow it back to the source.
  build: process.env.ARIADNE_BENCH
    ? { outDir: "dist-bench", sourcemap: true, rolldownOptions: { input: { index: "index.html", bench: "bench.html" } } }
    : { sourcemap: true },
  server: {
    port: 5182,
    strictPort: true,
    // What the dev server may serve beyond this app: the workspace (the
    // engines' builds among it), and the linked Stoa packages and their
    // dependencies. Not the whole parent folder, which would hand the other
    // repositories' files (ignored ones included) to anything that can
    // reach the server.
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), "../../../stoa/packages", "../../../stoa/node_modules"],
    },
  },
  preview: { port: 4178, strictPort: true },
});
