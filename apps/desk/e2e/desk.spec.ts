// The main tasks: filtering with counts, search, sorting, views, roles,
// inline edits with validation, conflicts, bulk changes with undo, CSV and
// the keyboard.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ALL, WITH_COMMENTS, cell, focusCell, grid, open, toasts } from "./helpers";

test("50,000 requests reach the grid through the worker", async ({ page }) => {
  await open(page);
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "50001");
  await expect(grid(page)).toHaveAttribute("aria-colcount", "9");
  await expect(cell(page, 0, 1)).toHaveText("Z-000001");
  // Only the rows in view are in the document.
  expect(await grid(page).getByRole("row").count()).toBeLessThan(60);
  await page.getByText("Performance").click();
  await expect(page.locator(".perf")).toContainText("Worker");
});

test("the desk opens on the requests that need action, with their SLA, the least time first", async ({ page }) => {
  await page.goto("/?colleague=off");
  // New, in progress, awaiting the client and in review.
  await expect(page.getByTestId("row-count")).toHaveText("30,927 of 50,000 requests", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /View$/ })).toContainText("Needs action");
  const sla = page.getByRole("columnheader", { name: "SLA, h" });
  await expect(sla).toHaveAttribute("aria-sort", "ascending");
  const headers = await page.getByRole("columnheader").allTextContents();
  expect(headers.slice(1, 5)).toEqual(["ID", "Client", "Status", "SLA, h"]);
  for (const name of ["Approved", "Rejected", "Closed"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name} \\d`) })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(page.getByRole("button", { name: /^New \d/ })).toHaveAttribute("aria-pressed", "true");
  // It is first in the list of views.
  await page.getByRole("button", { name: /View$/ }).click();
  await expect(page.getByRole("option").first()).toHaveText("Needs action");
});

test("the demo's own controls sit apart from the desk's, and say what the simulated colleague does", async ({ page }) => {
  await open(page, "colleague=40");
  const demo = page.getByRole("region", { name: "About this demo" });
  await expect(demo).toContainText("A simulated colleague edits one about every 40 seconds; edit the same cell to see a conflict.");
  await expect(demo.getByRole("radio", { name: "Operator" })).toBeVisible();
  await expect(demo.getByRole("button", { name: "Colleague’s edit" })).toBeVisible();
  const actions = page.getByRole("toolbar", { name: "Actions" });
  await expect(actions.getByRole("button", { name: "Colleague’s edit" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "View" }).getByRole("radio", { name: "Operator" })).toHaveCount(0);
  await demo.getByRole("button", { name: "Colleague’s edit" }).click();
  await expect(toasts(page)).toContainText("A colleague set Status");
  // Switched off by the link, the demo says so.
  await open(page, "colleague=off");
  await expect(page.getByRole("region", { name: "About this demo" })).toContainText("The simulated colleague is off on this page");
});

test("a status chip filters by its count, and chips combine", async ({ page }) => {
  await open(page);
  const approved = page.getByRole("button", { name: /^Approved \d/ });
  const count = (await approved.locator(".stoa-filter-chip__count").textContent())!;
  await approved.click();
  await expect(approved).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("row-count")).toHaveText(`${count} of 50,000 requests`);
  await expect(grid(page)).toHaveAttribute("aria-rowcount", String(Number(count.replace(/,/g, "")) + 1));
  for (let r = 0; r < 5; r++) await expect(cell(page, r, 5)).toHaveText("Approved");
  // A second group narrows; its chips count within the first.
  const high = page.getByRole("button", { name: /^High \d/ });
  const highCount = (await high.locator(".stoa-filter-chip__count").textContent())!;
  await high.click();
  await expect(page.getByTestId("row-count")).toHaveText(`${highCount} of 50,000 requests`);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("row-count")).toHaveText(ALL);
});

test("search narrows the grid and marks matches; no match shows the empty state", async ({ page }) => {
  await open(page);
  const search = page.getByLabel("Search");
  await search.fill("quillmere");
  await expect(page.getByTestId("row-count")).not.toHaveText(ALL);
  await expect(cell(page, 0, 2)).toHaveText("Quillmere Freight Ltd");
  await expect(cell(page, 0, 2).locator("mark")).toHaveText("Quillmere");
  await search.fill("no request says this");
  await expect(page.getByTestId("row-count")).toHaveText("0 of 50,000 requests");
  await expect(page.getByText("No requests match")).toBeVisible();
  await grid(page).locator("..").getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("row-count")).toHaveText(ALL);
  await expect(search).toHaveValue("");
});

test("a header sorts through the worker, ascending then descending", async ({ page }) => {
  await open(page);
  const id = page.getByRole("columnheader", { name: "ID" });
  await id.click();
  await expect(id).toHaveAttribute("aria-sort", "ascending");
  await expect(cell(page, 0, 1)).toHaveText("Z-000001");
  await id.click();
  await expect(id).toHaveAttribute("aria-sort", "descending");
  await expect(cell(page, 0, 1)).toHaveText("Z-050000");
  await expect(page.getByText("Modified")).toBeVisible();
  // With the keyboard: Enter on the Client header.
  await focusCell(page, 0, 1);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("columnheader", { name: "Client" })).toHaveAttribute("aria-sort", "ascending");
  await expect(cell(page, 0, 2)).toHaveText("Bramblecote Textiles");
});

test("inline edits are validated, saved and announced", async ({ page }) => {
  await open(page, `view=${WITH_COMMENTS}`);
  // A row without a comment cannot be approved.
  const texts = await grid(page).locator('[data-cell$=":9"]').allTextContents();
  const row = texts.findIndex((t) => t === "");
  expect(row).toBeGreaterThanOrEqual(0);
  await focusCell(page, row, 5);
  await page.keyboard.press("Enter");
  const list = grid(page).getByRole("listbox", { name: "Status" });
  await expect(list).toBeFocused();
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(grid(page).getByRole("alert")).toHaveText("Approval needs a comment. Add one first.");
  await expect(list).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Escape");
  await expect(cell(page, row, 5)).toBeFocused();

  // A comment over 200 characters is refused; a shorter one is saved.
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(cell(page, row, 9)).toBeFocused();
  await page.keyboard.press("F2");
  const input = grid(page).getByRole("textbox", { name: "Comment" });
  await input.fill("x".repeat(201));
  await input.press("Enter");
  await expect(grid(page).getByRole("alert")).toHaveText("At most 200 characters; this comment has 201.");
  await input.fill("Called back, documents received");
  await input.press("Enter");
  await expect(cell(page, row, 9)).toHaveText("Called back, documents received");
  await expect(page.locator(".stoa-live-region, [role=status]").filter({ hasText: "Comment is now" }).first()).toContainText(
    "Comment is now “Called back, documents received”.",
  );
  // Now the approval goes through.
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(cell(page, row, 5)).toHaveText("Approved");
  // Ctrl or Cmd with Z takes the last edit back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cell(page, row, 5)).not.toHaveText("Approved");
  await expect(toasts(page)).toContainText("Undone on 1 request.");
});

test("a mouse edits too: a double click opens the editor, a click picks the value", async ({ page }) => {
  await open(page, `view=${WITH_COMMENTS}`);
  const before = await cell(page, 2, 5).textContent();
  const next = before === "In review" ? "Closed" : "In review";
  await cell(page, 2, 5).dblclick();
  const list = grid(page).getByRole("listbox", { name: "Status" });
  await expect(list).toBeVisible();
  await list.getByRole("option", { name: next }).click();
  await expect(list).toBeHidden();
  await expect(cell(page, 2, 5)).toHaveText(next);

  await cell(page, 2, 9).dblclick();
  const input = grid(page).getByRole("textbox", { name: "Comment" });
  await expect(input).toBeFocused();
  await input.fill("Edited with the mouse");
  // Leaving the editor for another cell saves a valid value.
  await cell(page, 5, 2).click();
  await expect(input).toBeHidden();
  await expect(cell(page, 2, 9)).toHaveText("Edited with the mouse");
  await expect(cell(page, 5, 2)).toBeFocused();
});

test("an editor opened with the mouse also meets a colleague's change with the conflict dialog", async ({ page }) => {
  await open(page, `view=${WITH_COMMENTS}&colleague=1`);
  await cell(page, 6, 9).dblclick();
  const input = grid(page).getByRole("textbox", { name: "Comment" });
  await input.fill("Mouse note");
  await expect(toasts(page)).toContainText("A colleague changed the cell you are editing (Z-000007, Comment)", { timeout: 10_000 });
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Changed while you were editing" });
  await expect(dialog.getByTestId("conflict-mine")).toHaveText("Mouse note");
  await dialog.getByRole("button", { name: "Use mine" }).click();
  await expect(cell(page, 6, 9)).toHaveText("Mouse note");
});

test("a colleague's change to the cell being edited opens a conflict dialog", async ({ page }) => {
  await open(page, `view=${WITH_COMMENTS}&colleague=1`);
  await focusCell(page, 3, 9);
  await page.keyboard.press("Enter");
  const input = grid(page).getByRole("textbox", { name: "Comment" });
  await input.fill("My note");
  await expect(toasts(page)).toContainText("A colleague changed the cell you are editing (Z-000004, Comment)", { timeout: 10_000 });
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Changed while you were editing" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("conflict-mine")).toHaveText("My note");
  await expect(dialog.getByTestId("conflict-theirs")).toHaveText(/^Colleague's edit \d+$/);
  // Escape does not decide: the dialog stays, with the typed value, and
  // says why.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("conflict-mine")).toHaveText("My note");
  await expect(dialog.getByRole("alert")).toContainText("Your value is not saved yet. “Use mine” saves it; “Keep theirs” discards it.");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Use mine" }).click();
  await expect(dialog).toBeHidden();
  await expect(cell(page, 3, 9)).toHaveText("My note");
  await expect(toasts(page)).toContainText("Z-000004: your value was saved.");
  // The focus is back on the cell that was edited.
  await expect(cell(page, 3, 9)).toBeFocused();

  // The other way: keep theirs.
  await focusCell(page, 4, 9);
  await page.keyboard.press("Enter");
  await grid(page).getByRole("textbox", { name: "Comment" }).fill("Mine again");
  await expect(toasts(page)).toContainText("A colleague changed the cell you are editing (Z-000005, Comment)", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  const theirs = (await dialog.getByTestId("conflict-theirs").textContent())!;
  await dialog.getByRole("button", { name: "Keep theirs" }).click();
  await expect(cell(page, 4, 9)).toHaveText(theirs);
  await expect(cell(page, 4, 9)).toBeFocused();
});

test("the focus stays on the active cell while rows change under it", async ({ page }) => {
  await open(page);
  // Sorted by status, a colleague's status change moves rows around.
  await page.getByRole("columnheader", { name: "Status" }).click();
  await expect(page.getByRole("columnheader", { name: "Status" })).toHaveAttribute("aria-sort", "ascending");
  await focusCell(page, 0, 1);
  const id = await cell(page, 0, 1).textContent();
  for (let k = 0; k < 4; k++) {
    await page.keyboard.press("c");
    await expect(toasts(page)).toContainText("A colleague set Status");
  }
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("data-cell", /^\d+:1$/);
  await expect(focused).toHaveText(id!);
});

test("a bulk change on a keyboard selection can be undone from its toast", async ({ page }) => {
  await open(page);
  const before = await Promise.all([0, 1, 2].map((r) => cell(page, r, 5).textContent()));
  await focusCell(page, 0, 1);
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const bulk = page.getByRole("region", { name: "Bulk change" });
  await expect(bulk).toContainText("Selected: 3");
  await bulk.getByRole("button", { name: /New status/ }).click();
  await page.getByRole("option", { name: "Closed" }).click();
  await bulk.getByRole("button", { name: "Apply" }).click();
  for (const r of [0, 1, 2]) await expect(cell(page, r, 5)).toHaveText("Closed");
  await expect(bulk).toBeHidden();
  // The bar and its Apply are gone; the focus goes back to the grid's
  // active cell, not to the page's body.
  await expect(cell(page, 2, 1)).toBeFocused();
  const toast = toasts(page).getByRole("alertdialog").or(toasts(page).locator(".stoa-toast")).filter({ hasText: "set on 3 requests" });
  await expect(toast).toContainText("Status “Closed” set on 3 requests.");
  await toast.getByRole("button", { name: "Undo" }).click();
  for (const [r, text] of before.entries()) await expect(cell(page, r, 5)).toHaveText(text!);
  await expect(toasts(page)).toContainText("Undone on 3 requests.");
});

test("after the bulk bar closes, by Apply or by Clear selection, the focus is in the grid", async ({ page }) => {
  await open(page);
  await cell(page, 1, 0).locator("input").click();
  const bulk = page.getByRole("region", { name: "Bulk change" });
  await bulk.getByRole("button", { name: "Clear selection" }).click();
  await expect(bulk).toBeHidden();
  await expect(cell(page, 1, 0)).toBeFocused();
  await cell(page, 4, 0).locator("input").click();
  await bulk.getByRole("button", { name: "Apply" }).click();
  await expect(bulk).toBeHidden();
  await expect(cell(page, 4, 0)).toBeFocused();
  // Undo by keyboard from there keeps it.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(toasts(page)).toContainText("Undone on 1 request.");
  await expect(cell(page, 4, 0)).toBeFocused();
});

test("the operator role sees fewer regions, no margins, no bulk changes or export", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "Operator" }).click();
  await expect(page.getByTestId("row-count")).toHaveText("18,881 of 50,000 requests");
  expect(new URL(page.url()).searchParams.get("role")).toBe("operator");
  await expect(page.getByText("Operators work the regions Port Halvard, Wrenmouth, Kestrel Bay.")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Region" }).getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  // The finance view's margin columns are hidden from operators.
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Finance" }).click();
  await expect(page.getByRole("columnheader", { name: "Revenue" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Margin" })).toHaveCount(0);
  await expect(page.getByText("Hidden for this role: Margin, Margin %.")).toBeVisible();
  await focusCell(page, 0, 1);
  await page.keyboard.press("Space");
  await expect(page.getByText("Bulk changes need the manager role.")).toBeVisible();
  await page.getByRole("radio", { name: "Manager" }).click();
  await expect(page.getByRole("columnheader", { name: "Margin", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
});

test("views: a preset, a saved view that survives a reload, a link, and deletion", async ({ page, context }) => {
  await open(page);
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Urgent" }).click();
  await expect(page.getByRole("columnheader", { name: "SLA, h" })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("button", { name: /^High \d/ })).toHaveAttribute("aria-pressed", "true");
  const urgent = (await page.getByTestId("row-count").textContent())!;
  await page.getByRole("button", { name: /^Low \d/ }).click();
  await expect(page.getByText("Modified")).toBeVisible();

  await page.getByRole("button", { name: "Save view" }).click();
  const dialog = page.getByRole("dialog", { name: "Save the view" });
  const name = dialog.getByLabel("Name");
  await name.fill("urgent");
  await name.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText("That name belongs to a built-in view.");
  await name.fill("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Give the view a name.");
  await name.fill("Urgent and low");
  await name.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(toasts(page)).toContainText("View “Urgent and low” saved.");
  await expect(page.getByText("Modified")).toHaveCount(0);
  const saved = (await page.getByTestId("row-count").textContent())!;
  expect(saved).not.toBe(urgent);

  await page.reload();
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Urgent and low" }).click();
  await expect(page.getByTestId("row-count")).toHaveText(saved);

  await page.getByRole("button", { name: "Copy link" }).click();
  const link = new URL(page.url());
  expect(link.searchParams.get("view")).toBeTruthy();
  const other = await context.newPage();
  await other.goto(`${link.pathname}${link.search}&colleague=off`);
  await expect(other.getByTestId("row-count")).toHaveText(saved, { timeout: 15_000 });
  await expect(other.getByRole("columnheader", { name: "SLA, h" })).toHaveAttribute("aria-sort", "ascending");
  await other.close();

  await page.getByRole("button", { name: "Delete view" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete the view “Urgent and low”?" });
  await confirm.getByRole("button", { name: "Delete view" }).click();
  // The desk goes back to the view it opens on; the focus, on the Delete
  // view button that went with the saved view, moves on to the next
  // action rather than to the page's body.
  await expect(page.getByTestId("row-count")).toHaveText("30,927 of 50,000 requests");
  await expect(page.getByRole("toolbar", { name: "Actions" }).getByRole("button", { name: "Columns" })).toBeFocused();
  await expect(page.getByRole("button", { name: /View$/ })).toContainText("Needs action");
  await page.getByRole("button", { name: /View$/ }).click();
  await expect(page.getByRole("option", { name: "Urgent and low" })).toHaveCount(0);
});

test("the columns sheet shows, hides and reorders columns", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Columns" }).click();
  const sheet = page.getByRole("dialog", { name: "Columns" });
  await sheet.locator(".stoa-checkbox__label", { hasText: /^Owner$/ }).click();
  await expect(sheet.getByRole("checkbox", { name: "Owner" })).not.toBeChecked();
  await sheet.locator(".stoa-checkbox__label", { hasText: /^Comment$/ }).click();
  await expect(sheet.getByRole("checkbox", { name: "Comment" })).toBeChecked();
  await sheet.getByRole("button", { name: "Move up: Amount" }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
  const headers = await page.getByRole("columnheader").allTextContents();
  expect(headers.slice(1, 5)).toEqual(["ID", "Client", "Amount", "Date"]);
  expect(headers).not.toContain("Owner");
  expect(headers).toContain("Comment");
});

test("CSV export writes the current view, at most 5,000 rows", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Approved \d/ }).click();
  await expect(page.getByTestId("row-count")).toHaveText("5,892 of 50,000 requests");
  const capped = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await capped;
  expect(file.suggestedFilename()).toBe("requests.csv");
  const text = await readFile((await file.path())!, "utf8");
  const lines = text.split("\r\n");
  expect(lines[0]).toBe("﻿ID;Client;Date;Amount;Status;Owner;Region;Priority");
  expect(lines).toHaveLength(5_001);
  expect(lines.slice(1).every((l) => l.split(";")[4] === "Approved")).toBe(true);
  await expect(toasts(page)).toContainText("Exported the first 5,000 of 5,892 rows.");

  await page.getByRole("button", { name: /^High \d/ }).click();
  const n = Number((await page.getByRole("button", { name: /^High \d/ }).locator(".stoa-filter-chip__count").textContent())!.replace(/,/g, ""));
  await expect(page.getByTestId("row-count")).toHaveText(`${n.toLocaleString("en-US")} of 50,000 requests`);
  const small = page.waitForEvent("download");
  await page.keyboard.press("e");
  const rows = (await readFile((await (await small).path())!, "utf8")).split("\r\n");
  expect(rows).toHaveLength(n + 1);
  expect(rows.slice(1).every((l) => l.split(";")[7] === "High")).toBe(true);
});

test("app shortcuts: help, search, grid, clear", async ({ page }) => {
  await open(page);
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  await expect(help.locator("kbd").first()).toBeVisible();
  await expect(help).toContainText("Extend the selection");
  await expect(help).toContainText("Simulate a colleague’s edit");
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search")).toBeFocused();
  await page.keyboard.type("kestrel");
  await expect(page.getByTestId("row-count")).not.toHaveText(ALL);
  await expect(page.getByText("Updating")).toHaveCount(0);
  await page.getByLabel("Search").blur();
  await page.keyboard.press("g");
  await expect(cell(page, 0, 0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 1, 0)).toBeFocused();
  await page.keyboard.press("x");
  await expect(page.getByTestId("row-count")).toHaveText(ALL);
  // Ctrl or Cmd with End reaches the last request.
  await page.keyboard.press("ControlOrMeta+End");
  await expect(grid(page).locator('[aria-rowindex="50001"]')).toBeVisible();
});
