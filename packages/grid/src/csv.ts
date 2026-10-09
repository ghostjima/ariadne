import { moscowMs } from "./days.js";
import { COLUMN_BY_ID, type ColumnSpec } from "./schema.js";
import { effectiveDue, getNote, isAnswered, opRefText, rowId, workingDaysLeft, type ColumnStore } from "./store.js";
import { clientName, noteText, reasonText, subjectText, type Labels, type TextPools } from "./text.js";

/*
  CSV export. The header comes from caller-supplied column labels, code
  cells from the caller's labels and text cells from the caller's pools, so
  the engine writes no words of its own. Semicolon separated with CRLF by
  default (what Excel expects in many locales); the caller prepends a BOM
  for a download if it wants one. Text that a spreadsheet would read as a
  formula is written with a leading apostrophe (neutralizeFormula): a
  complaint's subject is the client's text, and the client is not trusted.
*/

export const CSV_LIMIT = 5_000;

export type CsvOptions = {
  /* Header text by column id; a missing id falls back to the id itself */
  headers: Readonly<Record<string, string>>;
  pools: TextPools;
  labels: Labels;
  /* At most this many rows after the header (default CSV_LIMIT) */
  limit?: number;
  separator?: string;
  newline?: string;
  /* Number cells; default String(n) */
  formatNumber?: (n: number, columnId: string) => string;
  /* Day cells, a day number; default YYYY-MM-DD */
  formatDay?: (day: number, columnId: string) => string;
  /* Date and time cells, epoch milliseconds; default ISO 8601 in UTC */
  formatTime?: (ms: number, columnId: string) => string;
};

export function csvEscape(value: string, separator = ";"): string {
  return value.includes(separator) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/*
  A spreadsheet reads a cell that starts with = + - @ (or their full-width
  forms), a tab or a carriage return as a formula, even inside quotes. A
  leading apostrophe makes it text again. Only for cells of text: numbers
  stay numbers.
*/
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;

export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/* Column kinds whose cells are numbers or dates, written as the formatter gives them */
const NUMERIC_KINDS: ReadonlySet<ColumnSpec["kind"]> = new Set(["money", "days", "date", "datetime"]);

const isoDayOf = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);
const isoTime = (ms: number) => new Date(ms).toISOString();

/* Displayed text of one cell, as written into the CSV */
export function cellText(store: ColumnStore, row: number, spec: ColumnSpec, options: CsvOptions): string {
  const { pools, labels } = options;
  const num = options.formatNumber ?? ((n: number) => String(n));
  const day = options.formatDay ?? isoDayOf;
  const time = options.formatTime ?? isoTime;
  const code = (list: readonly string[], v: number | undefined) => list[v ?? 0] ?? "";
  switch (spec.id) {
    case "id":
      return rowId(row);
    case "client":
      return clientName(store.applicant[row] ?? 0, store.client[row] ?? 0, pools);
    case "applicant":
      return code(labels.applicant, store.applicant[row]);
    case "stream":
      return code(labels.stream, store.stream[row]);
    case "reason":
      return reasonText(store.stream[row] ?? 0, store.reason[row] ?? 0, labels);
    case "database":
      /* Blank for a case with no data of the client's in the database */
      return (store.database[row] ?? 0) === 0 ? "" : code(labels.database, store.database[row]);
    case "restriction":
      /* Blank for a case with no data of the client's in the database */
      return (store.restriction[row] ?? 0) === 0 ? "" : code(labels.restriction, store.restriction[row]);
    case "subject":
      return subjectText(store, row, pools);
    case "source":
      return code(labels.source, store.source[row]);
    case "sector":
      return code(labels.sector, store.sector[row]);
    case "channel":
      return code(labels.channel, store.channel[row]);
    case "received":
      return time(moscowMs(store.received[row] ?? 0, store.receivedMinute[row] ?? 0), spec.id);
    case "registered":
      return day(store.registered[row] ?? 0, spec.id);
    case "left":
      /* An answered case has no time left to count */
      return isAnswered(store, row) ? "" : num(workingDaysLeft(store, row), spec.id);
    case "due":
      return day(effectiveDue(store, row), spec.id);
    case "extension":
      return code(labels.extension, store.extension[row]);
    case "stage":
      return code(labels.stage, store.stage[row]);
    case "outcome":
      return code(labels.outcome, store.outcome[row]);
    case "ground":
      return code(labels.ground, store.ground[row]);
    case "assignee":
      return pools.assignees[store.assignee[row] ?? 0] ?? "";
    case "signatory":
      return pools.signatories[store.signatory[row] ?? 0] ?? "";
    case "linked": {
      const l = store.linked[row] ?? -1;
      return l < 0 ? "" : rowId(l);
    }
    case "operation":
      return (store.operation[row] ?? 0) === 0 ? "" : opRefText(store.opRef[row] ?? 0);
    case "opAmount":
      return num(store.opAmount[row] ?? 0, spec.id);
    case "claim":
      return num(store.claim[row] ?? 0, spec.id);
    case "note":
      return noteText(getNote(store, row), pools);
    case "updatedAt":
      return day(Math.floor((store.updatedAt[row] ?? 0) / 86_400_000), spec.id);
    default:
      return "";
  }
}

/* The rows of `index` (in that order, up to the limit) as CSV text */
export function toCsv(store: ColumnStore, index: ArrayLike<number>, columns: readonly string[], options: CsvOptions): string {
  const sep = options.separator ?? ";";
  const specs = columns.map((id) => COLUMN_BY_ID.get(id)).filter((s): s is ColumnSpec => s !== undefined);
  const text = specs.map((s) => !NUMERIC_KINDS.has(s.kind));
  const lines: string[] = [specs.map((s) => csvEscape(neutralizeFormula(options.headers[s.id] ?? s.id), sep)).join(sep)];
  const n = Math.min(index.length, options.limit ?? CSV_LIMIT);
  for (let p = 0; p < n; p++) {
    const row = index[p] ?? 0;
    lines.push(
      specs
        .map((s, c) => {
          const cell = cellText(store, row, s, options);
          return csvEscape(text[c] ? neutralizeFormula(cell) : cell, sep);
        })
        .join(sep),
    );
  }
  return lines.join(options.newline ?? "\r\n");
}
