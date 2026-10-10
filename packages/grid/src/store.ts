import { AS_OF, Copy, CopyClass, DUE_SOON_WORKING_DAYS, DeadlineClass, Extension, Stage, type EnumField } from "./schema.js";
import { dayNumber } from "./days.js";
import type { JournalEntry } from "./workflow.js";

/*
  Columnar store. Every generated field is a typed array of codes, days or
  amounts, so a chunk moves between threads with transferable buffers and
  the same rows serve every display language. Days are whole days since
  1970-01-01 (see days.ts). The deadline columns (due, dueExt, extNotice,
  leftBase, leftExt, rules) are what ariadne-rules computed for the row
  when it was generated; nothing here counts a working day. The only
  non-typed part is `noteEdits`: notes written after generation (by the
  user or the simulated colleague), keyed by row.
*/

/* A note cell: a pool entry (code 0 is empty), free text, or the
   colleague's numbered note. The text is resolved per language. */
export type NoteValue =
  | { kind: "pool"; code: number }
  | { kind: "text"; text: string }
  | { kind: "colleague"; n: number };

/* Bits of `rules`: what ariadne-rules said about the row */
export const RulesFlag = {
  /* An extension to request documents is allowed (not refused) */
  ExtensionAllowed: 1,
  /* The money claim runs under 123-FZ (the ombudsman regime) */
  Ombudsman: 2,
  /* Registered after the next working day (warning registered_late) */
  RegisteredLate: 4,
  /* A registration notice is due (an electronic complaint) */
  RegistrationNotice: 8,
  /* The reply and every notice are copied to the Bank of Russia */
  CopyToBankOfRussia: 16,
  /* The complaint and the reply are copied to the self-regulatory
     organisation (a non-bank sector, a base-standard breach found) */
  CopyToSro: 32,
} as const;

export type Columns = {
  /* day of receipt, and the minute of that day (Moscow time) */
  received: Int32Array;
  receivedMinute: Uint16Array;
  registered: Int32Array;
  stream: Uint8Array;
  source: Uint8Array;
  /* the organisation of the group (Sector) */
  sector: Uint8Array;
  channel: Uint8Array;
  applicant: Uint8Array;
  /* an individual (see clientName) or a company, by `applicant` */
  client: Uint16Array;
  /* 0 none; k > 0 is the (k - 1)-th OD-2506 sign or 115-FZ category of
     ariadne-rules' lists, by `stream` */
  reason: Uint8Array;
  operation: Uint8Array;
  /* the operation's reference number, shown in base 36 */
  opRef: Uint32Array;
  opOn: Int32Array;
  /* roubles */
  opAmount: Float64Array;
  /* the money claimed, roubles; 0 when none */
  claim: Float64Array;
  /* 1 when the claim came on the ombudsman's standard electronic form */
  claimForm: Uint8Array;
  stage: Uint8Array;
  outcome: Uint8Array;
  ground: Uint8Array;
  extension: Uint8Array;
  assignee: Uint8Array;
  signatory: Uint8Array;
  /* the row of a linked case, or -1 */
  linked: Int32Array;
  /* the reply's last day; the last day once extended (-1 when the
     extension is refused); the last day for the extension notice (-1
     likewise) */
  due: Int32Array;
  dueExt: Int32Array;
  extNotice: Int32Array;
  /* working days from AS_OF to `due` and to `dueExt`, negative when past */
  leftBase: Int16Array;
  leftExt: Int16Array;
  /* RulesFlag bits */
  rules: Uint8Array;
  /* the day the reply went out, or -1 */
  sentOn: Int32Array;
  /* 1 when a breach of a base or internal standard was found */
  breach: Uint8Array;
  /* Copy bits: the copies owed and sent */
  copies: Uint8Array;
  /* the complaint's text: template, variation bits, adversarial insertion
     (0 none, k > 0 the k-th) */
  template: Uint8Array;
  variant: Uint16Array;
  injection: Uint8Array;
  /* 0 is empty, k > 0 is pools.notes[k - 1] */
  note: Uint8Array;
  /* epoch milliseconds of the last change */
  updatedAt: Float64Array;
  /* Path code: what happened after the first action or decision; its day,
     and its later day or -1; the working days a commission's request
     gives (0 when it gave none) */
  path: Uint8Array;
  pathOn: Int32Array;
  pathThen: Int32Array;
  pathTerm: Uint8Array;
  /* Database code: the client's own data in the Bank of Russia's
     database */
  database: Uint8Array;
  /* Restriction code: the suspension, or the transfer cap the bank chose
     instead, for the client's own data in the database */
  restriction: Uint8Array;
  /* the day the bank received from the Bank of Russia the database
     information that holds the client's data (161-FZ art. 27 part 7), or
     -1 for a case that is not about them: the ATM cash cap runs from it
     (Banking Law art. 30 part 16) */
  recordOn: Int32Array;
};

