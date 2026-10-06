// Shields.io endpoint badges from what CI measured on this commit.
//
// Usage (CI runs it after the tests; see .github/workflows/ci.yml):
//   node scripts/badges.mjs --out <dir>
//     --unit <log of `pnpm test`>
//     --e2e desk=<Playwright JSON report> --e2e agent=<Playwright JSON report>
//     --lighthouse desk:desktop=<Lighthouse JSON> --lighthouse desk:mobile=<Lighthouse JSON>
//     --lighthouse agent:desktop=<Lighthouse JSON> --lighthouse agent:mobile=<Lighthouse JSON>
//     --dist desk=apps/desk/dist --dist agent=apps/agent/dist
//     --rules-tests <output of `cargo test --release -p ariadne-rules`>
//     --rules-wasm <crates/ariadne-rules/pkg/ariadne_rules_bg.wasm>
//
// Each badge is one JSON file, {"schemaVersion":1,"label","message","color"},
// which CI commits to the `badges` branch for img.shields.io/endpoint to
// read. A value that cannot be read, or a run that did not pass, stops the
// script with an error: a badge is never written from a guess. Every app
// named with --e2e needs its two Lighthouse reports and its build, and no
// other app may be named.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export class BadgeError extends Error {}
const fail = (message) => {
  throw new BadgeError(message);
};

const read = (path) => {
  try {
    return readFileSync(path);
  } catch (e) {
    return fail(`cannot read ${path}: ${e.message}`);
  }
};
const readJson = (path) => {
  try {
    return JSON.parse(read(path).toString("utf8"));
  } catch (e) {
    if (e instanceof BadgeError) throw e;
    return fail(`${path} is not JSON: ${e.message}`);
  }
};

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
// pnpm prefixes a workspace package's output with "<dir> test: ".
const PREFIX = String.raw`(?:(\S+) test: )?`;
const STARTED = /^(\S+) test\$ (.+)$/;
const VITEST = new RegExp(`^${PREFIX}\\s*Tests\\s+(.+?)\\s+\\((\\d+)\\)\\s*$`);
const VITEST_FILES = new RegExp(`^${PREFIX}\\s*Test Files\\s+(.+?)\\s+\\((\\d+)\\)\\s*$`);
// node:test prints TAP ("# pass 54") when not on a terminal and its spec
// reporter ("ℹ pass 54") on one; the summary lines are not indented.
const NODE = new RegExp(`^${PREFIX}(?:#|\\u2139) (tests|pass|fail|cancelled|skipped|todo) (\\d+)$`);

/** The counts on one Vitest summary line, which must add up to its total. */
function vitestCounts(line, parts, total, kinds) {
  const counts = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (const part of parts.split("|")) {
    const p = new RegExp(`^\\s*(\\d+) (${kinds.join("|")})\\s*$`).exec(part);
    if (!p) fail(`unrecognised Vitest summary: "${line.trim()}"`);
    counts[p[2]] += Number(p[1]);
  }
  if (Object.values(counts).reduce((a, b) => a + b, 0) !== Number(total)) fail(`Vitest summary does not add up: "${line.trim()}"`);
  return counts;
}

/** Unit test counts from the output of `pnpm test`: one Vitest summary per
 * workspace package, and one node:test summary without a prefix for the
 * root scripts. A Vitest test file that failed to load counts as a failure
 * even when no test in it ran. */
