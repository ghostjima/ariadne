// The grid's columns: the engine's column catalogue turned into Stoa
// DataGrid columns for one language, role and store. Accessors read the
// page's store directly, so an edit shows as soon as the grid renders.
import {
  COLUMN_BY_ID,
  GROUND_COUNT,
  PINNED_COLUMNS,
  canEditColumn,
  checkField,
  checkNote,
  clientName,
  editContext,
  effectiveDue,
  getNote,
  moscowMs,
  noteText,
  opRefText,
  reasonText,
  rowId,
  subjectText,
  workingDaysLeft,
  type CellValue,
  type ColumnStore,
  type EditColumn,
  type EditError,
  type EnumField,
  type Labels,
  type Role,
} from "@ariadne/grid";
import { createElement } from "react";
import { DeadlineCell, deadlineText, stoaFormatters, type DataGridColumn, type StatusTone, type StoaFormat } from "@ghostjima/stoa-react";
import { LOCALES, type Lang, type Strings } from "../i18n";
import { POOLS } from "../data/query";

/** A case is close to its deadline at this many working days left. */
export const DUE_SOON = 3;

export type Formats = {
  /** A day number (days since 1970-01-01) */
  day: (day: number) => string;
  /** Epoch milliseconds, in Moscow time, the register's */
  dateTime: (ms: number) => string;
  /** Whole roubles */
  money: (roubles: number) => string;
  integer: Intl.NumberFormat;
  one: Intl.NumberFormat;
};

/** The desk's formats in a language, on Stoa's formatters (a minus sign,
 * no break inside a value) where they have one. */
export function makeFormats(lang: Lang): Formats {
  const locale = LOCALES[lang];
  const stoa = stoaFormatters(locale, { timeZone: "Europe/Moscow" });
  return {
    day: (day) => stoa.date(day * 86_400_000),
    dateTime: (ms) => stoa.dateTime(ms),
    money: (roubles) => stoa.money(roubles, { fractionDigits: 0 }),
    integer: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    one: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  };
}

/** A stage's tone in the grid: answered ones done, the ones waiting for a
 * signature called out; the rest without a symbol. */
export function stageTone(stage: number): StatusTone | null {
  if (stage >= 5) return "positive";
  return stage === 4 ? "warning" : null;
}

/** Width in CSS pixels by column id. */
const WIDTHS: Record<string, number> = {
  id: 112,
  client: 216,
  applicant: 152,
  stream: 216,
  reason: 280,
  subject: 280,
  source: 152,
  sector: 200,
  channel: 184,
  received: 152,
  registered: 136,
  left: 264,
  due: 136,
  extension: 200,
  stage: 192,
  outcome: 184,
  ground: 240,
  assignee: 184,
  signatory: 184,
  linked: 112,
  operation: 136,
  opAmount: 144,
  claim: 144,
  note: 280,
  updatedAt: 136,
};

/** The column a role edits is named in the role's refusal. */
const label = (labels: Labels, column: EditColumn) => labels.columns[column] ?? column;

/** The sentence for an engine edit error, in the interface's language. */
export function editErrorText(t: Strings, formats: Formats, labels: Labels, error: EditError): string {
  switch (error.code) {
    case "value-unknown":
      return t.editErrors.valueUnknown;
    case "role-cannot-edit":
      return t.editErrors.roleCannotEdit(label(labels, error.column));
    case "stage-not-for-role":
      return t.editErrors.stageNotForRole;
    case "transition-not-allowed":
      return t.editErrors.transitionNotAllowed;
    case "reason-required":
      return t.editErrors.reasonRequired;
    case "reply-needs-outcome":
      return t.editErrors.replyNeedsOutcome;
    case "refusal-needs-ground":
      return t.editErrors.refusalNeedsGround;
    case "ground-other-stream":
      return t.editErrors.groundOtherStream;
    case "send-needs-signature":
      return t.editErrors.sendNeedsSignature;
    case "reply-locked":
      return t.editErrors.replyLocked;
    case "extension-not-allowed":
      return t.editErrors.extensionNotAllowed;
    case "extension-too-late":
      return t.editErrors.extensionTooLate(formats.day(error.lastDay));
    case "extension-after-reply":
      return t.editErrors.extensionAfterReply;
    case "note-too-long":
      return t.editErrors.noteTooLong(formats.integer.format(error.max), formats.integer.format(error.length));
  }
}

/** The labels of a code field, in the store's code order. */
export function fieldLabels(lang: Lang, field: EnumField): readonly string[] {
  const { pools, labels } = POOLS[lang];
  switch (field) {
    case "stage":
      return labels.stage;
    case "outcome":
      return labels.outcome;
    case "ground":
      return labels.ground.slice(0, GROUND_COUNT);
    case "extension":
      return labels.extension;
    case "assignee":
      return pools.assignees;
  }
}

/** The displayed text of an editable cell's value. */
export function cellValueText(value: CellValue, lang: Lang, t: Strings): string {
  const { pools } = POOLS[lang];
  if (value.col === "note") return noteText(value.value, pools) || t.emptyNote;
  return fieldLabels(lang, value.col)[value.value] ?? "";
}

export type ColumnContext = {
  store: ColumnStore;
  lang: Lang;
  t: Strings;
  /** Stoa's words for the locale: the deadline's, as DeadlineCell writes it */
  stoa: StoaFormat;
  formats: Formats;
  role: Role;
  /** Pin the case and the applicant at the start; off on a narrow screen. */
  pin?: boolean;
  /** A refusal beyond the engine's edit rules (a reply not signed is not
   * sent), as its sentence, checked first. */
  check?: (row: number, field: EnumField, value: number) => string | null;
};

