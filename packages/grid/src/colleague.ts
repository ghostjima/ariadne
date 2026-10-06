import type { EditColumn } from "./edit.js";
import { makeRng, mixSeed } from "./generator.js";
import { STATUS_COUNT } from "./schema.js";
import {
  getComment,
  sameComment,
  writeComment,
  writeStatus,
  type ColumnStore,
  type CommentValue,
} from "./store.js";

/*
  The simulated colleague: a second user editing the same dataset. When
  edits happen comes from a seeded schedule; what each edit does is a pure
  function of the tick, so a demo button and a timer produce the same,
  testable result. Conflicts are detected by comparing the value a local
  edit started from with the value in the store when it is saved.
*/

const STRIDE = 7919;

/* Position, inside a view of `count` rows, of the row edited at `tick` */
export function colleagueRow(count: number, tick: number): number {
  if (count <= 0) return -1;
  return ((tick + 1) * STRIDE) % count;
}

/* The status the colleague moves a row to: always a different known one */
export function colleagueStatus(current: number): number {
  return (current + 3) % STATUS_COUNT;
}

/* The colleague's numbered note; the language module writes the text */
export function colleagueComment(tick: number): CommentValue {
  return { kind: "colleague", n: tick + 1 };
}

export const COLLEAGUE_MEAN_MS = 40_000;

/*
  Offsets in milliseconds of the first `count` remote edits: intervals of
  `meanMs` with up to `jitter` (a fraction) either way, drawn from `seed`.
*/
export function colleagueSchedule(
  seed: number,
  count: number,
  meanMs: number = COLLEAGUE_MEAN_MS,
  jitter = 0.25,
): Float64Array {
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

export type CellValue = { col: "status"; value: number } | { col: "comment"; value: CommentValue };

export function readCell(store: ColumnStore, row: number, col: EditColumn): CellValue {
  return col === "status"
    ? { col, value: store.status[row] ?? 0 }
    : { col, value: getComment(store, row) };
}

export function sameCell(a: CellValue, b: CellValue): boolean {
  if (a.col === "status" && b.col === "status") return a.value === b.value;
  if (a.col === "comment" && b.col === "comment") return sameComment(a.value, b.value);
  return false;
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
  otherwise it moves the status of a row of the current view.
*/
export function planColleagueEdit(
  store: ColumnStore,
  visible: ArrayLike<number>,
  tick: number,
  editing: EditSession | null,
): RemoteEdit | null {
  if (editing) {
    const cell: CellValue =
      editing.col === "status"
        ? { col: "status", value: colleagueStatus(store.status[editing.row] ?? 0) }
        : { col: "comment", value: colleagueComment(tick) };
    return { tick, row: editing.row, cell };
  }
  const position = colleagueRow(visible.length, tick);
  if (position < 0) return null;
  const row = visible[position] ?? 0;
  return { tick, row, cell: { col: "status", value: colleagueStatus(store.status[row] ?? 0) } };
}

/* Writes a remote edit into the store; it does not enter the undo stack */
export function applyRemoteEdit(store: ColumnStore, edit: RemoteEdit, now: number): void {
  if (edit.cell.col === "status") writeStatus(store, edit.row, edit.cell.value, now);
  else writeComment(store, edit.row, edit.cell.value, now);
}
