// What the desk keeps with a case beyond the register's columns: the draft
// the assistant handed over (its codes, as the engine drafted them, so the
// reviewer reads it in either language), the edits of the letter, the
// signature with its decision record, and deferred signatures. Kept for as
// long as the page is open, like the register's changes.
import { Stage, appendJournal, applyTransition, type ColumnStore, type JournalEntry, type Role, type TransitionError } from "@ariadne/grid";
import type { Lang } from "../i18n";
import type { LogEntry, ReplyDraft } from "@ariadne/runner";

export type RecordedDraft = {
  by: "assistant";
  /** Epoch milliseconds of the handover. */
  at: number;
  /** The run it came from: when that run started. */
  run: number;
  reply: ReplyDraft;
  confirmedBy: { role: Role; person: number };
};

/** The letter as a person wrote it over the draft, in the language they
 * wrote it in. */
export type LetterEdit = { at: number; by: { role: Role; person: number }; text: string; lang: Lang };

/** The signatory's decision on the letter: as proposed, with their own
 * changes, replacing what was proposed, or not now. */
export const SIGN_DECISIONS = ["approve", "modify", "override", "defer"] as const;
export type SignDecision = (typeof SIGN_DECISIONS)[number];

/** The decision record of a signature or of a deferral: the decision, the
 * signatory's concerns and what would make the decision wrong. */
export type DecisionRecord = { decision: SignDecision; concerns: string; wrong: string };

/** The signed letter: its text, frozen, and who signed it, when and why. */
export type Signature = DecisionRecord & {
  decision: Exclude<SignDecision, "defer">;
  at: number;
  by: { role: "signatory"; person: number };
  text: string;
  lang: Lang;
};

export type Deferral = DecisionRecord & { decision: "defer"; at: number; by: { role: "signatory"; person: number } };

export type CaseFile = { draft?: RecordedDraft; edits?: LetterEdit[]; signature?: Signature; deferrals?: Deferral[] };

export type CaseFiles = Map<number, CaseFile>;

/** Whether a person confirmed this step in the run itself. */
export function confirmedInRun(log: readonly LogEntry[], stepId: string): boolean {
  return log.some((e) => e.kind === "decision" && e.stepId === stepId && e.command === "confirm");
}

/** Where the assistant's handover stands for the case. */
export type HandoverState =
  | { kind: "recorded"; draft: RecordedDraft }
  | { kind: "no-draft" }
  | { kind: "not-operator" }
  | { kind: "already"; stage: number }
  | { kind: "confirm" };

export function handoverState(input: {
  store: ColumnStore;
  row: number;
  files: CaseFiles;
  run: number;
  draft: ReplyDraft | null;
  /** The page's role acts on the case as its operator. */
  operator: boolean;
}): HandoverState {
  const recorded = input.files.get(input.row)?.draft;
  if (recorded && recorded.run === input.run) return { kind: "recorded", draft: recorded };
  if (!input.draft) return { kind: "no-draft" };
  const stage = input.store.stage[input.row] ?? 0;
  if (stage >= Stage.LegalReview) return { kind: "already", stage };
  if (!input.operator) return { kind: "not-operator" };
  return { kind: "confirm" };
}

/** Records the handover a person confirmed: the case moves to legal review
 * (the assistant's entry names the person), and the draft is kept with
 * the case. The run's own log is not touched. */
export function recordHandover(
  store: ColumnStore,
  row: number,
  files: CaseFiles,
  input: { draft: ReplyDraft; run: number; person: number; at: number },
): { entry: JournalEntry } | { error: TransitionError } {
  const confirmedBy = { role: "operator" as const, person: input.person };
  const result = applyTransition(store, row, "hand_over", { role: "operator", actor: { kind: "assistant", confirmedBy }, at: input.at });
  if ("entry" in result) files.set(row, { ...files.get(row), draft: { by: "assistant", at: input.at, run: input.run, reply: input.draft, confirmedBy } });
  return result;
}

/** The concerns and "what would make this wrong" are the signatory's own
 * words: at least this many characters where they are asked for. */
export const RECORD_MIN = 10;
export const RECORD_MAX = 1000;
export const LETTER_MAX = 6000;

export type LetterError =
  | { code: "letter-empty" }
  | { code: "letter-too-long"; max: number; length: number }
  | { code: "letter-unchanged" }
  | { code: "letter-signed" };

export type SignError =
  | { code: "not-awaiting-signature" }
  | { code: "letter-signed" }
  | { code: "wrong-required"; min: number }
  | { code: "concerns-required"; min: number }
  | { code: "record-too-long"; max: number }
  | { code: "edit-first" }
  | { code: "edited-so-modify" }
  | { code: "letter-undecided" };

/** The edits made since the case last came to signature: the signatory's
 * own changes to the letter. */
export function signatoryEdits(file: CaseFile | undefined, since: number): LetterEdit[] {
  return (file?.edits ?? []).filter((e) => e.by.role === "signatory" && e.at >= since);
}

/** Records an edit of the letter, with its journal entry; refused once
 * the letter is signed, or when nothing changed. */
