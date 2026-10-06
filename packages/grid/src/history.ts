import { checkField, checkNoteValue, editContext, type EditError } from "./edit.js";
import type { Role } from "./roles.js";
import { Extension, SELF_ASSIGNEE, SELF_REVIEWER, SELF_SIGNATORY, SELF_SUPERVISOR, type EnumField } from "./schema.js";
import { getNote, rememberOrigin, sameNote, writeField, writeNote, type ColumnStore, type NoteValue } from "./store.js";
import { appendJournal, personActor, transitionBetween, type Actor } from "./workflow.js";

/*
  Local edits with an undo stack. Every edit records what it overwrote, so
  undo restores the value, the day a reply went out and updatedAt exactly.
  A row that someone else changed after the edit (the simulated colleague)
  is a conflict: undo leaves it alone and reports it, unless told to
  overwrite. A change of the stage (a transition) or of the extension is
  written into the case's journal, and so is its undo, with the person the
  role works as in this demo.
*/

/* The person each role works as in this demo */
export function selfActor(role: Role): Actor {
  const person = role === "operator" ? SELF_ASSIGNEE : role === "reviewer" ? SELF_REVIEWER : role === "signatory" ? SELF_SIGNATORY : SELF_SUPERVISOR;
  return personActor(role, person);
}

/* The journal entry of an edit of a code field, if it is one the journal
   keeps */
function journalEdit(store: ColumnStore, row: number, field: EnumField, before: number, value: number, actor: Actor, at: number): void {
  if (field === "stage") {
    const t = transitionBetween(before, value);
    appendJournal(store, row, { at, action: t?.action ?? "undo", from: before, to: value, actor });
  } else if (field === "extension") {
    const stage = store.stage[row] ?? 0;
    appendJournal(store, row, { at, action: value === Extension.Extended ? "extend" : "extension_withdrawn", from: stage, to: stage, actor });
  }
}

export type FieldEntry = {
  kind: "field";
  field: EnumField;
  rows: Uint32Array;
  value: number;
  role: Role;
  before: { value: Uint8Array; sentOn: Int32Array; updatedAt: Float64Array };
};

export type NoteEntry = {
  kind: "note";
  row: number;
  value: NoteValue;
  before: { note: NoteValue; updatedAt: number };
};

export type HistoryEntry = FieldEntry | NoteEntry;

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

  /* Sets one code field on one or many rows; rows the rules refuse are skipped */
  setField(
    store: ColumnStore,
    rows: ArrayLike<number>,
    field: EnumField,
    value: number,
    role: Role,
    now: number,
  ): EditResult {
    const accepted: number[] = [];
    const rejected: Rejection[] = [];
    for (let k = 0; k < rows.length; k++) {
      const row = rows[k]!;
      const error = checkField(field, value, editContext(store, row), role);
      if (error) rejected.push({ row, error });
      else accepted.push(row);
    }
    const applied = Uint32Array.from(accepted);
    if (applied.length === 0) return { entry: null, applied, rejected };
    const before = {
      value: new Uint8Array(applied.length),
      sentOn: new Int32Array(applied.length),
      updatedAt: new Float64Array(applied.length),
    };
    applied.forEach((row, k) => {
      rememberOrigin(store, row);
      before.value[k] = store[field][row] ?? 0;
      before.sentOn[k] = store.sentOn[row] ?? -1;
      before.updatedAt[k] = store.updatedAt[row] ?? 0;
      writeField(store, row, field, value, now);
      journalEdit(store, row, field, before.value[k] ?? 0, value, selfActor(role), now);
    });
    const entry: FieldEntry = { kind: "field", field, rows: applied, value, role, before };
    this.push(entry);
    return { entry, applied, rejected };
  }

  /* Sets a note on one row; text values should already be normalised */
  setNote(store: ColumnStore, row: number, value: NoteValue, role: Role, now: number): EditResult {
    const error = checkNoteValue(value, role);
    if (error) return { entry: null, applied: new Uint32Array(0), rejected: [{ row, error }] };
    const entry: NoteEntry = {
      kind: "note",
      row,
      value,
      before: { note: getNote(store, row), updatedAt: store.updatedAt[row] ?? 0 },
    };
    writeNote(store, row, value, now);
    this.push(entry);
    return { entry, applied: Uint32Array.of(row), rejected: [] };
  }

  /* Reverts the latest edit; null when there is nothing to undo */
  undo(store: ColumnStore, options: { overwrite?: boolean; now?: number } = {}): UndoResult | null {
    const entry = this.entries.pop();
    if (!entry) return null;
    const overwrite = options.overwrite === true;
    const restored: number[] = [];
    const conflicts: number[] = [];
    if (entry.kind === "field") {
      entry.rows.forEach((row, k) => {
        if (!overwrite && store[entry.field][row] !== entry.value) {
          conflicts.push(row);
          return;
        }
        const current = store[entry.field][row] ?? 0;
        const value = entry.before.value[k] ?? 0;
        store[entry.field][row] = value;
        store.sentOn[row] = entry.before.sentOn[k] ?? -1;
        store.updatedAt[row] = entry.before.updatedAt[k] ?? 0;
        if (entry.field === "stage" || entry.field === "extension") {
          const stage = store.stage[row] ?? 0;
          appendJournal(store, row, {
            at: options.now ?? Date.now(),
            action: "undo",
            from: entry.field === "stage" ? current : stage,
            to: entry.field === "stage" ? value : stage,
            actor: selfActor(entry.role),
          });
        }
        restored.push(row);
      });
    } else if (!overwrite && !sameNote(getNote(store, entry.row), entry.value)) {
      conflicts.push(entry.row);
    } else {
      writeNote(store, entry.row, entry.before.note, 0);
      store.updatedAt[entry.row] = entry.before.updatedAt;
      restored.push(entry.row);
    }
    return { entry, restored: Uint32Array.from(restored), conflicts: Uint32Array.from(conflicts) };
  }
}
