// Measures the built app in Chromium (Playwright) and prints the record
// with its stamp: commit, working-tree state, machine, browser.
//
//   pnpm build && node scripts/measure.mjs
//
// It starts `vite preview` on port 4178 itself, and stops it at the end.
import { execSync, spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { DEFAULT_VIEW, serializeView } from "@ariadne/grid";

const BASE = "http://localhost:4178";
const RUNS = Number(process.env.RUNS ?? 5);
const VIEWPORT = { width: 1440, height: 900 };

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const pct = (xs, p) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};
const f1 = (x) => x.toFixed(1);
const dist = (xs) => `p50 ${f1(pct(xs, 50))} / p95 ${f1(pct(xs, 95))} / max ${f1(Math.max(...xs))} ms (n = ${xs.length})`;

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("vite preview did not start");
}

// On all 50,000 cases of the scale mode (the desk opens on the open ones
// of its realistic register).
async function openDesk(page, query = "colleague=off") {
  await page.goto(`${BASE}/?${query}&scale=50000&view=${serializeView(DEFAULT_VIEW)}`);
  await page.getByTestId("row-count").filter({ hasText: "50,000 of 50,000 cases" }).waitFor({ timeout: 20_000 });
}

/** Round trips and worker compute of every query, kept across phases. */
const queries = { roundTrip: [], compute: [] };
async function clearMeasures(page) {
  queries.roundTrip.push(...(await measures(page, "round-trip")));
  queries.compute.push(...(await measures(page, "compute")));
  await page.evaluate(() => performance.clearMeasures());
}

const measures = (page, name) =>
  page.evaluate((n) => performance.getEntriesByName(`argus:${n}`).map((e) => e.duration), name);

/** Runs an input and waits for its measure: the grid repainted with its result. */
async function timed(page, name, action) {
  const before = (await measures(page, name)).length;
  await action();
  await page.waitForFunction(([n, b]) => performance.getEntriesByName(`argus:${n}`).length > b, [name, before]);
}

