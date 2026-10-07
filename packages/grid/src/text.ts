import { individualParts } from "./generator.js";
import { moscowMs } from "./days.js";
import {
  AML_REASON_COUNT,
  APPLICANT_COUNT,
  ASSIGNEE_COUNT,
  Applicant,
  CHANNEL_COUNT,
  COLUMN_IDS,
  COMPANY_COUNT,
  DEADLINE_COUNT,
  EXTENSION_COUNT,
  FIRST_NAME_COUNT,
  GROUND_COUNT,
  INJECTION_COUNT,
  NOTE_COUNT,
  OPERATION_COUNT,
  OUTCOME_COUNT,
  PRESET_IDS,
  REVIEWER_COUNT,
  SIGNATORY_COUNT,
  SIGN_COUNT,
  SOURCE_COUNT,
  STAGE_COUNT,
  STREAM_COUNT,
  SUPERVISOR_COUNT,
  SURNAME_COUNT,
  Stream,
  TEMPLATE_COUNT,
  type PresetId,
} from "./schema.js";
import { getNote, opRefText, rowId, type ColumnStore, type NoteValue } from "./store.js";

/*
  Displayed strings. The store holds codes; a language module supplies the
  free text the codes point at (TextPools) and the words of the interface
  (Labels). Switching language rebuilds the search index and nothing else.
  A complaint's text is put together here from its template, its
  variation bits and its slots (amount, date, reference), so the same row
  reads as the same complaint in every language.
*/

/* One complaint template. `body` is a list of sentences; a sentence given
   as a list is a choice, made by the row's variation bits. Slots:
   {amount} the operation's amount, {claim} the money claimed, {date} the
   operation's day, {ref} its reference. */
export type ComplaintTemplate = {
  /* A subject line, without slots */
  subject: string;
  body: readonly (string | readonly string[])[];
};

export type TextPools = {
  /* BCP 47 tag, used for collation and for the numbers and dates in
     generated text */
  locale: string;
  /* How a person's name is written: "{surname} {first}" or the other way */
  nameFormat: string;
  /* [male, female] forms of each surname */
  surnames: readonly (readonly [string, string])[];
  firstNames: { male: readonly string[]; female: readonly string[] };
  companies: readonly string[];
  assignees: readonly string[];
  signatories: readonly string[];
  /* The legal reviewers and the supervisor, as the journal names them */
  reviewers: readonly string[];
  supervisors: readonly string[];
  /* Non-empty notes; code k > 0 in the store is notes[k - 1] */
  notes: readonly string[];
  /* The colleague's note; "{n}" is replaced with its number */
  colleagueNote: string;
  /* TEMPLATE_COUNT templates for each stream, by stream code */
  complaints: readonly (readonly ComplaintTemplate[])[];
  greetings: readonly string[];
  closings: readonly string[];
  /* Text addressed to an assistant, planted in a complaint: the
     adversarial insertions, by injection code - 1 */
  injections: readonly string[];
};

export type Labels = {
  /* Header text for every column id of the catalogue */
  columns: Readonly<Record<string, string>>;
  stage: readonly string[];
  stream: readonly string[];
  source: readonly string[];
  channel: readonly string[];
  applicant: readonly string[];
  outcome: readonly string[];
  /* By ground code; code 0, no ground, included */
  ground: readonly string[];
  extension: readonly string[];
  deadline: readonly string[];
  operation: readonly string[];
  /* A short label for each OD-2506 sign in ariadne-rules' order, starting
     with the sign's number; the order's own wording is the crate's */
  signs: readonly string[];
  /* A short label for each 115-FZ category in ariadne-rules' order */
  amlReasons: readonly string[];
  presets: Readonly<Record<PresetId, string>>;
};

export type TextIssue =
  | { code: "size"; field: string; expected: number; actual: number }
  | { code: "empty-entry"; field: string; index: number }
  | { code: "missing-label"; field: string; key: string }
  | { code: "template"; field: string };

function checkList(issues: TextIssue[], field: string, list: readonly string[], expected: number): void {
  if (list.length !== expected) issues.push({ code: "size", field, expected, actual: list.length });
  list.forEach((s, index) => {
    if (s.trim() === "") issues.push({ code: "empty-entry", field, index });
  });
}

