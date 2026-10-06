// The main tasks, by keyboard where a person would use it: editing the
// plan, running it, the confirmations, Stop, Pause, the undo window, the
// agent's request to change a step, the reply it drafts and the rubric's
// check, the shortcuts and the log. The run is about one complaint; most
// tests open C-001200, whose fact request times out once (scenario 7).
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/agent/i18n";
import {
  LINKED_CASE,
  dialog,
  en,
  expectNoSeriousViolations,
  expectPlanState,
  logLines,
  ready,
  retryButton,
  runSteps,
  confirmation,
  agentUrl,
} from "./agent-helpers";

const TITLES = [
  "Classify the complaint",
  "Request the facts from operations",
  "Draft the reply",
  "Check the draft against the rubric",
  "Hand the draft to legal review",
];

test("the plan is edited with the keyboard: moved, marked, removed, flagged out of order, emptied and restored", async ({ page }) => {
  await page.goto(agentUrl());
  await ready(page);
  await expect(page.locator(".task")).toContainText("Prepare the reply in case C-001200");
  const plan = page.getByRole("grid", { name: en.plan.list });
  const rows = plan.getByRole("row");
  await expect(rows).toHaveCount(5);
  for (const [i, title] of TITLES.entries()) await expect(rows.nth(i)).toContainText(title);
  await expect(page.getByText("Steps: 5. Will ask before running: 1.")).toBeVisible();

  await page.getByRole("button", { name: "Move down: Classify the complaint" }).focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(0)).toContainText("Request the facts from operations");
  await expect(rows.nth(1)).toContainText("Classify the complaint");

  // Ask first on step 1 (now the fact request): one more step will ask.
  const ask = rows.nth(0).getByRole("switch", { name: en.plan.askFirst });
  await ask.focus();
  await page.keyboard.press("Space");
  await expect(ask).toBeChecked();
  await expect(page.getByText("Steps: 5. Will ask before running: 2.")).toBeVisible();
  // Drafting the reply is high risk: its switch is on, cannot be turned
  // off, and says why.
  await expect(rows.nth(2).getByRole("switch")).toBeDisabled();
  await expect(rows.nth(2)).toContainText(en.plan.alwaysAsks);
  await expect(rows.nth(2)).toContainText("high risk");

  await page.getByRole("button", { name: "Remove: Classify the complaint" }).focus();
  await page.keyboard.press("Enter");
  await expect(rows).toHaveCount(4);
  await expect(page.getByText("Steps: 4. Will ask before running: 2.")).toBeVisible();

  // The draft moved before the fact request: the plan says what is wrong.
  await page.getByRole("button", { name: "Move up: Draft the reply" }).focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(0)).toContainText("Draft the reply");
  const conflict = page.locator(".plan .stoa-callout").filter({ hasText: en.plan.conflictTitle });
  await expect(conflict).toContainText("Step 1 drafts the reply before step 2 asks for the facts.");
  await page.getByRole("button", { name: "Move down: Draft the reply" }).focus();
  await page.keyboard.press("Enter");
  await expect(conflict).toHaveCount(0);

  // Every step removed: the empty state, with a way back.
  for (let left = 4; left > 0; left -= 1) {
    await rows.first().getByRole("button", { name: /^Remove: / }).click();
    await expect(rows).toHaveCount(left - 1);
  }
  await expect(page.getByText(en.plan.emptyTitle)).toBeVisible();
  await expect(page.getByRole("button", { name: en.plan.run })).toHaveCount(0);
  await expectNoSeriousViolations(page, "empty plan");
  await page.getByRole("button", { name: en.plan.restore }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText("Classify the complaint");
});