export function buildColumns(ids: readonly string[], { store, lang, t, stoa, formats, role, pin = true, check }: ColumnContext): DataGridColumn<number>[] {
  const { pools, labels } = POOLS[lang];
  const pinned = new Set<string>(pin ? PINNED_COLUMNS : []);
  const columns: DataGridColumn<number>[] = [];
  const code = (list: readonly string[], data: ArrayLike<number>) => (i: number) => list[data[i] ?? 0] ?? "";
  /** An enum column with an editor when the role edits it. */
  const enumColumn = (base: DataGridColumn<number>, field: EnumField): DataGridColumn<number> => {
    const list = fieldLabels(lang, field);
    return {
      ...base,
      // The option id: the enum editor starts from it, and the grid shows its label.
      accessor: (i) => String(store[field][i] ?? 0),
      format: (v) => list[Number(v)] ?? String(v),
      editor: canEditColumn(role, field)
        ? {
            kind: "enum",
            options: list.map((text, value) => ({ id: String(value), label: text })),
            validate: (value, i) => {
              const refused = check?.(i, field, Number(value)) ?? null;
              if (refused) return refused;
              const error = checkField(field, Number(value), editContext(store, i), role);
              return error ? editErrorText(t, formats, labels, error) : null;
            },
          }
        : undefined,
    };
  };
  for (const id of ids) {
    if (!COLUMN_BY_ID.has(id)) continue;
    const base: DataGridColumn<number> = {
      id,
      header: labels.columns[id] ?? id,
      width: WIDTHS[id] ?? 144,
      pinned: pinned.has(id),
      sortable: true,
      accessor: () => "",
    };
    switch (id) {
      case "id":
        columns.push({ ...base, accessor: (i) => rowId(i) });
        break;
      case "client":
        columns.push({ ...base, accessor: (i) => clientName(store.applicant[i] ?? 0, store.client[i] ?? 0, pools) });
        break;
      case "applicant":
        columns.push({ ...base, accessor: code(labels.applicant, store.applicant) });
        break;
      case "stream":
        columns.push({ ...base, accessor: code(labels.stream, store.stream) });
        break;
      case "reason":
        columns.push({ ...base, accessor: (i) => reasonText(store.stream[i] ?? 0, store.reason[i] ?? 0, labels) });
        break;
      case "subject":
        columns.push({ ...base, accessor: (i) => subjectText(store, i, pools) });
        break;
      case "source":
        columns.push({ ...base, accessor: code(labels.source, store.source) });
        break;
      case "sector":
        columns.push({ ...base, accessor: code(labels.sector, store.sector) });
        break;
      case "channel":
        columns.push({ ...base, accessor: code(labels.channel, store.channel) });
        break;
      case "received":
        // A date reads with its month's name: words, so the sans face.
        columns.push({
          ...base,
          accessor: (i) => moscowMs(store.received[i] ?? 0, store.receivedMinute[i] ?? 0),
          format: (v) => formats.dateTime(Number(v)),
          mono: false,
        });
        break;
      case "registered":
        columns.push({ ...base, accessor: (i) => store.registered[i] ?? 0, format: (v) => formats.day(Number(v)), mono: false });
        break;
      case "due":
        columns.push({ ...base, accessor: (i) => effectiveDue(store, i), format: (v) => formats.day(Number(v)), mono: false });
        break;
      case "updatedAt":
        columns.push({
          ...base,
          accessor: (i) => Math.floor((store.updatedAt[i] ?? 0) / 86_400_000),
          format: (v) => formats.day(Number(v)),
          mono: false,
        });
        break;
      case "left":
        // Drawn by DeadlineCell: its words, and its symbol in its colour;
        // the cell's text is the same words, for assistive technology and
        // copy. An answered case has no time left to count.
        columns.push({
          ...base,
          accessor: (i) => ((store.stage[i] ?? 0) >= 5 ? "" : workingDaysLeft(store, i)),
          render: (v) => (v === "" ? null : createElement(DeadlineCell, { left: Number(v), unit: "workingDays", warnAt: DUE_SOON })),
          cellText: (v) => (v === "" ? "" : deadlineText(stoa, Number(v), "workingDays")),
          mono: false,
        });
        break;
      case "stage":
        columns.push({ ...enumColumn(base, id), tone: (v) => stageTone(Number(v)) });
        break;
      case "outcome":
      case "ground":
      case "extension":
      case "assignee":
        columns.push(enumColumn(base, id));
        break;
      case "signatory":
        columns.push({ ...base, accessor: (i) => pools.signatories[store.signatory[i] ?? 0] ?? "" });
        break;
      case "linked":
        columns.push({
          ...base,
          accessor: (i) => {
            const l = store.linked[i] ?? -1;
            return l < 0 ? "" : rowId(l);
          },
        });
        break;
      case "operation":
        columns.push({ ...base, accessor: (i) => ((store.operation[i] ?? 0) === 0 ? "" : opRefText(store.opRef[i] ?? 0)) });
        break;
      case "opAmount":
      case "claim": {
        const data = id === "opAmount" ? store.opAmount : store.claim;
        columns.push({ ...base, accessor: (i) => data[i] ?? 0, format: (v) => (Number(v) === 0 ? "" : formats.money(Number(v))) });
        break;
      }
      case "note":
        columns.push({
          ...base,
          accessor: (i) => noteText(getNote(store, i), pools),
          editor: canEditColumn(role, "note")
            ? {
                kind: "text",
                validate: (value) => {
                  const error = checkNote(value, role);
                  return error ? editErrorText(t, formats, labels, error) : null;
                },
              }
            : undefined,
        });
        break;
    }
  }
  return columns;
}
