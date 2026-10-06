/*
  Loading the module in Node (tests, scripts): the WebAssembly file is read
  from beside the glue instead of fetched.
*/
import { readFileSync } from "node:fs";
import { loadRulesSync } from "./index.js";

export function loadRulesFromFile(): void {
  loadRulesSync(readFileSync(new URL("../wasm/ariadne_rules_bg.wasm", import.meta.url)));
}