test("a run by keyboard: R runs, the agent's request and the draft focus the safe action, a failed step focuses Retry, S stops", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05", LINKED_CASE));
  await ready(page);
  await page.keyboard.press("r");

  // Step 2: the agent asks to take the linked case's facts; Keep the plan
  // has the focus, so Enter keeps the request.
  let alert = await dialog(page);
  await expect(alert.getByRole("heading")).toHaveText("Step 2: the agent asks to change the plan");
  await expect(alert.getByRole("button", { name: en.deviation.deny })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(alert).toBeHidden();

  // The request times out once: its Retry button takes focus.
  await expect(retryButton(page)).toBeFocused({ timeout: 15_000 });
  await expect(runSteps(page).nth(1)).toContainText("The fact request service did not answer within 5 s.");
  await page.keyboard.press("Enter");
  await expect(runSteps(page).nth(1)).toContainText("Facts requested from operations, due Oct 8, 2026.", { timeout: 15_000 });

  // Step 3 drafts the reply: the letter itself, and Skip has the focus.
  alert = await dialog(page);
  await expect(alert.getByRole("heading")).toHaveText("Step 3: Draft the reply");
  await expect(alert.getByRole("button", { name: en.confirm.skip })).toBeFocused();
  await expect(alert.locator(".reply-draft")).toContainText("We have reviewed your complaint of");
  await expect(alert.locator(".reply-draft")).toContainText("case C-001196.");
  await expect(alert.locator(".reply-draft")).toContainText("Our position rests on the terms of your contract with the bank.");
  await expect(alert).toContainText("Nothing is sent: the draft goes to legal review, and a signatory sends the reply.");
  await expect(alert).toContainText("Nothing has been sent or changed yet.");
  // S stops the run from the dialog.
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
  await expect(confirmation(page)).toHaveCount(0);
  await expect(page.locator(".summary")).toContainText("The run was stopped after step 2.");
  await expect(runSteps(page).nth(2)).toContainText("the run was stopped");
  // The steps the run never reached say so; none is left waiting.
  for (let i = 3; i < 5; i += 1) {
    await expect(runSteps(page).nth(i)).toContainText("Skipped");
    await expect(runSteps(page).nth(i)).toContainText("the run was stopped");
    await expect(runSteps(page).nth(i)).not.toContainText(en.step.willAsk);
  }
  await expect(page.locator('.agent [role="status"][aria-live="polite"][aria-atomic="true"]').last()).toHaveText(en.announce.stopped);
  const log = await logLines(page);
  expect(log.filter((l) => l.includes("You kept step 2 as planned."))).toHaveLength(1);
  expect(log.filter((l) => l.includes("You asked to retry step 2."))).toHaveLength(1);
  expect(log.at(-1)).toContain("Run stopped after step 2.");
});

test("Stop while a step runs: that step finishes, no new step starts", async ({ page }) => {
  await page.goto(agentUrl());
  await ready(page);
  await page.getByRole("radio", { name: en.autonomy.ask_none }).click();
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect(runSteps(page).nth(0)).toContainText("Running");
  await page.getByRole("button", { name: en.run.stop }).click();
  await expect(page.locator(".run")).toContainText(en.run.stoppingTitle);
  await expect(page.getByRole("button", { name: en.run.stop })).toBeDisabled();
  await expectPlanState(page, "stopped");
  const log = await logLines(page);
  const after = log.slice(log.findIndex((l) => l.includes(en.log.stopRequested)) + 1);
  // At most the rest of the running step (running, done) and the stop.
  expect(after.length).toBeLessThanOrEqual(3);
  expect(after.filter((l) => l.includes("started"))).toEqual([]);
  expect(after.at(-1)).toMatch(/Run stopped after step [12]\./);
  for (let i = 2; i < 5; i += 1) {
    await expect(runSteps(page).nth(i)).not.toContainText("Waiting");
    await expect(runSteps(page).nth(i)).toContainText("the run was stopped");
  }
});

/** A run with slow steps (so the stop takes a while), stopped while its
 * first step runs. */
async function stopWhileRunning(page: Page) {
  await page.goto(agentUrl("scale=4"));
  await ready(page);
  await page.getByRole("radio", { name: en.autonomy.ask_none }).click();
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect(runSteps(page).nth(0)).toContainText("Running");
  await page.getByRole("button", { name: en.run.stop }).click();
}

