// The assistant's handover on the case: recorded only once a person
// confirmed it (in the run, or with Confirm the handover), as the
// operator, with a draft; the case moves to legal review, the journal names
// the assistant and the person, and the draft is kept with the case.
import { describe, expect, it } from "vitest";
import { Stage, caseJournal, generateAll } from "@ariadne/grid";
import { generatePlan, type LogEntry, type ReplyDraft } from "@ariadne/runner";
import { caseBrief } from "../case/brief";
import { confirmedInRun, handoverState, recordHandover, type CaseFiles } from "./caseFile";

const fresh = () => generateAll(20261006, 1_200, 400);
const AT = Date.UTC(2026, 9, 6, 9);

function draftOf(store: ReturnType<typeof fresh>, row: number): ReplyDraft {
  const draft = generatePlan(7, caseBrief(store, row)).find((s) => s.type === "draft_reply")!.draft;
  if (draft.kind !== "reply") throw new Error("not a reply");
  return draft;
}

describe("the handover", () => {
  it("counts as confirmed in the run only with a person's confirm of that step", () => {
    const log: LogEntry[] = [
      { at: 1, kind: "decision", stepId: "s3", command: "confirm" },
      { at: 2, kind: "decision", stepId: "s5", command: "skip" },
    ];
    expect(confirmedInRun(log, "s3")).toBe(true);
    expect(confirmedInRun(log, "s5")).toBe(false);
    expect(confirmedInRun([], "s5")).toBe(false);
  });

  it("asks for a person while the case is before review, the role is the case's operator and a draft was written", () => {
    const store = fresh();
    const files: CaseFiles = new Map();
    const row = Array.from({ length: store.size }, (_, i) => i).find((i) => store.stage[i] === Stage.Registered)!;
    const draft = draftOf(store, row);
    expect(handoverState({ store, row, files, run: 1, draft, operator: true })).toEqual({ kind: "confirm" });
    expect(handoverState({ store, row, files, run: 1, draft, operator: false })).toEqual({ kind: "not-operator" });
    expect(handoverState({ store, row, files, run: 1, draft: null, operator: true })).toEqual({ kind: "no-draft" });
    const review = Array.from({ length: store.size }, (_, i) => i).find((i) => store.stage[i] === Stage.LegalReview)!;
    expect(handoverState({ store, row: review, files, run: 1, draft, operator: true })).toEqual({ kind: "already", stage: Stage.LegalReview });
  });

  it("once confirmed, moves the case to legal review, journals the assistant and the person, and keeps the draft; the run's log is not touched", () => {
    const store = fresh();
    const files: CaseFiles = new Map();
    const row = Array.from({ length: store.size }, (_, i) => i).find((i) => store.stage[i] === Stage.WaitingForFacts)!;
    const draft = draftOf(store, row);
    const result = recordHandover(store, row, files, { draft, run: 42, person: 0, at: AT });
    expect("entry" in result).toBe(true);
    expect(store.stage[row]).toBe(Stage.LegalReview);
    expect(caseJournal(store, row).at(-1)).toMatchObject({
      action: "hand_over",
      from: Stage.WaitingForFacts,
      to: Stage.LegalReview,
      actor: { kind: "assistant", confirmedBy: { role: "operator", person: 0 } },
    });
    expect(files.get(row)?.draft).toEqual({ by: "assistant", at: AT, run: 42, reply: draft, confirmedBy: { role: "operator", person: 0 } });
    expect(handoverState({ store, row, files, run: 42, draft, operator: true }).kind).toBe("recorded");
    // Another run after a return for rework is a new handover.
    expect(handoverState({ store, row, files, run: 43, draft, operator: true }).kind).toBe("already");
    // A second record of a case already under review is refused, and changes nothing.
    const again = recordHandover(store, row, files, { draft, run: 43, person: 0, at: AT + 1 });
    expect(again).toEqual({ error: { code: "transition-not-allowed" } });
    expect(files.get(row)?.draft?.run).toBe(42);
  });
});
