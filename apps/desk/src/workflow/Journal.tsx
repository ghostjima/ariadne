// The case's journal: every transition, oldest first, with who took it,
// when and why. A thin dated list, the desk's own until Stoa has a
// Timeline; it uses the same marks as the card's channel timeline.
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
  /** Epoch milliseconds as the register shows them (Moscow time). */
  time: (ms: number) => string;
};

export function Journal({ entries, w, t, pools, stages, time }: JournalProps) {
  return (
    <ol className="timeline journal" aria-label={w.journalCaption}>
      {entries.map((e, k) => (
        <li key={k} className="timeline__item" data-action={e.action}>
          <span className="timeline__when">{time(e.at)}</span>
          <div className="timeline__what">
            <span className="journal__action">{w.action[e.action]}</span>
            {e.from !== e.to && <span className="muted">{w.move(stages[e.from] ?? "", stages[e.to] ?? "")}</span>}
            <span className="muted">{actorText(w, t, pools, e.actor)}</span>
            {e.reason && <span>{w.why(w.reasons[e.reason])}</span>}
            {e.copy && <span>{w.dispatch.copy[e.copy]}</span>}
            {e.comment && (e.action === "sign" || e.action === "defer") ? (
              <DecisionLines w={w} comment={e.comment} />
            ) : (
              e.comment && <span className="journal__comment">{w.said(e.comment)}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
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
