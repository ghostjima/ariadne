// axe in every language and theme on every main state, the page frame
// (fixed header, scrolling region, scrollbars) and no sideways page scroll.
import { expect, test, type Page } from "@playwright/test";
import { WITH_COMMENTS, cell, expectNoSeriousViolations, grid, open } from "./helpers";

const LANGS = {
  en: { rows: "50,000 of 50,000 requests", empty: "0 of 50,000 requests", partial: "45,000 of 50,000 requests (5,000 did not load)" },
  ru: { rows: "50 000 заявок из 50 000", empty: "0 заявок из 50 000", partial: "45 000 заявок из 45 000" },
  ar: { rows: "الطلبات: ٥٠٬٠٠٠ من ٥٠٬٠٠٠", empty: "الطلبات: ٠ من ٥٠٬٠٠٠", partial: "الطلبات: ٤٥٬٠٠٠ من ٥٠٬٠٠٠ (لم يُحمَّل: ٥٬٠٠٠)" },
} as const;

for (const [lang, words] of Object.entries(LANGS)) {
  for (const theme of ["light", "dark"]) {
    test(`axe: main, selected, editing with an error, shortcuts, save view, columns and empty states (${lang}, ${theme})`, async ({ page }) => {
      await open(page, `lang=${lang}&theme=${theme}&view=${WITH_COMMENTS}`, words.rows);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expectNoSeriousViolations(page, "main", { lang, theme });

      // A selection with the bulk bar, then an editor with its error.
      await cell(page, 0, 1).click();
      await page.keyboard.press("Space");
      await expect(page.locator(".desk__bulk")).toBeVisible();
      await expectNoSeriousViolations(page, "selected", { lang, theme });
      await page.keyboard.press("Space");
      await cell(page, 0, 9).click();
      await page.keyboard.press("Enter");
      await grid(page).getByRole("textbox").fill("x".repeat(201));
      await page.keyboard.press("Enter");
      await expect(grid(page).getByRole("alert")).toBeVisible();
      await expectNoSeriousViolations(page, "editing", { lang, theme });
      await page.keyboard.press("Escape");

      for (const [key, name] of [
        ["?", "shortcuts"],
        ["s", "save view"],
      ] as const) {
        await page.keyboard.press(key);
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectNoSeriousViolations(page, name, { lang, theme });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      await page.locator(".desk__bar .stoa-toolbar button").nth(2).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoSeriousViolations(page, "columns", { lang, theme });
      await page.keyboard.press("Escape");

      await page.locator(".desk__search input").fill("ؤؤؤ zzz");
      await expect(page.getByTestId("row-count")).toHaveText(words.empty);
      await expectNoSeriousViolations(page, "empty", { lang, theme });
    });

    test(`axe: loading, partial failure and operator states (${lang}, ${theme})`, async ({ page }) => {
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/*desk.worker*", async (route) => {
        await held;
        await route.continue();
      });
      await open(page, `lang=${lang}&theme=${theme}&failChunk=3&role=operator`, "");
      await expect(grid(page)).toHaveAttribute("aria-busy", "true");
      await expectNoSeriousViolations(page, "loading", { lang, theme });
      release();
      await expect(page.locator(".stoa-callout").filter({ has: page.locator("button") })).toBeVisible({ timeout: 15_000 });
      await expect(grid(page)).not.toHaveAttribute("aria-busy");
      await expectNoSeriousViolations(page, "error and operator", { lang, theme });
    });
  }
}

test("axe: the conflict dialog and a toast", async ({ page }) => {
  await open(page, `view=${WITH_COMMENTS}&colleague=1&theme=dark&lang=ar`, LANGS.ar.rows);
  await cell(page, 2, 9).click();
  await page.keyboard.press("Enter");
  await grid(page).getByRole("textbox").fill("ملاحظتي");
  await expect(page.locator(".stoa-toast-region")).toContainText("Z-000003", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousViolations(page, "conflict");
});

async function sidewaysScroll(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const region = document.querySelector(".stoa-page-shell__scroll")!;
    return { document: doc.scrollWidth - doc.clientWidth, region: region.scrollWidth - region.clientWidth };
  });
}

for (const width of [1280, 375]) {
  test(`no sideways page scroll at ${width} px, in every language`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const lang of Object.keys(LANGS) as (keyof typeof LANGS)[]) {
      await open(page, `lang=${lang}&view=${WITH_COMMENTS}`, LANGS[lang].rows);
      expect(await sidewaysScroll(page), lang).toEqual({ document: 0, region: 0 });
      await cell(page, 0, 1).click();
      await page.keyboard.press("Space");
      await expect(page.locator(".desk__bulk")).toBeVisible();
      expect(await sidewaysScroll(page), `${lang}, selected`).toEqual({ document: 0, region: 0 });
    }
  });
}

test("at 375 px every column can be reached and edited, and the grid starts on the first screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of Object.keys(LANGS) as (keyof typeof LANGS)[]) {
    await open(page, `lang=${lang}`, LANGS[lang].rows);
    // Nothing is pinned but the selection column, so sideways scrolling
    // reaches the last column.
    await expect(page.locator(".stoa-data-grid__row--head .stoa-data-grid__cell--pinned")).toHaveCount(1);
    await expect(page.locator(".desk__hint")).toBeVisible();
    const head = await page.locator(".stoa-data-grid__head").boundingBox();
    expect(head!.y + head!.height, lang).toBeLessThan(812 - 3 * head!.height);
    const scroller = page.locator(".stoa-data-grid__scroller");
    await scroller.evaluate((el) => (el.scrollLeft = (getComputedStyle(el).direction === "rtl" ? -1 : 1) * el.scrollWidth));
    const box = (await scroller.boundingBox())!;
    // The last column of the view, drawn once the grid has caught up with
    // the scroll, lies inside the grid.
    const last = page.locator('.stoa-data-grid__row--head [aria-colindex="9"]');
    await expect
      .poll(async () => {
        const b = await last.boundingBox();
        return b !== null && b.x >= box.x - 1 && b.x + b.width <= box.x + box.width + 1;
      }, { message: lang })
      .toBe(true);
    // The status column, in view, opens its editor on a double click.
    await scroller.evaluate((el) => (el.scrollLeft = 0));
    await grid(page).locator('[data-cell="0:1"]').click();
    for (let k = 0; k < 4; k++) await page.keyboard.press(lang === "ar" ? "ArrowLeft" : "ArrowRight");
    const status = grid(page).locator('[data-cell="0:5"]');
    await expect(status).toBeFocused();
    await expect(status).toBeInViewport({ ratio: 1 });
    await status.dblclick();
    await expect(grid(page).getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    // The filters are one tap away.
    const filters = page.getByText(lang === "en" ? "Filters" : lang === "ru" ? "Фильтры" : "عوامل التصفية", { exact: true });
    await filters.click();
    await expect(page.locator(".stoa-filter-chip").first()).toBeVisible();
    await expectNoSeriousViolations(page, `narrow, ${lang}`);
  }
});

test("at 1280 px ID and client stay pinned", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await expect(page.locator(".stoa-data-grid__row--head .stoa-data-grid__cell--pinned")).toHaveCount(3);
  await expect(page.locator(".desk__hint")).toHaveCount(0);
  await expect(page.locator(".stoa-filter-chip").first()).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`the header stays put while the page region scrolls, scrollbars in Stoa's tokens (${theme})`, async ({ page }) => {
    await open(page, `theme=${theme}`);
    const header = page.getByRole("banner");
    const before = await header.boundingBox();
    const frame = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>(".stoa-page-shell__scroll")!;
      region.scrollTop = region.scrollHeight;
      const doc = document.scrollingElement!;
      window.scrollTo(0, 10_000);
      return {
        scrolled: region.scrollTop,
        regionTop: region.getBoundingClientRect().top,
        docScroll: doc.scrollTop,
        docOverflow: doc.scrollHeight - doc.clientHeight,
      };
    });
    expect(frame.scrolled).toBeGreaterThan(0);
    expect(frame.docScroll).toBe(0);
    expect(frame.docOverflow).toBeLessThanOrEqual(0);
    const after = await header.boundingBox();
    expect(after).toEqual(before);
    expect(frame.regionTop).toBeGreaterThanOrEqual(before!.y + before!.height - 0.5);

    // The page's scrollbar and the grid's own resolve to Stoa's tokens, thin.
    const bars = await page.evaluate(() => {
      const probe = (el: Element) => {
        const p = document.createElement("div");
        p.style.scrollbarColor = "var(--stoa-color-scrollbar-thumb) var(--stoa-color-scrollbar-track)";
        el.append(p);
        const expected = getComputedStyle(p).scrollbarColor;
        p.remove();
        const style = getComputedStyle(el);
        return { color: style.scrollbarColor, expected, width: style.scrollbarWidth };
      };
      return [probe(document.querySelector(".stoa-page-shell__scroll")!), probe(document.querySelector(".stoa-data-grid__scroller")!)];
    });
    for (const bar of bars) {
      expect(bar.color).toBe(bar.expected);
      expect(bar.color).not.toBe("auto");
      expect(bar.width).toBe("thin");
    }
  });
}