export type ColumnStore = Columns & {
  size: number;
  /* rows that have been loaded (1) or are still missing (0) */
  loaded: Uint8Array;
  /* notes edited after generation, overriding `note` */
  noteEdits: Map<number, NoteValue>;
  /* the journal entries made in this page, by row; the history before
     them is worked out from the generated row (workflow.ts) */
  journal: Map<number, JournalEntry[]>;
  /* what a row held as generated, kept at its first change in this page,
     so its worked-out history stays the generated one */
  origin: Map<number, RowOrigin>;
};

/* The fields of a generated row its history is worked out from */
export type RowOrigin = { stage: number; sentOn: number; extension: number; assignee: number; updatedAt: number };

/* Keeps what a row held as generated, before its first change */
export function rememberOrigin(store: ColumnStore, row: number): void {
  if (store.origin.has(row)) return;
  store.origin.set(row, {
    stage: store.stage[row] ?? 0,
    sentOn: store.sentOn[row] ?? -1,
    extension: store.extension[row] ?? 0,
    assignee: store.assignee[row] ?? 0,
    updatedAt: store.updatedAt[row] ?? 0,
  });
}

export type Chunk = Columns & { start: number; count: number };

export function allocColumns(size: number): Columns {
  return {
    received: new Int32Array(size),
    receivedMinute: new Uint16Array(size),
    registered: new Int32Array(size),
    stream: new Uint8Array(size),
    source: new Uint8Array(size),
    sector: new Uint8Array(size),
    channel: new Uint8Array(size),
    applicant: new Uint8Array(size),
    client: new Uint16Array(size),
    reason: new Uint8Array(size),
    operation: new Uint8Array(size),
    opRef: new Uint32Array(size),
    opOn: new Int32Array(size),
    opAmount: new Float64Array(size),
    claim: new Float64Array(size),
    claimForm: new Uint8Array(size),
    stage: new Uint8Array(size),
    outcome: new Uint8Array(size),
    ground: new Uint8Array(size),
    extension: new Uint8Array(size),
    assignee: new Uint8Array(size),
    signatory: new Uint8Array(size),
    linked: new Int32Array(size),
    due: new Int32Array(size),
    dueExt: new Int32Array(size),
    extNotice: new Int32Array(size),
    leftBase: new Int16Array(size),
    leftExt: new Int16Array(size),
    rules: new Uint8Array(size),
    sentOn: new Int32Array(size),
    breach: new Uint8Array(size),
    copies: new Uint8Array(size),
    template: new Uint8Array(size),
    variant: new Uint16Array(size),
    injection: new Uint8Array(size),
    note: new Uint8Array(size),
    updatedAt: new Float64Array(size),
    path: new Uint8Array(size),
    pathOn: new Int32Array(size),
    pathThen: new Int32Array(size),
    pathTerm: new Uint8Array(size),
    database: new Uint8Array(size),
    restriction: new Uint8Array(size),
    recordOn: new Int32Array(size),
  };
}