test("while the run stops, the badge says Stopping", async ({ page }) => {
  await stopWhileRunning(page);
  const bar = page.locator(".run-bar");
  await expect(bar.locator(".stoa-badge--warning")).toHaveText(new RegExp(en.run.stoppingTitle));
  await expect(bar).not.toContainText(en.run.status.streaming);
  await expect(bar).not.toContainText(en.run.status.connecting);
  await expectPlanState(page, "stopped");
  await expect(bar).toContainText(en.run.status.ended);
});

test("Pause is off while the run stops: a paused stop would never end", async ({ page }) => {
  await stopWhileRunning(page);
  // Read at one instant, while the stop is still under way (a slow step).
  const now = () =>
    page.evaluate((label) => {
      const layout = document.querySelector(".agent")!;
      const pause = [...document.querySelectorAll<HTMLButtonElement>(".run-bar button")].find((b) => b.textContent?.startsWith(label));
      return { plan: layout.getAttribute("data-plan-state"), stream: layout.getAttribute("data-stream"), pauseDisabled: pause?.disabled };
    }, en.run.pause);
  expect(await now()).toEqual({ plan: "running", stream: expect.stringMatching(/^(connecting|streaming)$/), pauseDisabled: true });
  await page.keyboard.press("p");
  expect(await now()).toEqual({ plan: "running", stream: expect.stringMatching(/^(connecting|streaming)$/), pauseDisabled: true });
  await expectPlanState(page, "stopped");
});

test("Pause holds the run between events; Resume goes on from the next one", async ({ page }) => {
  await page.goto(agentUrl("scale=0.5"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect.poll(async () => (await logLines(page)).length).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("p");
  await expect(page.locator(".run-bar")).toContainText(en.run.status.paused);
  await expect(page.locator(".run")).toContainText(en.run.pausedText);
  await expect(page.getByRole("button", { name: en.run.resume })).toBeVisible();
  const held = await logLines(page);
  await page.waitForTimeout(1500);
  expect(await logLines(page)).toEqual(held);
  await page.keyboard.press("p");
  await expect(page.locator(".run-bar")).toContainText(en.run.status.streaming);
  await expect.poll(async () => (await logLines(page)).length).toBeGreaterThan(held.length);
  // Nothing was repeated: every step started once, up to the failure.
  await expect(retryButton(page)).toBeVisible({ timeout: 15_000 });
  const log = await logLines(page);
  for (const n of [1, 2]) expect(log.filter((l) => l.includes(`Step ${n} started`))).toHaveLength(1);
});

test("the undo window: a toast with Undo and a countdown; Undo recalls the request", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05&undoWindow=8"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await retryButton(page).click();

  // Sent to another team. The draft's confirmation opens next: the toast
  // steps aside while it is open (on a phone it would cover its buttons).
  const toast = page.locator(".stoa-toast").filter({ hasText: "Facts requested from operations, due Oct 8, 2026." });
  await dialog(page);
  await expect(toast).toHaveCount(0);
  await (await dialog(page)).getByRole("button", { name: en.confirm.skip }).click();
  // Back once the dialog has closed, with Undo; the step shows the time left.
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Undo is possible until");
  const countdown = runSteps(page).nth(1).getByRole("progressbar", { name: "Undo window of step 2" });
  await expect(countdown).toHaveAttribute("aria-valuetext", /0:0[1-8]\u2069? of \u2068?0:08/);
  await toast.getByRole("button", { name: en.step.undo }).click();
  await expect(runSteps(page).nth(1)).toContainText("Undone");
  await expect(runSteps(page).nth(1)).toContainText("The request to operations was recalled.");
  await expect(page.locator(".stoa-toast").filter({ hasText: "Undone." })).toBeVisible();
  // An internal change can be undone at any time, even after the run.
  await expectPlanState(page, "finished");
  await expect(runSteps(page).nth(0)).toContainText(en.step.undoPermanent);
});

test("the undo window closes: the step is final, its Undo and the toast go", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05&undoWindow=3"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await retryButton(page).click();
  // The draft's confirmation opens next; skipped, the run ends.
  await (await dialog(page)).getByRole("button", { name: en.confirm.skip }).click();
  const second = runSteps(page).nth(1);
  await expect(second.getByRole("button", { name: /^Undo: / })).toBeVisible();
  await expect(second).toContainText("Final since", { timeout: 10_000 });
  await expect(second.getByRole("button", { name: /^Undo: / })).toHaveCount(0);
  await expect(page.locator(".stoa-toast").filter({ hasText: "Facts requested" })).toHaveCount(0);
});

