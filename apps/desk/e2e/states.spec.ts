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
  await expect(page.getByRole("progressbar", { name: "Generating requests" })).toBeVisible();
  await expect(page.getByTestId("row-count")).toHaveText("Loading requests");
  await expectNoSeriousViolations(page, "loading");
  release();
  await expect(page.getByTestId("row-count")).toHaveText(ALL, { timeout: 15_000 });
  await expect(grid(page)).not.toHaveAttribute("aria-busy");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("a chunk that fails to load is named, and a retry fills it in", async ({ page }) => {
  await open(page, "failChunk=3", "45,000 of 50,000 requests (5,000 did not load)");
  const alert = page.getByRole("alert").filter({ hasText: "Some requests did not load" });
  await expect(alert).toContainText("Rows 15,001 to 20,000 are missing.");
  await expectNoSeriousViolations(page, "error");
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("row-count")).toHaveText(ALL);
  await expect(alert).toHaveCount(0);
  // The Retry button went with its notice; the focus did not fall to the
  // page's body but moved on to the grid.
  await expect(grid(page).locator('[data-cell="0:0"]')).toBeFocused();
});

test("without a worker the desk says so and still filters and sorts", async ({ page }) => {
  await open(page, "worker=off");
  await expect(page.getByText("The background worker is unavailable")).toBeVisible();
  await page.getByRole("button", { name: /^Rejected \d/ }).click();
  await expect(page.getByTestId("row-count")).toHaveText("4,015 of 50,000 requests");
  await page.getByRole("columnheader", { name: "ID" }).click();
  await page.getByRole("columnheader", { name: "ID" }).click();
  await expect(grid(page).locator('[data-cell="0:5"]')).toHaveText("Rejected");
  await page.getByText("Performance").click();
  await expect(page.locator(".perf")).toContainText("Main thread");
  await expectNoSeriousViolations(page, "no worker");
});
