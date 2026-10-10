import { clock } from "@ariadne/rules";
import { isoDay } from "./days.js";
import { caseFacts, queryAnsweredOn, queryReceivedOn, removalAppliedOn, suspensionLiftedOn } from "./legal.js";
import type { Role } from "./roles.js";
import { Applicant, Database, Path, Restriction, Stream } from "./schema.js";
import { AS_OF_DAY, dayOf, rememberOrigin, type ColumnStore } from "./store.js";
import { appendJournal, type Actor, type QueryView } from "./workflow.js";

/*
  What the bank does on a case about the client's own data in the Bank of
  Russia's database, beyond the reply.

  Its own reasoned application to the Bank of Russia to remove the data,
  without the client's part in it, when it has grounds to think them
  included without basis (161-FZ art. 9 part 11.9). The application goes
  out once and cannot be recalled; it is recorded in the case's journal
  with the bank's reasons, and its day goes to ariadne-rules with the
  case's facts (legal.ts), which gives the Bank of Russia's 15 working
  days (Directive No. 6748-U items 2.6 to 2.8). The legal reviewer or the
  supervisor files it.

  The Bank of Russia's request about an application to remove the data
  that the client filed with it directly, through its Internet reception
  (item 1.2): the bank learns of the application only from the request
  (item 2.2). The operator or the supervisor records it on the day it
  arrives, and ariadne-rules gives the bank 3 working days to answer
  (item 2.9). The legal reviewer or the supervisor records the answer:
  the bank's view of whether the data were included with basis, with its
  reasons. The Bank of Russia then sends its decision to the client by
  email (items 2.1, 2.3, 2.4); the bank passes nothing on. A client who
  applied through the bank has had the bank's view forwarded with the
  application (item 1.5), so no request is recorded on such a case here.

  A suspension the bank chose under 161-FZ art. 9 part 11.6, lifted while
  the data stay in the database. Part 11.6 gives the bank a right to
  suspend ("вправе приостановить"), within its risk management and its
  contract; the law neither describes lifting such a suspension nor
  obliges the bank to keep it, so the desk records a lift as the bank's
  own decision, with its reasons, and never where the suspension is a
  duty: ariadne-rules refuses it with the Ministry of Internal Affairs'
  information (part 11.7). From the day of the lift an individual's
  transfers to individuals are capped at 100,000 roubles a month (part
  11.6, sentence 2, a conservative reading); a legal entity has no cap;
  ATM cash stays capped either way (Banking Law art. 30 part 16). The
  legal reviewer or the supervisor records it, once.

  Each is journaled and the stage does not move. Errors are codes; the
  interface writes the sentence.
*/

/* The roles that file the bank's own application */
export const REMOVAL_ROLES: readonly Role[] = ["reviewer", "supervisor"];
/* The bank's reasons, in its own words: at least and at most this many
   characters */
export const REMOVAL_REASON_MIN = 10;
export const REMOVAL_REASON_MAX = 1000;

export type RemovalError =
  | { code: "removal-not-client-data" }
  | { code: "removal-role" }
  | { code: "removal-already-sent" }
  | { code: "removal-reason-required"; min: number }
  | { code: "removal-reason-too-long"; max: number; length: number };

/* Whether the case is about the client's own data in the database */
export function isClientDataCase(store: ColumnStore, row: number): boolean {
  return store.stream[row] === Stream.Antifraud && (store.database[row] ?? Database.None) !== Database.None;
}

/* Whether `role` may file the bank's own application on a row now, with
   these reasons. Null when it may. */
export function checkRemoval(store: ColumnStore, row: number, role: Role, reason: string): RemovalError | null {
  if (!isClientDataCase(store, row)) return { code: "removal-not-client-data" };
  if (!REMOVAL_ROLES.includes(role)) return { code: "removal-role" };
  if (removalAppliedOn(store, row) >= 0) return { code: "removal-already-sent" };
  const text = reason.trim();
  if (text.length < REMOVAL_REASON_MIN) return { code: "removal-reason-required", min: REMOVAL_REASON_MIN };
  if (text.length > REMOVAL_REASON_MAX) return { code: "removal-reason-too-long", max: REMOVAL_REASON_MAX, length: text.length };
  return null;
}

