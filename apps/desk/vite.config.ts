import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages under /ariadne/; the agent sits beside it under
// /ariadne/agent/.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/ariadne/" : "/",
  plugins: [react()],
  // Stoa is linked from the sibling repository during development and has
  // its own node_modules: without dedupe the app would run two copies of
  // React and fail with "Invalid hook call".
  resolve: { dedupe: ["react", "react-dom", "react-aria-components"] },
  worker: { format: "es" },
  server: {
    port: 5182,
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
  preview: { port: 4178, strictPort: true },
});
