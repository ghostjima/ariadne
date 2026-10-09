// The client's own data in the Bank of Russia's database, on the case: what
// the bank's copy of the record holds; the bank's own reasoned application
// to remove the data (161-FZ art. 9 part 11.9), which the legal reviewer or
// the supervisor writes the bank's reasons for and sends after a
// confirmation, since it is not recalled, then shows when it went and when
// the Bank of Russia decides, as ariadne-rules counts it; and the Bank of
// Russia's request about an application the client filed with it
// directly (Directive No. 6748-U items 2.2, 2.9), recorded the day it
// arrives with the bank's 3 working days from ariadne-rules, and answered
// with the bank's view and reasons. Shown only for a case about the
// client's own data.
import { useEffect, useRef, useState } from "react";
import { AlertDialog, Button, DescriptionList, Panel, RadioGroup, TextArea, useFormatters } from "@ghostjima/stoa-react";
import {
  ANSWER_REASON_MIN,
  Path,
  QUERY_ANSWER_ROLES,
  QUERY_INTAKE_ROLES,
  QUERY_VIEWS,
  checkQueryAnswer,
  queryAnswerOf,
  queryReceivedOn,
  type QueryError,
  type QueryView,
  REMOVAL_REASON_MAX,
  REMOVAL_REASON_MIN,
  REMOVAL_ROLES,
  caseFacts,
  checkRemoval,
  dayNumber,
  isClientDataCase,
  removalAppliedOn,
  rowId,
  type ColumnStore,
  type RemovalError,
  type Role,
} from "@ariadne/grid";
import { clock } from "@ariadne/rules";
import { basisName } from "../case/sources";
import { POOLS } from "../data/query";
import type { Lang } from "../i18n";
import { actsOn } from "./CaseWork";
import { workflowStrings } from "./i18n";

const DAY_MS = 86_400_000;

export type DatabasePanelProps = {
  store: ColumnStore;
  row: number;
  role: Role;
  lang: Lang;
  /** Bumped by every write to the store. */
  version: number;
  /** Sends the bank's own application with its reasons; the refusal, or
   * null. */
  onApplyForRemoval: (reason: string) => RemovalError | null;
  /** Records the Bank of Russia's request received today; the refusal,
   * or null. */
  onRecordQuery: () => QueryError | null;
  /** Records the bank's answer to it; the refusal, or null. */
  onAnswerQuery: (view: QueryView | null, reason: string) => QueryError | null;
};

