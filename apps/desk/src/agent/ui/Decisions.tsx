// The confirmations the run stops for: a risky step's draft (confirm or
// skip; a reply shows the letter itself, as the agent will write it) and
// the agent's request to leave the plan (allow or keep it). Each
// is an AlertDialog with the focus on the safe action, so an Enter pressed
// by habit skips the step or keeps the plan; Escape does the same, and the
// dialog says so. Stop stays one key away while the dialog is open.
//
// One decision can follow another at once (the agent's request kept, then
// the same step's confirmation). A dialog notes where the focus was when
// it opened, to give it back when it closes; opened while the focus is
// still in the dialog that is closing, it would note a button that is
// about to go. So a dialog opens once the focus has left the last one.
import { useEffect, useRef, useState } from "react";
import { AlertDialog, Kbd } from "@ghostjima/stoa-react";
import { applyDeviation, type WaitingNotice } from "@ariadne/runner";
import { caseId, draftLines, objectLine, stepTitle, type Text } from "../text";
import type { StepView } from "./hooks";
import type { CaseFacts } from "@ariadne/rules";
import { ReplyDraftView } from "./ReplyCheck";

export type DecisionsProps = {
  x: Text;
  steps: StepView[];
  waiting: WaitingNotice | null;
  open: boolean;
  onDecide: (stepId: string, command: "confirm" | "skip" | "allow" | "deny") => void;
  /** The case's facts as ariadne-rules takes them: the reply shown for
   * confirmation cites the provisions the rules give for the case. */
  facts: CaseFacts;
};

function KeyHints({ x, escape }: { x: Text; escape: string }) {
  return (
    <>
      <p className="muted">
        <Kbd>Esc</Kbd> {escape}
      </p>
      <p className="muted">
        {x.t.confirm.stopHint} <Kbd>S</Kbd>
      </p>
    </>
  );
}

/** True once no dialog holds the focus (or after a few frames, so a
 * dialog never waits for long), for each new decision `key`. */
function useFocusSettled(key: string | null): boolean {
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    let frames = 0;
    let id = 0;
    const check = () => {
      const inDialog = document.activeElement?.closest('[role="alertdialog"], [role="dialog"]');
      if (!inDialog || frames >= 10) setSettled(key);
      else {
        frames += 1;
        id = requestAnimationFrame(check);
      }
    };
    check();
    return () => cancelAnimationFrame(id);
  }, [key]);
  return key !== null && settled === key;
}

export function Decisions({ x, steps, waiting, open, onDecide, facts }: DecisionsProps) {
  const { t, f } = x;
  const accepted = useRef(false);
  const settled = useFocusSettled(waiting ? `${waiting.stepId}-${waiting.accepts.join("-")}` : null);
  if (!waiting) return null;
  const index = steps.findIndex((s) => s.id === waiting.stepId);
  const view = steps[index];
  if (!view) return null;
  const ctx = view.snapshot.context;
  const position = f.int(index + 1);
  const key = `${waiting.stepId}-${waiting.accepts.join("-")}`;

  // Pressing the primary action confirms; any other close (the safe
  // button, Escape) is the safe answer.
  const onOpenChange = (safe: "skip" | "deny") => (isOpen: boolean) => {
    if (isOpen) return;
    if (accepted.current) {
      accepted.current = false;
      return;
    }
    onDecide(waiting.stepId, safe);
  };

  if (waiting.accepts.includes("allow") && ctx.deviation) {
    const deviation = ctx.deviation;
    const proposed = stepTitle(x, applyDeviation(ctx.step));
    return (
      <AlertDialog
        key={key}
        isOpen={open && settled}
        onOpenChange={onOpenChange("deny")}
        title={t.deviation.title(position)}
        confirmLabel={t.deviation.allow}
        cancelLabel={t.deviation.deny}
        onConfirm={() => {
          accepted.current = true;
          onDecide(waiting.stepId, "allow");
        }}
      >
        <p>{stepTitle(x, ctx.step)}</p>
        <p>{t.deviationReason[deviation.reason](caseId(deviation.linkedCase))}</p>
        <p>{t.deviationProposal[deviation.proposal]}</p>
        <p>{t.deviation.instead(proposed, t.risk[deviation.newRisk])}</p>
        <KeyHints x={x} escape={t.deviation.escapeKeeps} />
      </AlertDialog>
    );
  }

  if (waiting.accepts.includes("confirm") && ctx.draft) {
    const draft = ctx.draft;
    return (
      <AlertDialog
        key={key}
        isOpen={open && settled}
        onOpenChange={onOpenChange("skip")}
        title={t.confirm.title(position, stepTitle(x, ctx.step))}
        confirmLabel={t.confirm.confirm[draft.kind]}
        cancelLabel={t.confirm.skip}
        tone={ctx.step.risk === "high" ? "destructive" : "neutral"}
        onConfirm={() => {
          accepted.current = true;
          onDecide(waiting.stepId, "confirm");
        }}
      >
        <p className="draft-kind">
          {t.draftKind[draft.kind]} · {t.risk[ctx.step.risk]}
        </p>
        {draftLines(x, draft).map((line) => (
          <p key={line}>{line}</p>
        ))}
        {draft.kind === "reply" && <ReplyDraftView x={x} draft={draft} facts={facts} />}
        <p className="draft-heading">{t.confirm.changes}</p>
        <ul className="draft-objects">
          {ctx.step.objects.map((object) => {
            const line = objectLine(x, object);
            return <li key={line}>{line}</li>;
          })}
        </ul>
        <p>{t.confirm.intro}</p>
        <KeyHints x={x} escape={t.confirm.escapeSkips} />
      </AlertDialog>
    );
  }
  return null;
}
