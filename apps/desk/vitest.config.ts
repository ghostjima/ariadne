import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    // The register's deadlines come from ariadne-rules: its WebAssembly
    // module is loaded once per test file.
    setupFiles: ["src/test-setup.ts"],
  },
});
