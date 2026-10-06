import { makeRng, mixSeed } from "./generator.js";
import { ASSIGNEE_COUNT, EXTENSION_COUNT, GROUND_COUNT, OUTCOME_COUNT, Stage, type EditColumn, type EnumField } from "./schema.js";
import { getNote, readField, sameNote, writeField, writeNote, type ColumnStore, type NoteValue } from "./store.js";

/*
  The simulated colleague: a second person working the same register.
  When edits happen comes from a seeded schedule; what each edit does is a
  pure function of the tick, so a demo button and a timer produce the
  same, testable result. Conflicts are detected by comparing the value a
  local edit started from with the value in the store when it is saved.
*/

const STRIDE = 7919;

/* Position, inside a view of `count` rows, of the row edited at `tick` */
export function colleagueRow(count: number, tick: number): number {
  if (count <= 0) return -1;
  return ((tick + 1) * STRIDE) % count;
}

/* The stage the colleague moves a case to: the next one, or back to
   drafting from closed; always a different known stage */
export function colleagueStage(current: number): number {
  return current >= Stage.Closed ? Stage.Drafting : current + 1;
}

const COUNTS: Record<Exclude<EnumField, "stage">, number> = {
  outcome: OUTCOME_COUNT,
  ground: GROUND_COUNT,
  extension: EXTENSION_COUNT,
  assignee: ASSIGNEE_COUNT,
};

/* The value the colleague writes into a code field: a different one */
export function colleagueValue(field: EnumField, current: number): number {
  return field === "stage" ? colleagueStage(current) : (current + 1) % COUNTS[field];
}

/* The colleague's numbered note; the language module writes the text */
export function colleagueNote(tick: number): NoteValue {
  return { kind: "colleague", n: tick + 1 };
}

export const COLLEAGUE_MEAN_MS = 40_000;

/*
  Offsets in milliseconds of the first `count` remote edits: intervals of
  `meanMs` with up to `jitter` (a fraction) either way, drawn from `seed`.
*/
export function colleagueSchedule(seed: number, count: number, meanMs: number = COLLEAGUE_MEAN_MS, jitter = 0.25): Float64Array {
  const rng = makeRng(mixSeed(seed, 0x636f6c));
  const out = new Float64Array(count);
  let t = 0;
  for (let k = 0; k < count; k++) {
    t += Math.round(meanMs * (1 + (rng() * 2 - 1) * jitter));
    out[k] = t;
  }
  return out;
}

/* How many scheduled edits are due after `elapsedMs` */
export function dueTicks(schedule: Float64Array, elapsedMs: number): number {
  let lo = 0;
  let hi = schedule.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((schedule[mid] ?? Infinity) <= elapsedMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type CellValue =
  | { col: EnumField; value: number }
  | { col: "note"; value: NoteValue };

export function readCell(store: ColumnStore, row: number, col: EditColumn): CellValue {
  return col === "note" ? { col, value: getNote(store, row) } : { col, value: readField(store, row, col) };
}

export function sameCell(a: CellValue, b: CellValue): boolean {
  if (a.col !== b.col) return false;
  if (a.col === "note" && b.col === "note") return sameNote(a.value, b.value);
  return a.value === b.value;
}

/* A local edit in progress: the cell and the value it started from */
export type EditSession = { row: number; col: EditColumn; base: CellValue };

export function beginEdit(store: ColumnStore, row: number, col: EditColumn): EditSession {
  return { row, col, base: readCell(store, row, col) };
}

export type Conflict = { row: number; col: EditColumn; base: CellValue; theirs: CellValue };

/* A conflict when the cell changed in the store since the session began */
export function detectConflict(store: ColumnStore, session: EditSession): Conflict | null {
  const theirs = readCell(store, session.row, session.col);
  if (sameCell(theirs, session.base)) return null;
  return { row: session.row, col: session.col, base: session.base, theirs };
}

export type RemoteEdit = { tick: number; row: number; cell: CellValue };

/*
  What the colleague does at `tick`. While the user edits a cell, the
  colleague edits that same cell (so the demo always shows a conflict);
  otherwise it moves the stage of a case of the current view.
*/
export function planColleagueEdit(
  store: ColumnStore,
  visible: ArrayLike<number>,
  tick: number,
  editing: EditSession | null,
): RemoteEdit | null {
  if (editing) {
    const cell: CellValue =
      editing.col === "note"
        ? { col: "note", value: colleagueNote(tick) }
        : { col: editing.col, value: colleagueValue(editing.col, readField(store, editing.row, editing.col)) };
    return { tick, row: editing.row, cell };
  }
  const position = colleagueRow(visible.length, tick);
  if (position < 0) return null;
  const row = visible[position] ?? 0;
  return { tick, row, cell: { col: "stage", value: colleagueStage(store.stage[row] ?? 0) } };
}

/* Writes a remote edit into the store; it does not enter the undo stack */
export function applyRemoteEdit(store: ColumnStore, edit: RemoteEdit, now: number): void {
  if (edit.cell.col === "note") writeNote(store, edit.row, edit.cell.value, now);
  else writeField(store, edit.row, edit.cell.col, edit.cell.value, now);
}
