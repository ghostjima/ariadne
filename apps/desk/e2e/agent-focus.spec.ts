// Where the keyboard focus goes after a decision removes or disables the
// control that had it: never to the page's body, from which the next Tab
// would start again at the top of the page. During a run that place is the
// run's heading, one Tab before Stop.
import { expect, type Page } from "@playwright/test";
import { LINKED_CASE, dialog, en, expectPlanState, ready, retryButton, runSteps, test, throttleCpu, agentUrl } from "./agent-helpers";

/** What has the focus, in words; "body" when nothing does. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    return `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}`;
  });

const runHeading = (page: Page) => page.getByRole("heading", { name: en.run.panel, exact: true });

/** The focus is on the run's heading. */
async function expectAtRun(page: Page, what: string) {
  await expect(runHeading(page), what).toBeFocused();
}

/**
 * Where a decision sends the focus, read from a record of where it lands
 * rather than from where it is when the test looks. The run goes on after
 * the decision, and its next confirmation opens and takes the focus a few
 * tens of milliseconds later, as it should; on a slow machine that happens
 * before the test looks. The record starts when this is called: `act`
 * presses the control, and the first place the focus lands afterwards must
 * be the run's heading. A control pressed with the mouse is focused before
 * the record starts, so that the press itself lands nowhere new.
 */
async function expectSentToRun(page: Page, what: string, act: () => Promise<void>) {
  const start = await page.evaluate(() => {
    const w = window as unknown as { focusLandings?: string[] };
    if (!w.focusLandings) {
      const landings: string[] = [];
      w.focusLandings = landings;
      document.addEventListener(
        "focusin",
        (e) => {
          const el = e.target as Element;
          landings.push(`${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}`);
        },
        true,
      );
    }
    return w.focusLandings.length;
  });
  await act();
  const first = () => page.evaluate((from) => (window as unknown as { focusLandings: string[] }).focusLandings[from] ?? "nowhere yet", start);
  await expect.poll(first, { message: what }).toBe(`h4 ${en.run.panel}`);
}

/** The confirmation open now, by its own label: the run's next
 * confirmation, which may open as soon as this one closes, does not match
 * it. */
async function openConfirmation(page: Page) {
  const label = await (await dialog(page)).getAttribute("aria-labelledby");
  return page.locator(`section.stoa-dialog[aria-labelledby="${label}"]`);
}

test("after Run the focus is at the run, and Tab goes on to Stop", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05"));
  await ready(page);
  const run = page.getByRole("button", { name: en.plan.run });
  await run.focus();
  await expectSentToRun(page, "after Run", () => run.click());
  // From the heading, Tab goes on to Stop. Seen while the run waits at
  // step 2's failure, where nothing else moves the focus.
  await expect(retryButton(page)).toBeFocused({ timeout: 15_000 });
  await runHeading(page).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: en.run.stop, exact: true })).toBeFocused();
});

test("a run's decisions keep the focus at the run, from Run to Stop", async ({ page }) => {
  // Every step asks, in a case whose fact request asks to deviate.
  await page.goto(agentUrl("scale=0.05", LINKED_CASE));
  await ready(page);
  await page.getByRole("radio", { name: en.autonomy.ask_all }).click();
  const run = page.getByRole("button", { name: en.plan.run });
  await run.focus();
  await expectSentToRun(page, "after Run", () => run.click());

  // Step 1: confirmed from the keyboard.
  let alert = await openConfirmation(page);
  await page.keyboard.press("Tab");
  await expectSentToRun(page, "after a confirmation", () => page.keyboard.press("Enter"));
  await expect(alert).toBeHidden();

  // Step 2: the agent's request, kept with Escape; then its own
  // confirmation, confirmed.
  alert = await openConfirmation(page);
  await expectSentToRun(page, "after Escape on the agent's request", () => page.keyboard.press("Escape"));
  await expect(alert).toBeHidden();
  alert = await openConfirmation(page);
  await page.keyboard.press("Tab");
  await expectSentToRun(page, "after a second confirmation", () => page.keyboard.press("Enter"));
  await expect(alert).toBeHidden();

  // Step 2 fails: Retry has the focus; once pressed, the run has it.
  const retry = retryButton(page);
  await expect(retry).toBeFocused({ timeout: 15_000 });
  await expectSentToRun(page, "after Retry", () => page.keyboard.press("Enter"));
  await expect(retry).toHaveCount(0);

  // Step 3, the draft: Escape skips it.
  alert = await openConfirmation(page);
  await expectSentToRun(page, "after Escape", () => page.keyboard.press("Escape"));
  await expect(alert).toBeHidden();

  // Step 4: S stops the run from its confirmation. Nothing comes after a
  // stop, so the focus stays at the run.
  alert = await openConfirmation(page);
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
  await expect(alert).toBeHidden();
  await expectAtRun(page, "after S");
});