/* The column names, in a fixed order: every one is copied, transferred and
   hashed */
export const COLUMN_KEYS = Object.keys(allocColumns(0)) as (keyof Columns)[];

export function createStore(size: number): ColumnStore {
  return { ...allocColumns(size), size, loaded: new Uint8Array(size), noteEdits: new Map(), journal: new Map(), origin: new Map() };
}

/* Copies a chunk into the store at its start offset */
export function applyChunk(store: ColumnStore, chunk: Chunk): void {
  const { start, count } = chunk;
  for (const key of COLUMN_KEYS) (store[key] as Int32Array).set(chunk[key] as Int32Array, start);
  store.loaded.fill(1, start, start + count);
  for (let i = start; i < start + count; i++) {
    store.noteEdits.delete(i);
    store.journal.delete(i);
    store.origin.delete(i);
  }
}

/* Every buffer of a chunk, for a zero-copy postMessage */
export function chunkTransferables(chunk: Chunk): ArrayBuffer[] {
  return COLUMN_KEYS.map((key) => chunk[key].buffer as ArrayBuffer);
}

export const ID_PREFIX = "C-";

export function padId(n: number): string {
  return `${ID_PREFIX}${String(n).padStart(6, "0")}`;
}

/* The case id of a row is derived from its position (cases are numbered
   in the order they were received), so it is not stored */
export function rowId(i: number): string {
  return padId(i + 1);
}

/* Row position of a case id, or -1 */
export function rowOfId(id: string, size: number): number {
  const m = /^C-(\d{6})$/.exec(id);
  if (!m) return -1;
  const i = Number(m[1]) - 1;
  return i >= 0 && i < size ? i : -1;
}

/* The operation's reference as shown: base 36, upper case, 7 characters */
export function opRefText(ref: number): string {
  return `OP-${ref.toString(36).toUpperCase().padStart(7, "0")}`;
}

export function getNote(store: ColumnStore, i: number): NoteValue {
  return store.noteEdits.get(i) ?? { kind: "pool", code: store.note[i] ?? 0 };
}

/* Whether a row has no note, in any language */
export function isNoteBlank(store: ColumnStore, i: number): boolean {
  const c = getNote(store, i);
  if (c.kind === "pool") return c.code === 0;
  if (c.kind === "text") return c.text.trim() === "";
  return false;
}

export function sameNote(a: NoteValue, b: NoteValue): boolean {
  if (a.kind === "pool" && b.kind === "pool") return a.code === b.code;
  if (a.kind === "text" && b.kind === "text") return a.text === b.text;
  if (a.kind === "colleague" && b.kind === "colleague") return a.n === b.n;
  return false;
}

export const AS_OF_DAY = dayNumber(AS_OF);

export function isExtended(store: ColumnStore, i: number): boolean {
  return store.extension[i] === Extension.Extended && (store.dueExt[i] ?? -1) >= 0;
}

/* The reply's last day as it stands: extended or not */
export function effectiveDue(store: ColumnStore, i: number): number {
  return isExtended(store, i) ? (store.dueExt[i] ?? 0) : (store.due[i] ?? 0);
}

/* Working days from AS_OF to the reply's last day, negative when past */
export function workingDaysLeft(store: ColumnStore, i: number): number {
  return isExtended(store, i) ? (store.leftExt[i] ?? 0) : (store.leftBase[i] ?? 0);
}

export function isAnswered(store: ColumnStore, i: number): boolean {
  return (store.stage[i] ?? 0) >= Stage.Sent;
}

/* Overdue, due within DUE_SOON_WORKING_DAYS, later, or answered */
export function deadlineClass(store: ColumnStore, i: number): number {
  if (isAnswered(store, i)) return DeadlineClass.Answered;
  const left = workingDaysLeft(store, i);
  if (left < 0) return DeadlineClass.Overdue;
  return left <= DUE_SOON_WORKING_DAYS ? DeadlineClass.DueSoon : DeadlineClass.Later;
}

