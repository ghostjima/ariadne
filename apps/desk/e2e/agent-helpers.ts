import { expect, test as base, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { strings } from "../src/agent/i18n";

export const en = strings.en;

/** A project option: how many times slower than the machine the page's
 * CPU runs (Chrome's own throttling), 1 for not at all. A CI runner is
 * slower than a developer's machine; a rate above 1 makes every machine
 * at least as slow, so a test that depends on speed fails everywhere. */
export type CpuOptions = { cpuThrottle: number };

/** Slows a page's CPU by `rate`, as DevTools' CPU throttling does. */
export async function throttleCpu(page: Page, rate: number) {
  if (rate <= 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

/** Playwright's test, with each page's CPU slowed by the project's
 * `cpuThrottle`. */
export const test = base.extend<CpuOptions>({
  cpuThrottle: [1, { option: true }],
  page: async ({ page, cpuThrottle }, use) => {
    await throttleCpu(page, cpuThrottle);
    await use(page);
  },
});

/** `scan`, when given, names the language and theme scanned; with `where`
 * as the state, it is recorded as an annotation that scripts/badges.mjs
 * reads to state the axe matrix. */
export async function expectNoSeriousViolations(page: Page, where: string, scan?: { lang: string; theme: string }) {
  // A dialog or a toast that is still fading in has a contrast it will not
  // keep; axe looks at the page once every animation has ended.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const label = scan ? `${scan.lang} ${scan.theme} ${where}` : where;
  expect(serious.map((v) => `${label}: ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  if (scan) test.info().annotations.push({ type: "axe-scan", description: JSON.stringify({ ...scan, state: where }) });
}

export const layout = (page: Page) => page.locator(".agent");

/** The case the assistant's tests open: one of the last received, a
 * general complaint just registered, with no linked case. With the default
 * scenario number (7, odd) its fact request times out once. */
export const AGENT_CASE = "C-001191";
/** An open general complaint linked to C-001054: its fact request asks to
 * take the linked case's facts instead. */
export const LINKED_CASE = "C-001096";
/** An open case of the adversarial corpus: a money claim just registered
 * whose complaint tells an assistant to approve and close it unreviewed. */
export const ADVERSARIAL_CASE = "C-001173";
/** A case awaiting signature: its reply is past drafting. */
export const PAST_DRAFTING_CASE = "C-001112";

/** A link to the desk with a case open (AGENT_CASE unless named) and its
 * assistant in view, in English unless the query names a language, and the
 * simulated colleague off; `query` adds the stream's parameters (scale,
 * undoWindow, drop). */
export function agentUrl(query = "", caseId = AGENT_CASE): string {
  const params = new URLSearchParams(query);
  if (!params.has("lang")) params.set("lang", "en");
  params.set("case", caseId);
  params.set("panel", "assistant");
  params.set("colleague", "off");
  return `/?${params}`;
}

export async function expectPlanState(page: Page, state: string, timeout = 30_000) {
  await expect(layout(page)).toHaveAttribute("data-plan-state", state, { timeout });
}

/** The Retry button of a failed step. */
export const retryButton = (page: Page, label = en.step.retry) => page.getByRole("button", { name: label, exact: true });

/** Waits until the worker controls the page and Run can be pressed. */
export async function ready(page: Page, runLabel = en.plan.run) {
  await expect(page.getByRole("button", { name: runLabel })).toBeEnabled({ timeout: 15_000 });
}

/** The run's step rows, in order. */
export const runSteps = (page: Page) => page.getByRole("list", { name: en.run.list }).getByRole("listitem");

/** The log's lines, as text. */
export async function logLines(page: Page): Promise<string[]> {
  const pre = page.locator(".log .stoa-code__scroll");
  if ((await pre.count()) === 0) return [];
  return (await pre.locator(".stoa-code__line").allInnerTexts()).map((l) => l.trim());
}

/** A confirmation the run waits for: Stoa's AlertDialog, a modal. (A
 * toast has the role alertdialog too, as React Aria draws it.) */
export const confirmation = (page: Page) => page.locator('section.stoa-dialog[role="alertdialog"]');

export async function dialog(page: Page) {
  const alert = confirmation(page);
  await expect(alert).toBeVisible({ timeout: 20_000 });
  return alert;
}
