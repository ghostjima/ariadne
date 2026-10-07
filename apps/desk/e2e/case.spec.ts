// The open case: one window with the card and the assistant. Opened from
// the active row (O, or the toolbar's button) or from a link, back to the
// queue with Q and the focus on the row it was opened from; the card's
// flags, timeline, linked cases and the derivation of the reply's last day,
// every date and rule from ariadne-rules.
import { expect, test, type Page } from "@playwright/test";
import { cell, expectNoSeriousViolations, focusCell, grid, open, viewParam } from "./helpers";

const caseHeading = (page: Page) => page.locator("#case-heading");

/** The desk with one case open, in English unless a language is given. */
async function openCase(page: Page, id: string, query = "") {
  const params = new URLSearchParams(query);
  if (!params.has("lang")) params.set("lang", "en");
  params.set("case", id);
  params.set("colleague", "off");
  await page.goto(`/?${params}`);
  await expect(caseHeading(page)).toBeVisible({ timeout: 15_000 });
}

test("O opens the case of the active row; Q goes back with the focus on that row", async ({ page }) => {
  await open(page, `view=${viewParam({ search: "C-001196" })}`, "1 of 1,200 cases");
  await expect(grid(page)).not.toHaveAttribute("aria-busy");
  await focusCell(page, 0, 1);
  await expect(cell(page, 0, 1)).toHaveText("C-001196");
  await expect(page.getByRole("button", { name: /^Open case C-001196/ })).toBeVisible();
  await page.keyboard.press("o");
  await expect(caseHeading(page)).toContainText("C-001196, ");
  await expect(caseHeading(page)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("case")).toBe("C-001196");
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Block, 161-FZ");
  await expect(page.locator(".stoa-detail-header__status")).toContainText("15 working days left");
  await page.keyboard.press("q");
  await expect(cell(page, 0, 1)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("case")).toBeNull();
});

test("Back in the case's header goes to the queue with the focus on the row the case was opened from", async ({ page }) => {
  await open(page, `view=${viewParam({ search: "C-001196" })}`, "1 of 1,200 cases");
  await focusCell(page, 0, 1);
  await page.keyboard.press("o");
  await expect(caseHeading(page)).toBeFocused();
  await page.locator(".stoa-detail-header").getByRole("button", { name: /^Back to the queue/ }).click();
  await expect(cell(page, 0, 1)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("case")).toBeNull();
});

test("Q goes back to the queue while the case is still loading the rules engine", async ({ page }) => {
  await open(page, `view=${viewParam({ search: "C-001196" })}`, "1 of 1,200 cases");
  await focusCell(page, 0, 1);
  // The queue's worker has its rules module; the page loads its own when a
  // case opens. Held back here, so the case is still loading when Q comes.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/*.wasm", async (route) => {
    await held;
    await route.continue();
  });
  await page.keyboard.press("o");
  await expect(caseHeading(page)).toBeFocused();
  await expect(page.getByRole("button", { name: "Run plan" })).toHaveCount(0);
  await page.keyboard.press("q");
  await expect(cell(page, 0, 1)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("case")).toBeNull();
  release();
});

test("a 161-FZ transfer: the OD-2506 sign with the order's own wording, the suspension, the copy to the Bank of Russia", async ({ page }) => {
  await openCase(page, "C-001196");
  const flags = page.getByRole("region", { name: "Flags" });
  await expect(flags).toContainText("Sign 1.5 of Bank of Russia Order No. OD-2506");
  await expect(flags).toContainText("Transfer by bank details: suspended");
  // The order's wording is the law's, in Russian, as ariadne-rules holds it.
  await expect(flags.locator('q[lang="ru"]')).toContainText("параметрах устройств");
  await expect(flags).toContainText("The suspension ends");
  await expect(flags).toContainText("Last day for the client to confirm the order");
  const card = page.getByRole("region", { name: "Complaint" });
  await expect(card).toContainText("Forwarded by the Bank of Russia");
  await expect(card.locator("blockquote")).toContainText("suspended for two days");
});

