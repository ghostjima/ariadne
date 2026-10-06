// The grid's columns: the engine's column catalogue turned into Stoa
// DataGrid columns for one language, role and store. Accessors read the
// page's store directly, so an edit shows as soon as the grid renders.
import {
  COLUMN_BY_ID,
  CURRENCIES,
  METRIC_COUNT,
  METRIC_IDS,
  PINNED_COLUMNS,
  checkComment,
  checkStatus,
  commentText,
  getComment,
  isCommentBlank,
  rowId,
  tagsText,
  type CellValue,
  type ColumnStore,
  type EditError,
} from "@ariadne/grid";
import type { DataGridColumn } from "@ghostjima/stoa-react";
import { LOCALES, type Lang, type Strings } from "../i18n";
import { POOLS } from "../data/query";

export type Formats = {
  date: Intl.DateTimeFormat;
  money: Intl.NumberFormat[];
  integer: Intl.NumberFormat;
  one: Intl.NumberFormat;
  two: Intl.NumberFormat;
};

export function makeFormats(lang: Lang): Formats {
  const locale = LOCALES[lang];
  return {
    date: new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }),
    money: CURRENCIES.map((currency) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 })),
    integer: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    one: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    two: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
}

/** An amount in its currency. In a right-to-left language a symbol with
 * Latin letters ("US$") is isolated left to right: unisolated, its "$"
 * takes the cell's direction and is drawn before the letters, "$US". The
 * grid's cell takes a string, so the isolate is written into it (LRI and
 * PDI) where a component would use Stoa's Ltr. */
export function formatMoney(format: Intl.NumberFormat, value: number, rtl: boolean): string {
  if (!rtl) return format.format(value);
  return format
    .formatToParts(value)
    .map((p) => (p.type === "currency" && /[A-Za-z]/.test(p.value) ? `\u2066${p.value}\u2069` : p.value))
    .join("");
}

/** Width in CSS pixels by column id; metrics share one width. */
const WIDTHS: Record<string, number> = {
  id: 104,
  client: 216,
  date: 144,
  amount: 128,
  currency: 88,
  status: 152,
  owner: 168,
  region: 144,
  priority: 104,
  sla: 128,
  tags: 184,
  comment: 280,
  channel: 112,
  updatedAt: 144,
  createdBy: 144,
};
const METRIC_WIDTH = 120;

const metricIndex = new Map<string, number>(METRIC_IDS.map((m, i) => [m, i]));
/** Metrics shown with one decimal; the others are whole numbers or two decimals. */
const ONE_DECIMAL = new Set(["marginPct", "conversion"]);
const TWO_DECIMALS = new Set(["commission", "weight"]);

/** The sentence for an engine edit error, in the interface's language. */
export function editErrorText(t: Strings, formats: Formats, error: EditError): string {
  switch (error.code) {
    case "status-unknown":
      return t.editErrors.statusUnknown;
    case "approve-needs-comment":
      return t.editErrors.approveNeedsComment;
    case "comment-too-long":
      return t.editErrors.commentTooLong(formats.integer.format(error.max), formats.integer.format(error.length));
    case "reject-needs-comment":
      return t.editErrors.rejectNeedsComment;
  }
}

/** The displayed text of an editable cell's value. */
export function cellValueText(value: CellValue, lang: Lang, t: Strings): string {
  const { pools, labels } = POOLS[lang];
  if (value.col === "status") return labels.status[value.value] ?? "";
  return commentText(value.value, pools) || t.emptyComment;
}

export type ColumnContext = {
  store: ColumnStore;
  lang: Lang;
  t: Strings;
  formats: Formats;
  /** Editors for status and comment. */
  editable: boolean;
  /** Pin ID and client at the start; off on a narrow screen. */
  pin?: boolean;
};

export function buildColumns(ids: readonly string[], { store, lang, t, formats, editable, pin = true }: ColumnContext): DataGridColumn<number>[] {
  const { pools, labels } = POOLS[lang];
  const pinned = new Set<string>(pin ? PINNED_COLUMNS : []);
  const columns: DataGridColumn<number>[] = [];
  for (const id of ids) {
    const spec = COLUMN_BY_ID.get(id);
    if (!spec) continue;
    const base = { id, header: labels.columns[id] ?? id, width: WIDTHS[id] ?? METRIC_WIDTH, pinned: pinned.has(id), sortable: true };
    switch (id) {
      case "id":
        columns.push({ ...base, accessor: (i) => rowId(i) });
        break;
      case "client":
        columns.push({ ...base, accessor: (i) => pools.clients[store.client[i] ?? 0] ?? "" });
        break;
      case "owner":
        columns.push({ ...base, accessor: (i) => pools.owners[store.owner[i] ?? 0] ?? "" });
        break;
      case "createdBy":
        columns.push({ ...base, accessor: (i) => pools.authors[store.createdBy[i] ?? 0] ?? "" });
        break;
      case "region":
        columns.push({ ...base, accessor: (i) => pools.regions[store.region[i] ?? 0] ?? "" });
        break;
      case "tags":
        columns.push({ ...base, accessor: (i) => tagsText(store.tags[i] ?? 0, pools) });
        break;
      case "currency":
        columns.push({ ...base, accessor: (i) => CURRENCIES[store.currency[i] ?? 0] ?? "" });
        break;
      case "priority":
        columns.push({ ...base, accessor: (i) => labels.priority[store.priority[i] ?? 0] ?? "" });
        break;
      case "channel":
        columns.push({ ...base, accessor: (i) => labels.channel[store.channel[i] ?? 0] ?? "" });
        break;
      case "date":
      case "updatedAt": {
        const data = id === "date" ? store.date : store.updatedAt;
        // A date reads with its month's name: words, so the sans face.
        columns.push({ ...base, accessor: (i) => data[i] ?? 0, format: (v) => formats.date.format(Number(v)), mono: false });
        break;
      }
      case "amount":
        columns.push({
          ...base,
          accessor: (i) => store.amount[i] ?? 0,
          format: (v, i) => formatMoney(formats.money[store.currency[i] ?? 0] ?? formats.integer, Number(v), lang === "ar"),
        });
        break;
      case "sla":
        columns.push({ ...base, accessor: (i) => store.sla[i] ?? 0, format: (v) => formats.one.format(Number(v)) });
        break;
      case "status":
        columns.push({
          ...base,
          // The option id: the enum editor starts from it, and the grid shows its label.
          accessor: (i) => String(store.status[i] ?? 0),
          editor: editable
            ? {
                kind: "enum",
                options: labels.status.map((label, code) => ({ id: String(code), label })),
                validate: (value, i) => {
                  const error = checkStatus(Number(value), isCommentBlank(store, i));
                  return error ? editErrorText(t, formats, error) : null;
                },
              }
            : undefined,
          format: (v) => labels.status[Number(v)] ?? String(v),
        });
        break;
      case "comment":
        columns.push({
          ...base,
          accessor: (i) => commentText(getComment(store, i), pools),
          editor: editable
            ? {
                kind: "text",
                validate: (value, i) => {
                  const error = checkComment(value, store.status[i] ?? 0);
                  return error ? editErrorText(t, formats, error) : null;
                },
              }
            : undefined,
        });
        break;
      default: {
        const k = metricIndex.get(id);
        if (k === undefined) break;
        const format = ONE_DECIMAL.has(id) ? formats.one : TWO_DECIMALS.has(id) ? formats.two : formats.integer;
        columns.push({ ...base, accessor: (i) => store.metrics[i * METRIC_COUNT + k] ?? 0, format: (v) => format.format(Number(v)) });
      }
    }
  }
  return columns;
}
