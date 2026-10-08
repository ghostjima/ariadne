// Review and signature: the reviewer reads the letter with what the rubric
// finds and its changes against the assistant's draft, edits it, approves
// it (not while it leaves the decision open) or returns it; the signatory
// signs with a decision record (approve, modify, override or defer, with
// concerns and what would make this wrong), the letter names them and is
// frozen once signed, and only a signed reply is sent. By keyboard; the
// focus never falls to the page's body.
import { expect, test, type Page } from "@playwright/test";
import { strings as agentStrings } from "../src/agent/i18n";
import { workflowStrings } from "../src/workflow/i18n";
import { cell, expectNoSeriousViolations, open, pick, viewParam } from "./helpers";

const w = workflowStrings.en;
/** A general complaint under legal review, upheld, signed by V. Izotova. */
const REVIEW_CASE = "C-001114";
/** A general complaint at signature, upheld, signed by V. Izotova. */
const SIGN_CASE = "C-001062";

const letterPanel = (page: Page) => page.locator(".letter-panel");
const letter = (page: Page) => letterPanel(page).locator(".letter blockquote");
const work = (page: Page) => page.locator(".case-work");
const lastEntry = (page: Page) => work(page).locator(".stoa-timeline__entry").last();
/** The confirmation: Stoa's AlertDialog (a toast has the role alertdialog too). */
const confirmation = (page: Page) => page.locator('section.stoa-dialog[role="alertdialog"]');
const bodyHasFocus = (page: Page) => page.evaluate(() => document.activeElement === document.body);

async function openAs(page: Page, id: string, role: string, query = "") {
  const params = new URLSearchParams(query);
  if (!params.has("lang")) params.set("lang", "en");
  params.set("case", id);
  params.set("role", role);
  params.set("colleague", "off");
  await page.goto(`/?${params}`);
  await expect(letterPanel(page)).toBeVisible({ timeout: 15_000 });
}

/** Chooses a decision as a person does, by its label: the radio button
 * itself is drawn under its circle. */
async function chooseDecision(page: Page, decision: keyof typeof w.signature.decisions) {
  const group = letterPanel(page).getByRole("radiogroup", { name: w.signature.decision });
  await group.getByText(w.signature.decisions[decision], { exact: true }).click();
  await expect(group.getByRole("radio", { name: w.signature.decisions[decision] })).toBeChecked();
}

/** Opens the editor, puts `edit(text)` in it and saves. */
async function editLetter(page: Page, edit: (text: string) => string, words = w) {
  await letterPanel(page).getByRole("button", { name: words.review.edit }).click();
  const box = page.getByRole("dialog");
  const field = box.getByLabel(words.review.editLabel);
  await expect(field).toBeFocused();
  await field.fill(edit(await field.inputValue()));
  await box.getByRole("button", { name: words.review.save }).click();
  await expect(box).toBeHidden();
}

test("the reviewer reads the letter, what the rubric finds and the changes; edits it; the diff and the journal follow", async ({ page }) => {
  await openAs(page, REVIEW_CASE, "reviewer");
  await expect(letterPanel(page)).toContainText(w.letter.fromRegister);
  await expect(letter(page)).toContainText("We find your complaint justified.");
  await expect(letterPanel(page).locator(".letter__signatory")).toHaveText(w.letter.toBeSigned("V. Izotova", w.letter.position));
  await expect(letterPanel(page)).toContainText(w.review.diffNone);
  await expect(letterPanel(page)).toContainText(agentStrings.en.rubric.clean);
  // Unchanged: refused, and said.
  await letterPanel(page).getByRole("button", { name: w.review.edit }).click();
  const box = page.getByRole("dialog", { name: `Edit the letter of ${REVIEW_CASE}` });
  await box.getByRole("button", { name: w.review.save }).click();
  await expect(box.getByRole("alert")).toHaveText(w.review.errors["letter-unchanged"]);
  await page.keyboard.press("Escape");
  await expect(box).toBeHidden();
  // The editor gives the focus back to Edit the letter.
  await expect(letterPanel(page).getByRole("button", { name: w.review.edit })).toBeFocused();
  await editLetter(page, (text) => `${text}\nWe apologise for the delay in our answer.`);
  await expect(letterPanel(page).getByRole("button", { name: w.review.edit })).toBeFocused();
  await expect(letter(page)).toContainText("We apologise for the delay in our answer.");
  await expect(letterPanel(page)).toContainText("Edited by Reviewer K. Saburova");
  // Stoa's share of changed characters over both texts, and under it the
  // share the measure of light edits counts, which is the desk's own.
  await expect(letterPanel(page).locator(".stoa-diff__summary")).toHaveText(/of the characters changed: 0 deleted and 42 inserted, out of 586 in the two texts together\.$/);
  await expect(letterPanel(page)).toContainText("For the measure of light edits: 42 of the draft's 272 characters changed (15%), counting the longer side of each changed passage.");
  await expect(letterPanel(page).getByRole("figure", { name: w.review.diffCaption }).locator(".stoa-diff__text ins")).toContainText("We apologise for the delay in our answer.");
  await expect(lastEntry(page)).toContainText(w.action.edit);
  await expect(lastEntry(page)).toContainText("Reviewer K. Saburova");
});

