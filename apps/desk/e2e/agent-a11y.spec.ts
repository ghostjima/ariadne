// The assistant's accessibility and layout inside the desk: axe on every
// main state in each language and theme, the language switch reaching the
// assistant, no sideways scroll, Run (or, past drafting, the reason there
// is none) on the first screen, and the page frame (a fixed header, Stoa's
// scrollbars) with a long log.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { strings } from "../src/agent/i18n";
import type { Lang } from "../src/i18n";
import { LINKED_CASE, PAST_DRAFTING_CASE, en, expectNoSeriousViolations, expectPlanState, ready, confirmation, agentUrl } from "./agent-helpers";

const LANGS: Lang[] = ["ru", "en"];
const THEMES = ["light", "dark"] as const;

async function answer(page: Page, which: "safe" | "primary") {
  const alert = confirmation(page);
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await alert.getByRole("button").nth(which === "safe" ? 0 : 1).click();
}

for (const lang of LANGS)
  for (const theme of THEMES)
    test(`axe: every state in ${lang}, ${theme}`, async ({ page }) => {
      const t = strings[lang];
      // A case whose fact request asks to deviate, then times out once.
      await page.goto(agentUrl(`lang=${lang}&theme=${theme}&scale=0.05`, LINKED_CASE));
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await ready(page, t.plan.run);
      await expectNoSeriousViolations(page, "plan", { lang, theme });

      await page.getByRole("button", { name: t.plan.run }).click();
      await expect(confirmation(page)).toBeVisible();
      await expectNoSeriousViolations(page, "the agent's request to change a step", { lang, theme });
      await answer(page, "safe");

      // The failed step, with its Retry, Skip and Stop.
      await expect(page.getByRole("button", { name: t.step.retry, exact: true })).toBeVisible();
      await expectNoSeriousViolations(page, "failed step", { lang, theme });
      await page.getByRole("button", { name: t.step.retry, exact: true }).click();
      // The reply's confirmation, with the letter, over the undo countdown
      // (its toast waits behind the dialog, its region inert).
      await expect(confirmation(page).locator(".reply-draft")).toBeVisible();
      await expectNoSeriousViolations(page, "confirmation with the reply draft", { lang, theme });
      await page.keyboard.press("p"); // no effect while waiting; the dialog stays
      await answer(page, "primary");
      await expectPlanState(page, "finished");
      await page.locator(".reply-shown summary").click();
      await expect(page.locator(".summary")).toBeVisible();
      await expectNoSeriousViolations(page, "finished, with the draft, the rubric's check, summary and toasts", { lang, theme });

      // The fact request's undo window is still open: New plan asks first.
      await page.getByRole("button", { name: t.run.newPlan }).click();
      await expect(confirmation(page)).toBeVisible();
      await expectNoSeriousViolations(page, "new plan with an open undo window", { lang, theme });
      await confirmation(page).getByRole("button", { name: t.newPlanAsk.confirm }).click();
      await expectPlanState(page, "draft");
      for (let i = 0; i < 5; i += 1) await page.locator(".stoa-reorder__remove").first().click();
      await expect(page.getByText(t.plan.emptyTitle)).toBeVisible();
      await expectNoSeriousViolations(page, "empty plan", { lang, theme });
    });

for (const lang of LANGS)
  for (const theme of THEMES) {
    test(`axe: starting and failed run service in ${lang}, ${theme}`, async ({ browser }) => {
      const t = strings[lang];
      // Starting: the worker's script is held back for a while.
      const slow = await browser.newContext();
      await slow.route("**/sw.js", async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.continue();
      });
      const page = await slow.newPage();
      await page.goto(agentUrl(`lang=${lang}&theme=${theme}`));
      await expect(page.getByRole("progressbar", { name: t.service.starting })).toBeVisible();
      await expectNoSeriousViolations(page, "starting", { lang, theme });
      await slow.close();
      // Failed: workers blocked.
      const blocked = await browser.newContext({ serviceWorkers: "block" });
      const second = await blocked.newPage();
      await second.goto(agentUrl(`lang=${lang}&theme=${theme}`));
      await expect(second.getByText(t.service.failedTitle)).toBeVisible();
      await expectNoSeriousViolations(second, "worker failed", { lang, theme });
      await blocked.close();
    });
  }

