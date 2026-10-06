// Loading, partial failure with retry, and the main-thread fallback.
import { expect, test } from "@playwright/test";
import { ALL, expectNoSeriousViolations, grid, open } from "./helpers";

test("while the worker loads, the grid shows its loading state and the progress", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/*desk.worker*", async (route) => {
    await held;
    await route.continue();
  });
  await open(page, "", "");
  await expect(grid(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("progressbar", { name: "Generating the register" })).toBeVisible();
  await expect(page.getByTestId("row-count")).toHaveText("Loading cases");
  await expectNoSeriousViolations(page, "loading");
  release();
  await expect(page.getByTestId("row-count")).toHaveText(ALL, { timeout: 15_000 });
  await expect(grid(page)).not.toHaveAttribute("aria-busy");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("a chunk that fails to load is named, and a retry fills it in", async ({ page }) => {
  await open(page, "failChunk=1", "800 of 1,200 cases (400 did not load)");
  const alert = page.getByRole("alert").filter({ hasText: "Some cases did not load" });
  await expect(alert).toContainText("Rows 401 to 800 are missing.");
  await expectNoSeriousViolations(page, "error");
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("row-count")).toHaveText(ALL);
  await expect(alert).toHaveCount(0);
  // The Retry button went with its notice; the focus did not fall to the
  // page's body but moved on to the grid.
  await expect(grid(page).locator('[data-cell="0:0"]')).toBeFocused();
});

test("without a worker the desk says so, still loads the rules engine, and filters and sorts", async ({ page }) => {
  await open(page, "worker=off");
  await expect(page.getByText("The background worker is unavailable")).toBeVisible();
  await page.getByRole("button", { name: /^Awaiting signature \d/ }).click();
  await expect(page.getByTestId("row-count")).toHaveText("37 of 1,200 cases");
  await page.getByRole("columnheader", { name: "Case" }).click();
  await page.getByRole("columnheader", { name: "Case" }).click();
  await expect(grid(page).locator('[data-cell="0:4"]')).toHaveText("Awaiting signature");
  await expect(grid(page).locator('[data-cell="0:5"]')).toHaveText(/working days?$|^Due today$/);
  await page.getByText("Performance").click();
  await expect(page.locator(".perf")).toContainText("Main thread");
  await expectNoSeriousViolations(page, "no worker");
});
