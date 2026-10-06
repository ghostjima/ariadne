import { COLUMN_BY_ID, CURRENCIES, METRIC_COUNT, METRIC_IDS, type ColumnSpec } from "./schema.js";
import { getComment, rowId, type ColumnStore } from "./store.js";
import { commentText, tagsText, type Labels, type TextPools } from "./text.js";

/*
  CSV export. The header comes from caller-supplied column labels, enum
  cells from the caller's labels and text cells from the caller's pools, so
  the engine writes no words of its own. Semicolon separated with CRLF by
  default (what Excel expects in many locales); the caller prepends a BOM
  for a download if it wants one. Text that a spreadsheet would read as a
  formula is written with a leading apostrophe (neutralizeFormula).
*/

export const CSV_LIMIT = 5_000;

export type CsvOptions = {
  /* Header text by column id; a missing id falls back to the id itself */
  headers: Readonly<Record<string, string>>;
  pools: TextPools;
  labels: Pick<Labels, "status" | "priority" | "channel">;
  /* At most this many rows after the header (default CSV_LIMIT) */
  limit?: number;
  separator?: string;
  newline?: string;
  /* Number cells; default String(n) */
  formatNumber?: (n: number, columnId: string) => string;
  /* Date cells; default the UTC calendar date, YYYY-MM-DD */
  formatDate?: (ms: number, columnId: string) => string;
};

export function csvEscape(value: string, separator = ";"): string {
  return value.includes(separator) || /["\r\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

/*
  A spreadsheet reads a cell that starts with = + - @ (or their full-width
  forms), a tab or a carriage return as a formula, even inside quotes. A
  leading apostrophe makes it text again. Only for cells of text: numbers
  stay numbers, a negative amount included.
*/
const FORMULA_START = /^[=+\-@\t\r\uff1d\uff0b\uff0d\uff20]/;

export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/* Column kinds whose cells are numbers, written as the formatter gives them */
const NUMERIC_KINDS: ReadonlySet<ColumnSpec["kind"]> = new Set(["money", "number", "hours", "date"]);

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const metricIndex = new Map<string, number>(METRIC_IDS.map((m, i) => [m, i]));

/* Displayed text of one cell, as written into the CSV */
export function cellText(
  store: ColumnStore,
  row: number,
  spec: ColumnSpec,
  options: CsvOptions,
): string {
  const { pools, labels } = options;
  const num = options.formatNumber ?? ((n: number) => String(n));
  const date = options.formatDate ?? isoDate;
  switch (spec.id) {
    case "id":
      return rowId(row);
    case "client":
      return pools.clients[store.client[row] ?? 0] ?? "";
    case "date":
      return date(store.date[row] ?? 0, spec.id);
    case "amount":
      return num(store.amount[row] ?? 0, spec.id);
    case "currency":
      return CURRENCIES[store.currency[row] ?? 0] ?? "";
    case "status":
      return labels.status[store.status[row] ?? 0] ?? "";
    case "owner":
      return pools.owners[store.owner[row] ?? 0] ?? "";
    case "region":
      return pools.regions[store.region[row] ?? 0] ?? "";
    case "priority":
      return labels.priority[store.priority[row] ?? 0] ?? "";
    case "sla":
      return num(store.sla[row] ?? 0, spec.id);
    case "tags":
      return tagsText(store.tags[row] ?? 0, pools);
    case "comment":
      return commentText(getComment(store, row), pools);
    case "channel":
      return labels.channel[store.channel[row] ?? 0] ?? "";
    case "updatedAt":
      return date(store.updatedAt[row] ?? 0, spec.id);
    case "createdBy":
      return pools.authors[store.createdBy[row] ?? 0] ?? "";
    default: {
      const k = metricIndex.get(spec.id);
      return k === undefined ? "" : num(store.metrics[row * METRIC_COUNT + k] ?? 0, spec.id);
    }
  }
}

/* The rows of `index` (in that order, up to the limit) as CSV text */
export function toCsv(
  store: ColumnStore,
  index: ArrayLike<number>,
  columns: readonly string[],
  options: CsvOptions,
): string {
  const sep = options.separator ?? ";";
  const specs = columns
    .map((id) => COLUMN_BY_ID.get(id))
    .filter((s): s is ColumnSpec => s !== undefined);
  const text = specs.map((s) => !NUMERIC_KINDS.has(s.kind));
  const lines: string[] = [
    specs.map((s) => csvEscape(neutralizeFormula(options.headers[s.id] ?? s.id), sep)).join(sep),
  ];
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
