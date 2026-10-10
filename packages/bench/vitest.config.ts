import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Generation asks ariadne-rules; its WebAssembly module is loaded once
    // per test file, from the file beside the adapter.
    setupFiles: ["test/setup.ts"],
  },
});
