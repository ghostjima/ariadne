// Sentences from the engine's structured data: a step's title, a draft, the
// objects a step changes, a summary, an undo, an error, a log line. The
// words come from i18n.ts, the register's labels (stream, stage, operation,
// sign, category) from the grid's language pools, and the numbers and dates
// from format.ts.
import { AML_REASON_CODES, CASE_STAGES, OPERATIONS, SIGN_CODES, STREAMS } from "@ariadne/runner";
import type {
  AffectedObject,
  CaseStage,
  Draft,
  LogEntry,
  PlanStep,
  ReasonCode,
  StepError,
  StreamCode,
  Summary,
  UndoEffect,
} from "@ariadne/runner";
import { padId, type Labels } from "@ariadne/grid";
import type { Fmt } from "./format";
import type { Lang, Strings } from "./i18n";

export type Text = { t: Strings; f: Fmt; labels: Labels; lang: Lang };

/** A case number as the register shows it: C-000867. */
export const caseId = (caseNo: number): string => padId(caseNo);

export function streamName({ labels }: Text, stream: StreamCode): string {
  return labels.stream[STREAMS.indexOf(stream)] ?? stream;
}

export function stageName({ labels }: Text, stage: CaseStage): string {
  return labels.stage[CASE_STAGES.indexOf(stage)] ?? stage;
}

/** The register's label of an OD-2506 sign or a 115-FZ category. */
export function reasonName({ labels }: Text, reason: ReasonCode): string {
  const sign = (SIGN_CODES as readonly string[]).indexOf(reason);
  if (sign >= 0) return labels.signs[sign] ?? reason;
  return labels.amlReasons[(AML_REASON_CODES as readonly string[]).indexOf(reason)] ?? reason;
}

/** What a step does, as a title. A step that took the agent's proposed
 * change is titled by what it does now. */
export function stepTitle(x: Text, step: Pick<PlanStep, "type" | "draft">): string {
  const { t } = x;
  switch (step.type) {
    case "classify":
      return t.stepTitle.classify;
    case "request_facts":
      return t.stepTitle.request_facts(step.draft.template === "request_facts" ? t.team[step.draft.team] : t.team.operations);
    case "reuse_facts":
      return t.stepTitle.reuse_facts(step.draft.template === "reuse_linked_facts" ? caseId(step.draft.linkedCase) : "");
    case "draft_reply":
      return t.stepTitle.draft_reply;
    case "check_draft":
      return t.stepTitle.check_draft;
    case "hand_to_review":
      return t.stepTitle.hand_to_review;
  }
}

/** The lines of a draft, as a confirmation shows them. A reply's own
 * text is written out by reply.ts; here it has its preface. */
export function draftLines(x: Text, draft: Draft): string[] {
  const { t, f, labels } = x;
  switch (draft.template) {
    case "classify":
      return t.draft.classify(streamName(x, draft.stream), draft.reason ? reasonName(x, draft.reason) : null, t.regime[draft.regime]);
    case "request_facts": {
      const operation = draft.operation === "none" ? null : (labels.operation[OPERATIONS.indexOf(draft.operation)] ?? null);
      const day = draft.opOn ? `${operation}, ${f.date(draft.opOn)}` : operation;
      return t.draft.request_facts(
        caseId(draft.caseNo),
        t.team[draft.team],
        day,
        draft.questions.map((q) => t.question[q]),
        f.date(draft.factsDue),
      );
    }
    case "reuse_linked_facts":
      return t.draft.reuse_linked_facts(caseId(draft.linkedCase), draft.sendsRequest);
    case "reply":
      return t.draft.reply;
    case "check_draft":
      return t.draft.check_draft;
    case "hand_to_review":
      return t.draft.hand_to_review(caseId(draft.caseNo), stageName(x, draft.stageBefore), f.date(draft.replyDue), draft.sends);
  }
}

export function objectLine(x: Text, object: AffectedObject): string {
  const { t } = x;
  switch (object.kind) {
    case "classification":
      return t.object.classification(
        caseId(object.caseNo),
        t.classificationStatus[object.before.status],
        t.classificationStatus[object.after.status],
      );
    case "fact_request":
      return t.object.fact_request(t.team[object.team], t.requestStatus[object.before.status], t.requestStatus[object.after.status]);
    case "linked_facts":
      return t.object.linked_facts(caseId(object.linkedCase), t.linkStatus[object.before.status], t.linkStatus[object.after.status]);
    case "reply_draft":
      return t.object.reply_draft(t.draftStatus[object.before.status], t.draftStatus[object.after.status]);
    case "case":
      return t.object.case(caseId(object.caseNo), stageName(x, object.before.stage), stageName(x, object.after.stage));
  }
}

