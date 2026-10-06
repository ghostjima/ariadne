import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { BadgeError, buildBadges, parseArgs, parseCargoTest, parseUnitLog, readAxe, readLighthouse, readPlaywright } from "./badges.mjs";

const LOG = `Scope: 4 of 5 workspace projects
packages/grid test$ vitest run
packages/runner test$ vitest run
packages/grid test:  \x1b[2m Test Files \x1b[22m 10 passed (10)
packages/grid test: \x1b[2m      Tests \x1b[22m 108 passed (108)
packages/runner test:  Test Files  8 passed (8)
packages/runner test:       Tests  86 passed | 1 skipped (87)
apps/desk test$ vitest run --exclude 'e2e/**'
apps/desk test:  Test Files  5 passed (5)
apps/desk test:       Tests  27 passed (27)
# Subtest: nested
    # tests 99
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
`;

test("unit counts add the Vitest summary of every package and the root scripts' node:test", () => {
  assert.deepEqual(parseUnitLog(LOG), { suites: 4, passed: 229, failed: 0, skipped: 1 });
});

test("a package that started its tests without a summary stops the badge", () => {
  assert.throws(() => parseUnitLog(LOG.replace(/apps\/desk test: +Tests.*\n/, "")), BadgeError);
});

test("a test file that failed to load stops the badge even when its tests add up", () => {
  assert.throws(() => parseUnitLog(LOG.replace("Test Files  5 passed (5)", "Test Files  1 failed | 4 passed (5)")), BadgeError);
});

test("failed tests are counted, and a summary that does not add up is refused", () => {
  assert.equal(parseUnitLog(LOG.replace("27 passed (27)", "2 failed | 25 passed (27)")).failed, 2);
  assert.throws(() => parseUnitLog(LOG.replace("(108)", "(109)")), BadgeError);
});

test("a log without the root scripts' summary stops the badge", () => {
  assert.throws(() => parseUnitLog(LOG.split("# Subtest")[0]), BadgeError);
});

const CARGO = `   Compiling ariadne-rules v0.1.0
     Running unittests src/lib.rs (target/release/deps/ariadne_rules-1)

running 1 test
test tests::version_is_the_manifest_version ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests/calendar.rs (target/release/deps/calendar-2)

running 3 tests
test result: ok. 3 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s

   Doc-tests ariadne_rules

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
`;

test("the rules crate's tests add every binary and doc-test run cargo announced", () => {
  assert.deepEqual(parseCargoTest(CARGO), { passed: 4, ignored: 1 });
});

test("a failed, filtered or truncated cargo run stops the rules badge", () => {
  assert.throws(() => parseCargoTest(CARGO.replace("ok. 3 passed; 0 failed", "FAILED. 2 passed; 1 failed")), BadgeError);
  assert.throws(() => parseCargoTest(CARGO.replace("0 measured; 0 filtered out; finished in 0.00s\n\n     Running", "0 measured; 2 filtered out; finished in 0.00s\n\n     Running")), BadgeError);
  assert.throws(() => parseCargoTest(CARGO.split("   Doc-tests")[0] + "   Doc-tests ariadne_rules\n"), BadgeError);
  assert.throws(() => parseCargoTest("error: could not compile"), BadgeError);
});

const scan = (lang, theme, state) => ({ type: "axe-scan", description: JSON.stringify({ lang, theme, state }) });
const report = (annotations, stats = { expected: 3, unexpected: 0, flaky: 0, skipped: 0 }, status = "expected") => ({
  stats,
  suites: [{ specs: [], suites: [{ specs: [{ title: "axe", tests: [{ status, annotations }] }] }] }],
});
const matrix = (states) => ["en", "ru"].flatMap((lang) => ["light", "dark"].flatMap((theme) => states.map((s) => scan(lang, theme, s))));

test("an app's axe matrix is read from its scans, and a partial matrix is refused", () => {
  assert.deepEqual(readAxe(report(matrix(["a", "b", "c"])), "desk"), { states: 3, modes: 4 });
  assert.throws(() => readAxe(report(matrix(["a", "b"]).slice(1)), "desk"), BadgeError);
  assert.throws(() => readAxe(report([]), "desk"), BadgeError);
  assert.throws(() => readAxe(report(matrix(["a"]), undefined, "unexpected"), "desk"), BadgeError);
});

