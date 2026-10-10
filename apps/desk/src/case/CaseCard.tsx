// The case card: everything about one complaint in one window. The
// complaint as the applicant wrote it, the applicant, the operation behind
// it, the flags around the operation (the OD-2506 sign with the order's own
// wording, or the 115-FZ category with its article), the timeline of its
// channels, the cases linked to it, and how the reply's last day was worked
// out, step by step, each step with its source. Every date and every rule
// is ariadne-rules'.
import { useMemo } from "react";
import {
  Button,
  Callout,
  DeadlineCell,
  DerivationTable,
  DescriptionList,
  Panel,
  Table,
  Timeline,
  deadlineText,
  useFormatters,
  useStoaFormat,
  type DerivationStep,
  type TableColumn,
  type TimelineEntry,
} from "@ghostjima/stoa-react";
import {
  AS_OF_DAY,
  AML_REASON_CODES,
  Applicant,
  Operation,
  RulesFlag,
  Source,
  Stream,
  clientName,
  complaintText,
  dayNumber,
  effectiveDue,
  hasFlag,
  isAnswered,
  moscowMs,
  opRefText,
  rowId,
  workingDaysLeft,
  type ColumnStore,
} from "@ariadne/grid";
import type { Basis, Deadline } from "@ariadne/rules";
import { POOLS } from "../data/query";
import { DUE_SOON } from "../desk/columns";
import type { CountUnit, Lang, Strings } from "../i18n";
import { caseDetails, type CaseDetails, type Flag, type Relation, type TimelineEvent } from "./details";
import { basisName } from "./sources";
import { retentionText } from "./retention";

const DAY_MS = 86_400_000;
/** The register keeps Moscow time: a day is the day in Moscow. */
const MOSCOW = "Europe/Moscow";

/** Where an entry known only by its day stands in Stoa's Timeline, which
 * sorts by time: at the end of its Moscow day, after the one timed entry
 * of the card (the receipt), and in the card's own order among the rest. */
const dayAt = (day: number) => moscowMs(day, 24 * 60 - 1);

export type CaseCardProps = {
  store: ColumnStore;
  row: number;
  lang: Lang;
  t: Strings;
  /** Bumped by every write to the store, so the card reads it again. */
  version: number;
  onOpenCase: (row: number) => void;
};