test("the deadline is worked out step by step, each step with its source and revision", async ({ page }) => {
  await openCase(page, "C-001196");
  const table = page.getByRole("table", { name: "How the reply's last day was worked out" });
  const row = (name: string) => table.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  await expect(row("Registration")).toContainText("Oct 6, 2026");
  await expect(row("Registration")).toContainText("Banking Law No. 395-1, art. 30.1, part 5");
  await expect(row("Reply term")).toContainText("Oct 6, 2026 + 15 working days");
  await expect(row("Reply term")).toContainText("Oct 27, 2026");
  await expect(row("Reply term")).toContainText("revision 2026-08-04");
  await expect(row("Reply term").getByRole("link", { name: /Banking Law/ })).toHaveAttribute("href", /consultant\.ru/);
  await expect(row("Days off in the term")).toContainText("21 − 15");
  await expect(row("Days off in the term")).toContainText("6 days off: weekend days 6");
  await expect(row("Extension")).toContainText("Not asked; possible with a notice by Oct 27, 2026");
  await expect(row("Extension")).toContainText("conservative reading");
  await expect(row("Time left")).toContainText("15 working days left");
});

test("a money claim under 123-FZ: the ombudsman law's term, and no extension", async ({ page }) => {
  await openCase(page, "C-001192");
  await expect(page.getByRole("region", { name: "Operation" })).toContainText("Within 123-FZ");
  const table = page.getByRole("table", { name: "How the reply's last day was worked out" });
  await expect(table.getByRole("row").filter({ hasText: "Extension" })).toContainText("Not allowed: a money claim under 123-FZ is not extended");
  await expect(table.getByRole("row").filter({ hasText: "Reply term" })).toContainText("123-FZ, art. 16");
});

test("a linked case opens from the card, and the timeline runs from receipt to the reply's last day", async ({ page }) => {
  await openCase(page, "C-001156");
  const timeline = page.getByRole("region", { name: "Channel timeline" });
  await expect(timeline.locator(".stoa-timeline__entry").first()).toContainText("Received: Email");
  await expect(timeline).toContainText("Registration notice: Email");
  await expect(timeline.locator(".stoa-timeline__entry").last()).toContainText("Reply due");
  // The reply's last day, still to come, is the entry to notice first: a
  // symbol and a word before it, never its colour alone.
  await expect(timeline.locator(".stoa-timeline__entry--emphasis")).toHaveCount(1);
  await expect(timeline.locator(".stoa-timeline__entry--emphasis")).toContainText("Important:");
  const linked = page.getByRole("region", { name: "Linked cases" });
  await expect(linked.getByRole("row").nth(1)).toContainText("This case is linked to it");
  await linked.getByRole("button", { name: "Open case C-001136" }).click();
  await expect(caseHeading(page)).toContainText("C-001136");
  await expect(caseHeading(page)).toBeFocused();
  await expect(page.getByRole("region", { name: "Linked cases" })).toContainText("Linked to this case");
});

test("a link to a case that does not exist says so, and the queue is there", async ({ page }) => {
  await page.goto("/?lang=en&colleague=off&case=C-009999");
  await expect(page.getByRole("alert").filter({ hasText: "There is no case C-009999." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("row-count")).toHaveText("215 of 1,200 cases");
});

test("on a phone the card and the assistant are two tabs, with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["ru", "en"]) {
    await openCase(page, "C-001200", `lang=${lang}`);
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await tabs.getByRole("tab").nth(1).click();
    const run = page.getByRole("button", { name: lang === "ru" ? "Запустить план" : "Run plan" });
    await expect(run).toBeVisible();
    const sideways = await page.evaluate(() => {
      const region = document.querySelector(".stoa-page-shell__scroll")!;
      return [document.documentElement.scrollWidth - document.documentElement.clientWidth, region.scrollWidth - region.clientWidth];
    });
    expect(sideways, lang).toEqual([0, 0]);
  }
});

for (const lang of ["ru", "en"])
  for (const theme of ["light", "dark"])
    test(`axe: the open case, its card and the assistant (${lang}, ${theme})`, async ({ page }) => {
      await openCase(page, "C-001196", `lang=${lang}&theme=${theme}`);
      await expect(page.getByRole("table").last()).toBeVisible();
      await expectNoSeriousViolations(page, "case", { lang, theme });
    });
