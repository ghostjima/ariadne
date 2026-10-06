import { defineConfig, devices } from "@playwright/test";
import type { CpuOptions } from "./e2e/agent-helpers";

// The tests run against the production build (vite preview), so they see
// the same bundle, the same desk worker and the same Service Worker the
// measurements do, at the path a deployment serves it from. The build runs
// first every time. The preview serves on 4178; E2E_PORT moves it to
// another port, which is what CI does. ARIADNE_E2E=1 lets a test change the
// served Service Worker's revision with a cookie in its own browser
// context (see vite-sw.ts), to update it.
const PORT = Number(process.env.E2E_PORT ?? 4178);
const URL = `http://localhost:${PORT}`;
const VIEWPORT = { width: 1440, height: 900 };

export default defineConfig<CpuOptions>({
  testDir: "e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  use: { baseURL: URL, viewport: VIEWPORT },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: VIEWPORT } },
    // Where the focus goes is decided between a press, React's commit and
    // the stream's next event; on a slow machine those come in another
    // order. The assistant's focus tests run again with the page's CPU
    // slowed down six times (E2E_CPU_THROTTLE sets another rate), so that a
    // test which passes only on a fast machine fails on every machine.
    {
      name: "chromium-slow-cpu",
      testMatch: "agent-focus.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORT, cpuThrottle: Number(process.env.E2E_CPU_THROTTLE ?? 6) },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: false,
    env: { ARIADNE_E2E: "1" },
    timeout: 180_000,
  },
});
