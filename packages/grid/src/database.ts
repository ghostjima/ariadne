import { queryAnsweredOn, queryReceivedOn, removalAppliedOn } from "./legal.js";
import type { Role } from "./roles.js";
import { Database, Path, Stream } from "./schema.js";
import { rememberOrigin, type ColumnStore } from "./store.js";
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
