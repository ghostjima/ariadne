// The client's own data in the Bank of Russia's database, on the case: the
// bank's own reasoned application to remove them (161-FZ art. 9 part
// 11.9), filed by the legal reviewer or the supervisor with the bank's
// reasons after a confirmation, since it is not recalled; journaled; and
// the Bank of Russia's 15 working days on the card, from the rules engine.
// And the Bank of Russia's request about an application the client filed
// with it directly: recorded the day it arrives, the bank's 3 working days
// on the card, and the answer with the bank's view and reasons.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { workflowStrings } from "../src/workflow/i18n";
import { expectNoSeriousViolations } from "./helpers";

const w = workflowStrings.en;
const b = w.database;
/** A case about the client's own data, with the Ministry of Internal
 * Affairs' information, whose own application through the bank the Bank
 * of Russia received on 6 October 2026 and is reviewing; under legal
 * review. */
const CLIENT_DATA = "C-001115";
/** A suspended transfer, a block on a sign: no database panel. */
const BLOCK = "C-001196";
const REASONS = "The payer's bank confirmed the transfer was the client's own.";
/** A case about the client's own data, with the Ministry's information,
 * waiting for facts, with no application through the bank. */
const DIRECT = "C-001183";

/** A case about an individual's own data, without the Ministry's
 * information: the bank received the record on 22 September 2026 and
 * suspended the card on 23 September; in drafting. */
const RECEIVED_EARLIER = "C-001063";

const panel = (page: Page) => page.locator(".database-panel");
/** The flags of one day on the card, by the day's heading. */
const flagsOn = (page: Page, region: string, day: string) => page.getByRole("region", { name: region }).locator(".stoa-timeline__day").filter({ hasText: day });
const lastEntry = (page: Page) => page.locator(".case-work .stoa-timeline__entry").last();
/** The confirmation: Stoa's AlertDialog (a toast has the role alertdialog too). */
const confirmation = (page: Page) => page.locator('section.stoa-dialog[role="alertdialog"]');
const bodyHasFocus = (page: Page) => page.evaluate(() => document.activeElement === document.body);

async function openAs(page: Page, id: string, role: string, query = "") {
  const params = new URLSearchParams(query);
  if (!params.has("lang")) params.set("lang", "en");
  params.set("case", id);
  params.set("role", role);
  params.set("colleague", "off");
  await page.goto(`/?${params}`);
  await expect(page.locator(".case-card")).toBeVisible({ timeout: 15_000 });
}

