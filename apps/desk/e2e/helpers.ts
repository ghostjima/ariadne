import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_VIEW, serializeView, type View } from "@ariadne/grid";

export const ALL = "1,200 of 1,200 cases";

/** A view as a `view` parameter. */
export const viewParam = (view: Partial<View>) => serializeView({ ...DEFAULT_VIEW, name: "", ...view });

/** The built-in "All cases" view, as a `view` parameter. */
export const ALL_CASES = serializeView(DEFAULT_VIEW);

/** The columns the edits work on: case 1, applicant 2, stream 3, stage 4,
 * decision 5, ground 6, extension 7, note 8. */
export const EDIT_COLUMNS = ["id", "client", "stream", "stage", "outcome", "ground", "extension", "note"];
export const WITH_EDITS = viewParam({ columns: EDIT_COLUMNS });

/** Opens the desk in English unless asked for another language, with the
 * colleague off unless asked for, on all the cases unless a view is given
 * (the desk itself starts on the open ones), and waits for every row. */
export async function open(page: Page, query = "", rows = ALL) {
  const params = new URLSearchParams(query);
  if (!params.has("lang")) params.set("lang", "en");
  if (!params.has("colleague")) params.set("colleague", "off");
  if (!params.has("view")) params.set("view", ALL_CASES);
  await page.goto(`/?${params}`);
  if (rows) await expect(page.getByTestId("row-count")).toHaveText(rows, { timeout: 15_000 });
}

export const grid = (page: Page) => page.getByRole("grid");
export const cell = (page: Page, row: number, column: number) => grid(page).locator(`[data-cell="${row}:${column}"]`);
export const toasts = (page: Page) => page.locator(".stoa-toast-region");
/** The bar of actions on the selected rows (Stoa's DataGridSelectionBar). */
export const selectionBar = (page: Page) => page.getByRole("toolbar", { name: "Bulk change" });

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

/** Opens the enum editor of a cell and picks an option by name, from the
 * keyboard: a value the rules refuse keeps the editor open with the reason
 * (a click outside the list would close it). */
export async function pick(page: Page, row: number, column: number, name: string) {
  await focusCell(page, row, column);
  await page.keyboard.press("Enter");
  const list = grid(page).getByRole("listbox");
  await expect(list).toBeFocused();
  const options = await list.getByRole("option").allTextContents();
  const at = options.indexOf(name);
  expect(at, name).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Home");
  for (let k = 0; k < at; k++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}