test("a letter that leaves the decision open is not approved; the decided one goes to signature", async ({ page }) => {
  await openAs(page, REVIEW_CASE, "reviewer");
  await editLetter(page, (text) => `${text}\n${agentStrings.en.reply.outcome.pending}`);
  await work(page).getByRole("button", { name: w.act.approve }).click();
  await expect(work(page).getByRole("alert")).toContainText(w.letterRefusal["letter-undecided"]);
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Legal review");
  await editLetter(page, (text) => text.replace(`\n${agentStrings.en.reply.outcome.pending}`, ""));
  const approve = work(page).getByRole("button", { name: w.act.approve });
  await approve.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Awaiting signature");
  expect(await bodyHasFocus(page)).toBe(false);
});

test("the signatory signs with a decision record: what would make this wrong is asked for, the letter is frozen and names them, and only then is it sent", async ({ page }) => {
  await openAs(page, SIGN_CASE, "signatory", "sendDelay=1");
  await expect(letterPanel(page)).toContainText(w.signature.basis.slice(0, 40));
  // Send is not offered before the signature.
  await expect(work(page).getByRole("button", { name: w.act.send })).toHaveCount(0);
  await expect(page.getByRole("button", { name: w.dispatch.dispatch, exact: true })).toHaveCount(0);
  const form = letterPanel(page);
  await form.getByRole("button", { name: w.signature.sign }).click();
  await expect(form.getByRole("alert")).toHaveText(w.signature.errors["wrong-required"]("10"));
  // A modification needs the signatory's own edit first.
  await chooseDecision(page, "modify");
  await form.getByLabel(w.signature.concerns).fill("The tone is too formal for this client.");
  await form.getByLabel(w.signature.wrong).fill("The client has already been answered by phone.");
  await form.getByRole("button", { name: w.signature.sign }).click();
  await expect(form.getByRole("alert")).toHaveText(w.signature.errors["edit-first"]);
  await editLetter(page, (text) => text.replace("Dear client,", "Dear Sir or Madam,"));
  await form.getByRole("button", { name: w.signature.sign }).click();
  // Signed: the panel's heading takes the focus; the letter is frozen.
  await expect(form.getByRole("heading", { name: w.letter.signedPanel })).toBeFocused();
  await expect(form).toContainText(w.signature.frozen);
  await expect(form.locator(".letter__signatory")).toContainText("Signed by V. Izotova, authorised person of the bank, Oct 6, 2026");
  await expect(form).toContainText("Decision: Modify");
  await expect(form).toContainText("Concerns: The tone is too formal for this client.");
  await expect(form.getByRole("button", { name: w.review.edit })).toHaveCount(0);
  await expect(letter(page)).toContainText("Dear Sir or Madam,");
  await expect(lastEntry(page)).toContainText(w.action.sign);
  await expect(lastEntry(page)).toContainText("Decision: Modify");
  await expect(lastEntry(page)).toContainText("What would make this wrong: The client has already been answered by phone.");
  // A signed letter is not returned; it is dispatched.
  await expect(work(page).getByRole("button", { name: w.act.return })).toHaveCount(0);
  await page.getByRole("button", { name: w.dispatch.dispatch, exact: true }).click();
  await confirmation(page).getByRole("button", { name: w.dispatch.confirm, exact: true }).click();
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Reply sent", { timeout: 10_000 });
  await expect(lastEntry(page)).toContainText("Sent");
  await expect(letterPanel(page).locator(".letter__signatory")).toContainText("Signed by V. Izotova");
});

test("a deferred signature keeps the case at signature, with the concerns in the journal", async ({ page }) => {
  await openAs(page, SIGN_CASE, "signatory");
  const form = letterPanel(page);
  await chooseDecision(page, "defer");
  await form.getByLabel(w.signature.wrong).fill("The facts from operations would show a fee was due.");
  await form.getByRole("button", { name: w.signature.defer }).click();
  await expect(form.getByRole("alert")).toHaveText(w.signature.errors["concerns-required"]("10"));
  await form.getByLabel(w.signature.concerns).fill("The facts from operations are not in yet.");
  await form.getByRole("button", { name: w.signature.defer }).click();
  await expect(form.getByRole("heading", { name: w.letter.panel })).toBeFocused();
  await expect(form).toContainText(w.signature.deferrals);
  await expect(form).toContainText("Concerns: The facts from operations are not in yet.");
  await expect(page.locator(".stoa-detail-header__status")).toContainText("Awaiting signature");
  await expect(lastEntry(page)).toContainText(w.action.defer);
});

