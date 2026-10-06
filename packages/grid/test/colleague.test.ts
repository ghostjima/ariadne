import { describe, expect, it } from "vitest";
import { STATUS_COUNT, Status } from "../src/schema.js";
import {
  applyRemoteEdit,
  beginEdit,
  colleagueComment,
  colleagueRow,
  colleagueSchedule,
  colleagueStatus,
  detectConflict,
  dueTicks,
  planColleagueEdit,
} from "../src/colleague.js";
import { generateAll } from "../src/generator.js";
import { EMPTY_CRITERIA, filterRows } from "../src/filter.js";
import { EditHistory } from "../src/history.js";
import { getComment } from "../src/store.js";
import { commentText } from "../src/text.js";
import { pools as en } from "../src/pools/en.js";
import { pools as ru } from "../src/pools/ru.js";

const NOW = Date.UTC(2026, 9, 4);

describe("simulated colleague", () => {
  it("picks a row deterministically inside the current view", () => {
    expect(colleagueRow(0, 0)).toBe(-1);
    for (let tick = 0; tick < 50; tick++) {
      const r = colleagueRow(1_000, tick);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1_000);
      expect(colleagueRow(1_000, tick)).toBe(r);
    }
    expect(colleagueRow(1_000, 0)).not.toBe(colleagueRow(1_000, 1));
  });

  it("always moves the status to a different known value", () => {
    for (let s = 0; s < STATUS_COUNT; s++) {
      const next = colleagueStatus(s);
      expect(next).not.toBe(s);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(STATUS_COUNT);
    }
  });

  it("numbers its comments", () => {
    expect(colleagueComment(0)).toEqual({ kind: "colleague", n: 1 });
    expect(commentText(colleagueComment(0), ru)).toBe("Правка коллеги 1");
    expect(commentText(colleagueComment(4), ru)).toBe("Правка коллеги 5");
    expect(commentText(colleagueComment(4), en)).toBe("Colleague's edit 5");
  });
});

describe("schedule", () => {
  it("is seeded, increasing and within the jitter", () => {
    const a = colleagueSchedule(1, 100);
    expect(Array.from(colleagueSchedule(1, 100))).toEqual(Array.from(a));
    expect(Array.from(colleagueSchedule(2, 100))).not.toEqual(Array.from(a));
    let prev = 0;
    for (const t of a) {
      expect(t - prev).toBeGreaterThanOrEqual(30_000);
      expect(t - prev).toBeLessThanOrEqual(50_000);
      prev = t;
    }
    expect(Array.from(colleagueSchedule(1, 3, 1_000, 0))).toEqual([1_000, 2_000, 3_000]);
  });

  it("counts the edits due by a moment", () => {
    const s = Float64Array.from([1_000, 2_000, 3_000]);
    expect(dueTicks(s, 0)).toBe(0);
    expect(dueTicks(s, 999)).toBe(0);
    expect(dueTicks(s, 1_000)).toBe(1);
    expect(dueTicks(s, 2_500)).toBe(2);
    expect(dueTicks(s, 10_000)).toBe(3);
  });
});

describe("remote edits and conflicts", () => {
  const fresh = () => generateAll(20260904, 2_000, 500);

  it("moves the status of a visible row when nobody is editing", () => {
    const store = fresh();
    const visible = filterRows(store, null, { ...EMPTY_CRITERIA, status: [1] }).index;
    const edit = planColleagueEdit(store, visible, 3, null)!;
    expect(edit.row).toBe(visible[colleagueRow(visible.length, 3)]);
    expect(edit.cell).toEqual({ col: "status", value: colleagueStatus(1) });
    applyRemoteEdit(store, edit, NOW);
    expect(store.status[edit.row]).toBe(colleagueStatus(1));
    expect(planColleagueEdit(store, new Uint32Array(0), 0, null)).toBeNull();
  });

  it("edits the very cell the user is editing, and the save detects it", () => {
    const store = fresh();
    const session = beginEdit(store, 42, "status");
    expect(detectConflict(store, session)).toBeNull();
    const edit = planColleagueEdit(store, [], 0, session)!;
    expect(edit.row).toBe(42);
    applyRemoteEdit(store, edit, NOW);
    const conflict = detectConflict(store, session)!;
    expect(conflict.col).toBe("status");
    expect(conflict.base).toEqual(session.base);
    expect(conflict.theirs).toEqual({ col: "status", value: store.status[42] });
  });

  it("detects a comment conflict and resolves to the colleague's numbered note", () => {
    const store = fresh();
    const session = beginEdit(store, 7, "comment");
    applyRemoteEdit(store, planColleagueEdit(store, [], 5, session)!, NOW);
    const conflict = detectConflict(store, session)!;
    expect(conflict.theirs).toEqual({ col: "comment", value: { kind: "colleague", n: 6 } });
    expect(commentText(getComment(store, 7), en)).toBe("Colleague's edit 6");
  });

  it("is not a conflict when the value came back to where the session started", () => {
    const store = fresh();
    const session = beginEdit(store, 9, "status");
    const original = store.status[9]!;
    applyRemoteEdit(store, { tick: 0, row: 9, cell: { col: "status", value: (original + 1) % 7 } }, NOW);
    applyRemoteEdit(store, { tick: 1, row: 9, cell: { col: "status", value: original } }, NOW);
    expect(detectConflict(store, session)).toBeNull();
  });

  it("makes undo skip a bulk-edited row the colleague touched", () => {
    const store = fresh();
    const history = new EditHistory();
    const rows = Uint32Array.from([100, 200, 300]);
    history.setStatus(store, rows, Status.InReview, NOW);
    const edit = planColleagueEdit(store, rows, 0, null)!;
    applyRemoteEdit(store, edit, NOW);
    const u = history.undo(store)!;
    expect(Array.from(u.conflicts)).toEqual([edit.row]);
    expect(u.restored).toHaveLength(2);
  });
});
