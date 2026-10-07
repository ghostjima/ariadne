// The work on one case: the stage it is at, the transitions the page's
// role may take from there (each a button that says what it does), the
// return for rework with its reason, and the case's journal. The rules are
// the engine's (@ariadne/grid's transition table); a refusal is shown as
// its sentence, and nothing moves. After a transition the focus goes to
// the panel's heading: the button that had it may be gone with the stage.
import { useEffect, useRef, useState } from "react";
import { Button, Callout, Dialog, Panel, Select, TextField, useFormatters } from "@ghostjima/stoa-react";
import {
  RETURN_COMMENT_MIN,
  RETURN_REASONS,
  SELF_ASSIGNEE,
  SELF_SIGNATORY,
  caseJournal,
  rowId,
  transitionsFor,
  type Action,
  type ColumnStore,
  type ReturnReason,
  type Role,
  type TransitionError,
} from "@ariadne/grid";
import { POOLS } from "../data/query";
import type { Lang, Strings } from "../i18n";
import { workflowStrings } from "./i18n";
import { Journal, personName } from "./Journal";

export type TransitionRequest = { action: Action; reason?: ReturnReason; comment?: string };

export type CaseWorkProps = {
  store: ColumnStore;
  row: number;
  role: Role;
  lang: Lang;
  t: Strings;
  /** Bumped by every write to the store. */
  version: number;
  /** Takes a transition as the role's person; the refusal, or null. */
  onTransition: (request: TransitionRequest) => TransitionError | null;
};

/** Whether the role acts on this case: the operator on their own cases, the
 * signatory on the replies they sign; the reviewer and the supervisor on
 * every case. */
export function actsOn(store: ColumnStore, row: number, role: Role): boolean {
  if (role === "operator") return store.assignee[row] === SELF_ASSIGNEE;
  if (role === "signatory") return store.signatory[row] === SELF_SIGNATORY;
  return true;
}

export function CaseWork({ store, row, role, lang, t, version, onTransition }: CaseWorkProps) {
  const w = workflowStrings[lang];
  const { pools, labels } = POOLS[lang];
  const fmt = useFormatters({ timeZone: "Europe/Moscow" });
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<TransitionError | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState<ReturnReason | "none">("none");
  const [comment, setComment] = useState("");
  const [dialogError, setDialogError] = useState<TransitionError | null>(null);
  const refocus = useRef(false);
  const stage = store.stage[row] ?? 0;
  const id = rowId(row);
  void version;

  const focusHeading = () => {
    const heading = box.current?.querySelector<HTMLElement>(".stoa-panel__title");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };
  // Once the return dialog has gone, the focus goes to the heading: the
  // Return button that opened it went with the stage.
  useEffect(() => {
    if (returning || !refocus.current) return;
    refocus.current = false;
    const frame = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(frame);
  }, [returning]);

  const mine = actsOn(store, row, role);
  const actions = mine ? transitionsFor(stage, role) : [];
  const take = (action: Action) => {
    const refused = onTransition({ action });
    setError(refused);
    if (!refused) requestAnimationFrame(focusHeading);
  };
  const openReturn = () => {
    setReason("none");
    setComment("");
    setDialogError(null);
    setError(null);
    setReturning(true);
  };
  const confirmReturn = () => {
    const refused = onTransition({ action: "return", ...(reason === "none" ? {} : { reason }), comment });
    setDialogError(refused);
    if (!refused) {
      refocus.current = true;
      setReturning(false);
    }
  };
  const errorText = (e: TransitionError) =>
    e.code === "comment-required" ? w.commentRequired(String(e.min)) : e.code === "comment-too-long" ? w.commentTooLong(String(e.max), String(e.length)) : w.errors[e.code];

  return (
    <div ref={box} className="case-work">
      <Panel title={w.panel} level={3}>
        <p className="muted">{w.actingAs(t.roles[role], personName(pools, role, 0))}</p>
        {!mine ? (
          <p>
            {role === "operator"
              ? w.notYours(pools.assignees[store.assignee[row] ?? 0] ?? "")
              : w.notYoursSigner(pools.signatories[store.signatory[row] ?? 0] ?? "")}
          </p>
        ) : actions.length === 0 ? (
          <p>{w.nothingToDo(labels.stage[stage] ?? "")}</p>
        ) : (
          <ul className="case-work__actions">
            {actions.map((a) => (
              <li key={a.action}>
                <Button variant={a.needsReason ? "secondary" : "primary"} onPress={() => (a.needsReason ? openReturn() : take(a.action))}>
                  {w.act[a.action] ?? a.action}
                </Button>
                <span className="muted">{w.actHelp[a.action]}</span>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <Callout tone="negative" role="alert">
            {errorText(error)}
          </Callout>
        )}
        <h4 className="case-work__journal-title">{w.journal}</h4>
        <Journal entries={caseJournal(store, row)} w={w} t={t} pools={pools} stages={labels.stage} time={(ms) => fmt.dateTime(ms)} />
      </Panel>
      <Dialog
        isOpen={returning}
        onOpenChange={(open) => {
          if (!open) {
            refocus.current = true;
            setReturning(false);
          }
        }}
        title={w.returnTitle(id)}
        actions={
          <>
            <Button
              onPress={() => {
                refocus.current = true;
                setReturning(false);
              }}
            >
              {w.cancel}
            </Button>
            <Button variant="primary" onPress={confirmReturn}>
              {w.returnConfirm}
            </Button>
          </>
        }
      >
        <div className="case-work__return">
          <p>{w.returnFrom(labels.stage[stage] ?? "")}</p>
          <Select<ReturnReason | "none">
            label={w.reason}
            value={reason}
            onChange={setReason}
            options={[{ id: "none", label: w.reasonNone }, ...RETURN_REASONS.map((r) => ({ id: r, label: w.reasons[r] }))]}
          />
          <TextField label={w.comment} value={comment} onChange={setComment} description={w.commentHelp(String(RETURN_COMMENT_MIN))} />
          {dialogError && (
            <p className="field-error" role="alert">
              {errorText(dialogError)}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
