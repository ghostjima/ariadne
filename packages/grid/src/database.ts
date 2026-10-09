import { removalAppliedOn } from "./legal.js";
import type { Role } from "./roles.js";
import { Database, Stream } from "./schema.js";
import { rememberOrigin, type ColumnStore } from "./store.js";
import { appendJournal, type Actor } from "./workflow.js";

/*
  What the bank does on a case about the client's own data in the Bank of
  Russia's database, beyond the reply: its own reasoned application to the
  Bank of Russia to remove the data, without the client's part in it, when
  it has grounds to think them included without basis (161-FZ art. 9 part
  11.9). The application goes out once and cannot be recalled; it is
  recorded in the case's journal with the bank's reasons, and its day goes
  to ariadne-rules with the case's facts (legal.ts), which gives the Bank
  of Russia's 15 working days (Directive No. 6748-U items 2.6 to 2.8). The
  legal reviewer or the supervisor files it. Errors are codes; the
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