test("a confirmation says what Escape does there, and Escape does it", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05", LINKED_CASE));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  let alert = await dialog(page);
  await expect(alert.getByRole("heading")).toHaveText("Step 2: the agent asks to change the plan");
  await expect(alert.locator("p", { has: page.locator("kbd", { hasText: /^Esc$/ }) })).toHaveText("Esc keeps the plan as it is, like the Keep the plan button.");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await logLines(page)).some((l) => l.includes("You kept step 2 as planned."))).toBe(true);
  await retryButton(page).click();
  alert = await dialog(page);
  await expect(alert.locator("p", { has: page.locator("kbd", { hasText: /^Esc$/ }) })).toHaveText("Esc skips this step, like the Skip step button.");
  await page.keyboard.press("Escape");
  await expect(runSteps(page).nth(2)).toContainText("Skipped");
});

test("the agent asks to change a step: Allow takes the linked case's facts, and nothing is sent", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05", LINKED_CASE));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  const alert = await dialog(page);
  await expect(alert.getByRole("heading")).toHaveText("Step 2: the agent asks to change the plan");
  await expect(alert).toContainText("Request the facts from operations");
  await expect(alert).toContainText("Linked case C-001142 already holds the facts this request asks for.");
  await expect(alert).toContainText("Instead: Use the facts of linked case C-001142 (low risk).");
  await alert.getByRole("button", { name: en.deviation.allow }).click();
  await expect(runSteps(page).nth(1)).toContainText("Use the facts of linked case C-001142");
  await expect(runSteps(page).nth(1)).toContainText("Facts of case C-001142 used; no request sent.", { timeout: 15_000 });
  // Taken from the file, not sent: nothing to time out, no window to close.
  await expect(runSteps(page).nth(1)).toContainText(en.step.undoPermanent);
  await expect(retryButton(page)).toHaveCount(0);
  const log = await logLines(page);
  expect(log.some((l) => l.includes("You allowed the change to step 2."))).toBe(true);
  await expectNoSeriousViolations(page, "an allowed change");
});

test("a whole run: the draft under its step, the rubric's check, a summary", async ({ page }) => {
  await page.goto(agentUrl("scale=0.02"));
  await ready(page);
  await page.getByRole("radio", { name: en.autonomy.ask_none }).click();
  await page.getByRole("button", { name: en.plan.run }).click();
  for (;;) {
    const state = await page.locator(".agent").getAttribute("data-plan-state");
    if (state === "finished") break;
    const alert = confirmation(page);
    const retry = retryButton(page);
    await expect(alert.or(retry).or(page.locator('.agent[data-plan-state="finished"]'))).toBeVisible({ timeout: 15_000 });
    if (await alert.isVisible()) await alert.getByRole("button").last().click();
    else if (await retry.isVisible()) await retry.click();
  }
  // Step 3 shows the reply it drafted; step 4 what the rubric found in it.
  const draft = runSteps(page).nth(2);
  await expect(draft).toContainText("Reply in case C-001200 drafted.");
  await draft.getByText(en.rubric.draftShown).click();
  await expect(draft.locator(".reply-draft")).toContainText("Dear client,");
  await expect(draft.locator(".reply-draft")).toContainText("[The decision on the complaint: for the reviewer to state.]");
  await expect(runSteps(page).nth(3)).toContainText(en.rubric.clean);
  await expect(runSteps(page).nth(4)).toContainText("Case C-001200 handed to legal review; the reply is due by Oct 27, 2026.");
  const summary = page.locator(".summary");
  await expect(summary).toContainText(en.summary.finished);
  await expect(summary.getByRole("term")).toHaveText([en.summary.done, en.summary.skipped, en.summary.undone, en.summary.asked, en.summary.errors, en.summary.duration, en.summary.events]);
  await expect(summary.getByRole("definition").first()).toHaveText("5");
  await expect(page.locator('.agent [role="status"][aria-live="polite"][aria-atomic="true"]').last()).toHaveText("Run finished: 5 of 5 steps done.");
  // New plan: the fact request's undo window is still open, so it asks
  // first; then back to the editor, with a fresh plan.
  await page.getByRole("button", { name: en.run.newPlan }).click();
  await (await dialog(page)).getByRole("button", { name: en.newPlanAsk.confirm }).click();
  await expectPlanState(page, "draft");
  await expect(page.getByRole("grid", { name: en.plan.list }).getByRole("row")).toHaveCount(5);
});

