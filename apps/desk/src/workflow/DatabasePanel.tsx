// The client's own data in the Bank of Russia's database, on the case: what
// the bank's copy of the record holds and the day the bank received it,
// from which the ATM cash cap runs (Banking Law art. 30 part 16); the
// bank's own reasoned application to remove the data (161-FZ art. 9 part
// 11.9), which the legal reviewer or the supervisor writes the bank's
// reasons for and sends after a confirmation, since it is not recalled,
// then shows when it went and when the Bank of Russia decides, as
// ariadne-rules counts it; and the Bank of Russia's request about an
// application the client filed with it directly (Directive No. 6748-U items 2.2, 2.9), recorded the day it
// arrives with the bank's 3 working days from ariadne-rules, and answered
// with the bank's view and reasons; and the suspension itself: where the
// bank chose it under 161-FZ art. 9 part 11.6, the legal reviewer or the
// supervisor may record its lift with the bank's reasons, after a
// confirmation (the law does not describe a lift, and the panel says how
// the desk reads it); where it is a duty (part 11.7), the panel says so.
// And the client's application through the bank (Directive No. 6748-U
// items 1.2 to 1.5): one that arrives today is recorded by the operator of
// the case or the supervisor, with the day to forward it by from
// ariadne-rules; when it lacks mandatory data they refuse to forward it,
// ticking what is missing, after a confirmation that shows the notice the
// client gets; the panel then shows the notice and its 5 working days.
// Shown only for a case about the client's own data.
import { useEffect, useRef, useState } from "react";
import { AlertDialog, Button, Checkbox, CheckboxGroup, DescriptionList, Letter, Panel, RadioGroup, TextArea, useFormatters } from "@ghostjima/stoa-react";
import {
  ANSWER_REASON_MIN,
  APPLICATION_ROLES,
  Applicant,
  LIFT_REASON_MAX,
  LIFT_REASON_MIN,
  LIFT_ROLES,
  Restriction,
  applicationForwarded,
  applicationReceivedOn,
  checkApplicationIntake,
  checkForwardingRefusal,
  checkLift,
  forwardingRefusalOf,
  liftAllowed,
  liftedOn,
  mandatoryData,
  type ApplicationError,
  type LiftError,
  type MandatoryData,
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
import { clock, paymentGrounds, type Basis } from "@ariadne/rules";
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
  /** Records the lift of a suspension the bank chose under part 11.6,
   * with the bank's reasons; the refusal, or null. */
  onLiftSuspension: (reason: string) => LiftError | null;
  /** Records the client's application received through the bank today;
   * the refusal, or null. */
  onRecordApplication: () => ApplicationError | null;
  /** Records the bank's refusal to forward it, with the mandatory data it
   * lacks; the refusal of that step, or null. */
  onRefuseForwarding: (missing: MandatoryData[]) => ApplicationError | null;
};

/** The provision a refusal to forward an incomplete application rests on,
 * as ariadne-rules gives it: Directive No. 6748-U item 1.3. */
function refusalBasis(): Basis {
  const g = paymentGrounds().find((x) => x.code === "directive_6748_u_1_3");
  return { source: g?.source ?? "directive_6748_u", act: "", article: g?.article ?? "", part: g?.part ?? "1.3", revision: g?.revision ?? "", url: "", reading: "text" };
}