test("a failed or empty browser run stops the e2e badge", () => {
  assert.deepEqual(readPlaywright(report([]), "desk"), { passed: 3, flaky: 0, skipped: 0 });
  assert.throws(() => readPlaywright(report([], { expected: 3, unexpected: 1, flaky: 0, skipped: 0 }), "desk"), BadgeError);
  assert.throws(() => readPlaywright(report([], { expected: 0, unexpected: 0, flaky: 0, skipped: 2 }), "desk"), BadgeError);
  assert.throws(() => readPlaywright({}, "desk"), BadgeError);
});

const lighthouse = (formFactor, scores = { accessibility: 1, "best-practices": 0.96, seo: 0.9 }) => ({
  lighthouseVersion: "13.5.0",
  configSettings: { formFactor },
  categories: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { score }])),
});

test("Lighthouse scores come only from a version 12 report of the named form factor", () => {
  assert.deepEqual(readLighthouse(lighthouse("mobile"), "mobile", "desk"), { accessibility: 100, "best-practices": 96, seo: 90 });
  assert.throws(() => readLighthouse(lighthouse("desktop"), "mobile", "desk"), BadgeError);
  assert.throws(() => readLighthouse({ ...lighthouse("mobile"), lighthouseVersion: "11.0.0" }, "mobile", "desk"), BadgeError);
});

test("every app needs its e2e report, both Lighthouse reports and its build, and nothing else", () => {
  const base = ["--out", "o", "--unit", "u", "--rules-tests", "r.txt", "--rules-wasm", "r.wasm", "--e2e", "desk=d.json", "--dist", "desk=dist"];
  const full = [...base, "--lighthouse", "desk:desktop=a.json", "--lighthouse", "desk:mobile=b.json"];
  assert.deepEqual(parseArgs(full).apps, ["desk"]);
  assert.throws(() => parseArgs(full.filter((_, i) => i !== 4 && i !== 5)), BadgeError);
  assert.throws(() => parseArgs(base), BadgeError);
  assert.throws(() => parseArgs([...full, "--dist", "agent=dist"]), BadgeError);
  assert.throws(() => parseArgs([...full, "--lighthouse", "desk:tablet=c.json"]), BadgeError);
  assert.throws(() => parseArgs([...full, "--e2e", "desk=again.json"]), BadgeError);
});

const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test("the badges sum both apps and take the lowest Lighthouse score of any app and form factor", () => {
  const dir = mkdtempSync(join(tmpdir(), "badges-"));
  dirs.push(dir);
  const file = (name, value) => {
    const path = join(dir, name);
    writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
    return path;
  };
  const argv = ["--out", join(dir, "out"), "--unit", file("unit.log", LOG), "--rules-tests", file("rules.txt", CARGO), "--rules-wasm", file("rules.wasm", "\0asm".repeat(400))];
  for (const [app, passed, states] of [["desk", 49, ["a", "b"]], ["agent", 62, ["a", "b", "c"]]]) {
    mkdirSync(join(dir, app, "assets"), { recursive: true });
    writeFileSync(join(dir, app, "assets", "index.js"), "console.log(1);\n".repeat(50));
    argv.push("--e2e", `${app}=${file(`${app}.json`, report(matrix(states), { expected: passed, unexpected: 0, flaky: 0, skipped: 0 }))}`);
    argv.push("--dist", `${app}=${join(dir, app)}`);
    for (const form of ["desktop", "mobile"]) {
      const seo = app === "agent" && form === "mobile" ? 0.82 : 1;
      argv.push("--lighthouse", `${app}:${form}=${file(`${app}-${form}.json`, lighthouse(form, { accessibility: 1, "best-practices": 1, seo }))}`);
    }
  }
  const badges = buildBadges(parseArgs(argv));
  assert.equal(badges["unit-tests"].message, "229 passed, 1 skipped");
  assert.equal(badges.e2e.message, "111 passed (desk 49, agent 62)");
  assert.equal(badges.axe.message, "0 serious, desk 2 states x 4, agent 3 states x 4");
  assert.deepEqual([badges["lighthouse-seo"].message, badges["lighthouse-seo"].color], ["82", "orange"]);
  assert.equal(badges["lighthouse-accessibility"].message, "100");
  assert.match(badges["bundle-size"].message, /^desk \d+\.\d kB, agent \d+\.\d kB$/);
  assert.equal(badges["rules-tests"].message, "4 passed, 1 ignored");
  assert.match(badges["rules-wasm-size"].message, /^\d+\.\d kB$/);
});