export function CaseCard({ store, row, lang, t, version, onOpenCase }: CaseCardProps) {
  const fmt = useFormatters({ timeZone: MOSCOW });
  const stoa = useStoaFormat();
  const c = t.case;
  const { pools, labels } = POOLS[lang];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = useMemo(() => caseDetails(store, row), [store, row, version]);
  const day = (d: number) => fmt.date(d * DAY_MS);
  const isoDate = (iso: string) => day(dayNumber(iso));
  const source = (b: Basis) => ({
    name: b.reading === "conservative" ? `${basisName(b, lang)} (${c.conservative})` : basisName(b, lang),
    revision: b.revision,
    href: b.url,
  });

  const text = complaintText(store, row, pools);
  const stream = store.stream[row] ?? 0;
  const channel = labels.channel[store.channel[row] ?? 0] ?? "";
  const operation = store.operation[row] ?? 0;
  const claim = store.claim[row] ?? 0;

  return (
    <div className="case-card">
      <Panel title={c.complaint} level={3} className="case-card__complaint">
        <DescriptionList
          items={[
            { term: c.subject, description: text.subject },
            { term: c.received, description: fmt.dateTime(moscowMs(store.received[row] ?? 0, store.receivedMinute[row] ?? 0)) },
            { term: c.channel, description: channel },
            { term: c.source, description: labels.source[store.source[row] ?? 0] ?? "" },
          ]}
        />
        {store.source[row] === Source.BankOfRussia && (
          <Callout tone="info" role="none">
            {c.forwarded}
          </Callout>
        )}
        {text.injection && (
          <Callout tone="warning" role="none">
            {c.injected}
          </Callout>
        )}
        <figure className="case-card__text">
          <figcaption className="muted">{c.text}</figcaption>
          <blockquote lang={lang}>{text.body}</blockquote>
        </figure>
      </Panel>

      <Panel title={c.applicant} level={3}>
        <DescriptionList
          items={[
            { term: c.name, description: clientName(store.applicant[row] ?? Applicant.Individual, store.client[row] ?? 0, pools) },
            { term: c.applicantType, description: labels.applicant[store.applicant[row] ?? 0] ?? "" },
          ]}
        />
      </Panel>

      <Panel title={c.operation} level={3}>
        {operation === Operation.None && claim === 0 ? (
          <p className="muted">{c.noOperation}</p>
        ) : (
          <DescriptionList
            items={[
              { term: c.operationKind, description: labels.operation[operation] ?? "" },
              ...(operation === Operation.None ? [] : [{ term: c.reference, description: opRefText(store.opRef[row] ?? 0), numeric: true }]),
              { term: c.operationDay, description: day(store.opOn[row] ?? 0) },
              ...((store.opAmount[row] ?? 0) > 0 ? [{ term: c.amount, description: fmt.money(store.opAmount[row] ?? 0, { fractionDigits: 0 }), numeric: true }] : []),
              ...(claim > 0 ? [{ term: c.claim, description: fmt.money(claim, { fractionDigits: 0 }), numeric: true }] : []),
            ]}
          />
        )}
        {stream === Stream.MoneyClaim && <p className="muted">{hasFlag(store, row, RulesFlag.Ombudsman) ? c.claimOmbudsman : c.claimAbove}</p>}
      </Panel>

      <Panel title={c.flags} level={3}>
        <Flags details={details} t={t} lang={lang} isoDate={isoDate} />
      </Panel>

      <Panel title={c.duties} level={3}>
        <Duties store={store} row={row} details={details} t={t} lang={lang} day={day} />
      </Panel>

      <Panel title={c.timeline} level={3}>
        <ChannelTimeline events={details.timeline} t={t} lang={lang} day={day} time={(ms) => fmt.time(ms)} />
      </Panel>

      <Panel title={c.related} level={3}>
        <Related store={store} details={details} t={t} lang={lang} onOpenCase={onOpenCase} />
      </Panel>

      <Panel title={c.deadline} level={3}>
        <DerivationTable caption={c.derivation} steps={derivation(store, row, details, t, day, isoDate, source, (left) => deadlineText(stoa, left, "workingDays"))} />
      </Panel>
    </div>
  );
}

/** The measures capped by the month: the law gives the limit, not how the
 * month is counted. */
const MONTHLY_LIMITS: ReadonlySet<string> = new Set(["cap_transfers", "cap_atm_cash"]);

function Flags({ details, t, lang, isoDate }: { details: CaseDetails; t: Strings; lang: Lang; isoDate: (iso: string) => string }) {
  const c = t.case;
  const { labels } = POOLS[lang];
  if (details.flags.length === 0) return <p className="muted">{c.noFlags}</p>;
  const entry = (flag: Flag): Pick<TimelineEntry, "kind" | "text"> => {
    switch (flag.kind) {
      case "sign": {
        const operation = labels.operation[flag.operation] ?? "";
        return {
          kind: c.sign(flag.sign.number),
          text: (
            <>
              <p>{flag.suspended ? c.signSuspended(operation) : c.signRefused(operation)}</p>
              <p className="muted">
                {c.signWording}: <q lang="ru">{flag.sign.wording}</q>
              </p>
              {lang !== "ru" && (
                <p className="muted">
                  {c.signSummary}: {flag.sign.summary}
                </p>
              )}
            </>
          ),
        };
      }
      case "aml": {
        const label = labels.amlReasons[(AML_REASON_CODES as readonly string[]).indexOf(flag.reason.code)] ?? flag.reason.code;
        return {
          kind: c.amlDecision(
            label,
            basisName({ source: flag.reason.source, act: "", article: flag.reason.article, part: flag.reason.part, revision: flag.reason.revision, url: "", reading: "text" }, lang),
          ),
        };
      }
      case "measure":
        return {
          kind: c.measure[flag.measure.kind] ?? flag.measure.kind,
          text: (
            <>
              <p className="muted">{c.basisLine(groundName(flag.measure.basis, t, lang))}</p>
              {flag.measure.until && <p className="muted">{c.measureEnded(isoDate(flag.measure.until))}</p>}
              {MONTHLY_LIMITS.has(flag.measure.kind) && <p className="muted">{c.monthNote}</p>}
            </>
          ),
        };
      case "deadline":
        return { kind: c.flagDeadline[flag.deadline.kind] ?? flag.deadline.kind, text: <p className="muted">{c.basisLine(groundName(flag.deadline.basis, t, lang))}</p> };
    }
  };
  const entries: TimelineEntry[] = details.flags.map((flag, k) => ({ id: `${flag.kind}-${k}`, at: dayAt(flag.day), ...entry(flag) }));
  return <Timeline label={c.flags} entries={entries} timeZone={MOSCOW} dayLevel={4} />;
}