export function DatabasePanel({
  store,
  row,
  role,
  lang,
  version,
  onApplyForRemoval,
  onRecordQuery,
  onAnswerQuery,
  onLiftSuspension,
  onRecordApplication,
  onRefuseForwarding,
}: DatabasePanelProps) {
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
  const [liftReason, setLiftReason] = useState("");
  const [liftError, setLiftError] = useState<LiftError | null>(null);
  const [lifting, setLifting] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [applicationError, setApplicationError] = useState<ApplicationError | null>(null);
  const [refusing, setRefusing] = useState(false);
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
    if (asking || lifting || refusing || !refocus.current) return;
    refocus.current = false;
    const frame = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(frame);
  }, [asking, lifting, refusing]);

  if (!isClientDataCase(store, row)) return null;
  const id = rowId(row);
  const day = (n: number) => fmt.date(n * DAY_MS);
  const recordOn = store.recordOn[row] ?? -1;
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
  const lifted = liftedOn(store, row);
  const suspended = store.restriction[row] === Restriction.InstrumentSuspended;
  const individual = store.applicant[row] === Applicant.Individual;
  const liftErrorText = (e: LiftError) =>
    e.code === "lift-reason-required"
      ? b.liftErrors[e.code](String(e.min))
      : e.code === "lift-reason-too-long"
        ? b.liftErrors[e.code](String(e.max), String(e.length))
        : b.liftErrors[e.code];
  const askLift = () => {
    const refused = checkLift(store, row, role, liftReason);
    setLiftError(refused);
    if (!refused) setLifting(true);
  };
  // The client's application through the bank.
  const clientApplied = applicationReceivedOn(store, row);
  const forwardedOn = applicationForwarded(store, row) ? (store.pathThen[row] ?? -1) : -1;
  const refusal = forwardingRefusalOf(store, row);
  const applicationTerms = clientApplied >= 0 ? clock(facts).deadlines : [];
  const forwardDue = applicationTerms.find((d) => d.kind === "exclusion_forwarding");
  const noticeDue = applicationTerms.find((d) => d.kind === "exclusion_refusal_notice");
  const mayApply = APPLICATION_ROLES.includes(role) && (role !== "operator" || actsOn(store, row, role));
  const asked = mandatoryData(store.applicant[row] ?? Applicant.Individual);
  const dataLabel = (code: MandatoryData) => (!individual && code === "identity_documents" ? b.traderOnly(b.data[code]) : b.data[code]);
  const noticeOf = (data: readonly MandatoryData[]) =>
    b.noticeLines(day(clientApplied), data.map((code) => b.dataInNotice[code]).join("; "), basisName(refusalBasis(), lang));
  const picked = asked.filter((code) => missing.includes(code));
  const recordApplication = () => {
    const refused = checkApplicationIntake(store, row, role) ?? onRecordApplication();
    setApplicationError(refused);
    // The button goes with the application recorded: the heading takes
    // the focus.
    if (!refused) requestAnimationFrame(focusHeading);
  };
  const askRefusal = () => {
    const refused = checkForwardingRefusal(store, row, role, missing);
    setApplicationError(refused);
    if (!refused) setRefusing(true);
  };

  return (
    <div ref={box} className="database-panel">
      <Panel title={b.panel} level={3}>
        <DescriptionList
          items={[
            { id: "record", term: b.record, description: labels.database[store.database[row] ?? 0] ?? "" },
            ...(recordOn >= 0 ? [{ id: "received", term: b.received, description: day(recordOn) }] : []),
          ]}
        />
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
        {clientApplied >= 0 && !refusal ? (
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

        <h4>{b.application}</h4>
        <p className="muted">{b.applicationHelp}</p>
        {clientApplied < 0 ? (
          mayApply ? (
            <div className="letter-form__actions">
              <Button onPress={recordApplication}>{b.recordApplication}</Button>
            </div>
          ) : (
            <p className="muted">{b.applicationWhoMay}</p>
          )
        ) : (
          <>
            <p>
              {b.applicationReceived(day(clientApplied))}
              {forwardedOn >= 0 && ` ${b.forwarded(day(forwardedOn))}`}
              {forwardDue && forwardedOn < 0 && ` ${b.forwardBy(day(dayNumber(forwardDue.due)), basisName(forwardDue.basis, lang))}`}
            </p>
            {refusal ? (
              <>
                <p>{b.refused(day(refusal.on), refusal.missing.map((code) => dataLabel(code)).join("; "))}</p>
                {noticeDue && <p>{b.noticeDue(day(dayNumber(noticeDue.due)), basisName(noticeDue.basis, lang))}</p>}
                <Letter label={b.notice} lines={noticeOf(refusal.missing)} lang={lang} />
              </>
            ) : forwardedOn >= 0 ? null : mayApply ? (
              <div className="letter-form">
                <CheckboxGroup label={b.missing} value={missing} onChange={setMissing} description={b.missingHelp}>
                  {asked.map((code) => (
                    <Checkbox key={code} value={code}>
                      {dataLabel(code)}
                    </Checkbox>
                  ))}
                </CheckboxGroup>
                <div className="letter-form__actions">
                  <Button onPress={askRefusal}>{b.refuse}</Button>
                </div>
              </div>
            ) : (
              <p className="muted">{b.applicationWhoMay}</p>
            )}
          </>
        )}
        {applicationError && (
          <p className="field-error" role="alert">
            {b.applicationErrors[applicationError.code]}
          </p>
        )}

        <h4>{b.suspension}</h4>
        {lifted >= 0 ? (
          <>
            <p>{b.lifted(day(lifted))}</p>
            <p className="muted">{individual ? b.afterLift : b.afterLiftEntity}</p>
          </>
        ) : !suspended ? (
          <p className="muted">{b.liftNotSuspended}</p>
        ) : !liftAllowed(store, row) ? (
          <p className="muted">{b.liftDuty}</p>
        ) : (
          <>
            <p className="muted">{b.liftHelp}</p>
            <p className="muted">{b.liftAssumption}</p>
            {LIFT_ROLES.includes(role) ? (
              <div className="letter-form">
                <TextArea
                  label={b.liftReasons}
                  value={liftReason}
                  onChange={setLiftReason}
                  description={b.liftReasonsHelp(String(LIFT_REASON_MIN))}
                  rows={3}
                  isInvalid={liftError?.code === "lift-reason-required" || liftError?.code === "lift-reason-too-long"}
                />
                {liftError && (
                  <p className="field-error" role="alert">
                    {liftErrorText(liftError)}
                  </p>
                )}
                <div className="letter-form__actions">
                  <Button onPress={askLift}>{b.lift}</Button>
                </div>
              </div>
            ) : (
              <p className="muted">{b.liftWhoMay}</p>
            )}
          </>
        )}
      </Panel>
      <AlertDialog
        isOpen={lifting}
        onOpenChange={setLifting}
        title={b.liftConfirmTitle(id)}
        confirmLabel={b.liftConfirm}
        cancelLabel={b.liftKeep}
        tone="destructive"
        onConfirm={() => {
          refocus.current = true;
          const refused = onLiftSuspension(liftReason);
          setLiftError(refused);
          if (!refused) setLiftReason("");
        }}
      >
        <p>{b.liftConfirmText}</p>
        <blockquote className="database-reasons">{liftReason.trim().slice(0, LIFT_REASON_MAX)}</blockquote>
      </AlertDialog>
      <AlertDialog
        isOpen={refusing}
        onOpenChange={setRefusing}
        title={b.refuseConfirmTitle(id)}
        confirmLabel={b.refuseConfirm}
        cancelLabel={b.refuseKeep}
        tone="destructive"
        onConfirm={() => {
          refocus.current = true;
          const refused = onRefuseForwarding(picked);
          setApplicationError(refused);
          if (!refused) setMissing([]);
        }}
      >
        <p>{b.refuseConfirmText}</p>
        <blockquote className="database-reasons" lang={lang}>
          {noticeOf(picked).join("\n")}
        </blockquote>
      </AlertDialog>
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
