// Theme (System, Light, Dark) and language (EN, RU, AR), and their persistence.
import { expect, test } from "@playwright/test";
import { open } from "./helpers";

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
  expect(await page.evaluate(() => localStorage.getItem("argus-desk.theme"))).toBe("dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  // Without the parameter, the choice comes from the last visit.
  await page.goto("/?lang=ru&colleague=off");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  // A link's theme wins over the remembered one, and asks for the system.
  await page.goto("/?theme=system&colleague=off");
  await expect(html).not.toHaveAttribute("data-theme");
  await page.goto("/?theme=light&colleague=off");
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  expect(new URL(page.url()).searchParams.get("theme")).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("argus-desk.theme"))).toBeNull();
});

test("Russian: words, digits and data in Russian, kept after a reload", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "RU", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page).toHaveTitle("Аргус");
  await expect(page.getByTestId("row-count")).toHaveText("50 000 заявок из 50 000");
  await expect(page.getByRole("columnheader", { name: "Клиент" })).toBeVisible();
  await expect(page.locator('[data-cell="0:2"]')).toHaveText("ООО «Ветроплав»");
  await page.reload();
  await expect(page.getByRole("radio", { name: "RU", exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Аргус");
});

test("Arabic: right to left, Arabic-Indic digits, Arabic data, pinned columns at the right", async ({ page }) => {
  await open(page, "lang=ar", "الطلبات: ٥٠٬٠٠٠ من ٥٠٬٠٠٠");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveTitle("أرغوس");
  await expect(page.getByRole("columnheader", { name: "العميل" })).toBeVisible();
  await expect(page.locator('[data-cell="0:2"]')).toHaveText(/[؀-ۿ]/);
  await expect(page.locator('[data-cell="0:3"]')).toHaveText(/[٠-٩]/);
  // The ID column is pinned at the right edge of a right-to-left grid.
  const grid = await page.getByRole("grid").boundingBox();
  const id = await page.getByRole("columnheader", { name: "المعرّف" }).boundingBox();
  expect(id!.x + id!.width).toBeGreaterThan(grid!.x + grid!.width - 160);
  // Arrow keys follow the direction: ArrowLeft moves to the next column.
  await page.locator('[data-cell="0:1"]').click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-cell="0:2"]')).toBeFocused();
  await page.getByRole("radio", { name: "EN", exact: true }).click();
  await expect(html).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("row-count")).toHaveText("50,000 of 50,000 requests");
});

test("Arabic: a US dollar amount reads US$, not $US", async ({ page }) => {
  await open(page, "lang=ar", "الطلبات: ٥٠٬٠٠٠ من ٥٠٬٠٠٠");
  // Z-000002 is in US dollars. Where each character is drawn, from the
  // left: U, S, then $ when the symbol keeps its own order.
  const amount = page.locator('[data-cell="1:4"]');
  await expect(amount).toContainText("US$");
  const x = await amount.evaluate((cell) => {
    const node = cell.querySelector(".stoa-data-grid__text")!.firstChild!;
    const text = node.textContent!;
    const at = (i: number) => {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      return range.getBoundingClientRect().x;
    };
    return { u: at(text.indexOf("U")), dollar: at(text.indexOf("$")) };
  });
  expect(x.u).toBeLessThan(x.dollar);
});

test("Arabic: digits in amounts and chip counts are tabular, so a column of them lines up", async ({ page }) => {
  await open(page, "lang=ar", "الطلبات: ٥٠٬٠٠٠ من ٥٠٬٠٠٠");
  const widths = await page.evaluate(async () => {
    await document.fonts.ready;
    const measure = (selector: string) => {
      const probe = document.createElement("span");
      probe.className = "stoa-data-grid__text";
      document.querySelector(selector)!.append(probe);
      const width = (text: string) => {
        probe.textContent = text;
        return probe.getBoundingClientRect().width;
      };
      // Load the face for these digits, then measure.
      const result = [width("١١١١١١"), width("٠٠٠٠٠٠"), width("٨٨٨٨٨٨")];
      probe.remove();
      return result;
    };
    return { amount: measure('[data-cell="0:4"]'), chip: measure(".stoa-filter-chip__count") };
  });
  for (const [where, [ones, zeros, eights]] of Object.entries(widths)) {
    expect(Math.abs(ones! - zeros!), where).toBeLessThan(0.5);
    expect(Math.abs(ones! - eights!), where).toBeLessThan(0.5);
  }
});

test("lang and dir are set before the first paint, from the link or the last visit", async ({ page }) => {
  // The application's script never arrives: what the page shows comes
  // from the document alone.
  await page.route(/\/assets\/index-[^/]*\.js$/, () => new Promise(() => {}));
  const html = page.locator("html");
  await page.goto("/?lang=ar", { waitUntil: "commit" });
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("lang", "ar");
  await page.evaluate(() => localStorage.setItem("argus-desk.lang", "ru"));
  await page.goto("/", { waitUntil: "commit" });
  await expect(html).toHaveAttribute("lang", "ru");
  await expect(html).toHaveAttribute("dir", "ltr");
  // A link's language wins over the stored one; an unknown one is ignored.
  await page.goto("/?lang=ar", { waitUntil: "commit" });
  await expect(html).toHaveAttribute("dir", "rtl");
  await page.goto("/?lang=xx", { waitUntil: "commit" });
  await expect(html).toHaveAttribute("lang", "ru");
});

test("the headers of the view the desk opens on fit their columns in every language", async ({ page }) => {
  for (const lang of ["en", "ru", "ar"]) {
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
  await page.getByRole("radio", { name: "AR", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
