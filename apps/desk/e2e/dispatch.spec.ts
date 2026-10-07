// Dispatch and copies: a signed reply goes out after a person confirms it
// and its send delay runs out, in which it can be cancelled; the copies
// it owes (to the Bank of Russia for a forwarded complaint, to the
// self-regulatory organisation when a non-bank company found a breach of
// a standard) are due the same day and listed in their own view; the
// supervisor's extension takes a reason and is refused for a money claim
// under 123-FZ, in words; a case exports for an inspection as text and
// CSV; how long it is kept is on the case.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { workflowStrings } from "../src/workflow/i18n";
import { cell, expectNoSeriousViolations, focusCell, grid, open } from "./helpers";

const w = workflowStrings.en;
const d = w.dispatch;
/** A 161-FZ refusal forwarded by the Bank of Russia, at signature, signed by V. Izotova. */
const FORWARDED = "C-001102";
/** A credit cooperative's refusal at signature, signed by V. Izotova. */
const COOPERATIVE = "C-001060";
/** A money claim under 123-FZ forwarded by the Bank of Russia, open. */
const CLAIM = "C-001192";
/** A suspended transfer forwarded by the Bank of Russia, registered today. */
const TRANSFER = "C-001196";

const panel = (page: Page) => page.locator(".dispatch-panel");
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
  await expect(panel(page)).toBeVisible({ timeout: 15_000 });
}

/** Signs the letter as proposed. */
async function sign(page: Page) {
  const form = page.locator(".letter-panel");
  await form.getByLabel(w.signature.wrong).fill("The client was answered by phone already.");
  await form.getByRole("button", { name: w.signature.sign }).click();
  await expect(form).toContainText(w.signature.frozen);
}

test("a signed reply is dispatched once a person confirms it and its send delay runs out; the copy to the Bank of Russia is due today", async ({ page }) => {
  await openAs(page, FORWARDED, "signatory", "sendDelay=2");
  await sign(page);
  await expect(panel(page)).toContainText(d.help);
  await panel(page).getByRole("button", { name: d.dispatch, exact: true }).click();
  const confirm = confirmation(page);
  await expect(confirm).toContainText(d.confirmTo("Bank of Russia account"));
  await expect(confirm).toContainText(d.copy.bank_of_russia);
  await expect(confirm).toContainText(d.confirmDelay("2"));
  // The safe action has the focus: an Enter by habit does not dispatch.
  await expect(confirm.getByRole("button", { name: d.keep })).toBeFocused();
  await confirm.getByRole("button", { name: d.confirm, exact: true }).click();
  await expect(panel(page).getByRole("progressbar")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: d.cancel })).toBeVisible();
  expect(await bodyHasFocus(page)).toBe(false);
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Reply sent", { timeout: 10_000 });
  await expect(lastEntry(page)).toContainText("Sent");
  const copy = panel(page).locator(".copies li").filter({ hasText: d.copy.bank_of_russia });
  await expect(copy).toContainText("due Oct 6, 2026");
  // The queue's view of copies due today has it, beside the one of the
  // register's four that this signatory signed.
  await page.keyboard.press("q");
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Copies due today", exact: true }).click();
  await expect(page.getByTestId("row-count")).toHaveText("2 of 1,200 cases");
  await expect(grid(page).getByRole("row").filter({ hasText: FORWARDED })).toHaveCount(1);
});

test("the copy is marked sent and journaled, and leaves the view of copies due today", async ({ page }) => {
  await openAs(page, FORWARDED, "signatory", "sendDelay=0");
  await sign(page);
  await panel(page).getByRole("button", { name: d.dispatch, exact: true }).click();
  await confirmation(page).getByRole("button", { name: d.confirm, exact: true }).click();
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Reply sent", { timeout: 10_000 });
  await panel(page).getByRole("button", { name: `${d.markSent}: ${d.copy.bank_of_russia}` }).click();
  await expect(panel(page).locator(".copies")).toContainText(`${d.copy.bank_of_russia}: sent Oct 6, 2026`);
  await expect(lastEntry(page)).toContainText(w.action.copy_sent);
  await expect(lastEntry(page)).toContainText(d.copy.bank_of_russia);
  expect(await bodyHasFocus(page)).toBe(false);
});

test("a dispatch is cancelled within its send delay: nothing went out, and the journal says so", async ({ page }) => {
  await openAs(page, FORWARDED, "signatory", "sendDelay=60");
  await sign(page);
  await panel(page).getByRole("button", { name: d.dispatch, exact: true }).click();
  await confirmation(page).getByRole("button", { name: d.confirm, exact: true }).click();
  const cancel = panel(page).getByRole("button", { name: d.cancel });
  await cancel.click();
  await expect(panel(page).getByRole("heading", { name: d.panel })).toBeFocused();
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Awaiting signature");
  await expect(lastEntry(page)).toContainText(w.action.dispatch_cancelled);
  await expect(panel(page).getByRole("button", { name: d.dispatch, exact: true })).toBeVisible();
  await expect(panel(page)).toContainText(d.noCopies);
});

