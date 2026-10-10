/*
  Records one run of an inbox item with a model on a local ollama, and
  writes its transcript as JSON.

    pnpm build
    node scripts/record.mjs --model qwen3:1.7b --set clean --seed 3 --lang ru --out run.json
      [--think on|off] [--ctx 8192] [--tokens 200] [--url http://127.0.0.1:11434]

  --tokens caps what the model may generate in each call (by default 256
  for the two short tasks and 1536 for the reply, more with thinking on).

  The transcript holds what the model was told, every request and raw
  response, the validated proposals, the decisions and the stamp of the
  model, of ollama and of this build. The engine replays it without the
  model (replayTranscript of @ariadne/runner). Nothing is downloaded: the
  model must already be in ollama.
*/

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import { loadRulesFromFile } from "@ariadne/rules/node";
import { OllamaClient } from "@ariadne/runner/model";
import { inboxItem, openInbox, recordRun } from "../dist/index.js";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const need = (name) => {
  if (!args.has(name)) {
    console.error(`missing --${name}`);
    process.exit(2);
  }
  return args.get(name);
};

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "--short=12", "HEAD");
const dirty = git("status", "--porcelain") !== "";

loadRulesFromFile();
const item = inboxItem(openInbox(), need("set"), Number(need("seed")), need("lang"));
const contextTokens = Number(args.get("ctx") ?? 8192);
const client = new OllamaClient({ model: need("model"), contextTokens, ...(args.has("url") ? { baseUrl: args.get("url") } : {}) });
const model = await client.describe();
/* Thinking is switched only on a model that has the switch */
const think = !model.thinking ? null : args.get("think") === "on";

const started = Date.now();
const { transcript, result } = await recordRun({
  item,
  client,
  model,
  think,
  ...(args.has("tokens") ? { maxTokens: { classify: Number(args.get("tokens")), request_facts: Number(args.get("tokens")), draft_reply: Number(args.get("tokens")) } } : {}),
  stamp: {
    commit: dirty ? `${commit}+changes` : commit,
    build: "tsc -p tsconfig.build.json (dist), unbundled",
    machine: `${os.cpus()[0]?.model ?? "unknown"}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}, Node ${process.version}`,
    recordedAt: new Date(started).toISOString(),
    contextTokens,
  },
});
writeFileSync(need("out"), `${JSON.stringify(transcript, null, 1)}\n`);
const calls = transcript.exchanges.map((e) => `${e.task}#${e.call} ${e.valid ? "valid" : (e.failure ?? e.issues.map((i) => `${i.path}:${i.code}`).join(","))} ${Math.round(e.ms)} ms`);
console.log(`${item.id} ${model.model} ${model.digest?.slice(0, 12)} think=${think} ollama ${model.engineVersion}`);
console.log(calls.join("\n"));
console.log(`events ${result.events.length}, last ${result.events.at(-1)?.event.type}, ${Date.now() - started} ms`);
