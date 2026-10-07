import { describe, expect, it } from "vitest";
import { EXTENSION_COUNT, GROUND_COUNT, OUTCOME_COUNT, STAGE_COUNT, Stage } from "../src/schema.js";
import {
  applyRemoteEdit,
  beginEdit,
  colleagueNote,
  colleagueRow,
  colleagueSchedule,
  colleagueStage,
  colleagueValue,
  detectConflict,
  dueTicks,
  planColleagueEdit,
} from "../src/colleague.js";
import { generateAll } from "../src/generator.js";
import { EMPTY_CRITERIA, filterRows } from "../src/filter.js";
import { EditHistory } from "../src/history.js";
import { getNote } from "../src/store.js";
import { transitionBetween } from "../src/workflow.js";
import { noteText } from "../src/text.js";
import { pools as en } from "../src/pools/en.js";
import { pools as ru } from "../src/pools/ru.js";

const NOW = Date.UTC(2026, 9, 6);

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

  it("moves a case on to its next stage by a transition of the table, and leaves a closed one", () => {
    for (let s = 0; s < STAGE_COUNT - 1; s++) {
      const next = colleagueStage(s);
      expect(next).toBe(s + 1);
      expect(transitionBetween(s, next)).not.toBeNull();
    }
    expect(colleagueStage(Stage.Closed)).toBe(Stage.Closed);
  });

  it("writes a different known value into every code field", () => {
    for (const [field, count] of [
      ["outcome", OUTCOME_COUNT],
      ["ground", GROUND_COUNT],
      ["extension", EXTENSION_COUNT],
    ] as const) {
      for (let v = 0; v < count; v++) {
        const next = colleagueValue(field, v);
        expect(next).not.toBe(v);
        expect(next).toBeLessThan(count);
      }
    }
  });

  it("numbers its notes", () => {
    expect(colleagueNote(0)).toEqual({ kind: "colleague", n: 1 });
    expect(noteText(colleagueNote(0), ru)).toBe("Правка коллеги 1");
    expect(noteText(colleagueNote(4), en)).toBe("Colleague's edit 5");
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
  const fresh = () => generateAll(20261006, 1_200, 400);

  it("moves the stage of a visible case when nobody is editing", () => {
    const store = fresh();
    const visible = filterRows(store, null, { ...EMPTY_CRITERIA, stage: [Stage.Drafting] }).index;
    const edit = planColleagueEdit(store, visible, 3, null)!;
    expect(edit.row).toBe(visible[colleagueRow(visible.length, 3)]);
    expect(edit.cell).toEqual({ col: "stage", value: Stage.LegalReview });
    applyRemoteEdit(store, edit, NOW);
    expect(store.stage[edit.row]).toBe(Stage.LegalReview);
    expect(planColleagueEdit(store, new Uint32Array(0), 0, null)).toBeNull();
  });

  it("edits the very cell the user is editing, and the save detects it", () => {
    const store = fresh();
    for (const col of ["stage", "outcome", "ground", "extension", "assignee"] as const) {
      const session = beginEdit(store, 42, col);
      expect(detectConflict(store, session)).toBeNull();
      const edit = planColleagueEdit(store, [], 0, session)!;
      expect(edit.row).toBe(42);
      applyRemoteEdit(store, edit, NOW);
      const conflict = detectConflict(store, session)!;
      expect(conflict.col).toBe(col);
      expect(conflict.base).toEqual(session.base);
      expect(conflict.theirs).toEqual({ col, value: store[col][42] });
    }
  });

  it("detects a note conflict and resolves to the colleague's numbered note", () => {
    const store = fresh();
    const session = beginEdit(store, 7, "note");
    applyRemoteEdit(store, planColleagueEdit(store, [], 5, session)!, NOW);
    expect(detectConflict(store, session)!.theirs).toEqual({ col: "note", value: { kind: "colleague", n: 6 } });
    expect(noteText(getNote(store, 7), en)).toBe("Colleague's edit 6");
  });

  it("is not a conflict when the value came back to where the session started", () => {
    const store = fresh();
    const session = beginEdit(store, 9, "stage");
    const original = store.stage[9]!;
    applyRemoteEdit(store, { tick: 0, row: 9, cell: { col: "stage", value: colleagueStage(original) } }, NOW);
    applyRemoteEdit(store, { tick: 1, row: 9, cell: { col: "stage", value: original } }, NOW);
    expect(detectConflict(store, session)).toBeNull();
  });

  it("makes undo skip a reassigned case the colleague moved", () => {
    const store = fresh();
    const history = new EditHistory();
    const rows = Uint32Array.from([100, 200, 300]);
    history.setField(store, rows, "assignee", 2, "supervisor", NOW);
    applyRemoteEdit(store, { tick: 0, row: 200, cell: { col: "assignee", value: 6 } }, NOW);
    const u = history.undo(store)!;
    expect(Array.from(u.conflicts)).toEqual([200]);
    expect(u.restored).toHaveLength(2);
  });
});