export function DatabasePanel({ store, row, role, lang, version, onApplyForRemoval, onRecordQuery, onAnswerQuery }: DatabasePanelProps) {
  void version;
  const w = workflowStrings[lang];
  const b = w.database;
  const { labels } = POOLS[lang];
  const fmt = useFormatters({ timeZone: "Europe/Moscow" });
  const box = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<RemovalError | null>(null);
  const [asking, setAsking] = useState(false);
  const [queryError, setQueryError] = useState<QueryError | null>(null);
  const [view, setView] = useState<QueryView | null>(null);
  const [answerReason, setAnswerReason] = useState("");
  const refocus = useRef(false);

  const focusHeading = () => {
    const heading = box.current?.querySelector<HTMLElement>(".stoa-panel__title");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };
  // Once the confirmation has gone, the form that opened it has gone too
  // when the application went: the heading takes the focus.
  useEffect(() => {
    if (asking || !refocus.current) return;
    refocus.current = false;
    const frame = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(frame);
  }, [asking]);

  if (!isClientDataCase(store, row)) return null;
  const id = rowId(row);
  const day = (n: number) => fmt.date(n * DAY_MS);
  const applied = removalAppliedOn(store, row);
  const decision = applied >= 0 ? clock(caseFacts(store, row)).deadlines.find((d) => d.kind === "operator_application_decision") : undefined;
  const errorText = (e: RemovalError) =>
    e.code === "removal-reason-required"
      ? b.errors[e.code](String(e.min))
      : e.code === "removal-reason-too-long"
        ? b.errors[e.code](String(e.max), String(e.length))
        : b.errors[e.code];
  const received = queryReceivedOn(store, row);
  const answer = queryAnswerOf(store, row);
  const facts = caseFacts(store, row);
  const answerDue = received >= 0 ? clock(facts).deadlines.find((d) => d.kind === "bank_of_russia_query_answer") : undefined;
  const canRecord = QUERY_INTAKE_ROLES.includes(role) && (role !== "operator" || actsOn(store, row, role));
  const queryErrorText = (e: QueryError) =>
    e.code === "query-reason-required"
      ? b.queryErrors[e.code](String(e.min))
      : e.code === "query-reason-too-long"
        ? b.queryErrors[e.code](String(e.max), String(e.length))
        : b.queryErrors[e.code];
  const record = () => {
    const refused = onRecordQuery();
    setQueryError(refused);
    // The button goes with the request recorded: the heading takes the
    // focus.
    if (!refused) requestAnimationFrame(focusHeading);
  };
  const sendAnswer = () => {
    const refused = checkQueryAnswer(store, row, role, view, answerReason) ?? onAnswerQuery(view, answerReason);
    setQueryError(refused);
    if (!refused) {
      setAnswerReason("");
      setView(null);
      requestAnimationFrame(focusHeading);
    }
  };
  const ask = () => {
    const refused = checkRemoval(store, row, role, reason);
    setError(refused);
    if (!refused) setAsking(true);
  };

  return (
    <div ref={box} className="database-panel">
      <Panel title={b.panel} level={3}>
        <DescriptionList items={[{ id: "record", term: b.record, description: labels.database[store.database[row] ?? 0] ?? "" }]} />
        <h4>{b.own}</h4>
        <p className="muted">{b.ownHelp}</p>
        {applied >= 0 ? (
          <p>
            {b.sent(day(applied))}
            {decision && ` ${b.decidesBy(day(dayNumber(decision.due)), basisName(decision.basis, lang))}`}
          </p>
        ) : REMOVAL_ROLES.includes(role) ? (
          <div className="letter-form">
            <TextArea
              label={b.reasons}
              value={reason}
              onChange={setReason}
              description={b.reasonsHelp(String(REMOVAL_REASON_MIN))}
              rows={3}
              isInvalid={error?.code === "removal-reason-required" || error?.code === "removal-reason-too-long"}
            />
            {error && (
              <p className="field-error" role="alert">
                {errorText(error)}
              </p>
            )}
            <div className="letter-form__actions">
              <Button onPress={ask}>{b.apply}</Button>
            </div>
          </div>
        ) : (
          <p className="muted">{b.whoMay}</p>
        )}

        <h4>{b.query}</h4>
        <p className="muted">{b.queryHelp}</p>
        {store.path[row] === Path.DatabaseRemoval ? (
          <p className="muted">{b.queryThroughBank}</p>
        ) : received < 0 ? (
          canRecord ? (
            <div className="letter-form__actions">
              <Button onPress={record}>{b.recordQuery}</Button>
            </div>
          ) : (
            <p className="muted">{b.queryWhoMay}</p>
          )
        ) : (
          <>
            <p>
              {b.queryReceived(day(received))}
              {answerDue && !answer && ` ${b.answerDue(day(dayNumber(answerDue.due)), basisName(answerDue.basis, lang))}`}
            </p>
            {answer ? (
              <>
                <p>{b.answered(day(answer.on), b.views[answer.view])}</p>
                <p className="muted">{b.afterAnswer}</p>
              </>
            ) : QUERY_ANSWER_ROLES.includes(role) ? (
              <div className="letter-form">
                <RadioGroup<QueryView>
                  label={b.view}
                  value={view}
                  onChange={setView}
                  options={QUERY_VIEWS.map((v) => ({ value: v, label: b.views[v] }))}
                  isInvalid={queryError?.code === "query-view-required"}
                />
                <TextArea
                  label={b.answerReasons}
                  value={answerReason}
                  onChange={setAnswerReason}
                  description={b.answerHelp(String(ANSWER_REASON_MIN))}
                  rows={3}
                  isInvalid={queryError?.code === "query-reason-required" || queryError?.code === "query-reason-too-long"}
                />
                <div className="letter-form__actions">
                  <Button onPress={sendAnswer}>{b.answer}</Button>
                </div>
              </div>
            ) : (
              <p className="muted">{b.answerWhoMay}</p>
            )}
          </>
        )}
        {queryError && (
          <p className="field-error" role="alert">
            {queryErrorText(queryError)}
          </p>
        )}
      </Panel>
      <AlertDialog
        isOpen={asking}
        onOpenChange={setAsking}
        title={b.confirmTitle(id)}
        confirmLabel={b.confirm}
        cancelLabel={b.keep}
        tone="destructive"
        onConfirm={() => {
          refocus.current = true;
          const refused = onApplyForRemoval(reason);
          setError(refused);
          if (!refused) setReason("");
        }}
      >
        <p>{b.confirmText}</p>
        <blockquote className="database-reasons">{reason.trim().slice(0, REMOVAL_REASON_MAX)}</blockquote>
      </AlertDialog>
    </div>
  );
}