export function summaryText(x: Text, summary: Summary): string {
  const { t, f } = x;
  switch (summary.code) {
    case "case_classified":
      return t.summaryText.case_classified(
        caseId(summary.caseNo),
        streamName(x, summary.stream),
        summary.reason ? reasonName(x, summary.reason) : null,
      );
    case "facts_requested":
      return t.summaryText.facts_requested(t.team[summary.team], f.date(summary.factsDue));
    case "linked_facts_reused":
      return t.summaryText.linked_facts_reused(caseId(summary.linkedCase));
    case "reply_drafted":
      return t.summaryText.reply_drafted(caseId(summary.caseNo));
    case "draft_checked":
      return t.summaryText.draft_checked;
    case "handed_to_review":
      return t.summaryText.handed_to_review(caseId(summary.caseNo), f.date(summary.replyDue));
  }
}

export function undoText(x: Text, undo: UndoEffect): string {
  const { t } = x;
  switch (undo.code) {
    case "unconfirm_classification":
      return t.undoText.unconfirm_classification(caseId(undo.caseNo));
    case "recall_fact_request":
      return t.undoText.recall_fact_request(t.team[undo.team]);
    case "unlink_facts":
      return t.undoText.unlink_facts(caseId(undo.linkedCase));
    case "discard_draft":
      return t.undoText.discard_draft;
    case "clear_check":
      return t.undoText.clear_check;
    case "return_to_drafting":
      return t.undoText.return_to_drafting(caseId(undo.caseNo), stageName(x, undo.stage));
  }
}

export function errorText({ t, f }: Text, error: StepError): string {
  // Only a service that timed out has a number of seconds to state.
  return t.errorText[error.code](t.serviceName[error.service], f.int("timeoutSec" in error ? error.timeoutSec : 0));
}

export type LogText = { level: string; text: string };

/** One entry of the plan machine's log as a line: who (the agent or you)
 * and what. `position` gives a step's number in the run's order; `title`
 * its current title. Progress is not logged, as in the engine. */
export function logLine(
  x: Text,
  entry: LogEntry,
  position: (stepId: string) => string,
  title: (stepId: string) => string,
): LogText {
  const { t, f } = x;
  const agent = (text: string): LogText => ({ level: t.log.agent, text });
  const you = (text: string): LogText => ({ level: t.log.you, text });
  switch (entry.kind) {
    case "approved":
      return you(t.log.approved(f.int(entry.total), t.autonomy[entry.autonomy], f.int(entry.confirmations)));
    case "decision":
      return you(t.log.decision[entry.command](position(entry.stepId)));
    case "stop_requested":
      return you(t.log.stopRequested);
    case "undo":
      return you(t.log.undo(position(entry.stepId), entry.undo ? undoText(x, entry.undo) : ""));
    case "event": {
      const ev = entry.event;
      switch (ev.type) {
        case "plan.started":
          return agent(t.log.planStarted(f.int(ev.total)));
        case "step.started":
          return agent(t.log.stepStarted(position(ev.stepId), title(ev.stepId)));
        case "step.deviation":
          return agent(t.log.deviation(position(ev.stepId)));
        case "step.deviated":
          return agent(t.log.deviated(position(ev.stepId), title(ev.stepId)));
        case "step.awaiting":
          return agent(t.log.awaiting(position(ev.stepId)));
        case "step.running":
          return agent(t.log.running(position(ev.stepId), { n: ev.attempt, text: f.int(ev.attempt) }));
        case "step.progress":
          return agent(t.phase[ev.phase]);
        case "step.finished":
          return agent(t.log.finished(position(ev.stepId), summaryText(x, ev.result.summary)));
        case "step.skipped":
          return agent(t.log.skipped(position(ev.stepId), t.skipReason[ev.reason]));
        case "step.error":
          return agent(t.log.failed(position(ev.stepId), errorText(x, ev.error)));
        case "plan.finished":
          return agent(t.log.planFinished);
        case "plan.stopped":
          return agent(t.log.planStopped(ev.afterStepId ? position(ev.afterStepId) : null));
      }
    }
  }
}
