import {
  addWorkingDays,
  clock,
  isWorkingDay,
  nextWorkingDay,
  workingDaysBetween,
  type CaseFacts,
  type Clock,
} from "@ariadne/rules";
import { dayNumber, isoDay } from "./days.js";
import { Applicant, EXTENSION_WORKING_DAYS, STREAM_RULES } from "./schema.js";
import { RulesFlag } from "./store.js";

/*
  The register's questions to ariadne-rules, with their answers cached:
  generation asks the same few hundred days and the same reply clocks over
  and over, and the module's answer to a question never changes. Every
  date here is a day number (days.ts); ariadne-rules sees `YYYY-MM-DD`.
*/

const workingDay = new Map<number, boolean>();
const nextWorkingCache = new Map<number, number>();
const plusWorking = new Map<string, number>();
const between = new Map<string, number>();
const clocks = new Map<string, ReplyClock>();

export function isWorking(day: number): boolean {
  let v = workingDay.get(day);
  if (v === undefined) {
    v = isWorkingDay(isoDay(day));
    workingDay.set(day, v);
  }
  return v;
}

/* The first working day strictly after `day` */
export function nextWorking(day: number): number {
  let v = nextWorkingCache.get(day);
  if (v === undefined) {
    v = dayNumber(nextWorkingDay(isoDay(day)));
    nextWorkingCache.set(day, v);
  }
  return v;
}

/* The `n`-th working day after `day` */
export function plusWorkingDays(day: number, n: number): number {
  const key = `${day}+${n}`;
  let v = plusWorking.get(key);
  if (v === undefined) {
    v = dayNumber(addWorkingDays(isoDay(day), n));
    plusWorking.set(key, v);
  }
  return v;
}

/* Working days after `from` up to and including `to`, negative when `to`
   is earlier */
export function workingDaysFrom(from: number, to: number): number {
  const key = `${from}:${to}`;
  let v = between.get(key);
  if (v === undefined) {
    v = workingDaysBetween(isoDay(from), isoDay(to));
    between.set(key, v);
  }
  return v;
}

/* What generation needs to know about a complaint to ask for its clock */
export type ReplyFacts = {
  stream: number;
  applicant: number;
  forwarded: boolean;
  electronic: boolean;
  received: number;
  registered: number;
  /* roubles, 0 for none */
  claim: number;
  standardForm: boolean;
  /* the breach a money claim is about, or -1 */
  breachOn: number;
};

/* The reply clock of a row, as ariadne-rules computed it */
export type ReplyClock = {
  due: number;
  /* -1 when the extension is refused */
  dueExt: number;
  /* the last day for the extension notice, -1 when refused */
  extNotice: number;
  /* RulesFlag bits */
  flags: number;
};

export function replyFacts(f: ReplyFacts, extended: boolean): CaseFacts {
  const facts: CaseFacts = {
    stream: STREAM_RULES[f.stream] ?? "general",
    receivedOn: isoDay(f.received),
    registeredOn: isoDay(f.registered),
    applicant: f.applicant === Applicant.LegalEntity ? "legal_entity" : "individual",
    origin: f.forwarded ? "forwarded_by_bank_of_russia" : "direct",
    electronic: f.electronic,
  };
  if (f.claim > 0) {
    facts.claimKopecks = Math.round(f.claim * 100);
    facts.claimStandardForm = f.standardForm;
    if (f.breachOn >= 0) facts.breachOn = isoDay(f.breachOn);
  }
  if (extended) facts.extension = { ground: "request_documents", workingDays: EXTENSION_WORKING_DAYS };
  return facts;
}

const dueOf = (c: Clock, kind: string): number => {
  const d = c.deadlines.find((x) => x.kind === kind);
  return d ? dayNumber(d.due) : -1;
};

/* The reply's last day, and what an extension to request documents would
   give: two clocks, one without and one with the extension asked for. */
export function replyClock(f: ReplyFacts): ReplyClock {
  const key = `${f.stream}|${f.applicant}|${f.forwarded ? 1 : 0}|${f.electronic ? 1 : 0}|${f.received}|${f.registered}|${f.claim}|${f.standardForm ? 1 : 0}|${f.breachOn}`;
  const cached = clocks.get(key);
  if (cached) return cached;
  const plain = clock(replyFacts(f, false));
  const asked = clock(replyFacts(f, true));
  const refused = asked.refusals.length > 0;
  let flags = 0;
  if (!refused) flags |= RulesFlag.ExtensionAllowed;
  if (plain.regime === "ombudsman_claim") flags |= RulesFlag.Ombudsman;
  if (plain.warnings.includes("registered_late")) flags |= RulesFlag.RegisteredLate;
  if (plain.deadlines.some((d) => d.kind === "registration_notice")) flags |= RulesFlag.RegistrationNotice;
  if (plain.duties.some((d) => d.kind === "copy_to_bank_of_russia")) flags |= RulesFlag.CopyToBankOfRussia;
  const out: ReplyClock = {
    due: dueOf(plain, "reply"),
    dueExt: refused ? -1 : dueOf(asked, "reply_extended"),
    extNotice: refused ? -1 : dueOf(asked, "extension_notice"),
    flags,
  };
  clocks.set(key, out);
  return out;
}
