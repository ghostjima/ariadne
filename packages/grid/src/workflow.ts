import { moscowMs } from "./days.js";
import { makeRng, mixSeed } from "./generator.js";
import { plusWorkingDays, workingDaysFrom } from "./legal.js";
import type { Role } from "./roles.js";
import { Extension, Ground, Outcome, REVIEWER_COUNT, Stage } from "./schema.js";
import { AS_OF_DAY, rememberOrigin, writeField, type ColumnStore } from "./store.js";

/*
  The stages of a case as explicit states, the transitions between them,
  who may make each one, and the case's journal: every transition with who
  made it, when and why.

  Registered, waiting for facts, drafting, legal review, awaiting
  signature, sent and closed are the states. The operator asks for facts,
  drafts and hands the reply over to legal review; the legal reviewer
  approves it for signature or returns it for rework, with a reason; the
  signatory sends it or returns it for rework, with a reason; the
  supervisor extends the deadline and closes an answered case. "Returned
  for rework" is the transition back to drafting from legal review or
  from signature, never a state of its own.

  The register's generated rows carry no journal; their history is worked
  out from the row as generated (its stage, its days, its people), seeded
  by the row, so it is the same in every tab. A change made in the page
  keeps what the row held as generated (`store.origin`) and adds its entry
  to `store.journal`; the journal shown is the history, then those
  entries. Errors are codes; the interface writes the sentence.
*/

export const ACTIONS = [
  "register",
  "request_facts",
  "facts_received",
  "start_drafting",
  "hand_over",
  "approve",
  "return",
  "send",
  "close",
  "extend",
  "extension_withdrawn",
  "undo",
  /* Recorded without a stage change: the reviewer's edit of the letter,
     the signatory's signature, and a signature deferred */
  "edit",
  "sign",
  "defer",
] as const;
export type Action = (typeof ACTIONS)[number];

