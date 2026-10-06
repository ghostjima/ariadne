import { beforeEach, describe, expect, it } from "vitest";
import { AS_OF, Outcome, Stage } from "../src/schema.js";
import { generateAll } from "../src/generator.js";
import { EditHistory } from "../src/history.js";
import { dayNumber } from "../src/days.js";
import { dayOf, getNote, writeField, writeNote, type ColumnStore } from "../src/store.js";
import { storeDigest } from "./digest.js";

const NOW = Date.UTC(2026, 9, 6, 12, 30);

let store: ColumnStore;
let history: EditHistory;

beforeEach(() => {
  store = generateAll(20261006, 1_200, 400);
  history = new EditHistory();
});

function rowsWhere(pred: (i: number) => boolean, limit = 50): number[] {
  const out: number[] = [];
  for (let i = 0; i < store.size && out.length < limit; i++) if (pred(i)) out.push(i);
  return out;
}

describe("bulk reassignment with undo", () => {
  it("assigns many cases to one person and undoes it exactly", () => {
    const before = storeDigest(store);
    const rows = rowsWhere((i) => store.assignee[i] !== 5, 40);
    const r = history.setField(store, rows, "assignee", 5, "supervisor", NOW);
    expect(r.applied).toHaveLength(40);
    expect(r.rejected).toEqual([]);
    for (const i of rows) expect([store.assignee[i], store.updatedAt[i]]).toEqual([5, dayOf(NOW)]);
    const u = history.undo(store);
    expect(u?.restored).toHaveLength(40);
    expect(u?.conflicts).toHaveLength(0);
    expect(storeDigest(store)).toBe(before);
    expect(history.undo(store)).toBeNull();
  });

  it("refuses what the role may not do and applies the rest", () => {
    expect(history.setField(store, [1, 2], "assignee", 5, "operator", NOW).rejected).toEqual([
      { row: 1, error: { code: "role-cannot-edit", column: "assignee" } },
      { row: 2, error: { code: "role-cannot-edit", column: "assignee" } },
    ]);
    expect(history.setField(store, [0], "assignee", 99, "supervisor", NOW).rejected[0]?.error).toEqual({ code: "value-unknown" });
    expect(history.size).toBe(0);
  });
});

describe("stage changes", () => {
  it("refuses legal review for drafts without a decision or with a refusal and no ground, and moves the rest", () => {
    const pending = rowsWhere((i) => store.stage[i] === Stage.Drafting && store.outcome[i] === Outcome.Pending, 3);
    const noGround = rowsWhere((i) => store.stage[i] === Stage.Drafting && store.outcome[i] === Outcome.Refused && store.ground[i] === 0, 2);
    const ready = rowsWhere((i) => store.stage[i] === Stage.Drafting && store.outcome[i] === Outcome.Upheld, 3);
    expect([pending.length, noGround.length, ready.length].every((n) => n > 0)).toBe(true);
    const r = history.setField(store, [...pending, ...noGround, ...ready], "stage", Stage.LegalReview, "supervisor", NOW);
    expect(Array.from(r.applied)).toEqual(ready);
    expect(r.rejected).toEqual([
      ...pending.map((row) => ({ row, error: { code: "reply-needs-outcome" } })),
      ...noGround.map((row) => ({ row, error: { code: "refusal-needs-ground" } })),
    ]);
  });

  it("a reply that goes out is sent on the day the data is taken; undo takes the day back", () => {
    const row = rowsWhere((i) => store.stage[i] === Stage.AwaitingSignature)[0]!;
    const before = storeDigest(store);
    history.setField(store, [row], "stage", Stage.Sent, "signatory", NOW);
    expect(store.sentOn[row]).toBe(dayNumber(AS_OF));
    history.undo(store);
    expect(store.sentOn[row]).toBe(-1);
    expect(storeDigest(store)).toBe(before);
  });

  it("undoes in reverse order across overlapping edits", () => {
    const before = storeDigest(store);
    const rows = rowsWhere((i) => store.stage[i] === Stage.Registered, 4);
    history.setField(store, rows.slice(0, 3), "stage", Stage.WaitingForFacts, "operator", NOW);
    history.setField(store, rows.slice(1), "stage", Stage.Drafting, "operator", NOW);
    history.setNote(store, rows[2]!, { kind: "text", text: "checked" }, "operator", NOW);
    expect(history.size).toBe(3);
    history.undo(store);
    history.undo(store);
    expect(store.stage[rows[1]!]).toBe(Stage.WaitingForFacts);
    history.undo(store);
    expect(storeDigest(store)).toBe(before);
    expect(store.noteEdits.size).toBe(0);
  });

  it("leaves rows a colleague changed since, and reports them", () => {
    const rows = rowsWhere((i) => store.stage[i] === Stage.Registered, 3);
    history.setField(store, rows, "stage", Stage.WaitingForFacts, "operator", NOW);
    expect(history.peek()?.kind).toBe("field");
    writeField(store, rows[1]!, "stage", Stage.Drafting, NOW + 1_000);
    const u = history.undo(store)!;
    expect(Array.from(u.conflicts)).toEqual([rows[1]]);
    expect(Array.from(u.restored)).toEqual([rows[0], rows[2]]);
    expect(store.stage[rows[1]!]).toBe(Stage.Drafting);
  });

  it("overwrites conflicting rows when asked", () => {
    const row = rowsWhere((i) => store.stage[i] === Stage.Registered)[0]!;
    history.setField(store, [row], "stage", Stage.WaitingForFacts, "operator", NOW);
    writeField(store, row, "stage", Stage.Drafting, NOW);
    expect(Array.from(history.undo(store, { overwrite: true })!.restored)).toEqual([row]);
    expect(store.stage[row]).toBe(Stage.Registered);
  });

  it("keeps at most `limit` entries", () => {
    const h = new EditHistory(3);
    for (let k = 0; k < 5; k++) h.setField(store, [k], "assignee", 1, "supervisor", NOW);
    expect(h.size).toBe(3);
    h.clear();
    expect(h.size).toBe(0);
  });
});

describe("note edits with undo", () => {
  it("validates, applies and restores a note", () => {
    const row = rowsWhere((i) => store.note[i] !== 0, 1)[0]!;
    const original = getNote(store, row);
    const r = history.setNote(store, row, { kind: "text", text: "new note" }, "operator", NOW);
    expect(r.entry?.kind).toBe("note");
    expect(getNote(store, row)).toEqual({ kind: "text", text: "new note" });
    history.undo(store);
    expect(getNote(store, row)).toEqual(original);
  });

  it("refuses a note over the limit", () => {
    const r = history.setNote(store, 3, { kind: "text", text: "x".repeat(201) }, "operator", NOW);
    expect(r.entry).toBeNull();
    expect(r.rejected).toEqual([{ row: 3, error: { code: "note-too-long", max: 200, length: 201 } }]);
    expect(history.size).toBe(0);
  });

  it("reports a note a colleague replaced since", () => {
    history.setNote(store, 7, { kind: "text", text: "mine" }, "operator", NOW);
    writeNote(store, 7, { kind: "colleague", n: 3 }, NOW);
    const u = history.undo(store)!;
    expect(Array.from(u.conflicts)).toEqual([7]);
    expect(getNote(store, 7)).toEqual({ kind: "colleague", n: 3 });
  });
});