test("the language switches the assistant with the desk, and is kept", async ({ page }) => {
  await page.goto(agentUrl());
  await ready(page);
  await page.getByRole("radio", { name: "RU", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("button", { name: strings.ru.plan.run })).toBeVisible();
  await expect(page.getByRole("heading", { name: strings.ru.title, exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("lang")).toBe("ru");
  expect(await page.evaluate(() => localStorage.getItem("ariadne.lang"))).toBe("ru");
  await page.getByRole("radio", { name: "EN", exact: true }).click();
  await expect(page.getByRole("button", { name: en.plan.run })).toBeVisible();
});

for (const width of [1280, 375])
  for (const lang of LANGS)
    test(`no sideways scroll at ${width} px in ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(agentUrl(`lang=${lang}&scale=0.05`));
      await ready(page, strings[lang].plan.run);
      const sideways = () =>
        page.evaluate(() => {
          const scroll = document.querySelector(".stoa-page-shell__scroll")!;
          return [document.documentElement.scrollWidth - document.documentElement.clientWidth, scroll.scrollWidth - scroll.clientWidth];
        });
      expect(await sideways()).toEqual([0, 0]);
      await page.getByRole("button", { name: strings[lang].plan.run }).click();
      await page.getByRole("button", { name: strings[lang].step.retry, exact: true }).click();
      // The reply's confirmation, the longest dialog, fits too.
      await expect(confirmation(page).locator(".reply-draft")).toBeVisible();
      expect(await sideways()).toEqual([0, 0]);
      const dialogBox = (await confirmation(page).boundingBox())!;
      expect(dialogBox.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width);
      await answer(page, "safe");
      await expectPlanState(page, "finished");
      expect(await sideways()).toEqual([0, 0]);
    });

/** Waits until the case's assistant is drawn and its run service is
 * ready: the plan's bar is there, and neither the service's start nor its
 * failure is shown under it. */
async function serviceReady(page: Page, lang: Lang) {
  const t = strings[lang];
  const agent = page.locator(".agent");
  await expect(agent.locator(".plan-bar")).toBeVisible({ timeout: 15_000 });
  await expect(agent.getByRole("progressbar", { name: t.service.starting })).toHaveCount(0, { timeout: 15_000 });
  await expect(agent.getByText(t.service.failedTitle)).toHaveCount(0);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The plan's reason a case past drafting has no Run, whatever its stage. */
function pastDraftingReason(page: Page, lang: Lang) {
  const [before, after] = strings[lang].task.pastDrafting("\u0000").split("\u0000");
  return page.locator(".agent .plan").getByText(new RegExp(`^${escapeRegExp(before!)}.+${escapeRegExp(after!)}$`));
}

/** What a case's assistant offers in place of a run: Run for a case in
 * drafting, the reason there is no Run for a case past it. */
type Offer = "run" | "reason";

/** What the assistant shows of its state ends within the first screen of a
 * case's assistant (AGENT_CASE unless named): Run for a case in drafting,
 * the reason there is no Run for a case past drafting, and a failed run
 * service's title for either. The page shows exactly one of Run and the
 * reason, and the one it shows is the one measured; it is returned, for
 * the caller to hold a named case to its kind. */
async function expectAssistantOnFirstScreen(browser: Browser, width: number, height: number, lang: Lang, caseId?: string): Promise<Offer> {
  const t = strings[lang];
  const label = `${lang}, ${caseId ?? "the assistant's case"}`;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(agentUrl(`lang=${lang}`, caseId));
  await serviceReady(page, lang);
  // The plan's bar, Run and the reason are drawn together: once the bar is
  // there, one of the two is, and never both.
  const run = page.getByRole("button", { name: t.plan.run });
  const reason = pastDraftingReason(page, lang);
  await expect(run.or(reason), `${label}: Run or the reason there is none`).toHaveCount(1);
  const offer: Offer = (await reason.count()) === 1 ? "reason" : "run";
  const box = (await (offer === "run" ? run : reason).boundingBox())!;
  expect(box.y + box.height, `${label}: ${offer === "run" ? "Run's" : "the reason's"} bottom edge`).toBeLessThanOrEqual(height);
  await context.close();
  // A run service that failed says so where Run is, or would be.
  const blocked = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  const second = await blocked.newPage();
  await second.goto(agentUrl(`lang=${lang}`, caseId));
  const failed = second.getByText(t.service.failedTitle);
  await expect(failed).toBeVisible();
  const top = (await failed.boundingBox())!;
  expect(top.y + top.height, `${label}: the failure's title`).toBeLessThanOrEqual(height);
  await blocked.close();
  return offer;
}

for (const [width, height] of [
  [1280, 800],
  [375, 812],
] as const)
  test(`Run and the run service's state are on the first screen at ${width}x${height}`, async ({ browser }) => {
    for (const lang of LANGS) expect(await expectAssistantOnFirstScreen(browser, width, height, lang)).toBe("run");
  });

// A case past drafting has no Run: the reason there is none, and the run
// service's state, are what the assistant shows, and they are on the
// first screen.
test("the reason there is no Run and the run service's state are on the first screen at 375x812 for a case past drafting, in Russian", async ({ browser }) => {
  expect(await expectAssistantOnFirstScreen(browser, 375, 812, "ru", PAST_DRAFTING_CASE)).toBe("reason");
});

// Whatever the case: every open case is opened on a phone in Russian, the
// longer language, and the one whose content above the assistant's Run is
// tallest (the top of the plan's bar lowest on the page; the first in the
// queue's order on a tie) is checked as above. A change to the register or
// to the case's header is measured again, never assumed. The tallest may be
// a case past drafting: the walk waits for the plan's bar, not for Run, and
// the check measures the reason there is no Run in Run's place.
test("Run, or the reason there is none, and the run service's state are on the first screen at 375x812 for the open case with the tallest content above the plan's bar, in Russian", async ({ browser }) => {
  // The walk opens every open case; a slow runner is given two minutes.
  test.setTimeout(120_000);
  const [width, height] = [375, 812];
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  const page = await context.newPage();
  // The desk starts on the open cases; each opens on its assistant.
  await page.goto("/?lang=ru&colleague=off&panel=assistant");
  const count = page.getByTestId("row-count");
  await expect(count).toHaveText(/ из /, { timeout: 15_000 });
  const open = Number((await count.textContent())!.split(" из ")[0]!.replace(/\D/g, ""));
  expect(open).toBeGreaterThan(0);
  const idCell = (row: number) => page.getByRole("grid").locator(`[data-cell="${row}:1"]`);
  await idCell(0).click();
  await expect(idCell(0)).toBeFocused();
  const planBar = page.locator(".agent .plan-bar");
  let tallest = { id: "", top: -1 };
  for (let row = 0; row < open; row += 1) {
    if (row > 0) {
      await page.keyboard.press("ArrowDown");
      await expect(idCell(row)).toBeFocused();
    }
    const id = (await idCell(row).textContent())!.trim();
    await page.keyboard.press("o");
    await expect(page.locator("#case-heading")).toContainText(`${id}, `);
    await expect(planBar).toBeVisible();
    const top = (await planBar.boundingBox())!.y;
    if (top > tallest.top) tallest = { id, top };
    await page.keyboard.press("q");
    await expect(idCell(row)).toBeFocused();
  }
  await context.close();
  test.info().annotations.push({ type: "tallest-open-case", description: `${tallest.id} of ${open}: the plan's bar at ${Math.round(tallest.top * 10) / 10} px` });
  await expectAssistantOnFirstScreen(browser, width, height, "ru", tallest.id);
});

for (const theme of THEMES)
  test(`the header stays put and the scrollbars are Stoa's, ${theme}`, async ({ page }) => {
    await page.goto(agentUrl(`theme=${theme}&scale=0.05`));
    await ready(page);
    // A log long enough to scroll inside itself, and a page that scrolls.
    await page.getByRole("radio", { name: en.autonomy.ask_all }).click();
    await page.getByRole("button", { name: en.plan.run }).click();
    await answer(page, "primary");
    await answer(page, "primary");
    await page.getByRole("button", { name: en.step.retry, exact: true }).click();
    await answer(page, "primary");
    await expect(confirmation(page)).toBeVisible();
    await page.keyboard.press("s");
    await expectPlanState(page, "stopped");
    const header = page.locator(".stoa-app-header");
    const before = await header.boundingBox();
    const region = page.locator(".stoa-page-shell__scroll");
    await region.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    expect(await region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => [window.scrollY, document.documentElement.scrollHeight <= window.innerHeight])).toEqual([0, true]);
    const regionTop = await region.evaluate((el) => el.getBoundingClientRect().top);
    expect(regionTop).toBeGreaterThanOrEqual(before!.y + before!.height - 0.5);
    const log = page.locator(".log .stoa-code__scroll");
    expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const tokens = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.color = "var(--stoa-color-scrollbar-thumb)";
      probe.style.backgroundColor = "var(--stoa-color-scrollbar-track)";
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const value = `${style.color} ${style.backgroundColor}`;
      probe.remove();
      return value;
    });
    for (const scroller of [region, log]) {
      const style = await scroller.evaluate((el) => [getComputedStyle(el).scrollbarColor, getComputedStyle(el).scrollbarWidth]);
      expect(style).toEqual([tokens, "thin"]);
    }
  });