export function parseUnitLog(text) {
  const started = new Set();
  const summaries = [];
  let node = null;
  for (const raw of text.replace(ANSI, "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if ((m = STARTED.exec(line))) {
      started.add(m[1]);
    } else if ((m = VITEST_FILES.exec(line))) {
      const files = vitestCounts(line, m[2], m[3], ["passed", "failed", "skipped"]);
      if (files.failed > 0) fail(`${m[1] ?? "the root"}: ${files.failed} unit test file(s) failed`);
    } else if ((m = VITEST.exec(line))) {
      const counts = vitestCounts(line, m[2], m[3], ["passed", "failed", "skipped", "todo"]);
      summaries.push({ scope: m[1] ?? "", runner: "vitest", ...counts });
    } else if ((m = NODE.exec(line))) {
      const [, scope = "", key, value] = m;
      if (key === "tests") {
        node = { scope, runner: "node:test", tests: Number(value) };
        summaries.push(node);
      } else {
        if (!node || node.scope !== scope) fail(`node:test "${key}" line before its "tests" line: "${line}"`);
        node[key] = Number(value);
      }
    }
  }
  for (const s of summaries.filter((s) => s.runner === "node:test")) {
    for (const key of ["pass", "fail", "cancelled", "skipped", "todo"]) {
      if (!Number.isInteger(s[key])) fail(`node:test summary${s.scope ? ` for ${s.scope}` : ""} has no "${key}" line`);
    }
    if (s.pass + s.fail + s.cancelled + s.skipped + s.todo !== s.tests) fail(`node:test summary${s.scope ? ` for ${s.scope}` : ""} does not add up`);
    Object.assign(s, { passed: s.pass, failed: s.fail + s.cancelled, skipped: s.skipped, todo: s.todo });
  }
  if (summaries.length === 0) fail("no Vitest or node:test summary in the unit test log");
  for (const scope of started) {
    if (!summaries.some((s) => s.scope === scope)) fail(`${scope} started its tests but printed no summary`);
  }
  if (!summaries.some((s) => s.scope === "")) fail("no summary from the root scripts' tests");
  const sum = (key) => summaries.reduce((n, s) => n + s[key], 0);
  return { suites: summaries.length, passed: sum("passed"), failed: sum("failed"), skipped: sum("skipped") + sum("todo") };
}

const BINARY_RUN = /^\s*(Running|Doc-tests) (.+)$/;
const CARGO_RESULT = /^test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out;/;

/** Test counts from `cargo test` output: one "test result" line for every
 * test binary and doc-test run that cargo announced. A run with a failure,
 * a filter or no passing test stops the badge. */
export function parseCargoTest(text, what = "cargo test") {
  let binaries = 0;
  const results = [];
  for (const raw of text.replace(ANSI, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (BINARY_RUN.test(line)) binaries++;
    const m = CARGO_RESULT.exec(line);
    if (m) results.push({ ok: m[1] === "ok", passed: +m[2], failed: +m[3], ignored: +m[4], filtered: +m[6] });
  }
  if (binaries === 0) fail(`no test binary in the ${what} output`);
  if (results.length !== binaries) fail(`${what}: cargo announced ${binaries} test runs but printed ${results.length} results`);
  const sum = (key) => results.reduce((n, r) => n + r[key], 0);
  if (results.some((r) => !r.ok) || sum("failed") > 0) fail(`${what}: ${sum("failed")} test(s) failed`);
  if (sum("filtered") > 0) fail(`${what}: tests were filtered out: not a full run`);
  if (sum("passed") === 0) fail(`${what}: no test passed`);
  return { passed: sum("passed"), ignored: sum("ignored") };
}

/** gzip (level 9) of one file, such as a WebAssembly module. */
export function gzipBytes(path) {
  const bytes = read(path);
  if (bytes.length === 0) fail(`${path} is empty`);
  return gzipSync(bytes, { level: 9 }).length;
}

/** Pass counts from a Playwright JSON report (reporter "json"). */
export function readPlaywright(report, name) {
  const s = report?.stats;
  if (!s || ![s.expected, s.unexpected, s.flaky, s.skipped].every(Number.isInteger)) fail(`${name}: the e2e report has no Playwright stats`);
  if (s.unexpected > 0) fail(`${name}: ${s.unexpected} e2e test(s) failed`);
  if (s.expected + s.flaky === 0) fail(`${name}: no e2e test passed`);
  return { passed: s.expected, flaky: s.flaky, skipped: s.skipped };
}

function* playwrightTests(suite) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) yield { title: spec.title, ...test };
  for (const child of suite.suites ?? []) yield* playwrightTests(child);
}