export function recordEdit(
  store: ColumnStore,
  row: number,
  files: CaseFiles,
  input: { text: string; current: string; lang: Lang; role: Role; person: number; at: number },
): LetterError | null {
  const file = files.get(row);
  if (file?.signature) return { code: "letter-signed" };
  const text = input.text.replace(/\r\n?/g, "\n").trim();
  if (text === "") return { code: "letter-empty" };
  if (text.length > LETTER_MAX) return { code: "letter-too-long", max: LETTER_MAX, length: text.length };
  if (text === input.current.trim()) return { code: "letter-unchanged" };
  const stage = store.stage[row] ?? 0;
  files.set(row, { ...file, edits: [...(file?.edits ?? []), { at: input.at, by: { role: input.role, person: input.person }, text, lang: input.lang }] });
  appendJournal(store, row, { at: input.at, action: "edit", from: stage, to: stage, actor: { kind: "person", role: input.role, person: input.person } });
  return null;
}

/** Checks a decision record: "what would make this wrong" always, the
 * concerns for anything but an approval as proposed. */
export function checkRecord(record: DecisionRecord): SignError | null {
  const wrong = record.wrong.trim();
  const concerns = record.concerns.trim();
  if (wrong.length > RECORD_MAX || concerns.length > RECORD_MAX) return { code: "record-too-long", max: RECORD_MAX };
  if (wrong.length < RECORD_MIN) return { code: "wrong-required", min: RECORD_MIN };
  if (record.decision !== "approve" && concerns.length < RECORD_MIN) return { code: "concerns-required", min: RECORD_MIN };
  return null;
}

/** Signs the letter as it stands, with the decision record: the text is
 * frozen with the signature, and the journal says who signed, when and
 * with what decision. An approval as proposed is refused when the
 * signatory changed the letter (that is a modification), and a
 * modification or an override when they did not; a letter that still
 * leaves the decision open is not signed. `since` is when the case last
 * came to signature. */
export function signLetter(
  store: ColumnStore,
  row: number,
  files: CaseFiles,
  input: { record: DecisionRecord & { decision: Exclude<SignDecision, "defer"> }; text: string; lang: Lang; undecided: boolean; person: number; at: number; since: number },
): SignError | null {
  if ((store.stage[row] ?? 0) !== Stage.AwaitingSignature) return { code: "not-awaiting-signature" };
  const file = files.get(row);
  if (file?.signature) return { code: "letter-signed" };
  const record = checkRecord(input.record);
  if (record) return record;
  const edited = signatoryEdits(file, input.since).length > 0;
  if (input.record.decision === "approve" && edited) return { code: "edited-so-modify" };
  if (input.record.decision !== "approve" && !edited) return { code: "edit-first" };
  if (input.undecided) return { code: "letter-undecided" };
  const by = { role: "signatory" as const, person: input.person };
  const signature: Signature = {
    decision: input.record.decision,
    concerns: input.record.concerns.trim(),
    wrong: input.record.wrong.trim(),
    at: input.at,
    by,
    text: input.text,
    lang: input.lang,
  };
  files.set(row, { ...file, signature });
  appendJournal(store, row, { at: input.at, action: "sign", from: Stage.AwaitingSignature, to: Stage.AwaitingSignature, actor: { kind: "person", ...by }, comment: decisionComment(signature) });
  return null;
}

/** Defers the signature, with the decision record; the letter stays as it
 * is, at signature. */
export function deferSignature(
  store: ColumnStore,
  row: number,
  files: CaseFiles,
  input: { concerns: string; wrong: string; person: number; at: number },
): SignError | null {
  if ((store.stage[row] ?? 0) !== Stage.AwaitingSignature) return { code: "not-awaiting-signature" };
  const file = files.get(row);
  if (file?.signature) return { code: "letter-signed" };
  const record: DecisionRecord = { decision: "defer", concerns: input.concerns, wrong: input.wrong };
  const error = checkRecord(record);
  if (error) return error;
  const by = { role: "signatory" as const, person: input.person };
  const deferral: Deferral = { decision: "defer", concerns: input.concerns.trim(), wrong: input.wrong.trim(), at: input.at, by };
  files.set(row, { ...file, deferrals: [...(file?.deferrals ?? []), deferral] });
  appendJournal(store, row, { at: input.at, action: "defer", from: Stage.AwaitingSignature, to: Stage.AwaitingSignature, actor: { kind: "person", ...by }, comment: decisionComment(deferral) });
  return null;
}

/** The decision record as the journal keeps it: three lines, the
 * decision's code, the concerns (empty when none) and what would make it
 * wrong. */
export function decisionComment(record: DecisionRecord): string {
  return [record.decision, record.concerns.replace(/\s+/g, " "), record.wrong.replace(/\s+/g, " ")].join("\n");
}

/** A journal comment back into its decision record, or null. */
export function parseDecisionComment(comment: string | undefined): DecisionRecord | null {
  const [decision, concerns = "", wrong = ""] = (comment ?? "").split("\n");
  return (SIGN_DECISIONS as readonly string[]).includes(decision ?? "") ? { decision: decision as SignDecision, concerns, wrong } : null;
}

/** A return for rework discards an unsigned letter's signature state: the
 * case goes back to drafting with the edits kept. A signed letter is not
 * returned. */
export function canReturn(file: CaseFile | undefined): boolean {
  return !file?.signature;
}