/* Checks that a pool fits the generator's code ranges. Empty means usable. */
export function validatePools(pools: TextPools): TextIssue[] {
  const issues: TextIssue[] = [];
  checkList(issues, "surnames", pools.surnames.map((s) => (s[0].trim() && s[1].trim() ? s[0] : "")), SURNAME_COUNT);
  checkList(issues, "firstNames.male", pools.firstNames.male, FIRST_NAME_COUNT);
  checkList(issues, "firstNames.female", pools.firstNames.female, FIRST_NAME_COUNT);
  checkList(issues, "companies", pools.companies, COMPANY_COUNT);
  checkList(issues, "assignees", pools.assignees, ASSIGNEE_COUNT);
  checkList(issues, "signatories", pools.signatories, SIGNATORY_COUNT);
  checkList(issues, "reviewers", pools.reviewers, REVIEWER_COUNT);
  checkList(issues, "supervisors", pools.supervisors, SUPERVISOR_COUNT);
  checkList(issues, "notes", pools.notes, NOTE_COUNT);
  checkList(issues, "injections", pools.injections, INJECTION_COUNT);
  if (pools.greetings.length === 0) issues.push({ code: "size", field: "greetings", expected: 1, actual: 0 });
  if (pools.closings.length === 0) issues.push({ code: "size", field: "closings", expected: 1, actual: 0 });
  if (!pools.colleagueNote.includes("{n}")) issues.push({ code: "template", field: "colleagueNote" });
  if (!pools.nameFormat.includes("{surname}") || !pools.nameFormat.includes("{first}")) {
    issues.push({ code: "template", field: "nameFormat" });
  }
  if (pools.complaints.length !== STREAM_COUNT) {
    issues.push({ code: "size", field: "complaints", expected: STREAM_COUNT, actual: pools.complaints.length });
  }
  pools.complaints.forEach((list, s) => {
    if (list.length !== TEMPLATE_COUNT) {
      issues.push({ code: "size", field: `complaints.${s}`, expected: TEMPLATE_COUNT, actual: list.length });
    }
    list.forEach((t, k) => {
      if (t.subject.trim() === "" || t.body.length === 0) issues.push({ code: "empty-entry", field: `complaints.${s}`, index: k });
    });
  });
  return issues;
}

export function validateLabels(labels: Labels): TextIssue[] {
  const issues: TextIssue[] = [];
  for (const id of COLUMN_IDS) {
    const s = labels.columns[id];
    if (s === undefined || s.trim() === "") issues.push({ code: "missing-label", field: "columns", key: id });
  }
  checkList(issues, "stage", labels.stage, STAGE_COUNT);
  checkList(issues, "stream", labels.stream, STREAM_COUNT);
  checkList(issues, "source", labels.source, SOURCE_COUNT);
  checkList(issues, "channel", labels.channel, CHANNEL_COUNT);
  checkList(issues, "applicant", labels.applicant, APPLICANT_COUNT);
  checkList(issues, "outcome", labels.outcome, OUTCOME_COUNT);
  checkList(issues, "ground", labels.ground, GROUND_COUNT);
  checkList(issues, "extension", labels.extension, EXTENSION_COUNT);
  checkList(issues, "deadline", labels.deadline, DEADLINE_COUNT);
  checkList(issues, "operation", labels.operation, OPERATION_COUNT);
  checkList(issues, "signs", labels.signs, SIGN_COUNT);
  checkList(issues, "amlReasons", labels.amlReasons, AML_REASON_COUNT);
  for (const id of PRESET_IDS) {
    const s = labels.presets[id];
    if (s === undefined || s.trim() === "") issues.push({ code: "missing-label", field: "presets", key: id });
  }
  return issues;
}

const formats = new Map<string, { number: Intl.NumberFormat; money: Intl.NumberFormat; date: Intl.DateTimeFormat }>();

function formatsFor(locale: string) {
  let f = formats.get(locale);
  if (!f) {
    f = {
      number: new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 }),
      money: new Intl.NumberFormat(locale, { style: "currency", currency: "RUB", maximumFractionDigits: 0 }),
      date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
    };
    formats.set(locale, f);
  }
  return f;
}

export function noteText(value: NoteValue, pools: TextPools): string {
  switch (value.kind) {
    case "pool":
      return value.code === 0 ? "" : (pools.notes[value.code - 1] ?? "");
    case "text":
      return value.text;
    case "colleague":
      return pools.colleagueNote.replace("{n}", formatsFor(pools.locale).number.format(value.n));
  }
}

/* A client's name: a company, or a person written in the pool's order */
export function clientName(applicant: number, code: number, pools: TextPools): string {
  if (applicant === Applicant.LegalEntity) return pools.companies[code % COMPANY_COUNT] ?? "";
  const { surname, first, female } = individualParts(code);
  const forms = pools.surnames[surname];
  const firstName = (female ? pools.firstNames.female : pools.firstNames.male)[first] ?? "";
  return pools.nameFormat.replace("{surname}", forms?.[female ? 1 : 0] ?? "").replace("{first}", firstName);
}