test("the supervisor applies to the Bank of Russia to remove the client's data: reasons first, a confirmation, then the journal and the Bank of Russia's term on the card", async ({ page }) => {
  await openAs(page, CLIENT_DATA, "supervisor");
  await expect(panel(page)).toContainText(b.record);
  await expect(panel(page)).toContainText("The client's data and the police information");
  await expect(panel(page)).toContainText(b.ownHelp);
  // Without reasons it does not go.
  await panel(page).getByRole("button", { name: b.apply }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(b.errors["removal-reason-required"]("10"));
  await expect(confirmation(page)).toBeHidden();
  await panel(page).getByLabel(b.reasons).fill(REASONS);
  await panel(page).getByRole("button", { name: b.apply }).click();
  const confirm = confirmation(page);
  await expect(confirm).toContainText(b.confirmText);
  await expect(confirm).toContainText(REASONS);
  // The safe action has the focus: an Enter by habit sends nothing.
  await expect(confirm.getByRole("button", { name: b.keep })).toBeFocused();
  await confirm.getByRole("button", { name: b.confirm, exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator(".stoa-toast-region")).toContainText(b.applied(CLIENT_DATA));
  // The form has gone with the application; the focus is on the panel.
  await expect(panel(page).getByRole("button", { name: b.apply })).toHaveCount(0);
  await expect(panel(page).locator(".stoa-panel__title")).toBeFocused();
  expect(await bodyHasFocus(page)).toBe(false);
  // The client's own application is under review: one decision on both,
  // 15 working days from the first (Directive No. 6748-U item 2.8).
  await expect(panel(page)).toContainText(b.sent("Oct 6, 2026"));
  await expect(panel(page)).toContainText("(Bank of Russia Directive No. 6748-U, item 2.8)");
  await expect(lastEntry(page)).toContainText(w.action.removal_applied);
  await expect(lastEntry(page)).toContainText(`Comment: ${REASONS}`);
  const flags = page.getByRole("region", { name: "Flags" });
  await expect(flags).toContainText("The Bank of Russia decides on the bank's own application to remove the client's data");
  await expect(flags).toContainText("Ground: Bank of Russia Directive No. 6748-U, item 2.8");
  // The export for an inspection keeps the entry with the reasons.
  const download = page.waitForEvent("download");
  await page.locator(".dispatch-panel").getByRole("button", { name: w.dispatch.exportText }).click();
  const body = await readFile((await (await download).path())!, "utf8");
  expect(body).toContain(w.action.removal_applied);
  expect(body).toContain(REASONS);
});

test("the ATM cash cap is dated by the day the bank received the record, not by the day it suspended the card; the transfer cap in between has its end", async ({ page }) => {
  await openAs(page, RECEIVED_EARLIER, "supervisor");
  await expect(panel(page).locator("dl")).toContainText(`${b.received}Sep 22, 2026`);
  // Received on 22 September: ATM cash capped from that day (Banking Law
  // art. 30 part 16), and the transfers capped until the suspension (161-FZ
  // art. 9 part 11.6, sentence 2).
  const received = flagsOn(page, "Flags", "September 22, 2026");
  await expect(received).toContainText("ATM cash capped at 100,000 roubles a month from the day the bank received the database information");
  await expect(received).toContainText("Ground: Banking Law No. 395-1, art. 30, part 16");
  await expect(received).toContainText("Ground: 161-FZ, art. 9, part 11.6, sentence 2");
  await expect(received).toContainText("Ended on Sep 23, 2026");
  await expect(received).toContainText("The law says \"a month\" and not how the month is counted.");
  await expect(received).not.toContainText("card or online banking suspended");
  const suspended = flagsOn(page, "Flags", "September 23, 2026");
  await expect(suspended).toContainText("The client's card or online banking suspended");
  await expect(suspended).not.toContainText("ATM cash");
  await expect(page.getByRole("region", { name: "Duties and storage" })).not.toContainText("The day the bank received the database information is not known");
  // In Russian, with the same days.
  await openAs(page, RECEIVED_EARLIER, "supervisor", "lang=ru");
  await expect(panel(page).locator("dl")).toContainText(workflowStrings.ru.database.received);
  const ru = flagsOn(page, "Признаки и решения", "22 сентября 2026");
  await expect(ru).toContainText("со дня, когда банк получил информацию из базы Банка России");
  await expect(ru).toContainText("Основание: Закон о банках № 395-1, ст. 30, ч. 16");
  await expect(ru).toContainText("Прекращено 23 сент. 2026");
});

test("the operator and the signatory see who files it; a block on a sign has no database panel", async ({ page }) => {
  for (const role of ["operator", "signatory"]) {
    await openAs(page, CLIENT_DATA, role);
    await expect(panel(page)).toContainText(b.whoMay);
    await expect(panel(page).getByRole("button", { name: b.apply })).toHaveCount(0);
  }
  await openAs(page, BLOCK, "supervisor");
  await expect(page.locator(".dispatch-panel")).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test("in Russian, the legal reviewer files it and the card shows the Bank of Russia's term by item", async ({ page }) => {
  const ru = workflowStrings.ru.database;
  await openAs(page, CLIENT_DATA, "reviewer", "lang=ru");
  await expect(panel(page)).toContainText("Сведения о клиенте и сведения МВД");
  await panel(page).getByLabel(ru.reasons).fill("Банк плательщика подтвердил, что перевод сделал сам клиент.");
  await panel(page).getByRole("button", { name: ru.apply }).click();
  await confirmation(page).getByRole("button", { name: ru.confirm, exact: true }).click();
  await expect(panel(page)).toContainText("(Указание Банка России № 6748-У, п. 2.8)");
  await expect(page.getByRole("region", { name: "Признаки и решения" })).toContainText("Банк России решает по заявлению банка об исключении сведений о клиенте");
  await expect(lastEntry(page)).toContainText(workflowStrings.ru.action.removal_applied);
});

for (const lang of ["ru", "en"] as const)
  for (const theme of ["light", "dark"])
    test(`axe: the bank's own application to remove the client's data, refused without reasons, its confirmation, and sent (${lang}, ${theme})`, async ({ page }) => {
      const words = workflowStrings[lang].database;
      await openAs(page, CLIENT_DATA, "supervisor", `lang=${lang}&theme=${theme}`);
      await panel(page).getByRole("button", { name: words.apply }).click();
      await expect(panel(page).getByRole("alert")).toBeVisible();
      await expectNoSeriousViolations(page, "bank's removal application refused", { lang, theme });
      await panel(page).getByLabel(words.reasons).fill(REASONS);
      await panel(page).getByRole("button", { name: words.apply }).click();
      await expect(confirmation(page)).toBeVisible();
      await expectNoSeriousViolations(page, "bank's removal application confirmation", { lang, theme });
      await confirmation(page).getByRole("button", { name: words.confirm, exact: true }).click();
      await expect(confirmation(page)).toBeHidden();
      await expect(panel(page).getByRole("button", { name: words.apply })).toHaveCount(0);
      await expectNoSeriousViolations(page, "bank's removal application sent", { lang, theme });
    });

test("on a phone the database panel fits without sideways scroll, with the application form and with the request's answer form", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["ru", "en"] as const)
    for (const id of [CLIENT_DATA, DIRECT]) {
      await openAs(page, id, "supervisor", `lang=${lang}`);
      await expect(panel(page)).toBeVisible();
      if (id === DIRECT) {
        await panel(page).getByRole("button", { name: workflowStrings[lang].database.recordQuery }).click();
        await expect(panel(page).getByRole("button", { name: workflowStrings[lang].database.answer })).toBeVisible();
      }
      const sideways = await page.evaluate(() => {
        const region = document.querySelector(".stoa-page-shell__scroll")!;
        return [document.documentElement.scrollWidth - document.documentElement.clientWidth, region.scrollWidth - region.clientWidth];
      });
      expect(sideways, `${lang} ${id}`).toEqual([0, 0]);
    }
});

test("the Bank of Russia's request on the client's own application: recorded the day it arrives, its 3 working days on the card, and the answer with the bank's view and reasons", async ({ page }) => {
  await openAs(page, DIRECT, "supervisor");
  await expect(panel(page)).toContainText(b.queryHelp);
  await panel(page).getByRole("button", { name: b.recordQuery }).click();
  await expect(page.locator(".stoa-toast-region")).toContainText(b.queryRecorded(DIRECT));
  await expect(panel(page).locator(".stoa-panel__title")).toBeFocused();
  // Tuesday 6 October 2026: 7, 8, 9 October (Directive No. 6748-U item 2.9).
  await expect(panel(page)).toContainText(b.queryReceived("Oct 6, 2026"));
  await expect(panel(page)).toContainText(b.answerDue("Oct 9, 2026", "Bank of Russia Directive No. 6748-U, item 2.9"));
  await expect(lastEntry(page)).toContainText(w.action.query_received);
  const flags = page.getByRole("region", { name: "Flags" });
  await expect(flags).toContainText("The answer to the Bank of Russia's request is due");
  await expect(flags).toContainText("Ground: Bank of Russia Directive No. 6748-U, item 2.9");
});

test("the legal reviewer answers the request with the bank's view and reasons; without a view it does not go", async ({ page }) => {
  await openAs(page, DIRECT, "supervisor");
  await panel(page).getByRole("button", { name: b.recordQuery }).click();
  await expect(panel(page).getByRole("button", { name: b.recordQuery })).toHaveCount(0);
  await panel(page).getByRole("button", { name: b.answer }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(b.queryErrors["query-view-required"]);
  await panel(page).getByRole("radiogroup", { name: b.view }).getByText(b.views.unjustified, { exact: true }).click();
  await panel(page).getByLabel(b.answerReasons).fill(REASONS);
  await panel(page).getByRole("button", { name: b.answer }).click();
  await expect(page.locator(".stoa-toast-region")).toContainText(b.answeredToast(DIRECT));
  await expect(panel(page)).toContainText(b.answered("Oct 6, 2026", b.views.unjustified));
  await expect(panel(page)).toContainText(b.afterAnswer);
  await expect(panel(page).locator(".stoa-panel__title")).toBeFocused();
  expect(await bodyHasFocus(page)).toBe(false);
  await expect(lastEntry(page)).toContainText(w.action.query_answered);
  await expect(lastEntry(page)).toContainText(b.viewSaid(b.views.unjustified));
  await expect(lastEntry(page)).toContainText(`Comment: ${REASONS}`);
  const download = page.waitForEvent("download");
  await page.locator(".dispatch-panel").getByRole("button", { name: w.dispatch.exportText }).click();
  const body = await readFile((await (await download).path())!, "utf8");
  expect(body).toContain(w.action.query_received);
  expect(body).toContain(b.viewSaid(b.views.unjustified));
});

test("the request is not recorded where the client applied through the bank, nor by the legal reviewer or another operator's hand", async ({ page }) => {
  await openAs(page, CLIENT_DATA, "supervisor");
  await expect(panel(page)).toContainText(b.queryThroughBank);
  await expect(panel(page).getByRole("button", { name: b.recordQuery })).toHaveCount(0);
  for (const role of ["reviewer", "operator", "signatory"]) {
    await openAs(page, DIRECT, role);
    await expect(panel(page)).toContainText(b.queryWhoMay);
    await expect(panel(page).getByRole("button", { name: b.recordQuery })).toHaveCount(0);
  }
  const ru = workflowStrings.ru.database;
  await openAs(page, DIRECT, "supervisor", "lang=ru");
  await panel(page).getByRole("button", { name: ru.recordQuery }).click();
  await expect(panel(page)).toContainText(ru.answerDue("9 окт. 2026 г.", "Указание Банка России № 6748-У, п. 2.9"));
  await expect(lastEntry(page)).toContainText(workflowStrings.ru.action.query_received);
});

for (const lang of ["ru", "en"] as const)
  for (const theme of ["light", "dark"])
    test(`axe: the Bank of Russia's request recorded, its answer refused without a view, and answered (${lang}, ${theme})`, async ({ page }) => {
      const words = workflowStrings[lang].database;
      await openAs(page, DIRECT, "supervisor", `lang=${lang}&theme=${theme}`);
      await panel(page).getByRole("button", { name: words.recordQuery }).click();
      await expect(panel(page).getByRole("button", { name: words.answer })).toBeVisible();
      await expectNoSeriousViolations(page, "Bank of Russia's request recorded", { lang, theme });
      await panel(page).getByRole("button", { name: words.answer }).click();
      await expect(panel(page).getByRole("alert")).toBeVisible();
      await expectNoSeriousViolations(page, "answer to the request refused", { lang, theme });
      await panel(page).getByRole("radiogroup", { name: words.view }).getByText(words.views.justified, { exact: true }).click();
      await panel(page).getByLabel(words.answerReasons).fill(REASONS);
      await panel(page).getByRole("button", { name: words.answer }).click();
      await expect(panel(page)).toContainText(words.afterAnswer);
      await expectNoSeriousViolations(page, "answer to the request recorded", { lang, theme });
    });

