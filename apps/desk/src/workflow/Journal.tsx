// The case's journal: every transition, oldest first, with who took it,
// when and why, in Stoa's Timeline, grouped by its day in Moscow time.
import { Timeline, type TimelineEntry } from "@ghostjima/stoa-react";
import type { Actor, JournalEntry, Role, TextPools } from "@ariadne/grid";
import type { Strings } from "../i18n";
import { parseDecisionComment } from "./caseFile";
import type { WorkflowStrings } from "./i18n";

/** The person a role's index names. */
export function personName(pools: TextPools, role: Role, person: number): string {
  const list = role === "operator" ? pools.assignees : role === "reviewer" ? pools.reviewers : role === "signatory" ? pools.signatories : pools.supervisors;
  return list[person] ?? "";
}

/** Who made an entry, in words. */
export function actorText(w: WorkflowStrings, t: Strings, pools: TextPools, actor: Actor): string {
  switch (actor.kind) {
    case "system":
      return w.system;
    case "colleague":
      return w.colleague;
    case "assistant":
      return w.assistant(personName(pools, actor.confirmedBy.role, actor.confirmedBy.person));
    case "person":
      return w.person(t.roles[actor.role], personName(pools, actor.role, actor.person));
  }
}

export type JournalProps = {
  entries: readonly JournalEntry[];
  w: WorkflowStrings;
  t: Strings;
  pools: TextPools;
  stages: readonly string[];
  /** The time of day of epoch milliseconds, as the register shows them
   * (Moscow time); the day is the heading it sits under. */
  time: (ms: number) => string;
};

export function Journal({ entries, w, t, pools, stages, time }: JournalProps) {
  const items: TimelineEntry[] = entries.map((e, k) => ({
    id: String(k),
    at: e.at,
    when: time(e.at),
    kind: w.action[e.action],
    actor: actorText(w, t, pools, e.actor),
    text: (
      <div className="journal__lines" data-action={e.action}>
        {e.from !== e.to && <span className="muted">{w.move(stages[e.from] ?? "", stages[e.to] ?? "")}</span>}
        {e.reason && <span>{w.why(w.reasons[e.reason])}</span>}
        {e.copy && <span>{w.dispatch.copy[e.copy]}</span>}
        {e.view && <span>{w.database.viewSaid(w.database.views[e.view])}</span>}
        {e.comment && (e.action === "sign" || e.action === "defer") ? (
          <DecisionLines w={w} comment={e.comment} />
        ) : (
          e.comment && <span className="journal__comment">{w.said(e.comment)}</span>
        )}
      </div>
    ),
  }));
  return <Timeline label={w.journalCaption} entries={items} timeZone="Europe/Moscow" dayLevel={5} />;
}

/** A signature's or a deferral's decision record, as the journal keeps it. */
function DecisionLines({ w, comment }: { w: WorkflowStrings; comment: string }) {
  const record = parseDecisionComment(comment);
  if (!record) return <span className="journal__comment">{w.said(comment)}</span>;
  return (
    <>
      <span>{w.signature.record(w.signature.decisions[record.decision])}</span>
      {record.concerns && <span className="journal__comment">{w.signature.concernsSaid(record.concerns)}</span>}
      {record.wrong && <span className="journal__comment">{w.signature.wrongSaid(record.wrong)}</span>}
    </>
  );
}
