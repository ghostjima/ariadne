// The supervisor's metrics over the register: from the toolbar or M, under
// the case card's header (Stoa's DetailHeader), whose heading has the
// focus; every measure says what it counts and that it is computed from
// the synthetic register, a table per operator; a letter signed in the
// page counts; Back or Q goes back to the queue with the focus in the
// grid. Only the supervisor has them.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/i18n";
import { supervisionStrings } from "../src/supervision/i18n";
import { workflowStrings } from "../src/workflow/i18n";
import { ALL, expectNoSeriousViolations, focusCell, grid, open } from "./helpers";

const s = supervisionStrings.en;
const heading = (page: Page) => page.getByRole("heading", { name: s.title });
const card = (page: Page, label: string) => page.locator(".stoa-metric").filter({ has: page.locator(".stoa-metric__label", { hasText: label }) });

test("the supervisor opens the metrics by keyboard; each measure says what it counts; Q goes back to the grid", async ({ page }) => {
  await open(page);
  await focusCell(page, 0, 1);
  await page.keyboard.press("m");
  await expect(heading(page)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("metrics")).toBe("1");
  await expect(page.locator(".metrics")).toContainText("Computed in this page from the synthetic register, as of Oct 6, 2026");
  await expect(card(page, s.breaches)).toContainText("82 replies sent late");
  await expect(card(page, s.breaches)).toContainText("4 open cases past their last day");
  await expect(card(page, s.firstAction)).toContainText("median, working days from registration to the first step on the case");
  await expect(card(page, s.light)).toContainText("of 985 signed letters");
  await expect(card(page, s.overrides)).toContainText("signatures replaced what was proposed");
  await expect(card(page, s.returned)).toContainText("replies that reached legal review were returned at least once");
  await expect(card(page, s.reopened)).toContainText("of 1,200 cases");
  const table = page.getByRole("table", { name: s.byOperator });
  await expect(table.getByRole("row")).toHaveCount(9);
  await expect(table.getByRole("row").nth(1)).toContainText("V. Lanskaya");
  await page.keyboard.press("q");
  await expect(grid(page).locator('[data-cell="0:1"]')).toBeFocused();
  expect(new URL(page.url()).searchParams.get("metrics")).toBeNull();
});

test("the metrics open with the case card's header: Back with Q, the title, and what the figures come from; Back returns to the grid", async ({ page }) => {
  for (const lang of ["ru", "en"] as const) {
    const words = supervisionStrings[lang];
    await open(page, `lang=${lang}`, lang === "en" ? ALL : "");
    await page.getByRole("grid").waitFor();
    await focusCell(page, 2, 1);
    await page.keyboard.press("m");
    const header = page.locator(".metrics > .stoa-detail-header");
    await expect(header.getByRole("heading", { level: 2, name: words.title })).toBeFocused();
    // The case card's Back, in the same words.
    const back = header.getByRole("button", { name: strings[lang].case.back, exact: true });
    await expect(back).toHaveAttribute("aria-keyshortcuts", "Q");
    await expect(header.locator(".stoa-detail-header__status")).toContainText(words.synthetic);
    await expect(header.locator(".stoa-detail-header__status")).toContainText(words.asOf(lang === "en" ? "Oct 6, 2026" : "6 окт. 2026 г."));
    await back.click();
    await expect(grid(page).locator('[data-cell="2:1"]')).toBeFocused();
    expect(new URL(page.url()).searchParams.get("metrics")).toBeNull();
  }
});

test("on a phone the metrics' Back lists no key, as the case card's", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?lang=en&colleague=off&metrics=1");
  const back = page.locator(".metrics > .stoa-detail-header").getByRole("button", { name: s.back, exact: true });
  await expect(back).toBeVisible({ timeout: 15_000 });
  await expect(back).not.toHaveAttribute("aria-keyshortcuts", /./);
});

test("a letter signed in the page counts in the metrics, from its own texts", async ({ page }) => {
  await page.goto("/?lang=en&colleague=off&role=signatory&sendDelay=0&case=C-001062");
  const form = page.locator(".letter-panel");
  await form.getByLabel(workflowStrings.en.signature.wrong).fill("The client was answered by phone already.");
  await form.getByRole("button", { name: workflowStrings.en.signature.sign }).click();
  await page.keyboard.press("q");
  await page.getByRole("radio", { name: "Supervisor" }).click();
  await page.getByRole("button", { name: s.open, exact: true }).click();
  await expect(card(page, s.light)).toContainText("1 signed in this page");
  await expect(card(page, s.light)).toContainText("of 986 signed letters");
});

test("only the supervisor has the metrics", async ({ page }) => {
  await open(page, "role=operator", "164 of 1,200 cases");
  await expect(page.getByRole("button", { name: s.open, exact: true })).toHaveCount(0);
  await page.goto("/?lang=en&colleague=off&role=operator&metrics=1");
  await expect(page.getByTestId("row-count")).toBeVisible({ timeout: 15_000 });
  await expect(heading(page)).toHaveCount(0);
});

for (const lang of ["ru", "en"] as const)
  for (const theme of ["light", "dark"])
    test(`axe: the supervisor's metrics (${lang}, ${theme})`, async ({ page }) => {
      await page.goto(`/?lang=${lang}&theme=${theme}&colleague=off&metrics=1`);
      await expect(page.getByRole("table", { name: supervisionStrings[lang].byOperator })).toBeVisible({ timeout: 15_000 });
      await expectNoSeriousViolations(page, "metrics", { lang, theme });
    });

test("on a phone the metrics fit without sideways scroll; the table scrolls in its own region", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["ru", "en"] as const) {
    await page.goto(`/?lang=${lang}&colleague=off&metrics=1`);
    await expect(page.getByRole("table", { name: supervisionStrings[lang].byOperator })).toBeVisible({ timeout: 15_000 });
    const sideways = await page.evaluate(() => {
      const region = document.querySelector(".stoa-page-shell__scroll")!;
      return [document.documentElement.scrollWidth - document.documentElement.clientWidth, region.scrollWidth - region.clientWidth];
    });
    expect(sideways, lang).toEqual([0, 0]);
  }
});
