import { beforeEach, describe, expect, it } from "vitest";
import { Status } from "../src/schema.js";
import { generateAll } from "../src/generator.js";
import { EditHistory } from "../src/history.js";
import { dayOf, getComment, writeComment, writeStatus, type ColumnStore } from "../src/store.js";
import { storeDigest } from "./digest.js";

const NOW = Date.UTC(2026, 9, 4, 12, 30);

let store: ColumnStore;
let history: EditHistory;

beforeEach(() => {
  store = generateAll(20260904, 1_000, 500);
  history = new EditHistory();
});

function rowsWhere(pred: (i: number) => boolean, limit = 50): number[] {
  const out: number[] = [];
  for (let i = 0; i < store.size && out.length < limit; i++) if (pred(i)) out.push(i);
  return out;
}

describe("bulk status with undo", () => {
  it("applies one status to many rows and undoes it exactly", () => {
    const before = storeDigest(store);
    const rows = rowsWhere((i) => store.slaBreached[i] === 1, 40);
    expect(rows.length).toBe(40);
    const r = history.setStatus(store, rows, Status.Closed, NOW);
    expect(r.applied).toHaveLength(40);
    expect(r.rejected).toEqual([]);
    for (const i of rows) {
      expect(store.status[i]).toBe(Status.Closed);
      /* A settled request no longer breaches its SLA */
      expect(store.slaBreached[i]).toBe(0);
      expect(store.updatedAt[i]).toBe(dayOf(NOW));
    }
    const u = history.undo(store);
    expect(u?.restored).toHaveLength(40);
    expect(u?.conflicts).toHaveLength(0);
    /* Status, SLA flag and updatedAt all come back */
    expect(storeDigest(store)).toBe(before);
    expect(history.undo(store)).toBeNull();
  });

  it("refuses approval for rows without a comment and applies the rest", () => {
    const blank = rowsWhere((i) => store.comment[i] === 0, 5);
    const commented = rowsWhere((i) => store.comment[i] !== 0, 5);
    const r = history.setStatus(store, [...blank, ...commented], Status.Approved, NOW);
    expect(Array.from(r.applied)).toEqual(commented);
    expect(r.rejected).toEqual(blank.map((row) => ({ row, error: { code: "approve-needs-comment" } })));
    expect(history.setStatus(store, blank, Status.Approved, NOW).entry).toBeNull();
    expect(history.setStatus(store, [0], 99, NOW).rejected[0]?.error).toEqual({
      code: "status-unknown",
    });
    expect(history.size).toBe(1);
  });

  it("refuses rejection for rows without a comment and applies the rest", () => {
    const blank = rowsWhere((i) => store.comment[i] === 0 && store.status[i] !== Status.Rejected, 5);
    const commented = rowsWhere((i) => store.comment[i] !== 0, 5);
    const r = history.setStatus(store, [...blank, ...commented], Status.Rejected, NOW);
    expect(Array.from(r.applied)).toEqual(commented);
    expect(r.rejected).toEqual(blank.map((row) => ({ row, error: { code: "reject-needs-comment" } })));
    for (const row of blank) expect(store.status[row]).not.toBe(Status.Rejected);
  });

  it("undoes in reverse order across overlapping edits", () => {
    const before = storeDigest(store);
    history.setStatus(store, [1, 2, 3], Status.InProgress, NOW);
    history.setStatus(store, [2, 3, 4], Status.InReview, NOW);
    history.setComment(store, 3, { kind: "text", text: "checked" }, NOW);
    expect(history.size).toBe(3);
    history.undo(store);
    history.undo(store);
    expect(store.status[2]).toBe(Status.InProgress);
    history.undo(store);
    expect(storeDigest(store)).toBe(before);
    expect(store.commentEdits.size).toBe(0);
  });

  it("leaves rows a colleague changed since, and reports them", () => {
    const rows = [10, 11, 12];
    history.setStatus(store, rows, Status.InReview, NOW);
    expect(history.peek()?.kind).toBe("status");
    writeStatus(store, 11, Status.Rejected, NOW + 1_000);
    const u = history.undo(store)!;
    expect(Array.from(u.conflicts)).toEqual([11]);
    expect(Array.from(u.restored)).toEqual([10, 12]);
    expect(store.status[11]).toBe(Status.Rejected);
  });

  it("overwrites conflicting rows when asked", () => {
    const original = store.status[11];
    history.setStatus(store, [11], Status.InReview, NOW);
    writeStatus(store, 11, Status.Rejected, NOW);
    const u = history.undo(store, { overwrite: true })!;
    expect(Array.from(u.restored)).toEqual([11]);
    expect(store.status[11]).toBe(original);
  });

  it("keeps at most `limit` entries", () => {
    const h = new EditHistory(3);
    for (let k = 0; k < 5; k++) h.setStatus(store, [k], Status.InProgress, NOW);
    expect(h.size).toBe(3);
    h.clear();
    expect(h.size).toBe(0);
  });
});

describe("comment edits with undo", () => {
  it("validates, applies and restores a comment", () => {
    const row = rowsWhere((i) => store.comment[i] !== 0, 1)[0]!;
    const original = getComment(store, row);
    const r = history.setComment(store, row, { kind: "text", text: "new note" }, NOW);
    expect(r.entry?.kind).toBe("comment");
    expect(getComment(store, row)).toEqual({ kind: "text", text: "new note" });
    history.undo(store);
    expect(getComment(store, row)).toEqual(original);
  });

  it("refuses to clear the comment of a rejected request", () => {
    const row = rowsWhere((i) => store.status[i] === Status.Rejected, 1)[0]!;
    const r = history.setComment(store, row, { kind: "text", text: "" }, NOW);
    expect(r.entry).toBeNull();
    expect(r.rejected).toEqual([{ row, error: { code: "reject-needs-comment" } }]);
    expect(history.setComment(store, row, { kind: "pool", code: 0 }, NOW).rejected).toHaveLength(1);
    expect(history.size).toBe(0);
  });

  it("reports a comment a colleague replaced since", () => {
    history.setComment(store, 7, { kind: "text", text: "mine" }, NOW);
    writeComment(store, 7, { kind: "colleague", n: 3 }, NOW);
    const u = history.undo(store)!;
    expect(Array.from(u.conflicts)).toEqual([7]);
    expect(getComment(store, 7)).toEqual({ kind: "colleague", n: 3 });
  });
});
