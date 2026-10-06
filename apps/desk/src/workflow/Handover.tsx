// Under the assistant's "hand over to legal review" step: whether the
// handover is on the case. The run hands over in its own log only; the
// case moves to legal review, with the draft kept for the reviewer, once a
// person confirms: in the run (the step asked, and the person confirmed),
// recorded at once, or here, with Confirm the handover.
import { useEffect, useRef } from "react";
import { Button, Callout, keepFocusInPlace, useFormatters } from "@ghostjima/stoa-react";
import { Stage, type ColumnStore } from "@ariadne/grid";
import type { ReplyDraft } from "@ariadne/runner";
import { POOLS } from "../data/query";
import type { Lang, Strings } from "../i18n";
import { handoverState, type CaseFiles } from "./caseFile";
import { workflowStrings } from "./i18n";
import { actorText } from "./Journal";

export type HandoverProps = {
  store: ColumnStore;
  row: number;
  files: CaseFiles;
  lang: Lang;
  t: Strings;
  run: number;
  draft: ReplyDraft | null;
  operator: boolean;
  /** A person confirmed the step in the run. */
  confirmed: boolean;
  onRecord: () => void;
};

export function Handover({ store, row, files, lang, t, run, draft, operator, confirmed, onRecord }: HandoverProps) {
  const w = workflowStrings[lang];
  const { pools, labels } = POOLS[lang];
  const fmt = useFormatters({ timeZone: "Europe/Moscow" });
  const state = handoverState({ store, row, files, run, draft, operator });
  const recordedOnce = useRef(false);
  // Confirmed in the run: on the case at once.
  useEffect(() => {
    if (state.kind === "confirm" && confirmed && !recordedOnce.current) {
      recordedOnce.current = true;
      onRecord();
    }
  }, [state.kind, confirmed, onRecord]);

  switch (state.kind) {
    case "recorded": {
      const who = actorText(w, t, pools, { kind: "assistant", confirmedBy: state.draft.confirmedBy });
      return (
        <div className="handover">
          <p>{w.handover.recorded(labels.stage[Stage.LegalReview] ?? "", who, fmt.dateTime(state.draft.at))}</p>
          <p className="muted">{w.handover.draftKept}</p>
        </div>
      );
    }
    case "no-draft":
      return <p className="muted">{w.handover.noDraft}</p>;
    case "already":
      return <p className="muted">{w.handover.already(labels.stage[state.stage] ?? "")}</p>;
    case "not-operator":
      return <p className="muted">{w.handover.notOperator}</p>;
    case "confirm":
      return (
        <Callout
          tone="info"
          role="none"
          title={w.handover.confirmTitle}
          action={
            <Button
              variant="primary"
              onPress={(e) => {
                // The button goes with the confirmation; the focus moves on
                // to the next control, never to the page's body.
                keepFocusInPlace(e.target);
                onRecord();
              }}
            >
              {w.handover.confirm}
            </Button>
          }
        >
          {w.handover.confirmText(labels.stage[Stage.LegalReview] ?? "")}
        </Callout>
      );
  }
}
