// The supervisor's metrics over the register, as Stoa's Metrics in a
// StatBar and a table per operator, labelled as computed from the
// synthetic register. The heading takes the focus when the view opens; Q
// or Back to the queue returns.
import { useEffect, useMemo, useRef, useState } from "react";
import { loadRules, rulesLoaded } from "@ariadne/rules";
import { AS_OF_DAY, type ColumnStore } from "@ariadne/grid";
import { Button, Callout, Disclosure, Metric, ProgressBar, StatBar, Table, useShortcuts, useFormatters, type MetricProps, type TableColumn } from "@ghostjima/stoa-react";
import { strings as agentStrings } from "../agent/i18n";
import { makeFmt } from "../agent/format";
import type { Text } from "../agent/text";
import { POOLS } from "../data/query";
import { LOCALES, type Lang } from "../i18n";
import type { CaseFiles } from "../workflow/caseFile";
import { supervisionStrings, type SupervisionStrings } from "./i18n";
import { measure, type Group } from "./measure";

export type MetricsProps = {
  store: ColumnStore;
  lang: Lang;
  files: CaseFiles;
  /** Bumped by every write to the store. */
  version: number;
  onBack: () => void;
};

type OperatorRow = { operator: number; group: Group };

export function Metrics({ store, lang, files, version, onBack }: MetricsProps) {
  const s = supervisionStrings[lang];
  const { pools, labels } = POOLS[lang];
  const fmt = useFormatters({ timeZone: "Europe/Moscow" });
  const [ready, setReady] = useState(rulesLoaded);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void loadRules().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [ready]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useShortcuts([{ key: "q", description: s.keys.back, group: s.title, onTrigger: onBack }]);

  const x: Text = useMemo(() => ({ t: agentStrings[lang], f: makeFmt(LOCALES[lang]), labels, lang }), [lang, labels]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => (ready ? measure(x, s, store, files) : null), [ready, x, s, store, files, version]);
  const f = x.f;
  const share = (a: number, b: number) => (b === 0 ? s.none : f.percent(a / b));
  const days = (v: number | null) => (v === null ? s.none : f.int(v));

  return (
    <section className="metrics" aria-labelledby="metrics-heading">
      <div className="case__bar">
        <Button variant="ghost" onPress={onBack} shortcut={{ key: "q" }}>
          {s.back}
        </Button>
        <h2 id="metrics-heading" ref={heading} tabIndex={-1} className="case__heading">
          {s.title}
        </h2>
      </div>
      <Callout tone="info" role="none">
        {s.note(fmt.date(AS_OF_DAY * 86_400_000))}
      </Callout>
      {!m ? (
        <ProgressBar label={s.title} isIndeterminate />
      ) : (
        <>
          <StatBar
            label={s.overall}
            items={[
              { label: s.counts.cases, value: f.int(m.all.cases) },
              { label: s.counts.open, value: f.int(m.all.open) },
              { label: s.counts.reviewed, value: f.int(m.all.reviewed) },
              { label: s.counts.signed, value: f.int(m.all.signed) },
            ]}
          />
          <div className="metrics__grid">
            {(
              [
                {
                  label: s.firstAction,
                  value: m.all.firstAction.median ?? 0,
                  unit: s.workingDays,
                  basis: `${s.firstActionBasis(f.int(m.all.firstAction.n))}; ${s.median(days(m.all.firstAction.median), days(m.all.firstAction.p90))}`,
                },
                {
                  label: s.breaches,
                  value: m.all.late + m.all.overdueNow,
                  unit: s.cases,
                  basis: s.breachesBasis(f.int(m.all.late), f.int(m.all.lateDays), f.int(m.all.overdueNow), f.int(m.all.overdueDays)),
                },
                { label: s.light, value: share(m.all.light, m.all.signed), basis: s.lightBasis(f.int(m.all.light), f.int(m.all.signed), f.int(m.all.signedInPage)) },
                { label: s.overrides, value: share(m.all.overrides, m.all.signed), basis: s.overridesBasis(f.int(m.all.overrides), f.int(m.all.signed)) },
                { label: s.returned, value: share(m.all.returned, m.all.reviewed), basis: s.returnedBasis(f.int(m.all.returned), f.int(m.all.reviewed)) },
                { label: s.reopened, value: share(m.all.reopened, m.all.cases), basis: s.reopenedBasis(f.int(m.all.cases)) },
                { label: s.escalated, value: share(m.all.escalated, m.all.cases), basis: s.escalatedBasis(f.int(m.all.cases)) },
              ] satisfies MetricProps[]
            ).map((props) => (
              <Metric key={props.label} {...props} />
            ))}
          </div>
          <OperatorTable rows={m.operators.map((group, operator) => ({ operator, group }))} names={pools.assignees} s={s} f={f} share={share} days={days} />
          <Disclosure summary={s.definitions}>
            <ul className="metrics__definitions">
              {s.defs.map((d, k) => (
                <li key={k}>{d}</li>
              ))}
            </ul>
          </Disclosure>
        </>
      )}
    </section>
  );
}

function OperatorTable({
  rows,
  names,
  s,
  f,
  share,
  days,
}: {
  rows: OperatorRow[];
  names: readonly string[];
  s: SupervisionStrings;
  f: Text["f"];
  share: (a: number, b: number) => string;
  days: (v: number | null) => string;
}) {
  const c = s.columns;
  const columns: TableColumn<OperatorRow>[] = [
    { id: "operator", header: c.operator, cell: (r) => names[r.operator] ?? "" },
    { id: "cases", header: c.cases, cell: (r) => f.int(r.group.cases), numeric: true },
    { id: "open", header: c.open, cell: (r) => f.int(r.group.open), numeric: true },
    { id: "overdue", header: c.overdue, cell: (r) => f.int(r.group.overdueNow), numeric: true },
    { id: "late", header: c.late, cell: (r) => f.int(r.group.late), numeric: true },
    { id: "first", header: c.firstAction, cell: (r) => days(r.group.firstAction.median), numeric: true },
    { id: "returned", header: c.returned, cell: (r) => share(r.group.returned, r.group.reviewed), numeric: true },
    { id: "light", header: c.light, cell: (r) => share(r.group.light, r.group.signed), numeric: true },
  ];
  return <Table caption={s.byOperator} columns={columns} rows={rows} rowKey={(r) => r.operator} emptyText={s.none} wrapHeaders />;
}