async function main() {
  const commit = sh("git rev-parse --short HEAD");
  const dirty = sh("git status --porcelain").length > 0;
  const server = spawn("pnpm", ["preview"], { stdio: "ignore" });
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEWPORT });
    const out = {};

    // Time to first rows: navigation start to the first painted frame with
    // rows (the app's argus:first-rows measure), fresh page each run.
    const firstRows = [];
    for (let i = 0; i < RUNS; i++) {
      const page = await context.newPage();
      await openDesk(page);
      await page.waitForFunction(() => performance.getEntriesByName("argus:first-rows").length > 0);
      firstRows.push((await measures(page, "first-rows"))[0]);
      await page.close();
    }
    out.firstRows = firstRows;

    const page = await context.newPage();
    await openDesk(page);
    const cdp = await context.newCDPSession(page);

    // Memory: main-thread JS heap after loading, before and after a GC.
    await cdp.send("Performance.enable");
    const heap = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize").value;
    out.heapLoaded = await heap();
    await cdp.send("HeapProfiler.collectGarbage");
    out.heapAfterGc = await heap();

    // Filter latency: status chips toggled on and off (input to repainted
    // grid, the app's argus:filter measure).
    await clearMeasures(page);
    const chips = ["Registered", "Waiting for facts", "Closed", "Overdue", "Block, 161-FZ", "Bank of Russia"];
    for (let i = 0; i < 40; i++) {
      await timed(page, "filter", () => page.getByRole("button", { name: new RegExp(`^${chips[i % chips.length]} \\d`) }).click());
    }
    out.chip = await measures(page, "filter");

    // Search: a query typed into the search field, one sample per value.
    await timed(page, "filter", () => page.getByRole("button", { name: "Clear filters" }).first().click());
    await clearMeasures(page);
    const words = ["transfer", "vetlugina", "c-0001", "refund", "card", "op-", "llc", "fee", "app", "lanskaya"];
    for (let i = 0; i < 30; i++) {
      await timed(page, "filter", () => page.getByLabel("Search").fill(words[i % words.length]));
    }
    out.search = await measures(page, "filter");
    await timed(page, "filter", () => page.getByLabel("Search").fill(""));

    // Sort latency: header clicks over numeric and text columns.
    await clearMeasures(page);
    const headers = ["Time left", "Applicant", "Reply due", "Stage", "Case"];
    for (let i = 0; i < 30; i++) {
      await timed(page, "sort", () => page.getByRole("columnheader", { name: headers[i % headers.length], exact: true }).click());
    }
    out.sort = await measures(page, "sort");
    // Worker round trip and compute, over every query above.
    await clearMeasures(page);
    out.roundTrip = queries.roundTrip;
    out.compute = queries.compute;

    // Scroll frames: 56 px down per frame for 300 frames, then 24 px
    // sideways per frame for 120 frames; intervals between frames, 3 runs pooled.
    const frames = [];
    for (let run = 0; run < 3; run++) {
      frames.push(
        ...(await page.evaluate(async () => {
          const el = document.querySelector(".stoa-data-grid__scroller");
          el.scrollTop = 0;
          el.scrollLeft = 0;
          const intervals = [];
          await new Promise((resolve) => {
            let n = 0;
            let last = performance.now();
            const step = (now) => {
              intervals.push(now - last);
              last = now;
              if (n < 300) el.scrollTop += 56;
              else el.scrollLeft += 24;
              n++;
              if (n < 420) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame((now) => {
              last = now;
              requestAnimationFrame(step);
            });
          });
          return intervals;
        })),
      );
    }
    out.frames = frames;

    // Active-cell move: ArrowDown on the focused cell, from the key event to
    // the frame after it was handled, 300 presses.
    await page.evaluate(() => {
      const el = document.querySelector(".stoa-data-grid__scroller");
      el.scrollTop = 0;
      el.scrollLeft = 0;
      window.__moves = [];
      window.__tasks = [];
      window.addEventListener(
        "keydown",
        (e) => {
          if (e.key !== "ArrowDown") return;
          const t0 = performance.now();
          window.__t0 = t0;
          requestAnimationFrame(() => {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => window.__moves.push(performance.now() - t0);
            ch.port2.postMessage(null);
          });
        },
        { capture: true },
      );
      // Bubbling to the window comes after React's listener on its root,
      // which handles a key press, renders and commits synchronously.
      window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") window.__tasks.push(performance.now() - window.__t0);
      });
    });
    await page.locator('[data-cell="0:1"]').click();
    for (let i = 0; i < 300; i++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction((n) => window.__moves.length >= n, i + 1);
    }
    out.moves = await page.evaluate(() => window.__moves);
    out.moveTasks = await page.evaluate(() => window.__tasks);
    out.landed = await page.evaluate(() => document.activeElement?.closest('[role="row"]')?.getAttribute("aria-rowindex"));

    out.browser = browser.version();
    await browser.close();

    // Bundle: every file the build emits, raw and gzip (zlib default level).
    const assets = readdirSync("dist/assets").map((f) => {
      const buf = readFileSync(`dist/assets/${f}`);
      return { f, raw: statSync(`dist/assets/${f}`).size, gz: gzipSync(buf).length };
    });
    const js = assets.filter((a) => a.f.endsWith(".js"));
    const css = assets.filter((a) => a.f.endsWith(".css"));

    const kib = (b) => `${(b / 1024).toFixed(1)} KiB`;
    const mib = (b) => `${(b / 1048576).toFixed(1)} MiB`;
    const lines = [
      `commit ${commit}${dirty ? " (working tree has changes)" : ""}; ${os.cpus()[0].model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB, macOS ${sh("sw_vers -productVersion")}; Chromium ${out.browser} headless (Playwright); Node ${process.version}; viewport ${VIEWPORT.width} x ${VIEWPORT.height}; production build (vite preview)`,
      `first rows (navigation start to first painted frame with rows, ${RUNS} fresh loads): median ${f1(pct(out.firstRows, 50))} ms, min ${f1(Math.min(...out.firstRows))}, max ${f1(Math.max(...out.firstRows))}`,
      `filter, stage, deadline, stream and source chips (input to repainted grid): ${dist(out.chip)}`,
      `filter, search text (input to repainted grid): ${dist(out.search)}`,
      `sort, header click (input to repainted grid): ${dist(out.sort)}`,
      `worker round trip (query posted to result received, every query above): ${dist(out.roundTrip)}`,
      `worker compute (sort, search index and filter inside the worker, same queries): ${dist(out.compute)}`,
      `scroll frame intervals (300 frames down at 56 px, 120 sideways at 24 px, 3 runs pooled): p50 ${f1(pct(out.frames, 50))} / p95 ${f1(pct(out.frames, 95))} / max ${f1(Math.max(...out.frames))} ms; over 20 ms: ${out.frames.filter((x) => x > 20).length} of ${out.frames.length}`,
      `active-cell move (ArrowDown, capture to bubble at the window: the grid's handler, React render and commit, focus): ${dist(out.moveTasks)}`,
      `active-cell move (ArrowDown, key event to the frame after): ${dist(out.moves)}; landed on aria-rowindex ${out.landed}`,
      `main-thread JS heap after load: ${mib(out.heapLoaded)}; after a forced GC: ${mib(out.heapAfterGc)} (the worker's heap is not included)`,
      `bundle JS: ${js.map((a) => `${a.f} ${kib(a.raw)} raw, ${kib(a.gz)} gzip`).join("; ")}`,
      `bundle CSS: ${css.map((a) => `${a.f} ${kib(a.raw)} raw, ${kib(a.gz)} gzip`).join("; ")}`,
    ];
    console.log(lines.join("\n"));
  } finally {
    server.kill();
  }
}

await main();
