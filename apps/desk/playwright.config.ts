import { defineConfig, devices } from "@playwright/test";

// The tests run against the production build (vite preview), so they see
// the same bundle and worker the measurements do. The build runs first
// every time. The preview serves on 4178; E2E_PORT moves it to another
// port, which is what CI does.
const PORT = Number(process.env.E2E_PORT ?? 4178);
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  use: { baseURL: URL, viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: `pnpm build && pnpm preview --port ${PORT} --strictPort`, url: URL, reuseExistingServer: false, timeout: 180_000 },
});