/* The reason of a row: an OD-2506 sign for a 161-FZ case, a 115-FZ
   category for a refusal under 115-FZ, nothing otherwise */
export function reasonText(stream: number, reason: number, labels: Labels): string {
  if (reason === 0) return "";
  if (stream === Stream.Antifraud) return labels.signs[reason - 1] ?? "";
  if (stream === Stream.Aml) return labels.amlReasons[reason - 1] ?? "";
  return "";
}

/* The bits of `variant` that choose each part of a complaint */
function choose<T>(list: readonly T[], variant: number, shift: number): T | undefined {
  if (list.length === 0) return undefined;
  return list[(variant >>> shift) % list.length];
}

export type ComplaintText = {
  subject: string;
  /* The complaint as the client wrote it, sentences joined with spaces */
  body: string;
  /* The adversarial insertion inside `body`, if any */
  injection: string | null;
};

/* The complaint's text in one language: untrusted data, shown and quoted,
   never followed */
export function complaintText(store: ColumnStore, i: number, pools: TextPools): ComplaintText {
  const stream = store.stream[i] ?? 0;
  const template = pools.complaints[stream]?.[store.template[i] ?? 0];
  if (!template) return { subject: "", body: "", injection: null };
  const variant = store.variant[i] ?? 0;
  const f = formatsFor(pools.locale);
  const slots: Record<string, string> = {
    amount: f.money.format(store.opAmount[i] ?? 0),
    claim: f.money.format(store.claim[i] ?? 0),
    date: f.date.format(moscowMs(store.opOn[i] ?? 0, 720)),
    ref: opRefText(store.opRef[i] ?? 0),
  };
  const fill = (s: string) => s.replace(/\{(amount|claim|date|ref)\}/g, (_, k: string) => slots[k] ?? "");
  const sentences: string[] = [];
  const greeting = choose(pools.greetings, variant, 0);
  if (greeting) sentences.push(greeting);
  template.body.forEach((part, k) => {
    const s = typeof part === "string" ? part : choose(part, variant, 2 + 2 * k);
    if (s) sentences.push(fill(s));
  });
  const code = store.injection[i] ?? 0;
  const injection = code > 0 ? (pools.injections[code - 1] ?? null) : null;
  if (injection) sentences.push(injection);
  const closing = choose(pools.closings, variant, 12);
  if (closing) sentences.push(closing);
  return { subject: template.subject, body: sentences.join(" "), injection };
}

/* The displayed text of a row's searchable fields */
export type RowText = {
  id: string;
  client: string;
  subject: string;
  operation: string;
  assignee: string;
  note: string;
};

/* The complaint's subject line alone */
export function subjectText(store: ColumnStore, i: number, pools: TextPools): string {
  return pools.complaints[store.stream[i] ?? 0]?.[store.template[i] ?? 0]?.subject ?? "";
}

export function rowText(store: ColumnStore, pools: TextPools, i: number): RowText {
  return {
    id: rowId(i),
    client: clientName(store.applicant[i] ?? 0, store.client[i] ?? 0, pools),
    subject: subjectText(store, i, pools),
    operation: (store.operation[i] ?? 0) === 0 ? "" : opRefText(store.opRef[i] ?? 0),
    assignee: pools.assignees[store.assignee[i] ?? 0] ?? "",
    note: noteText(getNote(store, i), pools),
  };
}

/* Lowercase search string per row, in one language */
export type SearchIndex = string[];

export function buildSearch(parts: RowText): string {
  return `${parts.id} ${parts.client} ${parts.subject} ${parts.operation} ${parts.assignee} ${parts.note}`.toLowerCase();
}

/* Search strings for every loaded row; rows not loaded get "" */
export function buildSearchIndex(store: ColumnStore, pools: TextPools): SearchIndex {
  const out = new Array<string>(store.size).fill("");
  for (let i = 0; i < store.size; i++) {
    if (store.loaded[i] === 0) continue;
    out[i] = buildSearch(rowText(store, pools, i));
  }
  return out;
}

/* Refreshes one row after an edit of a text field, or after its chunk loads */
export function refreshSearch(search: SearchIndex, store: ColumnStore, pools: TextPools, i: number): void {
  search[i] = store.loaded[i] === 0 ? "" : buildSearch(rowText(store, pools, i));
}
