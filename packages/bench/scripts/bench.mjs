/*
  The bench of the assistant's proposers.

    pnpm bench -- --out results/2026-10-10 [options]

  Options:
    --agents all | a comma-separated list of agent ids or model tags
             (scripted, naive, qwen3:8b, ...); default all
    --sets clean,hard,adversarial        default all three
    --langs ru,en                        default ru
    --seeds 10 | 1,2,5                   a count (seeds 1..n) or a list; default 10
    --repeats 3                          runs of each item; default 3
    --stops 5                            timed stops per agent; default 5
    --ctx 8192                           the context window, in tokens
    --timeout 300                        the longest one call may take, in seconds
    --transcripts adversarial            keep whole transcripts of the first
                                         repeat of these sets; default none
    --resume                             go on from the files already there
    --keep-loaded                        do not tell ollama a model is done with
    --url http://127.0.0.1:11434

  It writes one JSONL file an agent (a header with the stamps, a line a
  run, the timed stops, a footer with the memory seen), then summary.json
  and SUMMARY.md. It calls models already in a local ollama and downloads
  nothing. Run it on a quiet machine: other work on it shows in every
  latency.
*/

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRulesFromFile } from "@ariadne/rules/node";
import { OLLAMA_URL, OllamaClient } from "@ariadne/runner/model";
import { MATRIX, benchStamp, loadedModels, readResults, releaseModel, runBench, summarise, summaryMarkdown, watchMemory } from "../dist/index.js";

const args = new Map();
const argv = process.argv.slice(2).filter((a) => a !== "--");
for (let i = 0; i < argv.length; i++) {
  const key = argv[i].replace(/^--/, "");
  if (key === "resume" || key === "keep-loaded") args.set(key, true);
  else args.set(key, argv[++i]);
}
if (!args.has("out")) {
  console.error("usage: node scripts/bench.mjs --out <dir> [--agents ...] [--sets ...] [--langs ...] [--seeds ...] [--repeats n] [--stops n] [--resume]");
  process.exit(2);
}
const list = (name, fallback) => (args.has(name) ? String(args.get(name)).split(",") : fallback);
const wanted = list("agents", ["all"]);
const agents = wanted.includes("all") ? [...MATRIX] : MATRIX.filter((a) => wanted.includes(a.id) || (a.kind === "model" && wanted.includes(a.model)));
if (agents.length === 0) {
  console.error(`no agent among: ${MATRIX.map((a) => a.id).join("; ")}`);
  process.exit(2);
}
const seedsArg = String(args.get("seeds") ?? "10");
const seeds = seedsArg.includes(",") ? seedsArg.split(",").map(Number) : Array.from({ length: Number(seedsArg) }, (_, i) => i + 1);
const sets = list("sets", ["clean", "hard", "adversarial"]);
const langs = list("langs", ["ru"]);
const keep = list("transcripts", []);
const baseUrl = args.get("url") ?? OLLAMA_URL;
const contextTokens = Number(args.get("ctx") ?? 8192);
const outDir = resolve(String(args.get("out")));
const plan = { sets, langs, seeds, repeats: Number(args.get("repeats") ?? 3) };

loadRulesFromFile();
const digests = JSON.parse(readFileSync(new URL("../models.json", import.meta.url), "utf8")).digests;
await runBench({
  agents,
  ...plan,
  stopTrials: Number(args.get("stops") ?? 5),
  contextTokens,
  modelSeed: 7,
  callTimeoutMs: Number(args.get("timeout") ?? 300) * 1000,
  outDir,
  stamp: benchStamp(),
  digests,
  clientFor: (model) => new OllamaClient({ model, baseUrl, contextTokens }),
  watchMemory: () => watchMemory(500),
  loaded: () => loadedModels(baseUrl),
  ...(args.has("keep-loaded") ? {} : { release: (model) => releaseModel(baseUrl, model) }),
  keepTranscript: (r) => r.repeat === 1 && keep.includes(r.set),
  resume: args.has("resume"),
  log: (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`),
});
const summary = summarise(readResults(outDir, agents), agents, plan);
writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 1)}\n`);
writeFileSync(join(outDir, "SUMMARY.md"), summaryMarkdown(summary));
console.log(`written to ${outDir}`);