/** One app's axe matrix, from the "axe-scan" annotations its e2e records:
 * one per scan, naming the language, the theme and the state of the
 * screen. */
export function readAxe(report, name) {
  const scans = [];
  for (const suite of report.suites ?? []) {
    for (const test of playwrightTests(suite)) {
      const notes = (test.annotations ?? []).filter((a) => a.type === "axe-scan");
      if (notes.length === 0) continue;
      if (test.status !== "expected") fail(`${name}: axe test "${test.title}" did not pass`);
      for (const note of notes) scans.push(JSON.parse(note.description));
    }
  }
  if (scans.length === 0) fail(`${name}: no axe scan in the e2e report`);
  const distinct = (f) => new Set(scans.map(f)).size;
  const states = distinct((s) => s.state);
  const modes = distinct((s) => `${s.lang}/${s.theme}`);
  if (states * modes !== scans.length || distinct((s) => `${s.lang}/${s.theme}/${s.state}`) !== scans.length) {
    fail(`${name}: the axe scans are not a full matrix: ${scans.length} scans, ${states} states, ${modes} language and theme pairs`);
  }
  return { states, modes };
}

export const CATEGORIES = { accessibility: "accessibility", "best-practices": "best practices", seo: "SEO" };
export const FORM_FACTORS = ["desktop", "mobile"];

/** Lighthouse 13 category scores, 0 to 100, from one JSON report. */
export function readLighthouse(report, formFactor, name) {
  if (!String(report?.lighthouseVersion ?? "").startsWith("13.")) fail(`${name}: the ${formFactor} report is not from Lighthouse 13`);
  if (report.runtimeError) fail(`${name}: Lighthouse ${formFactor}: ${report.runtimeError.message ?? report.runtimeError.code}`);
  if (report.configSettings?.formFactor !== formFactor) fail(`${name}: the ${formFactor} report was run as ${report.configSettings?.formFactor}`);
  const scores = {};
  for (const id of Object.keys(CATEGORIES)) {
    const score = report.categories?.[id]?.score;
    if (typeof score !== "number") fail(`${name}: Lighthouse ${formFactor} has no ${id} score`);
    scores[id] = Math.round(score * 100);
  }
  return scores;
}

const lighthouseColor = (score) => (score >= 90 ? "brightgreen" : score >= 50 ? "orange" : "red");

/** gzip (level 9) of every JavaScript and CSS file a build wrote. */
export function bundleBytes(dist) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return fail(`cannot read ${dir}: ${e.message}`);
    }
    for (const e of entries) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (/\.(m?js|css)$/.test(e.name)) files.push(path);
    }
  };
  walk(dist);
  if (!files.some((f) => f.endsWith(".js"))) fail(`no JavaScript in ${dist}`);
  return files.reduce((n, f) => n + gzipSync(read(f), { level: 9 }).length, 0);
}
export const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

/** "name=value" (or "name:form=value" for --lighthouse) into a map. */
function keyed(values, flag) {
  const map = new Map();
  for (const v of values) {
    const i = v.indexOf("=");
    if (i <= 0 || i === v.length - 1) fail(`--${flag} expects <name>=<path>, got "${v}"`);
    const key = v.slice(0, i);
    if (map.has(key)) fail(`--${flag} names ${key} twice`);
    map.set(key, v.slice(i + 1));
  }
  return map;
}

const SINGLE = ["out", "unit", "rules-tests", "rules-wasm"];

