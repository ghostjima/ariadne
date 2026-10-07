// What the desk keeps with a case beyond the register's columns: the draft
// the assistant handed over (its codes, as the engine drafted them, so the
// reviewer reads it in either language). Kept for as long as the page is
// open, like the register's changes.
import { Stage, applyTransition, type ColumnStore, type JournalEntry, type Role, type TransitionError } from "@ariadne/grid";
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

export type CaseFile = { draft?: RecordedDraft };

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