/* Files the bank's own application: checks it and journals it with the
   bank's reasons. The stage does not move. */
export function applyForRemoval(
  store: ColumnStore,
  row: number,
  input: { role: Role; actor: Actor; at: number; reason: string },
): RemovalError | null {
  const error = checkRemoval(store, row, input.role, input.reason);
  if (error) return error;
  rememberOrigin(store, row);
  const stage = store.stage[row] ?? 0;
  appendJournal(store, row, { at: input.at, action: "removal_applied", from: stage, to: stage, actor: input.actor, comment: input.reason.trim() });
  return null;
}

/* The roles that record the Bank of Russia's request, and that answer it */
export const QUERY_INTAKE_ROLES: readonly Role[] = ["operator", "supervisor"];
export const QUERY_ANSWER_ROLES: readonly Role[] = ["reviewer", "supervisor"];
/* The bank's reasons in its answer, in its own words */
export const ANSWER_REASON_MIN = 10;
export const ANSWER_REASON_MAX = 1000;

export type QueryError =
  | { code: "query-not-client-data" }
  | { code: "query-through-bank" }
  | { code: "query-role" }
  | { code: "query-already-received" }
  | { code: "query-not-received" }
  | { code: "query-already-answered" }
  | { code: "query-view-required" }
  | { code: "query-reason-required"; min: number }
  | { code: "query-reason-too-long"; max: number; length: number };

/* Whether `role` may record the Bank of Russia's request on a row now.
   Null when it may. */
export function checkQueryIntake(store: ColumnStore, row: number, role: Role): QueryError | null {
  if (!isClientDataCase(store, row)) return { code: "query-not-client-data" };
  if (store.path[row] === Path.DatabaseRemoval) return { code: "query-through-bank" };
  if (!QUERY_INTAKE_ROLES.includes(role)) return { code: "query-role" };
  if (queryReceivedOn(store, row) >= 0) return { code: "query-already-received" };
  return null;
}

/* Records the Bank of Russia's request as it reaches the bank: journaled,
   and its day goes to ariadne-rules with the case's facts. */
export function recordQuery(store: ColumnStore, row: number, input: { role: Role; actor: Actor; at: number }): QueryError | null {
  const error = checkQueryIntake(store, row, input.role);
  if (error) return error;
  rememberOrigin(store, row);
  const stage = store.stage[row] ?? 0;
  appendJournal(store, row, { at: input.at, action: "query_received", from: stage, to: stage, actor: input.actor });
  return null;
}

/* Whether `role` may answer the request now, with this view and these
   reasons. Null when it may. */
export function checkQueryAnswer(store: ColumnStore, row: number, role: Role, view: QueryView | null, reason: string): QueryError | null {
  if (!isClientDataCase(store, row)) return { code: "query-not-client-data" };
  if (!QUERY_ANSWER_ROLES.includes(role)) return { code: "query-role" };
  if (queryReceivedOn(store, row) < 0) return { code: "query-not-received" };
  if (queryAnsweredOn(store, row) >= 0) return { code: "query-already-answered" };
  if (view === null) return { code: "query-view-required" };
  const text = reason.trim();
  if (text.length < ANSWER_REASON_MIN) return { code: "query-reason-required", min: ANSWER_REASON_MIN };
  if (text.length > ANSWER_REASON_MAX) return { code: "query-reason-too-long", max: ANSWER_REASON_MAX, length: text.length };
  return null;
}