/* Why a reply was returned for rework */
export const RETURN_REASONS = ["facts_missing", "ground_wrong", "deadline_wrong", "option_missing", "wording", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
/* A reason "other" needs a comment of at least this many characters */
export const RETURN_COMMENT_MIN = 10;
export const RETURN_COMMENT_MAX = 500;

export type Transition = {
  action: Action;
  from: readonly number[];
  to: number;
  roles: readonly Role[];
  /* A reason must be given (a return for rework) */
  needsReason: boolean;
};

/* The transitions a case can take. A draft can be handed over from any
   stage before review: the operator (or the assistant, once a person
   confirms) may have drafted without asking for facts first. */
export const TRANSITIONS: readonly Transition[] = [
  { action: "request_facts", from: [Stage.Registered, Stage.Drafting], to: Stage.WaitingForFacts, roles: ["operator"], needsReason: false },
  { action: "start_drafting", from: [Stage.Registered], to: Stage.Drafting, roles: ["operator"], needsReason: false },
  { action: "facts_received", from: [Stage.WaitingForFacts], to: Stage.Drafting, roles: ["operator"], needsReason: false },
  {
    action: "hand_over",
    from: [Stage.Registered, Stage.WaitingForFacts, Stage.Drafting],
    to: Stage.LegalReview,
    roles: ["operator"],
    needsReason: false,
  },
  { action: "approve", from: [Stage.LegalReview], to: Stage.AwaitingSignature, roles: ["reviewer"], needsReason: false },
  { action: "return", from: [Stage.LegalReview], to: Stage.Drafting, roles: ["reviewer"], needsReason: true },
  { action: "return", from: [Stage.AwaitingSignature], to: Stage.Drafting, roles: ["signatory"], needsReason: true },
  { action: "send", from: [Stage.AwaitingSignature], to: Stage.Sent, roles: ["signatory"], needsReason: false },
  { action: "close", from: [Stage.Sent], to: Stage.Closed, roles: ["supervisor"], needsReason: false },
];

/* The transition that takes a case from `from` to `to`, for anyone */
export function transitionBetween(from: number, to: number): Transition | null {
  return TRANSITIONS.find((t) => t.to === to && t.from.includes(from)) ?? null;
}

/* The transitions a role may take from a stage */
export function transitionsFor(stage: number, role: Role): Transition[] {
  return TRANSITIONS.filter((t) => t.from.includes(stage) && t.roles.includes(role));
}

/* Who made an entry. A person is a role and an index into that role's
   people (assignees, reviewers, signatories, supervisors). The assistant
   acts only once a person confirms, and the entry names that person. */
export type Actor =
  | { kind: "person"; role: Role; person: number }
  | { kind: "assistant"; confirmedBy: { role: Role; person: number } }
  | { kind: "colleague" }
  | { kind: "system" };

export type JournalEntry = {
  /* Epoch milliseconds */
  at: number;
  action: Action;
  from: number;
  to: number;
  actor: Actor;
  reason?: ReturnReason;
  /* The person's own words, as they typed them */
  comment?: string;
  /* Worked out from the generated row, not made in this page */
  generated?: true;
};

export type TransitionError =
  | { code: "transition-not-allowed" }
  | { code: "stage-not-for-role" }
  | { code: "reason-required" }
  | { code: "comment-required"; min: number }
  | { code: "comment-too-long"; max: number; length: number }
  | { code: "reply-needs-outcome" }
  | { code: "refusal-needs-ground" };

/* What a transition reads from a row */
export type TransitionContext = { stage: number; outcome: number; ground: number };

export function transitionContext(store: ColumnStore, row: number): TransitionContext {
  return { stage: store.stage[row] ?? 0, outcome: store.outcome[row] ?? 0, ground: store.ground[row] ?? 0 };
}

/* The guards of a transition beyond the table: a reply goes to signature,
   and out, only decided, and a refusal only with its legal ground. Legal
   review itself may get a reply undecided: the assistant's draft leaves
   the decision to the reviewer. */
export function guardTransition(t: Transition, row: TransitionContext): TransitionError | null {
  if (t.to === Stage.AwaitingSignature || t.to === Stage.Sent) {
    if (row.outcome === Outcome.Pending) return { code: "reply-needs-outcome" };
    if (row.outcome === Outcome.Refused && row.ground === Ground.None) return { code: "refusal-needs-ground" };
  }
  return null;
}

/* Whether `role` may take `action` on a row now, with this reason and
   comment. Null when it may. */
export function checkTransition(
  row: TransitionContext,
  action: Action,
  role: Role,
  why: { reason?: ReturnReason; comment?: string } = {},
): TransitionError | null {
  const candidates = TRANSITIONS.filter((t) => t.action === action && t.from.includes(row.stage));
  if (candidates.length === 0) return { code: "transition-not-allowed" };
  const t = candidates.find((c) => c.roles.includes(role));
  if (!t) return { code: "stage-not-for-role" };
  if (t.needsReason) {
    if (!why.reason) return { code: "reason-required" };
    const comment = (why.comment ?? "").trim();
    if (comment.length > RETURN_COMMENT_MAX) return { code: "comment-too-long", max: RETURN_COMMENT_MAX, length: comment.length };
    if (why.reason === "other" && comment.length < RETURN_COMMENT_MIN) return { code: "comment-required", min: RETURN_COMMENT_MIN };
  }
  return guardTransition(t, row);
}

/* The one transition `action` names from a row's stage for a role */
export function transitionOf(stage: number, action: Action, role: Role): Transition | null {
  return TRANSITIONS.find((t) => t.action === action && t.from.includes(stage) && t.roles.includes(role)) ?? null;
}

/* Takes a transition on a row: checks it, freezes the row's history,
   moves the stage and writes the entry. The actor is the role's person,
   or the assistant with the person who confirmed. Returns the entry, or
   the refusal. */
export function applyTransition(
  store: ColumnStore,
  row: number,
  action: Action,
  by: { role: Role; actor: Actor; at: number; reason?: ReturnReason; comment?: string },
): { entry: JournalEntry } | { error: TransitionError } {
  const context = transitionContext(store, row);
  const error = checkTransition(context, action, by.role, by);
  if (error) return { error };
  const t = transitionOf(context.stage, action, by.role)!;
  rememberOrigin(store, row);
  writeField(store, row, "stage", t.to, by.at);
  const comment = by.comment?.trim();
  const entry: JournalEntry = {
    at: by.at,
    action,
    from: context.stage,
    to: t.to,
    actor: by.actor,
    ...(t.needsReason && by.reason ? { reason: by.reason } : {}),
    ...(comment ? { comment } : {}),
  };
  appendJournal(store, row, entry);
  return { entry };
}

/* The journal of a row as it stands: the history worked out from the
   generated row, then the entries made in this page, in time order (an
   entry made in the page that would come before the history's last is
   shown a minute after it). Needs the rules module, for the working days
   of the history. */
export function caseJournal(store: ColumnStore, row: number): JournalEntry[] {
  const out = generatedJournal(store, row);
  for (const e of store.journal.get(row) ?? []) {
    const last = out[out.length - 1]?.at ?? -Infinity;
    out.push(e.at > last ? e : { ...e, at: last + 60_000 });
  }
  return out;
}

/* Adds an entry made in the page. What the row held as generated is kept
   first, so its history stays the generated one. */
export function appendJournal(store: ColumnStore, row: number, entry: JournalEntry): void {
  rememberOrigin(store, row);
  let list = store.journal.get(row);
  if (!list) {
    list = [];
    store.journal.set(row, list);
  }
  const last = list[list.length - 1]?.at ?? -Infinity;
  list.push(entry.at > last ? entry : { ...entry, at: last + 60_000 });
}

/* The desk's "now": the day the data is taken, at the time of day it is
   now in Moscow. Everything a person does in the page happens on that
   day, as the register's deadlines are counted from it. */
export function deskNow(now: number): number {
  const minute = Math.floor((((now + 3 * 3_600_000) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000);
  return moscowMs(AS_OF_DAY, minute);
}

/* Whether the last move into the row's stage was a return for rework */
export function wasReturned(store: ColumnStore, row: number): boolean {
  const journal = caseJournal(store, row);
  for (let k = journal.length - 1; k >= 0; k--) {
    const e = journal[k]!;
    if (e.from === e.to) continue;
    return e.action === "return" && e.to === (store.stage[row] ?? 0);
  }
  return false;
}

/* The person a role works as in this demo, for an entry it makes */
export function personActor(role: Role, person: number): Actor {
  return { kind: "person", role, person };
}

/*
  The history of a generated row, worked out from what the row says: the
  stage it reached, the day it was registered, the day the reply went out
  and the day it was closed, its operator, its signatory, an extension.
  Seeded by the row, so the same row has the same history everywhere. The
  path is the shortest one the transitions allow to the row's stage, with
  a few detours a desk has: facts asked for first (most cases), a reply
  returned for rework once in a while, by the reviewer or the signatory. A
  case in drafting may be there because it was returned. Days are working
  days from the registration to the day the reply went out (or the day the
  data is taken, while open); the first action comes within two working
  days of the registration. The shares are this generator's own.
*/
const FACTS_FIRST_SHARE = 0.6;
const REVIEW_RETURN_SHARE = 0.12;
const SIGNATURE_RETURN_SHARE = 0.05;
const RETURNED_DRAFT_SHARE = 0.18;

type Move = { action: Action; from: number; to: number; actor: Actor; reason?: ReturnReason };

export function generatedJournal(store: ColumnStore, row: number): JournalEntry[] {
  const rng = makeRng(mixSeed(((store.opRef[row] ?? 0) ^ ((store.variant[row] ?? 0) << 8)) >>> 0, row + 0x6a6f));
  const origin = store.origin.get(row);
  const stage = origin?.stage ?? store.stage[row] ?? 0;
  const registered = store.registered[row] ?? 0;
  const sentOn = origin?.sentOn ?? store.sentOn[row] ?? -1;
  const extension = origin?.extension ?? store.extension[row] ?? 0;
  const operator = personActor("operator", origin?.assignee ?? store.assignee[row] ?? 0);
  const reviewer = personActor("reviewer", Math.floor(rng() * REVIEWER_COUNT));
  const signatory = personActor("signatory", store.signatory[row] ?? 0);
  const supervisor = personActor("supervisor", 0);
  const reason = (): ReturnReason => RETURN_REASONS[Math.floor(rng() * RETURN_REASONS.length)] ?? "wording";

  const moves: Move[] = [];
  const move = (action: Action, from: number, to: number, actor: Actor, why?: ReturnReason) =>
    moves.push(why ? { action, from, to, actor, reason: why } : { action, from, to, actor });

  let at: number = Stage.Registered;
  if (stage > Stage.Registered) {
    if (stage === Stage.WaitingForFacts || rng() < FACTS_FIRST_SHARE) {
      move("request_facts", at, Stage.WaitingForFacts, operator);
      at = Stage.WaitingForFacts;
    }
    if (stage > Stage.WaitingForFacts) {
      move(at === Stage.WaitingForFacts ? "facts_received" : "start_drafting", at, Stage.Drafting, operator);
      at = Stage.Drafting;
    }
  }
  const returnedDraft = stage === Stage.Drafting && rng() < RETURNED_DRAFT_SHARE;
  if (stage >= Stage.LegalReview || returnedDraft) {
    move("hand_over", Stage.Drafting, Stage.LegalReview, operator);
    if (stage >= Stage.LegalReview && rng() < REVIEW_RETURN_SHARE) {
      move("return", Stage.LegalReview, Stage.Drafting, reviewer, reason());
      move("hand_over", Stage.Drafting, Stage.LegalReview, operator);
    }
    if (returnedDraft) {
      if (rng() < 0.7) move("return", Stage.LegalReview, Stage.Drafting, reviewer, reason());
      else {
        move("approve", Stage.LegalReview, Stage.AwaitingSignature, reviewer);
        move("return", Stage.AwaitingSignature, Stage.Drafting, signatory, reason());
      }
    } else if (stage >= Stage.AwaitingSignature) {
      move("approve", Stage.LegalReview, Stage.AwaitingSignature, reviewer);
      if (rng() < SIGNATURE_RETURN_SHARE) {
        move("return", Stage.AwaitingSignature, Stage.Drafting, signatory, reason());
        move("hand_over", Stage.Drafting, Stage.LegalReview, operator);
        move("approve", Stage.LegalReview, Stage.AwaitingSignature, reviewer);
      }
    }
  }
  /* An extension, asked for while the facts were awaited */
  if (extension === Extension.Extended) {
    const k = Math.min(moves.length, 1);
    const here = k === 0 ? Stage.Registered : (moves[k - 1]?.to ?? Stage.Registered);
    moves.splice(k, 0, { action: "extend", from: here, to: here, actor: supervisor });
  }

  /* Days: working days after the registration, up to the day the reply
     went out, or the day the data is taken while the case is open */
  const answered = stage >= Stage.Sent && sentOn >= 0;
  const end = answered ? sentOn : AS_OF_DAY;
  const span = Math.max(0, workingDaysFrom(registered, end));
  const first = Math.min(span, rng() < 0.55 ? 0 : rng() < 0.75 ? 1 : 2);
  const dayAt = (offset: number) => (offset <= 0 ? registered : plusWorkingDays(registered, offset));
  const out: JournalEntry[] = [];
  const registerMinute =
    (store.received[row] ?? 0) === registered ? Math.min(1439, (store.receivedMinute[row] ?? 540) + 20) : 540 + Math.floor(rng() * 60);
  out.push({ at: moscowMs(registered, registerMinute), action: "register", from: Stage.Registered, to: Stage.Registered, actor: { kind: "system" }, generated: true });
  let lastAt = out[0]!.at;
  moves.forEach((m, k) => {
    const offset = moves.length === 1 ? first : Math.round(first + ((span - first) * k) / Math.max(1, moves.length));
    const day = dayAt(Math.min(span, offset));
    let t = moscowMs(day, 540 + Math.floor(rng() * 540));
    if (t <= lastAt) t = lastAt + (5 + Math.floor(rng() * 40)) * 60_000;
    lastAt = t;
    out.push({ at: t, action: m.action, from: m.from, to: m.to, actor: m.actor, ...(m.reason ? { reason: m.reason } : {}), generated: true });
  });
  if (answered) {
    let t = moscowMs(sentOn, 600 + Math.floor(rng() * 420));
    if (t <= lastAt) t = lastAt + 30 * 60_000;
    lastAt = t;
    out.push({ at: t, action: "send", from: Stage.AwaitingSignature, to: Stage.Sent, actor: signatory, generated: true });
    if (stage === Stage.Closed) {
      const closedOn = Math.min(AS_OF_DAY, plusWorkingDays(sentOn, 1 + Math.floor(rng() * 5)));
      let c = moscowMs(closedOn, 600 + Math.floor(rng() * 420));
      if (c <= lastAt) c = lastAt + 30 * 60_000;
      out.push({ at: c, action: "close", from: Stage.Sent, to: Stage.Closed, actor: supervisor, generated: true });
    }
  }
  return out;
}