/* Whether the complaint's text carries an adversarial insertion: text
   that addresses an assistant ("ignore previous instructions", "approve
   and close this"). Marked in the data so tests can find every one. */
export function isAdversarial(store: ColumnStore, i: number): boolean {
  return (store.injection[i] ?? 0) > 0;
}

export function hasFlag(store: ColumnStore, i: number, flag: number): boolean {
  return ((store.rules[i] ?? 0) & flag) !== 0;
}

/* One row as codes, language-neutral */
export type RowCodes = {
  index: number;
  id: string;
  received: number;
  receivedMinute: number;
  registered: number;
  stream: number;
  source: number;
  sector: number;
  channel: number;
  applicant: number;
  client: number;
  reason: number;
  operation: number;
  opRef: number;
  opOn: number;
  opAmount: number;
  claim: number;
  claimForm: number;
  stage: number;
  outcome: number;
  ground: number;
  extension: number;
  assignee: number;
  signatory: number;
  linked: number;
  due: number;
  dueExt: number;
  extNotice: number;
  leftBase: number;
  leftExt: number;
  rules: number;
  sentOn: number;
  breach: number;
  copies: number;
  template: number;
  variant: number;
  injection: number;
  note: NoteValue;
  updatedAt: number;
};

export function getRow(store: ColumnStore, i: number): RowCodes {
  const row = { index: i, id: rowId(i) } as RowCodes;
  for (const key of COLUMN_KEYS) {
    if (key !== "note") (row as Record<string, unknown>)[key] = store[key][i] ?? 0;
  }
  row.note = getNote(store, i);
  return row;
}

const DAY = 86_400_000;

/* Start of the UTC day of `now`: what an edit writes into updatedAt */
export function dayOf(now: number): number {
  return Math.floor(now / DAY) * DAY;
}

/* Reads an editable code field */
export function readField(store: ColumnStore, row: number, field: EnumField): number {
  return store[field][row] ?? 0;
}

/* Writes an editable code field. A reply that goes out is sent on
   AS_OF; one taken back to an earlier stage has not gone out. */
export function writeField(store: ColumnStore, row: number, field: EnumField, value: number, now: number): void {
  store[field][row] = value;
  if (field === "stage") {
    if (value >= Stage.Sent && (store.sentOn[row] ?? -1) < 0) store.sentOn[row] = AS_OF_DAY;
    if (value < Stage.Sent) store.sentOn[row] = -1;
  }
  store.updatedAt[row] = dayOf(now);
}

/* Writes a note. A pool value clears any edit; other values override. */
export function writeNote(store: ColumnStore, row: number, value: NoteValue, now: number): void {
  if (value.kind === "pool") {
    store.note[row] = value.code;
    store.noteEdits.delete(row);
  } else if (value.kind === "text" && value.text === "") {
    store.note[row] = 0;
    store.noteEdits.delete(row);
  } else {
    store.noteEdits.set(row, value);
  }
  store.updatedAt[row] = dayOf(now);
}

/* Copies due today and not yet sent, sent, or none owed: the copies of a
   reply are due on the day it went out, the copy of an extension notice
   on the day of the extension (always the day the data is taken) */
export function copyClass(store: ColumnStore, i: number): number {
  const c = store.copies[i] ?? 0;
  if (c === 0) return CopyClass.None;
  const today = (store.sentOn[i] ?? -1) === AS_OF_DAY;
  const open =
    (today && (c & Copy.BankOfRussiaDue) !== 0 && (c & Copy.BankOfRussiaSent) === 0) ||
    (today && (c & Copy.SroDue) !== 0 && (c & Copy.SroSent) === 0) ||
    ((c & Copy.NoticeDue) !== 0 && (c & Copy.NoticeSent) === 0);
  return open ? CopyClass.DueToday : CopyClass.Sent;
}
