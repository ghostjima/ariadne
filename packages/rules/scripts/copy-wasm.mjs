/*
  Copies the WebAssembly build of crates/ariadne-rules (made by wasm-pack,
  see the crate's README) into this package's wasm/ folder, which the
  adapter imports. The build itself is not made here: it needs Rust and
  wasm-pack, and CI builds it once in its own job.
*/
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "..", "..", "crates", "ariadne-rules", "pkg");
const out = join(here, "..", "wasm");
const FILES = ["ariadne_rules.js", "ariadne_rules.d.ts", "ariadne_rules_bg.wasm", "ariadne_rules_bg.wasm.d.ts"];

const missing = FILES.filter((f) => !existsSync(join(pkg, f)));
if (missing.length > 0) {
  console.error(
    `@ariadne/rules: ${missing.join(", ")} not found in crates/ariadne-rules/pkg. Build it first, from the repository root:\n` +
      "  wasm-pack build crates/ariadne-rules --release --target web --out-dir pkg --out-name ariadne_rules -- --no-default-features --features wasm",
  );
  process.exit(1);
}
mkdirSync(out, { recursive: true });
for (const f of FILES) copyFileSync(join(pkg, f), join(out, f));