test("the decision is one radio group, each option with what it means; the record takes several lines; all by keyboard", async ({ page }) => {
  await openAs(page, SIGN_CASE, "signatory");
  const form = letterPanel(page);
  const group = form.getByRole("radiogroup", { name: w.signature.decision });
  for (const d of ["approve", "modify", "override", "defer"] as const)
    await expect(group.getByRole("radio", { name: w.signature.decisions[d] })).toHaveAccessibleDescription(w.signature.decisionHelp[d]);
  const concerns = form.getByRole("textbox", { name: w.signature.concerns });
  const wrong = form.getByRole("textbox", { name: w.signature.wrong });
  expect(await concerns.evaluate((el) => el.tagName)).toBe("TEXTAREA");
  expect(await wrong.evaluate((el) => el.tagName)).toBe("TEXTAREA");
  await expect(concerns).toHaveAccessibleDescription(w.signature.concernsHelp("10"));
  await expect(wrong).toHaveAccessibleDescription(w.signature.wrongHelp("10"));
  // Signing with nothing said: refused, and the field it names is marked.
  await form.getByRole("button", { name: w.signature.sign }).click();
  await expect(form.getByRole("alert")).toHaveText(w.signature.errors["wrong-required"]("10"));
  await expect(wrong).toHaveAttribute("aria-invalid", "true");
  await expect(concerns).not.toHaveAttribute("aria-invalid", "true");
  // One tab stop, on the chosen option; the arrows move and choose.
  await group.getByRole("radio", { name: w.signature.decisions.approve }).focus();
  for (const d of ["modify", "override", "defer"] as const) {
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio", { name: w.signature.decisions[d] })).toBeFocused();
    await expect(group.getByRole("radio", { name: w.signature.decisions[d] })).toBeChecked();
  }
  await expect(form.getByRole("button", { name: w.signature.defer })).toBeVisible();
  // Tab goes on to the concerns, where Enter starts a new line, then to
  // what would make this wrong, then to the button.
  await page.keyboard.press("Tab");
  await expect(concerns).toBeFocused();
  await page.keyboard.type("The facts from operations are not in yet.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Antifraud has not answered either.");
  await expect(concerns).toHaveValue("The facts from operations are not in yet.\nAntifraud has not answered either.");
  await page.keyboard.press("Tab");
  await expect(wrong).toBeFocused();
  await page.keyboard.type("Operations confirm the fee was due.");
  await page.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: w.signature.defer })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(form.getByRole("heading", { name: w.letter.panel })).toBeFocused();
  // The journal keeps the record on its three lines, the break as a space.
  await expect(lastEntry(page)).toContainText(w.action.defer);
  await expect(lastEntry(page)).toContainText("Concerns: The facts from operations are not in yet. Antifraud has not answered either.");
  await expect(lastEntry(page)).toContainText("What would make this wrong: Operations confirm the fee was due.");
  expect(await bodyHasFocus(page)).toBe(false);
});

test("in the queue a reply is not sent before it is signed", async ({ page }) => {
  await open(page, `role=signatory&view=${viewParam({ search: SIGN_CASE, columns: ["id", "client", "stage"] })}`, "1 of 1,200 cases");
  await pick(page, 0, 3, "Reply sent");
  await expect(page.getByRole("grid").getByRole("alert")).toHaveText(w.letterRefusal["letter-not-signed"]);
  await page.keyboard.press("Escape");
  await expect(cell(page, 0, 3)).toContainText("Awaiting signature");
});

for (const lang of ["ru", "en"] as const)
  for (const theme of ["light", "dark"])
    test(`axe: the review with the letter, findings and changes, and the signature with its record (${lang}, ${theme})`, async ({ page }) => {
      const words = workflowStrings[lang];
      await openAs(page, REVIEW_CASE, "reviewer", `lang=${lang}&theme=${theme}`);
      await editLetter(page, (text) => `${text}\n${lang === "en" ? "We apologise for the delay." : "Приносим извинения за задержку."}`, words);
      await expect(letterPanel(page).locator(".stoa-diff")).toBeVisible();
      await expectNoSeriousViolations(page, "review", { lang, theme });
      await openAs(page, SIGN_CASE, "signatory", `lang=${lang}&theme=${theme}`);
      await letterPanel(page).getByRole("button", { name: words.signature.sign }).click();
      await expect(letterPanel(page).getByRole("alert")).toBeVisible();
      await expectNoSeriousViolations(page, "signature", { lang, theme });
    });

test("on a phone the review and the signature fit without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["ru", "en"] as const) {
    for (const [id, role] of [
      [REVIEW_CASE, "reviewer"],
      [SIGN_CASE, "signatory"],
    ] as const) {
      await openAs(page, id, role, `lang=${lang}`);
      const sideways = await page.evaluate(() => {
        const region = document.querySelector(".stoa-page-shell__scroll")!;
        return [document.documentElement.scrollWidth - document.documentElement.clientWidth, region.scrollWidth - region.clientWidth];
      });
      expect(sideways, `${lang} ${role}`).toEqual([0, 0]);
    }
  }
});