/** A basis briefly, with the reading it takes when that is the
 * conservative one. */
function groundName(b: Basis, t: Strings, lang: Lang): string {
  return b.reading === "conservative" ? `${basisName(b, lang)} (${t.case.conservative})` : basisName(b, lang);
}

/** The duties tied to an event, each with when and its basis; how long the
 * case is kept; and what the rules note about the case's data. */
function Duties({ store, row, details, t, lang, day }: { store: ColumnStore; row: number; details: CaseDetails; t: Strings; lang: Lang; day: (d: number) => string }) {
  const c = t.case;
  const items = details.duties.map((duty, k) => ({
    id: `${duty.kind}-${k}`,
    term: c.duty[duty.kind] ?? duty.kind,
    description: c.dutyLine(c.dutyWhen[duty.when] ?? duty.when, groundName(duty.basis, t, lang)),
  }));
  const notes = details.warnings.map((code) => c.warning[code] ?? code);
  return (
    <>
      {items.length === 0 ? <p className="muted">{c.noDuties}</p> : <DescriptionList layout="stacked" items={items} />}
      <DescriptionList items={[{ id: "storage", term: c.keptUntil, description: retentionText(store, row, details, lang, day) }]} />
      {notes.length > 0 && (
        <Callout tone="warning" role="none" title={c.warnings}>
          <ul className="case-card__notes">
            {notes.map((note, k) => (
              <li key={k}>{note}</li>
            ))}
          </ul>
        </Callout>
      )}
    </>
  );
}

function ChannelTimeline({ events, t, lang, day, time }: { events: TimelineEvent[]; t: Strings; lang: Lang; day: (d: number) => string; time: (ms: number) => string }) {
  const e = t.case.event;
  const { labels } = POOLS[lang];
  const channel = (code: number) => labels.channel[code] ?? "";
  const line = (event: TimelineEvent): string => {
    switch (event.kind) {
      case "received":
        return event.forwarded ? `${e.received(channel(event.channel))}, ${e.forwarded}` : e.received(channel(event.channel));
      case "registered":
        return event.late ? e.registeredLate : e.registered;
      case "registration_notice":
        return e.registrationNotice(channel(event.channel));
      case "extended":
        return e.extended(day(event.until));
      case "reply_sent":
        return event.late ? `${e.replySent(channel(event.channel))}. ${e.replySentLate}` : e.replySent(channel(event.channel));
      case "copy_to_bank_of_russia":
        return e.copy;
      case "closed":
        return e.closed;
      case "reply_due":
        return e.replyDue;
    }
  };
  const entries: TimelineEntry[] = events.map((event, k) =>
    event.kind === "received"
      ? { id: `${event.kind}-${k}`, at: moscowMs(event.day, event.minute), when: time(moscowMs(event.day, event.minute)), kind: line(event) }
      : // The reply's last day, still to come, is the entry to notice first.
        { id: `${event.kind}-${k}`, at: dayAt(event.day), kind: line(event), emphasis: event.kind === "reply_due" },
  );
  return <Timeline label={t.case.timeline} entries={entries} timeZone={MOSCOW} dayLevel={4} />;
}

type RelatedRow = { row: number; relation: Relation };

function Related({ store, details, t, lang, onOpenCase }: { store: ColumnStore; details: CaseDetails; t: Strings; lang: Lang; onOpenCase: (row: number) => void }) {
  const c = t.case;
  const { labels } = POOLS[lang];
  const columns: TableColumn<RelatedRow>[] = [
    {
      id: "case",
      header: c.relatedColumns.case,
      cell: (r) => (
        <Button variant="ghost" size="small" onPress={() => onOpenCase(r.row)} aria-label={c.openCase(rowId(r.row))}>
          {rowId(r.row)}
        </Button>
      ),
    },
    { id: "relation", header: c.relatedColumns.relation, cell: (r) => c.relation[r.relation] },
    { id: "stream", header: c.relatedColumns.stream, cell: (r) => labels.stream[store.stream[r.row] ?? 0] ?? "" },
    { id: "stage", header: c.relatedColumns.stage, cell: (r) => labels.stage[store.stage[r.row] ?? 0] ?? "" },
    {
      id: "left",
      header: c.relatedColumns.left,
      cell: (r) => (isAnswered(store, r.row) ? "" : <DeadlineCell left={workingDaysLeft(store, r.row)} unit="workingDays" warnAt={DUE_SOON} />),
    },
  ];
  return <Table caption={c.related} hideCaption columns={columns} rows={details.related} rowKey={(r) => r.row} emptyText={c.relatedNone} wrapHeaders />;
}

