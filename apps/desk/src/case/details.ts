// What the case card shows, worked out from the register and asked of
// ariadne-rules: the whole clock of the case, the days off its reply term
// skips, the flags around its operation (the sign or the category, the
// measures with their grounds and every dated term), the duties, storage
// and warnings, the timeline of its channels and the cases linked to it. Codes, days and numbers only; CaseCard writes the
// words. The rules module must be loaded (loadRules).
import {
  Applicant,
  ELECTRONIC_CHANNELS,
  EXTENSION_WORKING_DAYS,
  Operation,
  RulesFlag,
  Source,
  Stage,
  Stream,
  caseFacts,
  dayNumber,
  effectiveDue,
  hasFlag,
  isExtended,
  isoDay,
  type ColumnStore,
} from "@ariadne/grid";
import { amlReasons, clock, dayKind, od2506Signs, type AmlReason, type Clock, type DayKind, type Deadline, type Duty, type Measure, type Sign } from "@ariadne/rules";

/** The days of a term after its first day up to its last, by kind. */
export type TermDays = {
  calendar: number;
  working: number;
  /** Saturdays and Sundays */
  weekend: number;
  /** Holidays and the weekdays a day off was moved to, with their days */
  daysOff: { day: number; kind: Exclude<DayKind, "working" | "working_weekend" | "weekend"> }[];
  /** Saturdays made working days by a decree, counted as working */
  workingWeekends: number;
};

export type Flag =
  | { kind: "sign"; day: number; sign: Sign; operation: number; suspended: boolean }
  | { kind: "aml"; day: number; reason: AmlReason; category: number }
  | { kind: "measure"; day: number; measure: Measure }
  | { kind: "deadline"; day: number; deadline: Deadline };

export type TimelineEvent =
  | { kind: "received"; day: number; minute: number; channel: number; forwarded: boolean }
  | { kind: "registered"; day: number; late: boolean }
  | { kind: "registration_notice"; day: number; channel: number }
  | { kind: "extended"; day: number; until: number }
  | { kind: "reply_sent"; day: number; channel: number; late: boolean }
  | { kind: "copy_to_bank_of_russia"; day: number }
  | { kind: "closed"; day: number }
  | { kind: "reply_due"; day: number };

export type Relation = "linked" | "links_here" | "same_applicant";

export type CaseDetails = {
  row: number;
  clock: Clock;
  registration: Deadline | null;
  reply: Deadline | null;
  /** The extension: as taken, or as it could be taken (the module asked
   * with one), or refused, with the module's refusal codes */
  extension:
    | { status: "taken"; extended: Deadline; notice: Deadline | null }
    | { status: "possible"; extended: Deadline; notice: Deadline }
    | { status: "refused"; refusals: string[] };
  /** The days the reply term covers, as it stands (extended or not) */
  term: TermDays;
  /** The sign or the category, the measures taken with their grounds, and
   * every dated term of the case beyond the reply's own (which the
   * derivation shows) and its storage */
  flags: Flag[];
  /** The duties tied to an event, each with when and its basis */
  duties: Duty[];
  /** How long the complaint, the reply and every notice are kept; null
   * when the sector's article sets no term (a warning says so) */
  storage: Deadline | null;
  /** What the rules note about the case's data, as codes */
  warnings: string[];
  timeline: TimelineEvent[];
  related: { row: number; relation: Relation }[];
};

const kinds = new Map<number, DayKind>();
function kindOf(day: number): DayKind {
  let kind = kinds.get(day);
  if (kind === undefined) {
    kind = dayKind(isoDay(day));
    kinds.set(day, kind);
  }
  return kind;
}

/** The days after `from` up to and including `to`, by their kind on the
 * production calendar. */
export function termDays(from: number, to: number): TermDays {
  const out: TermDays = { calendar: 0, working: 0, weekend: 0, daysOff: [], workingWeekends: 0 };
  for (let day = from + 1; day <= to; day++) {
    out.calendar++;
    const kind = kindOf(day);
    if (kind === "working") out.working++;
    else if (kind === "working_weekend") {
      out.working++;
      out.workingWeekends++;
    } else if (kind === "weekend") out.weekend++;
    else out.daysOff.push({ day, kind });
  }
  return out;
}

