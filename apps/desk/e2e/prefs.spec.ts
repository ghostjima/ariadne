// Theme (System, Light, Dark) and language (RU, the default, and EN), and
// their persistence under the desk's keys.
import { expect, test } from "@playwright/test";
import { ALL_CASES, open } from "./helpers";

test("the theme follows the system until one is chosen", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page);
  const html = page.locator("html");
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
  await expect(html).not.toHaveAttribute("data-theme");
  const background = () => html.evaluate((el) => getComputedStyle(el).backgroundColor);
  const dark = await background();
  // The browser's own controls and scrollbars follow the theme too.
  const scheme = () => html.evaluate((el) => getComputedStyle(el).colorScheme);
  expect(await scheme()).toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).not.toHaveAttribute("data-theme");
  await expect.poll(background).not.toBe(dark);
  expect(await scheme()).toBe("light");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(scheme).toBe("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("radio", { name: "Light" }).click();
  await expect.poll(scheme).toBe("light");
});

test("a chosen theme survives a reload and the next visit; System and ?theme=system clear it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "from=link");
  const html = page.locator("html");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const url = new URL(page.url());
  expect(url.searchParams.get("theme")).toBe("dark");
  expect(url.searchParams.get("from")).toBe("link");
  expect(await page.evaluate(() => localStorage.getItem("ariadne.theme"))).toBe("dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  // Without the parameter, the choice comes from the last visit.
  await page.goto("/?colleague=off");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  // A link's theme wins over the remembered one, and asks for the system.
  await page.goto("/?theme=system&colleague=off&lang=en");
  await expect(html).not.toHaveAttribute("data-theme");
  await page.goto("/?theme=light&colleague=off&lang=en");
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  expect(new URL(page.url()).searchParams.get("theme")).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("ariadne.theme"))).toBeNull();
});

test("Russian by default: words, digits and data in Russian; English chosen is kept", async ({ page }) => {
  await page.goto("/?colleague=off&view=" + ALL_CASES);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page).toHaveTitle("Ariadne Стол заявок");
  await expect(page.getByRole("radio", { name: "RU", exact: true })).toBeChecked();
  await expect.poll(async () => (await page.getByTestId("row-count").textContent())?.replace(/\u00a0/g, " "), { timeout: 15_000 }).toBe("1 200 обращений из 1 200");
  await expect(page.getByRole("columnheader", { name: "Заявитель" })).toBeVisible();
  await expect(page.locator('[data-cell="0:2"]')).toHaveText("ООО «Песчаный Маяк»");
  await expect(page.locator('[data-cell="0:3"]')).toHaveText("Отказ, 115-ФЗ");
  await page.getByRole("radio", { name: "EN", exact: true }).click();
  await expect(page).toHaveTitle("Ariadne Desk");
  expect(await page.evaluate(() => localStorage.getItem("ariadne.lang"))).toBe("en");
  await page.goto("/?colleague=off");
  await expect(page.getByRole("radio", { name: "EN", exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ariadne Desk");
});

test("the headers of the view the desk opens on fit their columns in both languages", async ({ page }) => {
  for (const lang of ["ru", "en"]) {
    await page.goto(`/?lang=${lang}&colleague=off`);
    await expect(page.getByRole("grid")).not.toHaveAttribute("aria-busy");
    await page.evaluate(() => document.fonts.ready);
    const clipped = await page.locator(".stoa-data-grid__row--head .stoa-data-grid__text").evaluateAll((spans) =>
      spans.filter((s) => s.scrollWidth > s.clientWidth).map((s) => s.textContent),
    );
    expect(clipped, lang).toEqual([]);
  }
});

test("the theme and language can be chosen with storage blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await open(page);
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.getByRole("radio", { name: "RU", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});