export function parseArgs(argv) {
  const args = { e2e: [], lighthouse: [], dist: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key || value === undefined) fail(`expected --name value pairs, got "${argv.slice(i).join(" ")}"`);
    if (Array.isArray(args[key])) args[key].push(value);
    else if (SINGLE.includes(key)) args[key] = value;
    else fail(`unknown option --${key}`);
  }
  for (const key of SINGLE) if (!args[key]) fail(`--${key} is required`);
  const e2e = keyed(args.e2e, "e2e");
  const lighthouse = keyed(args.lighthouse, "lighthouse");
  const dist = keyed(args.dist, "dist");
  if (e2e.size === 0) fail("--e2e is required");
  const apps = [...e2e.keys()];
  for (const app of apps) {
    if (!dist.has(app)) fail(`--dist ${app}=<path> is required`);
    for (const form of FORM_FACTORS) if (!lighthouse.has(`${app}:${form}`)) fail(`--lighthouse ${app}:${form}=<path> is required`);
  }
  for (const key of dist.keys()) if (!e2e.has(key)) fail(`--dist names ${key}, which has no --e2e report`);
  for (const key of lighthouse.keys()) {
    const [app, form] = key.split(":");
    if (!e2e.has(app) || !FORM_FACTORS.includes(form)) fail(`--lighthouse ${key} is not <app>:desktop or <app>:mobile of an app with an --e2e report`);
  }
  return { out: args.out, unit: args.unit, rulesTests: args["rules-tests"], rulesWasm: args["rules-wasm"], apps, e2e, lighthouse, dist };
}

export function buildBadges(args) {
  const unit = parseUnitLog(read(args.unit).toString("utf8"));
  if (unit.failed > 0) fail(`${unit.failed} unit test(s) failed`);
  if (unit.passed === 0) fail("no unit test passed");
  const apps = args.apps.map((app) => {
    const report = readJson(args.e2e.get(app));
    const lighthouse = FORM_FACTORS.map((form) => readLighthouse(readJson(args.lighthouse.get(`${app}:${form}`)), form, app));
    return { app, e2e: readPlaywright(report, app), axe: readAxe(report, app), lighthouse, bytes: bundleBytes(args.dist.get(app)) };
  });
  const sum = (key) => apps.reduce((n, a) => n + a.e2e[key], 0);
  const extra = (skipped, flaky = 0) => `${skipped ? `, ${skipped} skipped` : ""}${flaky ? `, ${flaky} flaky` : ""}`;
  const each = (f) => apps.map((a) => `${a.app} ${f(a)}`).join(", ");
  const badges = {
    "unit-tests": { label: "unit tests", message: `${unit.passed} passed${extra(unit.skipped)}`, color: "brightgreen" },
    e2e: {
      label: "e2e",
      message: `${sum("passed")} passed${extra(sum("skipped"), sum("flaky"))} (${each((a) => a.e2e.passed)})`,
      color: sum("flaky") ? "yellow" : "brightgreen",
    },
    axe: { label: "axe", message: `0 serious, ${each((a) => `${a.axe.states} states x ${a.axe.modes}`)}`, color: "brightgreen" },
  };
  for (const [id, name] of Object.entries(CATEGORIES)) {
    const score = Math.min(...apps.flatMap((a) => a.lighthouse.map((s) => s[id])));
    badges[`lighthouse-${id}`] = { label: `Lighthouse ${name} (min of apps, desktop and mobile)`, message: String(score), color: lighthouseColor(score) };
  }
  badges["bundle-size"] = { label: "bundle gzip (JS + CSS)", message: each((a) => kB(a.bytes)), color: "blue" };
  const rules = parseCargoTest(read(args.rulesTests).toString("utf8"), "ariadne-rules cargo test");
  badges["rules-tests"] = { label: "ariadne-rules tests", message: `${rules.passed} passed${rules.ignored ? `, ${rules.ignored} ignored` : ""}`, color: "brightgreen" };
  badges["rules-wasm-size"] = { label: "ariadne-rules wasm gzip", message: kB(gzipBytes(args.rulesWasm)), color: "blue" };
  return badges;
}

export function writeBadges(out, badges) {
  mkdirSync(out, { recursive: true });
  for (const [name, { label, message, color }] of Object.entries(badges)) {
    const json = `${JSON.stringify({ schemaVersion: 1, label, message, color })}\n`;
    writeFileSync(join(out, `${name}.json`), json);
    process.stdout.write(`${name}.json ${json}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    writeBadges(args.out, buildBadges(args));
  } catch (e) {
    if (!(e instanceof BadgeError)) throw e;
    console.error(`badges: ${e.message}`);
    process.exit(1);
  }
}
