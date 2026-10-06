// The letter's edits and its signature with the decision record: an edit
// is journaled and refused once signed; "what would make this wrong" is
// always asked for, the concerns unless approved as proposed; approval as
// proposed after one's own edit is a modification; a letter that leaves
// the decision open is not signed; the signed text is frozen.
import { describe, expect, it } from "vitest";
import { Stage, caseJournal, generateAll } from "@ariadne/grid";
import { strings as agentStrings } from "../agent/i18n";
import { makeFmt } from "../agent/format";
import type { Text } from "../agent/text";
import { POOLS } from "../data/query";
import { checkRecord, deferSignature, parseDecisionComment, recordEdit, signLetter, type CaseFiles } from "./caseFile";
import { cameToSignature, currentLetter, draftText, isUndecided } from "./letter";

const AT = Date.UTC(2026, 9, 6, 9);
const x: Text = { t: agentStrings.en, f: makeFmt("en-US"), labels: POOLS.en.labels, lang: "en" };
const setup = () => {
  const store = generateAll(20261006, 1_200, 400);
  const files: CaseFiles = new Map();
  const row = Array.from({ length: store.size }, (_, i) => i).find((i) => store.stage[i] === Stage.AwaitingSignature && store.outcome[i] === 1)!;
  return { store, files, row };
};
const record = (decision: "approve" | "modify" | "override", concerns = "", wrong = "The client was answered before.") => ({ decision, concerns, wrong });

describe("the letter", () => {
  it("is the assistant's draft with the register's decision until a person edits it; the placeholder of an open decision is found in either language", () => {
    const { store, files, row } = setup();
    const letter = currentLetter(x, store, row, files);
    expect(letter.edit).toBeNull();
    expect(letter.text).toContain("We find your complaint justified.");
    expect(draftText(x, store, row, files)).toBe(letter.text);
    expect(isUndecided(letter.text)).toBe(false);
    expect(isUndecided(`a\n${agentStrings.ru.reply.outcome.pending}`)).toBe(true);
    expect(isUndecided(agentStrings.en.reply.outcome.pending)).toBe(true);
  });

  it("an edit is kept with its author and language and journaled; an unchanged or empty one is refused", () => {
    const { store, files, row } = setup();
    const current = currentLetter(x, store, row, files).text;
    expect(recordEdit(store, row, files, { text: current, current, lang: "en", role: "signatory", person: 0, at: AT })).toEqual({ code: "letter-unchanged" });
    expect(recordEdit(store, row, files, { text: "  ", current, lang: "en", role: "signatory", person: 0, at: AT })).toEqual({ code: "letter-empty" });
    expect(recordEdit(store, row, files, { text: `${current}\r\nThank you.`, current, lang: "en", role: "signatory", person: 0, at: AT })).toBeNull();
    const letter = currentLetter(x, store, row, files);
    expect(letter.text.endsWith("\nThank you.")).toBe(true);
    expect(letter.edit?.by).toEqual({ role: "signatory", person: 0 });
    expect(caseJournal(store, row).at(-1)).toMatchObject({ action: "edit", from: Stage.AwaitingSignature, to: Stage.AwaitingSignature });
  });
});

describe("the signature", () => {
  it("asks for what would make this wrong always, and the concerns unless approved as proposed", () => {
    expect(checkRecord({ decision: "approve", concerns: "", wrong: "short" })).toEqual({ code: "wrong-required", min: 10 });
    expect(checkRecord({ decision: "approve", concerns: "", wrong: "The fee was due after all." })).toBeNull();
    expect(checkRecord({ decision: "defer", concerns: "", wrong: "The fee was due after all." })).toEqual({ code: "concerns-required", min: 10 });
    expect(checkRecord({ decision: "override", concerns: "x".repeat(1001), wrong: "The fee was due after all." })).toEqual({ code: "record-too-long", max: 1000 });
  });

  it("refuses an approval after one's own edit, and a modification without one; signs and freezes the text, once", () => {
    const { store, files, row } = setup();
    const since = cameToSignature(store, row)!;
    expect(since).toBeGreaterThan(0);
    const sign = (r: ReturnType<typeof record>, undecided = false) =>
      signLetter(store, row, files, { record: r, text: currentLetter(x, store, row, files).text, lang: "en", undecided, person: 0, at: AT + 10_000, since });
    expect(sign(record("modify", "Too formal for this client."))).toEqual({ code: "edit-first" });
    const current = currentLetter(x, store, row, files).text;
    recordEdit(store, row, files, { text: `${current}\nThank you.`, current, lang: "en", role: "signatory", person: 0, at: AT });
    expect(sign(record("approve"))).toEqual({ code: "edited-so-modify" });
    expect(sign(record("modify", "Too formal for this client."), true)).toEqual({ code: "letter-undecided" });
    expect(sign(record("modify", "Too formal for this client."))).toBeNull();
    const signed = files.get(row)!.signature!;
    expect(signed).toMatchObject({ decision: "modify", concerns: "Too formal for this client.", by: { role: "signatory", person: 0 }, lang: "en" });
    expect(signed.text.endsWith("\nThank you.")).toBe(true);
    expect(currentLetter(x, store, row, files)).toMatchObject({ signed: true, text: signed.text });
    expect(caseJournal(store, row).at(-1)).toMatchObject({ action: "sign", actor: { kind: "person", role: "signatory", person: 0 } });
    expect(parseDecisionComment(caseJournal(store, row).at(-1)?.comment)).toEqual({ decision: "modify", concerns: "Too formal for this client.", wrong: "The client was answered before." });
    // Frozen: no more edits, no second signature.
    expect(recordEdit(store, row, files, { text: "Other", current: signed.text, lang: "en", role: "signatory", person: 0, at: AT })).toEqual({ code: "letter-signed" });
    expect(sign(record("approve"))).toEqual({ code: "letter-signed" });
  });

  it("a deferral keeps the case at signature, with the record; a case not at signature is not signed", () => {
    const { store, files, row } = setup();
    expect(deferSignature(store, row, files, { concerns: "Facts are not in yet.", wrong: "Operations confirm the fee was due.", person: 0, at: AT })).toBeNull();
    expect(store.stage[row]).toBe(Stage.AwaitingSignature);
    expect(files.get(row)?.deferrals).toHaveLength(1);
    expect(caseJournal(store, row).at(-1)).toMatchObject({ action: "defer" });
    const review = Array.from({ length: store.size }, (_, i) => i).find((i) => store.stage[i] === Stage.LegalReview)!;
    expect(signLetter(store, review, files, { record: record("approve"), text: "x", lang: "en", undecided: false, person: 0, at: AT, since: 0 })).toEqual({ code: "not-awaiting-signature" });
  });
});
