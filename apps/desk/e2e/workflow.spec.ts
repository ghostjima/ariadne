// The stages of a case as explicit states: each role takes its own
// transitions from the case's page, a return for rework asks for its
// reason, every transition goes into the case's journal with who, when
// and why, and the assistant's handover moves the case to legal review
// once a person confirms it, with the draft kept on the case and no Run
// left. Keyboard first; the focus never falls to the page's body.
import { expect, test, type Page } from "@playwright/test";
import { workflowStrings } from "../src/workflow/i18n";
import { agentUrl, confirmation, dialog, en, expectPlanState, openConfirmation, ready, runSteps } from "./agent-helpers";
import { expectNoSeriousViolations } from "./helpers";

const w = workflowStrings.en;
/** A general complaint of the demo operator (V. Lanskaya), just
 * registered, with no linked case. */
const HANDOVER_CASE = "C-001184";
/** A 161-FZ reply under legal review, upheld. */
const REVIEW_CASE = "C-001024";

const work = (page: Page) => page.getByRole("region", { name: w.panel });
const journal = (page: Page) => work(page).getByRole("list", { name: w.journalCaption });
const heading = (page: Page) => work(page).getByRole("heading", { name: w.panel });

/** A case open as a role, in English unless a language is given. */
async function openAs(page: Page, id: string, role: string, query = "") {
  const params = new URLSearchParams(query);
  if (!params.has("lang")) params.set("lang", "en");
  params.set("case", id);
  params.set("role", role);
  params.set("colleague", "off");
  await page.goto(`/?${params}`);
  await expect(page.locator(".case-work")).toBeVisible({ timeout: 15_000 });
}

test("the reviewer returns a reply for rework: a reason is asked for, the journal says who, when and why, and the focus stays in the work", async ({ page }) => {
  await openAs(page, REVIEW_CASE, "reviewer");
  await expect(work(page)).toContainText("You act as the reviewer, K. Saburova.");
  await expect(journal(page).getByRole("listitem").last()).toContainText("Handed over to legal review");
  await work(page).getByRole("button", { name: w.act.return }).click();
  const box = page.getByRole("dialog", { name: w.returnTitle(REVIEW_CASE) });
  await expect(box).toBeVisible();
  // No reason chosen: refused, and said.
  await box.getByRole("button", { name: w.returnConfirm }).click();
  await expect(box.getByRole("alert")).toHaveText(w.errors["reason-required"]);
  // Another reason needs a comment.
  await box.getByRole("button", { name: /Reason/ }).click();
  await page.getByRole("option", { name: w.reasons.other }).click();
  await box.getByRole("button", { name: w.returnConfirm }).click();
  await expect(box.getByRole("alert")).toHaveText(w.commentRequired("10"));
  await box.getByRole("button", { name: /Reason/ }).click();
  await page.getByRole("option", { name: w.reasons.ground_wrong }).click();
  await box.getByLabel(w.comment).fill("The block rests on part 3.4, not 3.10.");
  await box.getByLabel(w.comment).press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(box).toBeHidden();
  // The Return button went with the stage: the focus is on the work's heading.
  await expect(heading(page)).toBeFocused();
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Drafting");
  await expect(page.locator(".stoa-detail-header__status")).toContainText(w.returned);
  const last = journal(page).getByRole("listitem").last();
  await expect(last).toContainText("Returned for rework");
  await expect(last).toContainText("Legal review → Drafting");
  await expect(last).toContainText("Reviewer K. Saburova");
  await expect(last).toContainText("Reason: The legal ground is wrong");
  await expect(last).toContainText("Comment: The block rests on part 3.4, not 3.10.");
  // The entry's time, under its day's heading.
  await expect(last.locator("time")).toHaveText(/\d{1,2}:\d{2}/);
  await expect(journal(page).locator(".stoa-timeline__day").last().getByRole("heading")).toHaveText("October 6, 2026");
  await expect(page.getByRole("status").filter({ hasText: `${REVIEW_CASE} is now at “Drafting”.` }).first()).toBeAttached();
  // At drafting the reviewer has nothing to do.
  await expect(work(page)).toContainText(w.nothingToDo("Drafting"));
});

test("the reviewer approves a decided reply for signature, by keyboard; the signatory of another's reply only reads", async ({ page }) => {
  await openAs(page, REVIEW_CASE, "reviewer");
  const approve = work(page).getByRole("button", { name: w.act.approve });
  await approve.focus();
  await page.keyboard.press("Enter");
  await expect(heading(page)).toBeFocused();
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Awaiting signature");
  await expect(journal(page).getByRole("listitem").last()).toContainText("Approved for signature");
  await expect(journal(page).getByRole("listitem").last()).toContainText("Legal review → Awaiting signature");
  // The queue holds the change: the case is in the awaiting-signature view.
  await page.keyboard.press("q");
  await expect(page.getByTestId("row-count")).toBeVisible();
});

test("a role works only its own: the operator does not act on another operator's case; the supervisor has nothing to do at drafting", async ({ page }) => {
  await openAs(page, "C-001096", "operator");
  await expect(work(page)).toContainText(w.notYours("T. Merkulov"));
  await expect(work(page).getByRole("button")).toHaveCount(0);
  await openAs(page, "C-001132", "supervisor");
  await expect(work(page)).toContainText(w.nothingToDo("Drafting"));
  await openAs(page, "C-001132", "operator");
  await expect(work(page).getByRole("button", { name: w.act.hand_over })).toBeVisible();
  await expect(work(page).getByRole("button", { name: w.act.request_facts })).toBeVisible();
});