test("Skip and Stop on a failed step keep the focus at the run", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect(retryButton(page)).toBeFocused({ timeout: 15_000 });
  const skip = page.getByRole("button", { name: en.step.skip, exact: true });
  await skip.focus();
  await expectSentToRun(page, "after Skip", () => skip.click());
  await expect(runSteps(page).nth(1)).toContainText("Skipped");
  // The same failure in a new run: Stop this time. Nothing comes after a
  // stop, so the focus stays at the run.
  await page.goto(agentUrl("scale=0.05&seed=7"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect(retryButton(page)).toBeFocused({ timeout: 15_000 });
  await page.getByRole("button", { name: en.step.stopRun, exact: true }).click();
  await expectPlanState(page, "stopped");
  await expectAtRun(page, "after Stop");
});

test("Stop pressed in the run bar leaves the focus at the run", async ({ page }) => {
  await page.goto(agentUrl("scale=4"));
  await ready(page);
  await page.getByRole("radio", { name: en.autonomy.ask_none }).click();
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect(runSteps(page).nth(0)).toContainText("Running");
  await page.getByRole("button", { name: en.run.stop }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: en.run.stop })).toBeDisabled();
  await expect(runHeading(page)).toBeFocused();
});

test("Undo on a step leaves the focus in place", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await retryButton(page).click();
  // The draft's confirmation opens next; S stops there, so the run waits
  // for nothing and nothing else moves the focus before Undo is pressed.
  await dialog(page);
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
  const undo = runSteps(page).nth(1).getByRole("button", { name: /^Undo: / });
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect(runSteps(page).nth(1)).toContainText("Undone");
  expect(await focused(page)).not.toBe("body");
});

test("removing the last step gives the focus to Restore", async ({ page }) => {
  await page.goto(agentUrl());
  await ready(page);
  const removes = page.locator(".stoa-reorder__remove");
  while ((await removes.count()) > 1) await removes.first().click();
  await removes.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(en.plan.emptyTitle)).toBeVisible();
  await expect(page.getByRole("button", { name: en.plan.restore })).toBeFocused();
});

test("New plan gives the focus to Run on the new plan", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05&undoWindow=1"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect(retryButton(page)).toBeVisible();
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
  await page.getByRole("button", { name: en.run.newPlan }).focus();
  await page.keyboard.press("Enter");
  await expectPlanState(page, "draft");
  await expect(page.getByRole("button", { name: en.plan.run })).toBeFocused();
});

test("New plan confirmed in its dialog gives the focus to Run on the new plan", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await retryButton(page).click();
  await dialog(page);
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
  await page.getByRole("button", { name: en.run.newPlan }).focus();
  await page.keyboard.press("Enter");
  const ask = await dialog(page);
  await ask.getByRole("button", { name: en.newPlanAsk.confirm }).focus();
  await page.keyboard.press("Enter");
  await expectPlanState(page, "draft");
  await expect(page.getByRole("button", { name: en.plan.run })).toBeFocused();
});

test("the run service's buttons leave the focus in place when their notice goes", async ({ browser, cpuThrottle }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await throttleCpu(page, cpuThrottle);
  await page.goto(agentUrl());
  await expect(page.getByText(en.service.failedTitle)).toBeVisible();
  await page.getByRole("button", { name: en.service.usePage }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: en.service.usePage })).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.plan.run })).toBeFocused();
  await context.close();
});
