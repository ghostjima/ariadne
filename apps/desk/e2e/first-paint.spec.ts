// What the page is before and as its script runs: the language and the
// theme from the first layout, set by Stoa's firstPaintScript, which
// vite.config.ts inlines from the desk's preferences; and no Arabic face,
// since the desk has no Arabic.
import { expect, test } from "@playwright/test";
import { strings } from "../src/i18n";

/** Families of the font faces the page has loaded. */
const loadedFamilies = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, ""));
  });

const rootState = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.documentElement.getAttribute("data-theme") ?? "system"]);

for (const how of ["link", "stored"] as const)
  test(`lang and the theme are set before the app's script runs (${how} choice)`, async ({ page }) => {
    if (how === "stored") {
      await page.goto("/?colleague=off");
      await page.getByRole("radio", { name: "EN", exact: true }).click();
      await page.getByRole("radio", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      expect(await page.evaluate(() => [localStorage.getItem("ariadne.lang"), localStorage.getItem("ariadne.theme")])).toEqual(["en", "dark"]);
    }
    // The bundle is held back: what the browser lays out meanwhile is the
    // page as the HTML alone makes it.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/.*\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(how === "link" ? "/?lang=en&theme=dark&colleague=off" : "/?colleague=off", { waitUntil: "commit" });
    await page.waitForSelector("#root", { state: "attached" });
    expect(await rootState(page)).toEqual(["en", "ltr", "dark"]);
    expect(await page.evaluate(() => document.getElementById("root")!.childElementCount)).toBe(0);
    release();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(strings.en.title);
  });

test("with no choice the page is in Russian on the system theme; an unknown language is ignored", async ({ page }) => {
  await page.goto("/?lang=xx&colleague=off", { waitUntil: "commit" });
  await page.waitForSelector("#root", { state: "attached" });
  expect(await rootState(page)).toEqual(["ru", "ltr", "system"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(strings.ru.title);
  await expect(page).toHaveTitle(strings.ru.title);
});

test("the choices of the apps before the merge are not read", async ({ page }) => {
  await page.goto("/?colleague=off", { waitUntil: "commit" });
  await page.evaluate(() => {
    localStorage.setItem("argus-desk.lang", "en");
    localStorage.setItem("ariadne-agent.theme", "dark");
  });
  await page.goto("/?colleague=off", { waitUntil: "commit" });
  await page.waitForSelector("#root", { state: "attached" });
  expect(await rootState(page)).toEqual(["ru", "ltr", "system"]);
});

test("the page preloads no font and downloads no Arabic face", async ({ page }) => {
  await page.goto("/?colleague=off");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(strings.ru.title);
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(0);
  const families = await loadedFamilies(page);
  expect(families).toContain("IBM Plex Sans");
  // Stoa's scaled fallbacks are local faces; nothing Arabic is downloaded.
  expect(families.filter((f) => f === "Noto Sans Arabic" || f === "IBM Plex Sans Arabic")).toEqual([]);
});
