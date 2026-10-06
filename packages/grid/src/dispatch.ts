import { checkField, editContext, type EditError } from "./edit.js";
import { replyClock, rowReplyFacts } from "./legal.js";
import type { Role } from "./roles.js";
import { Copy, Extension, Sector, Stage } from "./schema.js";
import { AS_OF_DAY, RulesFlag, rememberOrigin, writeField, type ColumnStore } from "./store.js";
import { appendJournal, applyTransition, type Actor, type CopyKind, type JournalEntry, type TransitionError } from "./workflow.js";

/*
  What goes out with a reply, and around it. Dispatch takes the "send"
  transition (the reply leaves today) and records the copies it owes, as
  ariadne-rules says for the case: the reply to the Bank of Russia for a
  forwarded complaint, the complaint and the reply to the self-regulatory
  organisation when a non-bank company found a breach of a base or
  internal standard; each is due the same day, and is marked once sent.
  An extension of the reply term by the supervisor takes a reason, is
  refused where ariadne-rules refuses it (a money claim under 123-FZ), and,
  for a forwarded complaint, owes the Bank of Russia a copy of its notice
  the same day. Each is journaled.
*/

/* The copies a reply owes, as ariadne-rules computes them for the row */
export function replyCopies(store: ColumnStore, row: number): number {
  const flags = replyClock(rowReplyFacts(store, row)).flags;
  let copies = 0;
  if ((flags & RulesFlag.CopyToBankOfRussia) !== 0) copies |= Copy.BankOfRussiaDue;
  if ((flags & RulesFlag.CopyToSro) !== 0) copies |= Copy.SroDue;
  return copies;
}

/* Sends the reply: the transition, then the copies due today */
export function dispatchReply(
  store: ColumnStore,
  row: number,
  by: { role: Role; actor: Actor; at: number },
): { entry: JournalEntry; copies: number } | { error: TransitionError } {
  const result = applyTransition(store, row, "send", by);
  if ("error" in result) return result;
  const copies = replyCopies(store, row);
  store.copies[row] = (store.copies[row] ?? 0) | copies;
  return { entry: result.entry, copies };
}

const DUE: Record<CopyKind, number> = { bank_of_russia: Copy.BankOfRussiaDue, sro: Copy.SroDue, notice: Copy.NoticeDue };
const SENT: Record<CopyKind, number> = { bank_of_russia: Copy.BankOfRussiaSent, sro: Copy.SroSent, notice: Copy.NoticeSent };

/* The copies a row owes and has not sent */
export function copiesOwed(store: ColumnStore, row: number): CopyKind[] {
  const c = store.copies[row] ?? 0;
  return (Object.keys(DUE) as CopyKind[]).filter((k) => (c & DUE[k]) !== 0 && (c & SENT[k]) === 0);
}

/* The copies a row has sent */
export function copiesSent(store: ColumnStore, row: number): CopyKind[] {
  const c = store.copies[row] ?? 0;
  return (Object.keys(DUE) as CopyKind[]).filter((k) => (c & SENT[k]) !== 0);
}

export type CopyError = { code: "copy-not-owed" };

/* Marks a copy sent, and journals it */
export function markCopySent(store: ColumnStore, row: number, kind: CopyKind, by: { actor: Actor; at: number }): CopyError | null {
  if (!copiesOwed(store, row).includes(kind)) return { code: "copy-not-owed" };
  rememberOrigin(store, row);
  store.copies[row] = (store.copies[row] ?? 0) | SENT[kind];
  const stage = store.stage[row] ?? 0;
  appendJournal(store, row, { at: by.at, action: "copy_sent", from: stage, to: stage, actor: by.actor, copy: kind });
  return null;
}

export type BreachError = { code: "breach-bank" } | { code: "breach-after-reply" };

/* A breach of a base or internal standard found, or no longer: a bank has
   no base standard to breach in this sense; the mark is set before the
   reply goes out, since the copy goes the same day */
export function markBreach(store: ColumnStore, row: number, found: boolean, by: { actor: Actor; at: number }): BreachError | null {
  if ((store.sector[row] ?? Sector.Bank) === Sector.Bank) return { code: "breach-bank" };
  if ((store.stage[row] ?? 0) >= Stage.Sent) return { code: "breach-after-reply" };
  rememberOrigin(store, row);
  store.breach[row] = found ? 1 : 0;
  store.rules[row] = replyClock(rowReplyFacts(store, row)).flags;
  const stage = store.stage[row] ?? 0;
  appendJournal(store, row, { at: by.at, action: found ? "breach_marked" : "breach_withdrawn", from: stage, to: stage, actor: by.actor });
  return null;
}

export type ExtensionError = EditError | { code: "extension-reason-required"; min: number } | { code: "already-extended" };
export const EXTENSION_REASON_MIN = 10;

/* Extends the reply term by ten working days to request documents, with
   the reason (which documents, from whom): the supervisor's; refused where
   the register's rules refuse it. For a forwarded complaint the notice of
   the extension owes the Bank of Russia a copy the same day. */
export function extendDeadline(
  store: ColumnStore,
  row: number,
  input: { role: Role; actor: Actor; at: number; reason: string },
): ExtensionError | null {
  const error = checkField("extension", Extension.Extended, editContext(store, row), input.role);
  if (error) return error;
  if ((store.extension[row] ?? 0) === Extension.Extended) return { code: "already-extended" };
  const reason = input.reason.trim();
  if (reason.length < EXTENSION_REASON_MIN) return { code: "extension-reason-required", min: EXTENSION_REASON_MIN };
  rememberOrigin(store, row);
  writeField(store, row, "extension", Extension.Extended, input.at);
  if (((store.rules[row] ?? 0) & RulesFlag.CopyToBankOfRussia) !== 0) store.copies[row] = (store.copies[row] ?? 0) | Copy.NoticeDue;
  const stage = store.stage[row] ?? 0;
  appendJournal(store, row, { at: input.at, action: "extend", from: stage, to: stage, actor: input.actor, comment: reason });
  return null;
}

/* The day the copies of a dispatch are due: the day the reply went out */
export function copiesDueOn(store: ColumnStore, row: number): number {
  const sent = store.sentOn[row] ?? -1;
  return sent >= 0 ? sent : AS_OF_DAY;
}
