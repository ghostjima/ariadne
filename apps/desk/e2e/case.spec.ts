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

// The register's paths beyond the first step, each on an open case: a
// refused repeat after the database answered (C-001182), a confirmed
// transfer suspended again (C-001142), an application to remove the
// client's data through the bank (C-001115), and the commission's request
// without a term (C-001088) and with one (C-001035).
test("a second step under 161-FZ: the first action and the second with their grounds, and what follows from part 3.11", async ({ page }) => {
  await openCase(page, "C-001182");
  const flags = page.getByRole("region", { name: "Flags" });
  await expect(flags).toContainText("The operation refused");
  await expect(flags).toContainText("Ground: 161-FZ, art. 8, part 3.4, sentence 2");
  await expect(flags).toContainText("The repeated operation refused: the Bank of Russia's database answered after the repeat");
  await expect(flags).toContainText("Ground: 161-FZ, art. 8, part 3.10, sentence 1");
  await expect(flags).toContainText("The two days after the refused repeat end");
  await expect(flags).toContainText("From this day the client's next repeat goes through");
  await expect(flags).toContainText("Ground: 161-FZ, art. 8, part 3.11 (conservative reading)");
  const duties = page.getByRole("region", { name: "Duties and storage" });
  await expect(duties).toContainText("Tell the client of the second step: its reason, its term, and that a later repeat is possible");
  await expect(duties).toContainText("at once; 161-FZ, art. 8, part 3.10, sentence 2");
  await expect(duties).toContainText("Kept until Oct 5, 2029: three years from registration (Banking Law No. 395-1, art. 30.1, part 11).");

  await openCase(page, "C-001142", "lang=ru");
  const ru = page.getByRole("region", { name: "Признаки и решения" });
  await expect(ru).toContainText("Приём распоряжения к исполнению приостановлен на два дня");
  await expect(ru).toContainText("Основание: 161-ФЗ, ст. 8, ч. 3.4, предл. 1");
  await expect(ru).toContainText("Подтверждённое распоряжение снова приостановлено на два дня");
  await expect(ru).toContainText("Основание: 161-ФЗ, ст. 8, ч. 3.10, предл. 1");
  await expect(ru).toContainText("Подтверждённое распоряжение исполняется");
});

test("an application to remove the client's data through the bank: no operation blocked and no sign, the card suspended under 161-FZ art. 9, and the terms of Directive No. 6748-U by item", async ({ page }) => {
  await openCase(page, "C-001115");
  // The client's own data in the database: no OD-2506 sign (sign 1.1 is
  // about the recipient of a transfer) and no art. 8 action.
  await expect(page.getByRole("region", { name: "Operation" })).toContainText("No operation");
  const flags = page.getByRole("region", { name: "Flags" });
  await expect(flags).not.toContainText("Order No. OD-2506");
  await expect(flags).not.toContainText("art. 8");
  await expect(flags).toContainText("The client's card or online banking suspended: the client's own data are in the Bank of Russia's database");
  // The register holds the Ministry of Internal Affairs' information: the
  // suspension is a duty under part 11.7.
  await expect(flags).toContainText("Ground: 161-FZ, art. 9, part 11.7");
  await expect(flags).not.toContainText("part 11.6");
  await expect(flags).toContainText("The client is told of the suspension and its reason");
  await expect(flags).toContainText("Ground: 161-FZ, art. 9, part 9.2");
  await expect(flags).toContainText("The application goes to the Bank of Russia, with the bank's view");
  await expect(flags).toContainText("Ground: Bank of Russia Directive No. 6748-U, item 1.5");
  await expect(flags).toContainText("The Bank of Russia decides on the application");
  await expect(flags).toContainText("Ground: Bank of Russia Directive No. 6748-U, items 2.1, 2.3, 2.4");
  await expect(page.getByRole("region", { name: "Duties and storage" })).toContainText(
    "Tell the client of the suspension and of the right to apply to the Bank of Russia, through the bank too, to remove the data",
  );
  await openCase(page, "C-001115", "lang=ru");
  const ru = page.getByRole("region", { name: "Признаки и решения" });
  await expect(ru).toContainText("Основание: Указание Банка России № 6748-У, п. 1.5");
  await expect(ru).toContainText("Основание: Указание Банка России № 6748-У, пп. 2.1, 2.3, 2.4");
  await expect(ru).toContainText("Основание: 161-ФЗ, ст. 9, ч. 11.7");
});

test("the register shows the client's own data in the Bank of Russia's database, with the Ministry of Internal Affairs' information or without, and nothing for a block", async ({ page }) => {
  const columns = ["id", "client", "database"];
  await open(page, `view=${viewParam({ search: "C-001115", columns })}`, "1 of 1,200 cases");
  await expect(cell(page, 0, 3)).toHaveText("The client's data and the police information");
  await open(page, `view=${viewParam({ search: "C-001140", columns })}`, "1 of 1,200 cases");
  await expect(cell(page, 0, 3)).toHaveText("The client's data");
  await open(page, `view=${viewParam({ search: "C-001196", columns })}`, "1 of 1,200 cases");
  await expect(cell(page, 0, 3)).toHaveText("");
  await open(page, `lang=ru&view=${viewParam({ search: "C-001115", columns })}`, "");
  await expect(cell(page, 0, 3)).toHaveText("Сведения о клиенте и сведения МВД", { timeout: 15_000 });
});

