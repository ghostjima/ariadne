import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_VIEW, serializeView } from "@ariadne/grid";

export const ALL = "50,000 of 50,000 requests";

/** The default view with the comment column, as a `view` parameter. */
export const WITH_COMMENTS = serializeView({ ...DEFAULT_VIEW, name: "", columns: [...DEFAULT_VIEW.columns, "comment"] });

/** The built-in "All requests" view, as a `view` parameter. */
export const ALL_REQUESTS = serializeView(DEFAULT_VIEW);

/** Opens the desk with the colleague off unless asked for, on all the
 * requests unless a view is given (the desk itself starts on the ones that
 * need action), and waits for every row. */
export async function open(page: Page, query = "", rows = ALL) {
  const params = new URLSearchParams(query);
  if (!params.has("colleague")) params.set("colleague", "off");
  if (!params.has("view")) params.set("view", ALL_REQUESTS);
  await page.goto(`/?${params}`);
  if (rows) await expect(page.getByTestId("row-count")).toHaveText(rows, { timeout: 15_000 });
}

export const grid = (page: Page) => page.getByRole("grid");
export const cell = (page: Page, row: number, column: number) => grid(page).locator(`[data-cell="${row}:${column}"]`);
export const toasts = (page: Page) => page.locator(".stoa-toast-region");

/** `scan`, when given, names the language and theme scanned; with `label`
 * as the state, it is recorded as an annotation that scripts/badges.mjs
 * reads to state the axe matrix. */
export async function expectNoSeriousViolations(page: Page, label = "", scan?: { lang: string; theme: string }) {
  // Colours are measured once dialogs and toasts have finished entering;
  // endless pulses (the loading skeleton) are left running.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), label).toEqual([]);
  if (scan) test.info().annotations.push({ type: "axe-scan", description: JSON.stringify({ ...scan, state: label }) });
}

/** Clicks the cell at a position and waits for it to have focus. */
export async function focusCell(page: Page, row: number, column: number) {
  await cell(page, row, column).click();
  await expect(cell(page, row, column)).toBeFocused();
}