test("a case past drafting: the plan is shown, Run is not offered, and the panel says why", async ({ page }) => {
  await page.goto(agentUrl("", "C-001117"));
  await expect(page.locator(".plan")).toContainText('This case is at "Awaiting signature": its reply is past drafting');
  await expect(page.getByRole("button", { name: en.plan.run })).toBeDisabled();
  await page.keyboard.press("r");
  await expectPlanState(page, "draft");
});

/** Run, send the fact request after its retry, and stop at the draft's
 * confirmation. */
async function sendRequestAndStop(page: Page) {
  await page.getByRole("button", { name: en.plan.run }).click();
  await retryButton(page).click();
  await dialog(page);
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
}

test("New plan asks before it ends undo windows that are still open", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05"));
  await ready(page);
  await sendRequestAndStop(page);
  await page.getByRole("button", { name: en.run.newPlan }).click();
  let ask = await dialog(page);
  await expect(ask.getByRole("heading")).toHaveText("Start a new plan?");
  await expect(ask).toContainText("Undo is still possible for 1 step of this run.");
  await expect(ask.getByRole("button", { name: "Keep this run" })).toBeFocused();
  await expectNoSeriousViolations(page, "new plan with open undo windows");
  // Escape keeps the run, and the request can still be recalled.
  await page.keyboard.press("Escape");
  await expect(ask).toBeHidden();
  await expectPlanState(page, "stopped");
  await expect(runSteps(page).nth(1).getByRole("button", { name: /^Undo: / })).toBeVisible();
  await page.getByRole("button", { name: en.run.newPlan }).click();
  ask = await dialog(page);
  await ask.getByRole("button", { name: "Start a new plan" }).click();
  await expectPlanState(page, "draft");
});

test("New plan goes straight to a new plan when no undo window is open", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05&undoWindow=1"));
  await ready(page);
  await sendRequestAndStop(page);
  await expect(runSteps(page).nth(1)).toContainText("Final since");
  await page.getByRole("button", { name: en.run.newPlan }).click();
  await expectPlanState(page, "draft");
  await expect(confirmation(page)).toHaveCount(0);
});

test("the shortcuts dialog lists every shortcut with its keys", async ({ page }) => {
  await page.goto(agentUrl());
  await ready(page);
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: en.shortcuts.title });
  await expect(help).toBeVisible();
  for (const [key, description] of [
    ["R", en.shortcuts.start],
    ["S", en.shortcuts.stop],
    ["P", en.shortcuts.pauseResume],
    ["?", en.shortcuts.help],
  ] as const)
    await expect(help.locator(".stoa-shortcuts__row", { hasText: description }).locator("kbd.stoa-kbd")).toHaveText(key);
  await expectNoSeriousViolations(page, "shortcuts dialog");
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.getByRole("button", { name: en.shortcutsButton }).click();
  await expect(help).toBeVisible();
});

test("a button with a key names it for assistive technology and draws it after its label", async ({ page }) => {
  await page.goto(agentUrl("scale=4"));
  await ready(page);
  const keyed = async (name: string, key: string) => {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toHaveAttribute("aria-keyshortcuts", key);
    // Stoa's hint: hidden from assistive technology, so the name stays the label.
    await expect(button.locator(".stoa-button__shortcut[aria-hidden='true'] kbd.stoa-kbd")).toHaveText(key);
  };
  await keyed(en.shortcutsButton, "?");
  await keyed(en.plan.run, "R");
  await page.getByRole("button", { name: en.plan.run }).click();
  await keyed(en.run.stop, "S");
  await keyed(en.run.pause, "P");
});