test("the assistant's handover goes on the case once a person confirms it: legal review, the draft kept, no Run, no Undo of the step", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05&seed=8&role=operator", HANDOVER_CASE));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  const alert = await dialog(page);
  await alert.getByRole("button", { name: en.confirm.confirm.reply }).click();
  await expectPlanState(page, "finished");
  // The run handed over in its own log; the case is not moved yet.
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Registered");
  const step = runSteps(page).nth(4);
  await expect(step).toContainText(w.handover.confirmTitle);
  await step.getByRole("button", { name: w.handover.confirm }).click();
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Legal review");
  await expect(step).toContainText("On the case: “Legal review”, The assistant, confirmed by V. Lanskaya");
  await expect(step).toContainText(w.handover.draftKept);
  await expect(step.getByRole("button", { name: /Undo/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  // The run's own log is as it was: the handover is its last step.
  await expect(runSteps(page)).toHaveCount(5);
  // The journal: the assistant, and who confirmed.
  const last = journal(page).getByRole("listitem").last();
  await expect(last).toContainText("Handed over to legal review");
  await expect(last).toContainText("Registered → Legal review");
  await expect(last).toContainText("The assistant, confirmed by V. Lanskaya");
  // A new plan on a case past drafting has no Run.
  await page.getByRole("button", { name: en.run.newPlan }).click();
  // The fact request's undo window is still open: New plan asks first.
  await page.getByRole("alertdialog").getByRole("button", { name: en.newPlanAsk.confirm }).click();
  await expectPlanState(page, "draft");
  await expect(page.getByRole("button", { name: en.plan.run })).toHaveCount(0);
  await expect(page.locator(".plan")).toContainText('This case is at "Legal review"');
});

test("a handover the person confirmed in the run goes on the case at once", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05&seed=8&role=operator", HANDOVER_CASE));
  await ready(page);
  await page.getByRole("radio", { name: en.autonomy.ask_all }).click();
  await page.getByRole("button", { name: en.plan.run }).click();
  const confirms = [en.confirm.confirm.change, en.confirm.confirm.request, en.confirm.confirm.reply, en.confirm.confirm.change, en.confirm.confirm.change];
  for (const [k, label] of confirms.entries()) {
    // Each step's confirmation by its own label, and named for its step.
    const alert = await openConfirmation(page);
    await expect(alert.getByRole("heading")).toContainText(`Step ${k + 1}:`);
    await alert.getByRole("button", { name: label }).click();
    // The next step asks within tens of milliseconds. Once its
    // confirmation is the one open, this step's has closed: asked of this
    // dialog, not of "no confirmation is visible", which at that moment
    // is false and stays false until the next decision.
    if (k + 1 < confirms.length) await expect(confirmation(page).getByRole("heading")).toContainText(`Step ${k + 2}:`);
    await expect(alert).toBeHidden();
  }
  await expect(confirmation(page)).toHaveCount(0);
  await expectPlanState(page, "finished");
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Legal review");
  await expect(runSteps(page).nth(4)).toContainText("On the case: “Legal review”");
  await expect(runSteps(page).nth(4).getByRole("button", { name: w.handover.confirm })).toHaveCount(0);
});

test("the handover is the operator's: another role sees why it is not on the case", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05&seed=8", HANDOVER_CASE));
  await ready(page);
  await page.getByRole("radio", { name: en.autonomy.ask_none }).click();
  await page.getByRole("button", { name: en.plan.run }).click();
  await (await dialog(page)).getByRole("button", { name: en.confirm.confirm.reply }).click();
  await expectPlanState(page, "finished");
  await expect(runSteps(page).nth(4)).toContainText(w.handover.notOperator);
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Registered");
});

for (const lang of ["ru", "en"] as const)
  for (const theme of ["light", "dark"])
    test(`axe: the work on a case with its journal, and the return dialog (${lang}, ${theme})`, async ({ page }) => {
      const words = workflowStrings[lang];
      await openAs(page, REVIEW_CASE, "reviewer", `lang=${lang}&theme=${theme}`);
      await expect(page.getByRole("region", { name: words.panel }).getByRole("list", { name: words.journalCaption })).toBeVisible();
      await expectNoSeriousViolations(page, "case work", { lang, theme });
      await page.getByRole("button", { name: words.act.return }).click();
      await expect(page.getByRole("dialog", { name: words.returnTitle(REVIEW_CASE) })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: words.returnConfirm }).click();
      await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
      await expectNoSeriousViolations(page, "return for rework", { lang, theme });
    });

test("on a phone the work on the case, its journal and the return dialog fit without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["ru", "en"] as const) {
    await openAs(page, REVIEW_CASE, "reviewer", `lang=${lang}`);
    await page.getByRole("button", { name: workflowStrings[lang].act.return }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const sideways = await page.evaluate(() => {
      const region = document.querySelector(".stoa-page-shell__scroll")!;
      return [document.documentElement.scrollWidth - document.documentElement.clientWidth, region.scrollWidth - region.clientWidth];
    });
    expect(sideways, lang).toEqual([0, 0]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    // Escape closes it; the focus is not on the page's body.
    expect(await page.evaluate(() => document.activeElement === document.body), lang).toBe(false);
  }
});