/* Records the bank's answer to the request, with its view and reasons */
export function answerQuery(
  store: ColumnStore,
  row: number,
  input: { role: Role; actor: Actor; at: number; view: QueryView | null; reason: string },
): QueryError | null {
  const error = checkQueryAnswer(store, row, input.role, input.view, input.reason);
  if (error || input.view === null) return error;
  rememberOrigin(store, row);
  const stage = store.stage[row] ?? 0;
  appendJournal(store, row, {
    at: input.at,
    action: "query_answered",
    from: stage,
    to: stage,
    actor: input.actor,
    view: input.view,
    comment: input.reason.trim(),
  });
  return null;
}

/* The bank's answer to the Bank of Russia's request, from the case's
   journal: its Moscow day and the view it gave, or null */
export function queryAnswerOf(store: ColumnStore, row: number): { on: number; view: QueryView } | null {
  const entry = (store.journal.get(row) ?? []).find((e) => e.action === "query_answered");
  if (!entry?.view) return null;
  return { on: queryAnsweredOn(store, row), view: entry.view };
}

/* The roles that record the lift of a suspension chosen under part 11.6 */
export const LIFT_ROLES: readonly Role[] = ["reviewer", "supervisor"];
/* The bank's reasons for the lift, in its own words */
export const LIFT_REASON_MIN = 10;
export const LIFT_REASON_MAX = 1000;

export type LiftError =
  | { code: "lift-not-client-data" }
  | { code: "lift-already-lifted" }
  | { code: "lift-not-suspended" }
  | { code: "lift-not-allowed" }
  | { code: "lift-role" }
  | { code: "lift-reason-required"; min: number }
  | { code: "lift-reason-too-long"; max: number; length: number };

/* The day the bank lifted the suspension on a row, or -1 */
export function liftedOn(store: ColumnStore, row: number): number {
  return suspensionLiftedOn(store, row);
}

/* Whether the rules allow lifting the row's suspension today: they refuse
   it where the suspension is a duty (161-FZ art. 9 part 11.7) */
export function liftAllowed(store: ColumnStore, row: number): boolean {
  const facts = caseFacts(store, row);
  if (!facts.database?.instrumentSuspendedOn) return false;
  const asked = clock({ ...facts, database: { ...facts.database, suspensionLiftedOn: isoDay(AS_OF_DAY) } });
  return !asked.refusals.includes("suspension_lift_not_allowed");
}

/* Whether `role` may record the lift of the suspension on a row now, with
   these reasons. Null when it may. */
export function checkLift(store: ColumnStore, row: number, role: Role, reason: string): LiftError | null {
  if (!isClientDataCase(store, row)) return { code: "lift-not-client-data" };
  if (suspensionLiftedOn(store, row) >= 0) return { code: "lift-already-lifted" };
  if (store.restriction[row] !== Restriction.InstrumentSuspended) return { code: "lift-not-suspended" };
  if (!liftAllowed(store, row)) return { code: "lift-not-allowed" };
  if (!LIFT_ROLES.includes(role)) return { code: "lift-role" };
  const text = reason.trim();
  if (text.length < LIFT_REASON_MIN) return { code: "lift-reason-required", min: LIFT_REASON_MIN };
  if (text.length > LIFT_REASON_MAX) return { code: "lift-reason-too-long", max: LIFT_REASON_MAX, length: text.length };
  return null;
}

/* Records the lift: checks it, journals it with the bank's reasons, and
   sets what the register shows from now on: the transfer cap for an
   individual, no restriction of transfers for a legal entity. The stage
   does not move. */
export function liftSuspension(store: ColumnStore, row: number, input: { role: Role; actor: Actor; at: number; reason: string }): LiftError | null {
  const error = checkLift(store, row, input.role, input.reason);
  if (error) return error;
  rememberOrigin(store, row);
  const stage = store.stage[row] ?? 0;
  appendJournal(store, row, { at: input.at, action: "suspension_lifted", from: stage, to: stage, actor: input.actor, comment: input.reason.trim() });
  store.restriction[row] = store.applicant[row] === Applicant.LegalEntity ? Restriction.None : Restriction.TransfersCapped;
  store.updatedAt[row] = dayOf(input.at);
  return null;
}