/** The derivation of a case's reply day, with the card's own words and
 * sources, for a caller outside the card (the export for an inspection). */
export function caseDerivation(
  store: ColumnStore,
  row: number,
  t: Strings,
  lang: Lang,
  fmt: { date: (ms: number) => string },
  stoa: ReturnType<typeof useStoaFormat>,
): DerivationStep[] {
  const c = t.case;
  const day = (d: number) => fmt.date(d * DAY_MS);
  const isoDate = (iso: string) => day(dayNumber(iso));
  const source = (b: Basis) => ({
    name: b.reading === "conservative" ? `${basisName(b, lang)} (${c.conservative})` : basisName(b, lang),
    revision: b.revision,
    href: b.url,
  });
  return derivation(store, row, caseDetails(store, row), t, day, isoDate, source, (left) => deadlineText(stoa, left, "workingDays"));
}

/** The steps from receipt to the reply's last day, and the time left. */
function derivation(
  store: ColumnStore,
  row: number,
  details: CaseDetails,
  t: Strings,
  day: (d: number) => string,
  isoDate: (iso: string) => string,
  source: (b: Basis) => { name: string; revision: string; href: string },
  leftText: (left: number) => string,
): DerivationStep[] {
  const c = t.case;
  const count = (d: Deadline) => c.count(isoDate(d.from), String(d.countValue), d.count as CountUnit, d.countValue);
  const steps: DerivationStep[] = [{ id: "received", label: c.step.received, value: day(store.received[row] ?? 0) }];
  if (details.registration) {
    const late = hasFlag(store, row, RulesFlag.RegisteredLate);
    steps.push({
      id: "registration",
      label: c.step.registration,
      formula: count(details.registration),
      value: late ? `${day(store.registered[row] ?? 0)}, ${c.registeredLateNote}` : day(store.registered[row] ?? 0),
      source: source(details.registration.basis),
    });
  }
  if (details.reply) {
    steps.push({ id: "reply", label: c.step.reply, formula: count(details.reply), value: isoDate(details.reply.due), source: source(details.reply.basis) });
  }
  const term = details.term;
  const daysOff = term.calendar - term.working;
  const holidays = term.daysOff.length > 0 ? c.holidays(term.daysOff.map((d) => day(d.day)).join(", ")) : "";
  steps.push({
    id: "days-off",
    label: c.step.daysOff,
    formula: c.daysOffFormula(String(term.calendar), String(term.working)),
    value: [c.daysOffValue(String(daysOff), daysOff, String(term.weekend), holidays), term.workingWeekends > 0 ? c.workingWeekends(String(term.workingWeekends)) : ""]
      .filter(Boolean)
      .join("; "),
  });
  const ext = details.extension;
  if (ext.status === "taken") {
    steps.push({ id: "extension", label: c.step.extension, formula: count(ext.extended), value: c.extensionTaken(isoDate(ext.extended.due)), source: source(ext.extended.basis) });
  } else if (ext.status === "possible") {
    steps.push({ id: "extension", label: c.step.extension, value: c.extensionPossible(isoDate(ext.notice.due)), source: source(ext.notice.basis) });
  } else {
    const reason = ext.refusals.map((r) => c.extensionRefusal[r] ?? r).join("; ") || c.extensionRefused;
    steps.push({ id: "extension", label: c.step.extension, value: reason, ...(details.reply ? { source: source(details.reply.basis) } : {}) });
  }
  if (!isAnswered(store, row)) {
    steps.push({
      id: "left",
      label: c.step.left,
      formula: c.leftFormula(day(AS_OF_DAY), day(effectiveDue(store, row))),
      value: leftText(workingDaysLeft(store, row)),
    });
  }
  return steps;
}