const find = (c: Clock, kind: string) => c.deadlines.find((d) => d.kind === kind) ?? null;
/** The reply's own terms, which the derivation of its last day shows, and
 * the storage term, shown with the duties: not among the flags. */
export const REPLY_TERMS: ReadonlySet<string> = new Set(["registration", "registration_notice", "reply", "extension_notice", "reply_extended", "storage_until"]);
const RELATED_MAX = 8;

export function caseDetails(store: ColumnStore, row: number): CaseDetails {
  const facts = caseFacts(store, row);
  const c = clock(facts);
  const reply = find(c, "reply");
  const asked = facts.extension ? c : clock({ ...facts, extension: { ground: "request_documents", workingDays: EXTENSION_WORKING_DAYS } });
  const extended = find(asked, "reply_extended");
  const notice = find(asked, "extension_notice");
  const extension: CaseDetails["extension"] = !extended
    ? { status: "refused", refusals: asked.refusals }
    : facts.extension
      ? { status: "taken", extended, notice }
      : { status: "possible", extended, notice: notice ?? extended };
  const registered = store.registered[row] ?? 0;
  const due = effectiveDue(store, row);
  const stream = store.stream[row] ?? 0;
  const reason = store.reason[row] ?? 0;
  const opOn = store.opOn[row] ?? 0;
  const operation = store.operation[row] ?? 0;

  const flags: Flag[] = [];
  if (stream === Stream.Antifraud && reason > 0) {
    const sign = od2506Signs()[reason - 1];
    if (sign) flags.push({ kind: "sign", day: opOn, sign, operation, suspended: operation === Operation.BankTransfer });
  }
  if (stream === Stream.Aml && reason > 0) {
    const r = amlReasons()[reason - 1];
    if (r) flags.push({ kind: "aml", day: opOn, reason: r, category: reason - 1 });
  }
  /* The measures taken, with their grounds, and every dated term around
     them, which binds the bank, the client or another body */
  for (const measure of c.measures) flags.push({ kind: "measure", day: dayNumber(measure.on), measure });
  for (const d of c.deadlines) if (!REPLY_TERMS.has(d.kind)) flags.push({ kind: "deadline", day: dayNumber(d.due), deadline: d });

  const channel = store.channel[row] ?? 0;
  const forwarded = store.source[row] === Source.BankOfRussia;
  const timeline: TimelineEvent[] = [
    { kind: "received", day: store.received[row] ?? 0, minute: store.receivedMinute[row] ?? 0, channel, forwarded },
    { kind: "registered", day: registered, late: hasFlag(store, row, RulesFlag.RegisteredLate) },
  ];
  if (ELECTRONIC_CHANNELS.includes(channel)) timeline.push({ kind: "registration_notice", day: registered, channel });
  if (isExtended(store, row)) timeline.push({ kind: "extended", day: store.extNotice[row] ?? registered, until: store.dueExt[row] ?? due });
  const sentOn = store.sentOn[row] ?? -1;
  if (sentOn >= 0) {
    timeline.push({ kind: "reply_sent", day: sentOn, channel, late: sentOn > due });
    if (forwarded) timeline.push({ kind: "copy_to_bank_of_russia", day: sentOn });
  } else {
    timeline.push({ kind: "reply_due", day: due });
  }
  if (store.stage[row] === Stage.Closed) timeline.push({ kind: "closed", day: Math.floor((store.updatedAt[row] ?? 0) / 86_400_000) });

  const related: { row: number; relation: Relation }[] = [];
  const linked = store.linked[row] ?? -1;
  if (linked >= 0) related.push({ row: linked, relation: "linked" });
  const client = store.client[row];
  const applicant = store.applicant[row] ?? Applicant.Individual;
  for (let i = 0; i < store.size && related.length < RELATED_MAX; i++) {
    if (i === row || i === linked || store.loaded[i] === 0) continue;
    if (store.linked[i] === row) related.push({ row: i, relation: "links_here" });
    else if (store.client[i] === client && store.applicant[i] === applicant) related.push({ row: i, relation: "same_applicant" });
  }

  return {
    row,
    clock: c,
    registration: find(c, "registration"),
    reply,
    extension,
    term: termDays(registered, due),
    flags,
    duties: c.duties,
    storage: find(c, "storage_until"),
    warnings: c.warnings,
    timeline: timeline.sort((a, b) => a.day - b.day),
    related,
  };
}