test("the log is copied as text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(agentUrl("scale=0.05"));
  await ready(page);
  await expect(page.getByText(en.log.emptyTitle)).toBeVisible();
  await page.getByRole("button", { name: en.plan.run }).click();
  await expect(retryButton(page)).toBeVisible();
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
  await page.locator(".log").getByRole("button", { name: "Copy" }).click();
  await expect(page.locator(".log")).toContainText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Plan approved: 5 steps, Ask for marked steps, 1 will ask first.");
  expect(copied).toContain("Step 2 failed. The fact request service did not answer within 5 s.");
  expect(copied).toContain("Run stopped after step 1.");
});

test("the log follows its newest line while the run goes on", async ({ page }) => {
  await page.goto(agentUrl("scale=0.05"));
  await ready(page);
  // Every step asks: the run waits six times (and once more at the failure).
  await page.getByRole("radio", { name: en.autonomy.ask_all }).click();
  await page.getByRole("button", { name: en.plan.run }).click();
  const region = page.locator(".log .stoa-code__scroll");
  const read = () => region.evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight, atEnd: el.scrollHeight - el.scrollTop - el.clientHeight < 2 }));
  // At each point the run waits, the newest line is in view.
  let waits = 0;
  for (;;) {
    if ((await page.locator(".agent").getAttribute("data-plan-state")) === "finished") break;
    const alert = confirmation(page);
    const retry = retryButton(page);
    await expect(alert.or(retry).or(page.locator('.agent[data-plan-state="finished"]'))).toBeVisible({ timeout: 15_000 });
    if ((await page.locator(".agent").getAttribute("data-plan-state")) === "finished") break;
    expect((await read()).atEnd).toBe(true);
    waits += 1;
    if (await alert.isVisible()) await alert.getByRole("button").last().click();
    else await retry.click();
  }
  expect(waits).toBeGreaterThan(2);
  expect(await read()).toEqual({ scrolls: true, atEnd: true });
  expect((await logLines(page)).at(-1)).toContain("Run finished");
});

test("a log keeps each line's time, level and message in that order, without invisible bidi marks", async ({ page }) => {
  const t = strings.ru;
  await page.goto(agentUrl("lang=ru&scale=0.05"));
  await ready(page, t.plan.run);
  await page.getByRole("button", { name: t.plan.run }).click();
  await expect(retryButton(page, t.step.retry)).toBeVisible();
  await page.keyboard.press("s");
  await expectPlanState(page, "stopped");
  const lines = page.locator(".log .stoa-code__line");
  expect(await lines.count()).toBeGreaterThan(3);
  expect(await page.locator(".log .stoa-code__scroll").evaluate((el) => /[\u2066-\u2069]/.test(el.textContent ?? ""))).toBe(false);
  for (const line of await lines.all()) {
    const [time, level, message] = await Promise.all(
      [".stoa-code__time", ".stoa-code__level", ".stoa-code__message"].map((part) => line.locator(part).evaluate((el) => el.getClientRects()[0]!.left)),
    );
    expect(time).toBeLessThan(level!);
    expect(level).toBeLessThan(message!);
  }
});

test("under reduced motion the undo countdown still counts, without animating", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(agentUrl("scale=0.05&undoWindow=6"));
  await ready(page);
  await page.getByRole("button", { name: en.plan.run }).click();
  await retryButton(page).click();
  const countdown = runSteps(page).nth(1).getByRole("progressbar");
  await expect(countdown).toBeVisible();
  const first = await countdown.getAttribute("aria-valuetext");
  await expect(countdown).not.toHaveAttribute("aria-valuetext", first ?? "", { timeout: 3000 });
  const fill = countdown.locator(".stoa-progress__fill");
  expect(await fill.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
});