/** A case about the client's own data in the database, without the
 * Ministry of Internal Affairs' information, where the bank chose not to
 * suspend the card under 161-FZ art. 9 part 11.6 and capped the
 * transfers instead; under legal review, refused on part 11.6. */
const CAPPED_CASE = "C-001140";

test("the bank's choice under 161-FZ art. 9 part 11.6: the transfers capped instead of the suspension, ATM cash capped either way, each on its ground, and the register's column", async ({ page }) => {
  await openCase(page, CAPPED_CASE);
  const flags = page.getByRole("region", { name: "Flags" });
  await expect(flags).toContainText(
    "Not suspended: the client's transfers to individuals capped at 100,000 roubles a month while the client's own data are in the Bank of Russia's database",
  );
  await expect(flags).toContainText("Ground: 161-FZ, art. 9, part 11.6, sentence 2");
  await expect(flags).toContainText(
    "ATM cash capped at 100,000 roubles a month from the day the bank received the database information, while the client's data are in the Bank of Russia's database",
  );
  await expect(flags).toContainText("Ground: Banking Law No. 395-1, art. 30, part 16");
  // No suspension, so no same-day notice of one and no duty of part 11.8.
  await expect(flags).not.toContainText("The client's card or online banking suspended");
  await expect(flags).not.toContainText("part 9.2");
  await expect(page.getByRole("region", { name: "Duties and storage" })).not.toContainText("Tell the client of the suspension");
  // A suspended case has the suspension and the ATM cap.
  await openCase(page, "C-001115");
  await expect(page.getByRole("region", { name: "Flags" })).toContainText("Ground: Banking Law No. 395-1, art. 30, part 16");
  await openCase(page, CAPPED_CASE, "lang=ru");
  const ru = page.getByRole("region", { name: "Признаки и решения" });
  await expect(ru).toContainText("Основание: 161-ФЗ, ст. 9, ч. 11.6, предл. 2");
  await expect(ru).toContainText("Основание: Закон о банках № 395-1, ст. 30, ч. 16");
  // The register's column: the suspension, the cap, nothing for a block.
  const columns = ["id", "client", "restriction"];
  await open(page, `view=${viewParam({ search: CAPPED_CASE, columns })}`, "1 of 1,200 cases");
  await expect(cell(page, 0, 3)).toHaveText("Transfers to individuals up to RUB 100,000 a month");
  await open(page, `view=${viewParam({ search: "C-001115", columns })}`, "1 of 1,200 cases");
  await expect(cell(page, 0, 3)).toHaveText("Card and online banking suspended");
  await open(page, `view=${viewParam({ search: "C-001196", columns })}`, "1 of 1,200 cases");
  await expect(cell(page, 0, 3)).toHaveText("");
  await open(page, `lang=ru&view=${viewParam({ search: CAPPED_CASE, columns })}`, "");
  await expect(cell(page, 0, 3)).toHaveText("Переводы физлицам до 100 000 ₽ в месяц", { timeout: 15_000 });
});

test("the commission's request: the bank's answer by its term under Regulation No. 842-P, or 3 working days when it gives none, with the rules' note", async ({ page }) => {
  await openCase(page, "C-001088");
  const flags = page.getByRole("region", { name: "Flags" });
  await expect(flags).toContainText("The bank's justification is due to the commission");
  await expect(flags).toContainText("Ground: 115-FZ, art. 7, item 13.6, paragraph 1 (conservative reading)");
  await expect(flags).toContainText("The commission decides");
  await expect(flags).toContainText("Ground: 115-FZ, art. 7, item 13.5, paragraph 3");
  const notes = page.getByRole("region", { name: "Duties and storage" });
  await expect(notes).toContainText("What the rules note");
  await expect(notes).toContainText("The commission's request gives no term: the least the law allows, 3 working days, is taken.");
  await openCase(page, "C-001035", "lang=ru");
  await expect(page.getByRole("region", { name: "Признаки и решения" })).toContainText("Основание: Положение Банка России № 842-П, п. 2.8");
});

for (const lang of ["ru", "en"])
  for (const theme of ["light", "dark"])
    test(`axe: the cases on the paths beyond the first step (${lang}, ${theme})`, async ({ page }) => {
      for (const [id, state] of [
        ["C-001182", "case with a second antifraud step"],
        ["C-001115", "case with an application to remove the client's data"],
        ["C-001088", "case with the commission's request"],
        [CAPPED_CASE, "case with the transfers capped instead of the suspension"],
      ] as const) {
        await openCase(page, id, `lang=${lang}&theme=${theme}`);
        await expect(page.getByRole("table").last()).toBeVisible();
        await expectNoSeriousViolations(page, state, { lang, theme });
      }
    });

test("on a phone the cases on the paths fit without sideways scroll, in Russian and English", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["ru", "en"])
    for (const id of ["C-001182", "C-001115", "C-001088", CAPPED_CASE]) {
      await openCase(page, id, `lang=${lang}`);
      await expect(page.getByRole("table").last()).toBeVisible();
      const sideways = await page.evaluate(() => {
        const region = document.querySelector(".stoa-page-shell__scroll")!;
        return [document.documentElement.scrollWidth - document.documentElement.clientWidth, region.scrollWidth - region.clientWidth];
      });
      expect(sideways, `${lang} ${id}`).toEqual([0, 0]);
    }
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
