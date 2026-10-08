// The main tasks on the complaints register: the open cases by time left,
// the working views, filters with counts, search, sorting, roles, edits
// validated by the rules (a refusal needs a ground; no extension for a
// money claim under 123-FZ), conflicts, bulk reassignment with undo, CSV
// and the keyboard.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ALL, EDIT_COLUMNS, WITH_EDITS, cell, focusCell, grid, open, pick, selectionBar, toasts, viewParam } from "./helpers";

const count = (page: import("@playwright/test").Page) => page.getByTestId("row-count");

test("1,200 cases reach the grid through the worker, their deadlines counted by the rules engine", async ({ page }) => {
  await open(page);
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "1201");
  await expect(grid(page)).toHaveAttribute("aria-colcount", "9");
  await expect(cell(page, 0, 1)).toHaveText("C-000001");
  await expect(page.getByText("Deadlines as of Oct 6, 2026")).toBeVisible();
  // Only the rows in view are in the document.
  expect(await grid(page).getByRole("row").count()).toBeLessThan(60);
  await page.getByText("Performance").click();
  await expect(page.locator(".perf")).toContainText("Worker");
});

test("the desk opens on the open cases, the least time left first", async ({ page }) => {
  await page.goto("/?colleague=off&lang=en");
  await expect(count(page)).toHaveText("215 of 1,200 cases", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /View$/ })).toContainText("Open cases");
  await expect(page.getByRole("columnheader", { name: "Time left" })).toHaveAttribute("aria-sort", "ascending");
  const headers = await page.getByRole("columnheader").allTextContents();
  expect(headers.slice(1, 6)).toEqual(["Case", "Applicant", "Stream", "Stage", "Time left"]);
  await expect(cell(page, 0, 1)).toHaveText("C-000957");
  // The time left in DeadlineCell's words, with its symbol: a cross once
  // overdue, an exclamation mark within 3 working days.
  await expect(cell(page, 0, 5)).toHaveText("✗1 working day overdue");
  await expect(cell(page, 0, 4)).toHaveText("Drafting");
  for (const name of ["Reply sent", "Closed", "Answered"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name} \\d`) })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(page.getByRole("button", { name: /^Registered \d/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "About this demo" })).toContainText("1,200 invented complaints, 215 of them open");
  await page.getByRole("button", { name: /View$/ }).click();
  await expect(page.getByRole("option").first()).toHaveText("Open cases");
});

test("the working views: due within 3 working days, overdue, forwarded, waiting for facts, awaiting signature", async ({ page }) => {
  await open(page);
  const views: [string, string][] = [
    ["Due within 3 working days", "24 of 1,200 cases"],
    ["Overdue", "4 of 1,200 cases"],
    ["Forwarded by the Bank of Russia", "38 of 1,200 cases"],
    ["Waiting for facts", "61 of 1,200 cases"],
    ["Awaiting signature", "30 of 1,200 cases"],
  ];
  for (const [name, rows] of views) {
    await page.getByRole("button", { name: /View$/ }).click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(count(page), name).toHaveText(rows);
    await expect(page.getByRole("columnheader", { name: "Time left" })).toHaveAttribute("aria-sort", "ascending");
  }
  // Overdue rows say by how much; due-soon rows how much is left.
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Overdue", exact: true }).click();
  await expect(cell(page, 0, 3)).toHaveText(/^✗\d+ working days? overdue$/);
});

test("the demo's own controls sit apart from the desk's, and say what the simulated colleague does", async ({ page }) => {
  await open(page, "colleague=40");
  const demo = page.getByRole("region", { name: "About this demo" });
  await expect(demo).toContainText("A simulated colleague edits one about every 40 seconds; edit the same cell to see a conflict.");
  for (const role of ["Operator", "Signatory", "Supervisor"]) await expect(demo.getByRole("radio", { name: role })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Actions" }).getByRole("button", { name: "Colleague’s edit" })).toHaveCount(0);
  await demo.getByRole("button", { name: "Colleague’s edit" }).click();
  // A case moved on to its next stage, or, where it cannot move on (a
  // closed one), a note.
  await expect(toasts(page)).toContainText(/A colleague set (Stage|Note)/);
  await open(page, "colleague=off");
  await expect(page.getByRole("region", { name: "About this demo" })).toContainText("The simulated colleague is off on this page");
});

test("a stage chip filters by its count, and chips of other groups combine with it", async ({ page }) => {
  await open(page);
  const closed = page.getByRole("button", { name: /^Closed \d/ });
  await expect(closed.locator(".stoa-filter-chip__count")).toHaveText("664");
  await closed.click();
  await expect(closed).toHaveAttribute("aria-pressed", "true");
  await expect(count(page)).toHaveText("664 of 1,200 cases");
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "665");
  for (let r = 0; r < 5; r++) await expect(cell(page, r, 4)).toHaveText("✓Closed");
  // A second group narrows; its chips count within the first.
  const block = page.getByRole("button", { name: /^Block, 161-FZ \d/ });
  const n = (await block.locator(".stoa-filter-chip__count").textContent())!;
  await block.click();
  await expect(count(page)).toHaveText(`${n} of 1,200 cases`);
  for (let r = 0; r < 3; r++) await expect(cell(page, r, 3)).toHaveText("Block, 161-FZ");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(count(page)).toHaveText(ALL);
  // Clear all leaves the focus in the search box, never on the page's body.
  await expect(page.getByLabel("Search")).toBeFocused();
});

test("search narrows the grid and marks matches; no match shows the empty state", async ({ page }) => {
  await open(page);
  const search = page.getByLabel("Search");
  await search.fill("vetlugina");
  await expect(count(page)).toHaveText("18 of 1,200 cases");
  await expect(cell(page, 0, 2)).toContainText("Vetlugina");
  await expect(cell(page, 0, 2).locator("mark")).toHaveText("Vetlugina");
  await search.fill("no case says this");
  await expect(count(page)).toHaveText("0 of 1,200 cases");
  await expect(page.getByText("No cases match")).toBeVisible();
  await page.locator(".desk__grid").getByRole("button", { name: "Clear filters" }).click();
  await expect(count(page)).toHaveText(ALL);
  await expect(search).toHaveValue("");
});

test("a header sorts through the worker, ascending then descending", async ({ page }) => {
  await open(page);
  const id = page.getByRole("columnheader", { name: "Case" });
  await id.click();
  await expect(id).toHaveAttribute("aria-sort", "ascending");
  await expect(cell(page, 0, 1)).toHaveText("C-000001");
  await id.click();
  await expect(id).toHaveAttribute("aria-sort", "descending");
  await expect(cell(page, 0, 1)).toHaveText("C-001200");
  await expect(page.getByText("Modified")).toBeVisible();
  // With the keyboard: Enter on the Applicant header.
  await focusCell(page, 0, 1);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("columnheader", { name: "Applicant" })).toHaveAttribute("aria-sort", "ascending");
  await expect(cell(page, 0, 2)).toHaveText("Alexei Belozyorov");
});

test("the ground's editor offers the grounds in reading order, 161-FZ art. 9 parts 11.6 and 11.7 among the 161-FZ ones", async ({ page }) => {
  await open(page, `role=reviewer&view=${viewParam({ columns: EDIT_COLUMNS, filters: { stage: [3], stream: [2], source: [], deadline: [], copy: [] } })}`, "");
  await expect(grid(page)).not.toHaveAttribute("aria-busy");
  await focusCell(page, 0, 6);
  await page.keyboard.press("Enter");
  const list = grid(page).getByRole("listbox");
  await expect(list).toBeFocused();
  await expect(list.getByRole("option")).toHaveText([
    "None",
    "161-FZ, art. 8, part 3.4",
    "161-FZ, art. 8, part 3.10",
    "161-FZ, art. 9, part 11.6",
    "161-FZ, art. 9, part 11.7",
    "115-FZ, art. 7, item 11",
    "115-FZ, art. 7, item 5.2, paragraph 2",
    "115-FZ, art. 7, item 5.2, paragraph 3",
    "115-FZ, art. 7, item 10",
    "115-FZ, art. 7, item 10.1",
    "115-FZ, art. 7, item 1, subitem 6",
    "115-FZ, art. 7.7, item 5",
    "Contract",
  ]);
  await page.keyboard.press("Escape");
  await expect(cell(page, 0, 6)).toBeFocused();
});

test("a refusal needs a legal ground of its own stream; the reviewer sends a reply to signature only decided, and never returns it from a cell", async ({ page }) => {
  // 161-FZ replies under legal review, as the reviewer sees them.
  await open(page, `role=reviewer&view=${viewParam({ columns: EDIT_COLUMNS, filters: { stage: [3], stream: [2], source: [], deadline: [], copy: [] } })}`, "");
  await expect(grid(page)).not.toHaveAttribute("aria-busy");
  // The body's cells only: the header row carries data-cell too.
  const body = grid(page).locator(".stoa-data-grid__body");
  const outcomes = await body.locator('[data-cell$=":5"]').allTextContents();
  const grounds = await body.locator('[data-cell$=":6"]').allTextContents();
  const row = outcomes.findIndex((t, k) => t === "Uphold" && grounds[k] === "None");
  expect(row).toBeGreaterThanOrEqual(0);
  // Refuse without a ground: refused, with the reason in the editor.
  await pick(page, row, 5, "Refuse");
  await expect(grid(page).getByRole("alert")).toHaveText("A refusal needs a legal ground. Choose the ground first.");
  await page.keyboard.press("Escape");
  await expect(cell(page, row, 5)).toBeFocused();
  // Undecided, the reply does not go to signature.
  await pick(page, row, 5, "Not decided");
  await expect(cell(page, row, 5)).toHaveText("Not decided");
  await pick(page, row, 4, "Awaiting signature");
  await expect(grid(page).getByRole("alert")).toHaveText("Decide the outcome before signature.");
  await page.keyboard.press("Escape");
  // A return for rework needs a reason, which only the case page asks for.
  await pick(page, row, 4, "Drafting");
  await expect(grid(page).getByRole("alert")).toHaveText("A return for rework needs a reason: return the case from its page.");
  await page.keyboard.press("Escape");
  // A 115-FZ ground on a 161-FZ case: refused; the 161-FZ one is saved.
  await pick(page, row, 6, "115-FZ, art. 7, item 11");
  await expect(grid(page).getByRole("alert")).toHaveText("This ground belongs to another stream: 161-FZ and 115-FZ grounds are not mixed.");
  await page.keyboard.press("Escape");
  await pick(page, row, 6, "161-FZ, art. 8, part 3.4");
  await expect(cell(page, row, 6)).toHaveText("161-FZ, art. 8, part 3.4");
  await pick(page, row, 5, "Refuse");
  await expect(cell(page, row, 5)).toHaveText("Refuse");
  await expect(page.locator("[role=status]").filter({ hasText: "Decision is now" }).first()).toContainText("Decision is now “Refuse”.");
  // Decided, with its ground: on to signature, which takes the case out of
  // this view of replies under review.
  const review = (await page.getByTestId("row-count").textContent())!;
  const id = (await cell(page, row, 1).textContent())!;
  await pick(page, row, 4, "Awaiting signature");
  await expect(page.locator("[role=status]").filter({ hasText: "Stage is now" }).first()).toContainText(`${id}: Stage is now “Awaiting signature”.`);
  await expect(page.getByTestId("row-count")).not.toHaveText(review);
  // Ctrl or Cmd with Z takes the last edit back, and the reply returns.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(toasts(page)).toContainText("Undone on 1 case.");
  await expect(page.getByTestId("row-count")).toHaveText(review);
});

test("a money claim under 123-FZ is never extended; a note over 200 characters is refused", async ({ page }) => {
  // Open money claims, the smallest claim first: within the ombudsman's limit.
  const view = viewParam({
    columns: ["id", "client", "stream", "claim", "extension", "note"],
    filters: { stage: [0, 1, 2, 3, 4], stream: [1], source: [], deadline: [], copy: [] },
    sort: { id: "claim", desc: false },
  });
  await open(page, `view=${view}`, "");
  await expect(grid(page)).not.toHaveAttribute("aria-busy");
  await pick(page, 0, 5, "Extended by 10 working days");
  await expect(grid(page).getByRole("alert")).toHaveText("A money claim under 123-FZ cannot be extended.");
  await page.keyboard.press("Escape");
  await expect(cell(page, 0, 5)).toHaveText("None");
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 0, 6)).toBeFocused();
  await page.keyboard.press("F2");
  const input = grid(page).getByRole("textbox", { name: "Note" });
  await input.fill("x".repeat(201));
  await input.press("Enter");
  await expect(grid(page).getByRole("alert")).toHaveText("At most 200 characters; this note has 201.");
  await input.fill("Claim within the ombudsman's limit");
  await input.press("Enter");
  await expect(cell(page, 0, 6)).toHaveText("Claim within the ombudsman's limit");
});

test("a mouse edits too: a double click opens the editor, a click picks the value", async ({ page }) => {
  await open(page, `view=${WITH_EDITS}`);
  await cell(page, 2, 8).dblclick();
  const input = grid(page).getByRole("textbox", { name: "Note" });
  await expect(input).toBeFocused();
  await input.fill("Edited with the mouse");
  // Leaving the editor for another cell saves a valid value.
  await cell(page, 5, 2).click();
  await expect(input).toBeHidden();
  await expect(cell(page, 2, 8)).toHaveText("Edited with the mouse");
  await expect(cell(page, 5, 2)).toBeFocused();
});

test("an editor opened with the mouse also meets a colleague's change with the conflict dialog", async ({ page }) => {
  await open(page, `view=${WITH_EDITS}&colleague=1`);
  await cell(page, 6, 8).dblclick();
  const input = grid(page).getByRole("textbox", { name: "Note" });
  await input.fill("Mouse note");
  await expect(toasts(page)).toContainText("A colleague changed the cell you are editing (C-000007, Note)", { timeout: 10_000 });
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Changed while you were editing" });
  await expect(dialog.getByTestId("conflict-mine")).toHaveText("Mouse note");
  await dialog.getByRole("button", { name: "Use mine" }).click();
  await expect(cell(page, 6, 8)).toHaveText("Mouse note");
});

test("a colleague's change to the cell being edited opens a conflict dialog", async ({ page }) => {
  await open(page, `view=${WITH_EDITS}&colleague=1`);
  await focusCell(page, 3, 8);
  await page.keyboard.press("Enter");
  const input = grid(page).getByRole("textbox", { name: "Note" });
  await input.fill("My note");
  await expect(toasts(page)).toContainText("A colleague changed the cell you are editing (C-000004, Note)", { timeout: 10_000 });
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
  await expect(cell(page, 3, 8)).toHaveText("My note");
  await expect(toasts(page)).toContainText("C-000004: your value was saved.");
  // The focus is back on the cell that was edited.
  await expect(cell(page, 3, 8)).toBeFocused();

  // The other way: keep theirs.
  await focusCell(page, 4, 8);
  await page.keyboard.press("Enter");
  await grid(page).getByRole("textbox", { name: "Note" }).fill("Mine again");
  await expect(toasts(page)).toContainText("A colleague changed the cell you are editing (C-000005, Note)", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  const theirs = (await dialog.getByTestId("conflict-theirs").textContent())!;
  await dialog.getByRole("button", { name: "Keep theirs" }).click();
  await expect(cell(page, 4, 8)).toHaveText(theirs);
  await expect(cell(page, 4, 8)).toBeFocused();
});

test("the focus stays on the active cell while rows change under it", async ({ page }) => {
  // Cases before review, each of which the colleague can move on.
  await open(page, `view=${viewParam({ filters: { stage: [0, 1, 2], stream: [], source: [], deadline: [], copy: [] } })}`, "");
  await expect(grid(page)).not.toHaveAttribute("aria-busy");
  // Sorted by stage, a colleague's stage change moves rows around.
  await page.getByRole("columnheader", { name: "Stage" }).click();
  await expect(page.getByRole("columnheader", { name: "Stage" })).toHaveAttribute("aria-sort", "ascending");
  await focusCell(page, 0, 1);
  const id = await cell(page, 0, 1).textContent();
  for (let k = 0; k < 4; k++) {
    await page.keyboard.press("c");
    await expect(toasts(page)).toContainText("A colleague set Stage");
  }
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("data-cell", /^\d+:1$/);
  await expect(focused).toHaveText(id!);
});

test("a bulk reassignment on a keyboard selection can be undone from its toast", async ({ page }) => {
  await open(page);
  const before = await Promise.all([0, 1, 2].map((r) => cell(page, r, 8).textContent()));
  await focusCell(page, 0, 1);
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const bar = selectionBar(page);
  await expect(bar).toContainText("3 selected");
  await bar.getByRole("button", { name: "Reassign" }).click();
  const dialog = page.getByRole("dialog", { name: "Reassign 3 cases" });
  await dialog.getByRole("button", { name: /Assign to/ }).click();
  await page.getByRole("option", { name: "F. Okunev" }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  for (const r of [0, 1, 2]) await expect(cell(page, r, 8)).toHaveText("F. Okunev");
  await expect(bar).toBeHidden();
  // The bar and its action are gone; the focus goes back to the grid's
  // active cell, not to the page's body.
  await expect(cell(page, 2, 1)).toBeFocused();
  const toast = toasts(page).getByRole("alertdialog").or(toasts(page).locator(".stoa-toast")).filter({ hasText: "assigned to" });
  await expect(toast).toContainText("3 cases assigned to F. Okunev.");
  await toast.getByRole("button", { name: "Undo" }).click();
  for (const [r, text] of before.entries()) await expect(cell(page, r, 8)).toHaveText(text!);
  await expect(toasts(page)).toContainText("Undone on 3 cases.");
});

test("after the selection bar closes, by an action or by Clear selection, the focus is in the grid", async ({ page }) => {
  await open(page);
  await cell(page, 1, 0).locator("input").click();
  const bar = selectionBar(page);
  await bar.getByRole("button", { name: "Clear selection" }).click();
  await expect(bar).toBeHidden();
  await expect(cell(page, 1, 0)).toBeFocused();
  await cell(page, 4, 0).locator("input").click();
  await bar.getByRole("button", { name: "Reassign" }).click();
  await page.getByRole("dialog", { name: "Reassign 1 case" }).getByRole("button", { name: "Apply" }).click();
  await expect(bar).toBeHidden();
  await expect(cell(page, 4, 0)).toBeFocused();
  // Undo by keyboard from there keeps it.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(toasts(page)).toContainText("Undone on 1 case.");
  await expect(cell(page, 4, 0)).toBeFocused();
});

test("the operator works their own cases; the signatory the replies they sign; neither reassigns or exports", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "Operator" }).click();
  await expect(count(page)).toHaveText("164 of 1,200 cases");
  expect(new URL(page.url()).searchParams.get("role")).toBe("operator");
  await expect(page.getByText("The operator works the cases assigned to V. Lanskaya")).toBeVisible();
  await expect(page.getByText("Hidden for this role: Assignee.")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Assignee" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await focusCell(page, 0, 1);
  await page.keyboard.press("Space");
  await expect(page.getByText("Reassigning cases needs the supervisor role.")).toBeVisible();
  await page.getByRole("radio", { name: "Signatory" }).click();
  await expect(count(page)).toHaveText("400 of 1,200 cases");
  await expect(page.getByText("The signatory signs and sends the replies assigned to V. Izotova")).toBeVisible();
  await page.getByRole("radio", { name: "Supervisor" }).click();
  await expect(count(page)).toHaveText(ALL);
  await expect(page.getByRole("columnheader", { name: "Assignee" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
});

test("views: a preset, a saved view that survives a reload, a link, and deletion", async ({ page, context }) => {
  await open(page);
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Overdue", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Time left" })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("button", { name: /^Overdue \d/ })).toHaveAttribute("aria-pressed", "true");
  const overdue = (await count(page).textContent())!;
  await page.getByRole("button", { name: /^Due within 3 working days \d/ }).click();
  await expect(page.getByText("Modified")).toBeVisible();

  await page.getByRole("button", { name: "Save view" }).click();
  const dialog = page.getByRole("dialog", { name: "Save the view" });
  const name = dialog.getByLabel("Name");
  await name.fill("overdue");
  await name.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText("That name belongs to a built-in view.");
  await name.fill("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Give the view a name.");
  await name.fill("Late or nearly");
  await name.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(toasts(page)).toContainText("View “Late or nearly” saved.");
  await expect(page.getByText("Modified")).toHaveCount(0);
  const saved = (await count(page).textContent())!;
  expect(saved).toBe("28 of 1,200 cases");
  expect(saved).not.toBe(overdue);

  await page.reload();
  await page.getByRole("button", { name: /View$/ }).click();
  await page.getByRole("option", { name: "Late or nearly" }).click();
  await expect(count(page)).toHaveText(saved);

  await page.getByRole("button", { name: "Copy link" }).click();
  const link = new URL(page.url());
  expect(link.searchParams.get("view")).toBeTruthy();
  const other = await context.newPage();
  await other.goto(`${link.pathname}${link.search}&colleague=off`);
  await expect(other.getByTestId("row-count")).toHaveText(saved, { timeout: 15_000 });
  await expect(other.getByRole("columnheader", { name: "Time left" })).toHaveAttribute("aria-sort", "ascending");
  await other.close();

  await page.getByRole("button", { name: "Delete view" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete the view “Late or nearly”?" });
  await confirm.getByRole("button", { name: "Delete view" }).click();
  // The desk goes back to the view it opens on; the focus, on the Delete
  // view button that went with the saved view, moves on to the next
  // action rather than to the page's body.
  await expect(count(page)).toHaveText("215 of 1,200 cases");
  await expect(page.getByRole("toolbar", { name: "Actions" }).getByRole("button", { name: "Columns" })).toBeFocused();
  await expect(page.getByRole("button", { name: /View$/ })).toContainText("Open cases");
  await page.getByRole("button", { name: /View$/ }).click();
  await expect(page.getByRole("option", { name: "Late or nearly" })).toHaveCount(0);
});

test("Stoa's column chooser shows, hides and reorders columns; the case and the applicant stay", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Columns" }).click();
  const sheet = page.getByRole("dialog", { name: "Columns" });
  await expect(sheet.getByRole("checkbox", { name: "Case" })).toHaveCount(0);
  // The list scrolls inside the sheet; a check box is pressed where it is.
  await sheet.getByRole("checkbox", { name: "Source" }).evaluate((el: HTMLElement) => el.click());
  await expect(sheet.getByRole("checkbox", { name: "Source" })).not.toBeChecked();
  await sheet.getByRole("checkbox", { name: "Note" }).evaluate((el: HTMLElement) => el.click());
  await expect(sheet.getByRole("checkbox", { name: "Note" })).toBeChecked();
  await sheet.getByRole("button", { name: "Move up: Stage" }).click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  const headers = await page.getByRole("columnheader").allTextContents();
  expect(headers.slice(1, 5)).toEqual(["Case", "Applicant", "Stage", "Stream"]);
  expect(headers).not.toContain("Source");
  expect(headers).toContain("Note");
  await expect(page.getByText("Modified")).toBeVisible();
});

test("CSV export writes the current view", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Closed \d/ }).click();
  await expect(count(page)).toHaveText("664 of 1,200 cases");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("complaints.csv");
  const lines = (await readFile((await file.path())!, "utf8")).split("\r\n");
  expect(lines[0]).toBe("﻿Case;Applicant;Stream;Stage;Time left;Reply due;Source;Assignee");
  expect(lines).toHaveLength(665);
  expect(lines.slice(1).every((l) => l.split(";")[3] === "Closed")).toBe(true);
  await expect(toasts(page)).toContainText("Exported 664 rows.");
  // By keyboard, on a narrower view.
  await page.getByRole("button", { name: /^Bank of Russia \d/ }).click();
  const n = Number((await page.getByRole("button", { name: /^Bank of Russia \d/ }).locator(".stoa-filter-chip__count").textContent())!);
  await expect(count(page)).toHaveText(`${n} of 1,200 cases`);
  const small = page.waitForEvent("download");
  await page.keyboard.press("e");
  const rows = (await readFile((await (await small).path())!, "utf8")).split("\r\n");
  expect(rows).toHaveLength(n + 1);
  expect(rows.slice(1).every((l) => l.split(";")[6] === "Bank of Russia")).toBe(true);
});

test("the scale mode holds 50,000 cases, and CSV stops at 5,000 rows", async ({ page }) => {
  await open(page, "rows=50000", "50,000 of 50,000 cases");
  await expect(page.getByRole("region", { name: "About this demo" })).toContainText("50,000 invented complaints");
  await page.getByRole("button", { name: /^Closed \d/ }).click();
  await expect(count(page)).toHaveText("26,914 of 50,000 cases");
  const capped = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const lines = (await readFile((await (await capped).path())!, "utf8")).split("\r\n");
  expect(lines).toHaveLength(5_001);
  await expect(toasts(page)).toContainText("Exported the first 5,000 of 26,914 rows.");
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
  await page.keyboard.type("transfer");
  await expect(count(page)).not.toHaveText(ALL);
  await expect(page.getByText("Updating")).toHaveCount(0);
  await page.getByLabel("Search").blur();
  await page.keyboard.press("g");
  await expect(cell(page, 0, 0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 1, 0)).toBeFocused();
  await page.keyboard.press("x");
  await expect(count(page)).toHaveText(ALL);
  // Ctrl or Cmd with End reaches the last case.
  await page.keyboard.press("ControlOrMeta+End");
  await expect(grid(page).locator('[aria-rowindex="1201"]')).toBeVisible();
});
