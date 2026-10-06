import { checkCommentValue, checkStatus, type EditError } from "./edit.js";
import {
  getComment,
  isCommentBlank,
  sameComment,
  writeComment,
  writeStatus,
  type ColumnStore,
  type CommentValue,
} from "./store.js";

/*
  Local edits with an undo stack. Every edit records what it overwrote, so
  undo restores status, SLA flag, comment and updatedAt exactly. A row that
  someone else changed after the edit (the simulated colleague) is a
  conflict: undo leaves it alone and reports it, unless told to overwrite.
*/

export type StatusEntry = {
  kind: "status";
  rows: Uint32Array;
  value: number;
  before: { status: Uint8Array; slaBreached: Uint8Array; updatedAt: Float64Array };
};

export type CommentEntry = {
  kind: "comment";
  row: number;
  value: CommentValue;
  before: { comment: CommentValue; updatedAt: number };
};

export type HistoryEntry = StatusEntry | CommentEntry;

export type Rejection = { row: number; error: EditError };

export type EditResult = {
  /* null when nothing was applied */
  entry: HistoryEntry | null;
  applied: Uint32Array;
  rejected: Rejection[];
};

export type UndoResult = {
  entry: HistoryEntry;
  restored: Uint32Array;
  /* Rows changed by someone else since the edit, left as they are */
  conflicts: Uint32Array;
};

export const HISTORY_LIMIT = 50;

export class EditHistory {
  private readonly entries: HistoryEntry[] = [];

  constructor(readonly limit: number = HISTORY_LIMIT) {}

  get size(): number {
    return this.entries.length;
  }

  peek(): HistoryEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  clear(): void {
    this.entries.length = 0;
  }

  private push(entry: HistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
  }

  /* Sets one status on one or many rows; rows the rules refuse are skipped */
  setStatus(store: ColumnStore, rows: ArrayLike<number>, status: number, now: number): EditResult {
    const accepted: number[] = [];
    const rejected: Rejection[] = [];
    for (let k = 0; k < rows.length; k++) {
      const row = rows[k]!;
      const error = checkStatus(status, isCommentBlank(store, row));
      if (error) rejected.push({ row, error });
      else accepted.push(row);
    }
    const applied = Uint32Array.from(accepted);
    if (applied.length === 0) return { entry: null, applied, rejected };
    const before = {
      status: new Uint8Array(applied.length),
      slaBreached: new Uint8Array(applied.length),
      updatedAt: new Float64Array(applied.length),
    };
    applied.forEach((row, k) => {
      before.status[k] = store.status[row] ?? 0;
      before.slaBreached[k] = store.slaBreached[row] ?? 0;
      before.updatedAt[k] = store.updatedAt[row] ?? 0;
      writeStatus(store, row, status, now);
    });
    const entry: StatusEntry = { kind: "status", rows: applied, value: status, before };
    this.push(entry);
    return { entry, applied, rejected };
  }

  /* Sets a comment on one row; text values should already be normalised */
  setComment(store: ColumnStore, row: number, value: CommentValue, now: number): EditResult {
    const error = checkCommentValue(value, store.status[row] ?? 0);
    if (error) return { entry: null, applied: new Uint32Array(0), rejected: [{ row, error }] };
    const entry: CommentEntry = {
      kind: "comment",
      row,
      value,
      before: { comment: getComment(store, row), updatedAt: store.updatedAt[row] ?? 0 },
    };
    writeComment(store, row, value, now);
    this.push(entry);
    return { entry, applied: Uint32Array.of(row), rejected: [] };
  }

  /* Reverts the latest edit; null when there is nothing to undo */
  undo(store: ColumnStore, options: { overwrite?: boolean } = {}): UndoResult | null {
    const entry = this.entries.pop();
    if (!entry) return null;
    const overwrite = options.overwrite === true;
    const restored: number[] = [];
    const conflicts: number[] = [];
    if (entry.kind === "status") {
      entry.rows.forEach((row, k) => {
        if (!overwrite && store.status[row] !== entry.value) {
          conflicts.push(row);
          return;
        }
        store.status[row] = entry.before.status[k] ?? 0;
        store.slaBreached[row] = entry.before.slaBreached[k] ?? 0;
        store.updatedAt[row] = entry.before.updatedAt[k] ?? 0;
        restored.push(row);
      });
    } else if (!overwrite && !sameComment(getComment(store, entry.row), entry.value)) {
      conflicts.push(entry.row);
    } else {
      writeComment(store, entry.row, entry.before.comment, 0);
      store.updatedAt[entry.row] = entry.before.updatedAt;
      restored.push(entry.row);
    }
    return { entry, restored: Uint32Array.from(restored), conflicts: Uint32Array.from(conflicts) };
  }
}
