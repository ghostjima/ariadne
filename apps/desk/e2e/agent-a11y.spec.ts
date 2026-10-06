// The assistant's accessibility and layout inside the desk: axe on every
// main state in each language and theme, the language switch reaching the
// assistant, no sideways scroll, Run on the first screen, and the page
// frame (a fixed header, Stoa's scrollbars) with a long log.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/agent/i18n";
import type { Lang } from "../src/i18n";
import { en, expectNoSeriousViolations, expectPlanState, ready, confirmation, agentUrl } from "./agent-helpers";

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
      await page.goto(agentUrl(`lang=${lang}&theme=${theme}&scale=0.05`));
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await ready(page, t.plan.run);
      await expectNoSeriousViolations(page, "plan", { lang, theme });

      await page.getByRole("button", { name: t.plan.run }).click();
      await expect(confirmation(page)).toBeVisible();
      await expectNoSeriousViolations(page, "confirmation", { lang, theme });
      await answer(page, "primary");

      // The failed step, with its Retry, Skip and Stop, and the undo countdown above.
      await expect(page.getByRole("button", { name: t.step.retry, exact: true })).toBeVisible();
      await expectNoSeriousViolations(page, "failed step and undo window", { lang, theme });
      await page.getByRole("button", { name: t.step.retry, exact: true }).click();
      await expect(confirmation(page)).toBeVisible();
      await page.keyboard.press("p"); // no effect while waiting; the dialog stays
      await page.keyboard.press("s");
      await expectPlanState(page, "stopped");
      await expect(page.locator(".summary")).toBeVisible();
      await expectNoSeriousViolations(page, "stopped, with summary and toasts", { lang, theme });

      // The letter's undo window is still open: New plan asks first.
      await page.getByRole("button", { name: t.run.newPlan }).click();
      await expect(confirmation(page)).toBeVisible();
      await expectNoSeriousViolations(page, "new plan with an open undo window", { lang, theme });
      await confirmation(page).getByRole("button", { name: t.newPlanAsk.confirm }).click();
      await expectPlanState(page, "draft");
      for (let i = 0; i < 12; i += 1) await page.locator(".stoa-reorder__remove").first().click();
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
      await answer(page, "primary");
      await expect(page.getByRole("button", { name: strings[lang].step.retry, exact: true })).toBeVisible();
      expect(await sideways()).toEqual([0, 0]);
      await page.keyboard.press("s");
      await expectPlanState(page, "stopped");
      expect(await sideways()).toEqual([0, 0]);
    });

for (const [width, height] of [
  [1280, 800],
  [375, 812],
] as const)
  test(`Run and the run service's state are on the first screen at ${width}x${height}`, async ({ browser }) => {
    for (const lang of LANGS) {
      const t = strings[lang];
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.goto(agentUrl(`lang=${lang}`));
      await ready(page, t.plan.run);
      const run = page.getByRole("button", { name: t.plan.run });
      const box = (await run.boundingBox())!;
      expect(box.y + box.height, `${lang}: Run's bottom edge`).toBeLessThanOrEqual(height);
      await context.close();
      // A run service that failed says so where Run is.
      const blocked = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
      const second = await blocked.newPage();
      await second.goto(agentUrl(`lang=${lang}`));
      const failed = second.getByText(t.service.failedTitle);
      await expect(failed).toBeVisible();
      const top = (await failed.boundingBox())!;
      expect(top.y + top.height, `${lang}: the failure's title`).toBeLessThanOrEqual(height);
      await blocked.close();
    }
  });

for (const theme of THEMES)
  test(`the header stays put and the scrollbars are Stoa's, ${theme}`, async ({ page }) => {
    await page.goto(agentUrl(`theme=${theme}&scale=0.05`));
    await ready(page);
    // A log long enough to scroll inside itself, and a page that scrolls.
    await page.getByRole("button", { name: en.plan.run }).click();
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