test("a non-bank company's breach of a standard owes its self-regulatory organisation a copy of the complaint and the reply", async ({ page }) => {
  await openAs(page, COOPERATIVE, "supervisor", "sendDelay=0");
  await expect(panel(page)).toContainText(d.retentionNone("").slice(30, 80));
  await panel(page).getByText(d.breach).click();
  await expect(panel(page).getByRole("checkbox", { name: d.breach })).toBeChecked();
  await expect(lastEntry(page)).toContainText(w.action.breach_marked);
  // The signatory, in the same page: back to the queue, the role, the case.
  await page.keyboard.press("q");
  await page.getByRole("radio", { name: "Signatory" }).click();
  await page.getByLabel("Search").fill(COOPERATIVE);
  await expect(page.getByTestId("row-count")).toHaveText("1 of 1,200 cases");
  await focusCell(page, 0, 1);
  await page.keyboard.press("o");
  await sign(page);
  await panel(page).getByRole("button", { name: d.dispatch, exact: true }).click();
  const confirm = confirmation(page);
  await expect(confirm).toContainText(d.copy.sro);
  await confirm.getByRole("button", { name: d.confirm, exact: true }).click();
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Reply sent", { timeout: 10_000 });
  await expect(panel(page).locator(".copies")).toContainText(d.copy.sro);
});

test("the supervisor's extension: refused for a money claim under 123-FZ, in words; with a reason, the term moves and the notice owes the Bank of Russia a copy", async ({ page }) => {
  await openAs(page, CLAIM, "supervisor");
  await panel(page).getByLabel(d.extensionReason).fill("Statements from the branch are requested.");
  await panel(page).getByRole("button", { name: d.extend }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(d.extensionRefusedBy("Not allowed: a money claim under 123-FZ is not extended"));
  await openAs(page, TRANSFER, "supervisor");
  await panel(page).getByRole("button", { name: d.extend }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(d.reasonRequired("10"));
  await panel(page).getByLabel(d.extensionReason).fill("=SUM(A1) statements from the branch");
  await panel(page).getByRole("button", { name: d.extend }).click();
  await expect(lastEntry(page)).toContainText(w.action.extend);
  await expect(lastEntry(page)).toContainText("Comment: =SUM(A1) statements from the branch");
  await expect(panel(page).locator(".copies")).toContainText(d.copy.notice);
  await expect(page.locator(".stoa-detail-header__status")).toContainText("25 working days left");

  // The export for an inspection: text and CSV, formulas written as text.
  const text = page.waitForEvent("download");
  await panel(page).getByRole("button", { name: d.exportText }).click();
  const textFile = await text;
  expect(textFile.suggestedFilename()).toBe(`${TRANSFER}-inspection.txt`);
  const body = await readFile((await textFile.path())!, "utf8");
  for (const part of [`Case ${TRANSFER}: export for an inspection`, "Organisation: Bank", "How the reply's last day was worked out", "Deadline extended by 10 working days"]) expect(body).toContain(part);
  // Dates are written as the desk writes them, with no-break spaces.
  expect(body).toMatch(/Retention: Kept until Oct\s6,\s2029: three years from registration \(Banking Law, art\. 30\.1, part 11\)\./);
  const csv = page.waitForEvent("download");
  await panel(page).getByRole("button", { name: d.exportCsv }).click();
  const csvBody = await readFile((await (await csv).path())!, "utf8");
  expect(csvBody.startsWith("﻿Section;When;Who;What;Detail")).toBe(true);
  expect(csvBody).toContain(";Comment: =SUM(A1) statements from the branch");
  expect(csvBody).not.toMatch(/;=SUM/);
});

test("the queue lists the copies due today, with the organisation of each case", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Copies due today", exact: true }).click();
  await expect(page.getByTestId("row-count")).toHaveText("4 of 1,200 cases");
  await expect(page.getByRole("button", { name: /^Copies due today \d/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("columnheader", { name: "Organisation" })).toBeVisible();
  await expect(cell(page, 0, 1)).toHaveText("C-001018");
  await expect(grid(page)).toBeVisible();
});

for (const lang of ["ru", "en"] as const)
  for (const theme of ["light", "dark"])
    test(`axe: dispatch with its confirmation and its send delay, copies and the extension (${lang}, ${theme})`, async ({ page }) => {
      const words = workflowStrings[lang];
      await openAs(page, FORWARDED, "signatory", `lang=${lang}&theme=${theme}&sendDelay=60`);
      const form = page.locator(".letter-panel");
      await form.getByLabel(words.signature.wrong).fill("The client was answered by phone already.");
      await form.getByRole("button", { name: words.signature.sign }).click();
      await panel(page).getByRole("button", { name: words.dispatch.dispatch, exact: true }).click();
      await expect(confirmation(page)).toBeVisible();
      await expectNoSeriousViolations(page, "dispatch confirmation", { lang, theme });
      await confirmation(page).getByRole("button", { name: words.dispatch.confirm, exact: true }).click();
      await expect(panel(page).getByRole("progressbar")).toBeVisible();
      await expectNoSeriousViolations(page, "send delay", { lang, theme });
      await openAs(page, TRANSFER, "supervisor", `lang=${lang}&theme=${theme}`);
      await panel(page).getByRole("button", { name: words.dispatch.extend }).click();
      await expect(panel(page).getByRole("alert")).toBeVisible();
      await expectNoSeriousViolations(page, "extension refused", { lang, theme });
    });

test("on a phone the dispatch, the copies and the extension fit without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["ru", "en"] as const) {
    await openAs(page, TRANSFER, "supervisor", `lang=${lang}`);
    const sideways = await page.evaluate(() => {
      const region = document.querySelector(".stoa-page-shell__scroll")!;
      return [document.documentElement.scrollWidth - document.documentElement.clientWidth, region.scrollWidth - region.clientWidth];
    });
    expect(sideways, lang).toEqual([0, 0]);
  }
});
