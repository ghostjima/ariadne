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
import {
  AML_REASON_CODES,
  Applicant,
  Database,
  ELECTRONIC_CHANNELS,
  EXTENSION_WORKING_DAYS,
  Operation,
  Path,
  Restriction,
  SECTOR_RULES,
  STREAM_RULES,
  Source,
  Stream,
} from "./schema.js";
import { RulesFlag, isExtended, type ColumnStore } from "./store.js";

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
  /* Sector code */
  sector: number;
  /* A breach of a base or internal standard found */
  breach: boolean;
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
    sector: SECTOR_RULES[f.sector] ?? "bank",
    standardBreachFound: f.breach,
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
  const key = `${f.stream}|${f.sector}|${f.breach ? 1 : 0}|${f.applicant}|${f.forwarded ? 1 : 0}|${f.electronic ? 1 : 0}|${f.received}|${f.registered}|${f.claim}|${f.standardForm ? 1 : 0}|${f.breachOn}`;
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
  if (plain.duties.some((d) => d.kind === "copy_to_sro")) flags |= RulesFlag.CopyToSro;
  const out: ReplyClock = {
    due: dueOf(plain, "reply"),
    dueExt: refused ? -1 : dueOf(asked, "reply_extended"),
    extNotice: refused ? -1 : dueOf(asked, "extension_notice"),
    flags,
  };
  clocks.set(key, out);
  return out;
}

/* What a stored row says about its reply clock */
export function rowReplyFacts(store: ColumnStore, i: number): ReplyFacts {
  const claim = store.claim[i] ?? 0;
  return {
    stream: store.stream[i] ?? 0,
    sector: store.sector[i] ?? 0,
    breach: (store.breach[i] ?? 0) === 1,
    applicant: store.applicant[i] ?? 0,
    forwarded: store.source[i] === Source.BankOfRussia,
    electronic: ELECTRONIC_CHANNELS.includes(store.channel[i] ?? 0),
    received: store.received[i] ?? 0,
    registered: store.registered[i] ?? 0,
    claim,
    standardForm: store.claimForm[i] === 1,
    breachOn: claim > 0 ? (store.opOn[i] ?? -1) : -1,
  };
}

/* The 115-FZ decisions ariadne-rules counts from, by category */
const AML_DECISION: Partial<Record<(typeof AML_REASON_CODES)[number], "refuse_operation" | "refuse_account" | "terminate_account">> = {
  aml_operation_refused: "refuse_operation",
  aml_account_refused: "refuse_account",
  aml_account_terminated: "terminate_account",
};

/* Everything a stored row knows, as ariadne-rules takes it: the reply's
   facts, the extension as it stands, the operation an antifraud block
   stopped (refused for a card, Faster Payments or e-money, suspended for a
   transfer by bank details) or the client's card or online banking
   suspended for the client's own data in the Bank of Russia's database,
   and the 115-FZ decision or measures; and the row's path beyond them
   (Path): the second step after a confirmation or a repeat, the client's
   application to remove their data from the database, the commission's
   request. The case card asks the module for its whole clock with these. */
export function caseFacts(store: ColumnStore, i: number): CaseFacts {
  const facts = replyFacts(rowReplyFacts(store, i), isExtended(store, i));
  const stream = store.stream[i] ?? 0;
  const on = isoDay(store.opOn[i] ?? 0);
  const operation = store.operation[i] ?? 0;
  const path = store.path[i] ?? Path.None;
  const pathOn = store.pathOn[i] ?? -1;
  const pathThen = store.pathThen[i] ?? -1;
  if (stream === Stream.Antifraud && operation !== Operation.None) {
    facts.blocked = { operation: operation === Operation.BankTransfer ? "transfer" : "card_sbp_or_emoney", on };
    /* The second step: confirmed or repeated, then the database answered */
    if (path === Path.SecondStep && pathOn >= 0) {
      facts.blocked.confirmedOn = isoDay(pathOn);
      facts.blocked.databaseMatchAfterConfirmation = true;
    }
  }
  /* The client's own data in the database: no operation was blocked; the
     card or online banking was suspended on `opOn`, a duty with the
     Ministry of Internal Affairs' information, or, the bank's choice under
     part 11.6, the transfers capped instead; then, if the client applied,
     the application to remove the data through the bank, and its receipt
     by the Bank of Russia once forwarded */
  const database = store.database[i] ?? Database.None;
  if (stream === Stream.Antifraud && database !== Database.None) {
    const capped = store.restriction[i] === Restriction.TransfersCapped;
    facts.database = {
      ...(capped ? { transfersCappedOn: on } : { instrumentSuspendedOn: on }),
      policeInformation: database === Database.ClientDataWithPoliceInformation,
    };
    if (path === Path.DatabaseRemoval && pathOn >= 0) {
      facts.database.exclusionReceivedByOperatorOn = isoDay(pathOn);
      if (pathThen >= 0) facts.database.exclusionReceivedByBankOfRussiaOn = isoDay(pathThen);
    }
  }
  if (stream === Stream.Aml) {
    const category = AML_REASON_CODES[(store.reason[i] ?? 1) - 1];
    const kind = category ? AML_DECISION[category] : undefined;
    if (kind) {
      facts.aml = { decision: { kind, on } };
      /* The application to the commission, and its request to the bank
         with the working days it gives, when it gave them */
      if (path === Path.CommissionRequest && pathOn >= 0 && pathThen >= 0) {
        facts.aml.commissionAppliedOn = isoDay(pathOn);
        const term = store.pathTerm[i] ?? 0;
        facts.aml.commissionRequest = term > 0 ? { receivedOn: isoDay(pathThen), workingDays: term } : { receivedOn: isoDay(pathThen) };
      }
    }
    /* The client's six months to apply to the commission run from the day
       the notice of the measures was received (115-FZ art. 7.8 item 1).
       The register does not know that day; the client complains about the
       measures, so had the notice by then. Conservative reading: the
       notice is taken as received on the day the measures were applied,
       the earliest it could have been, which gives the earliest end of the
       six months a reply can state. */
    else if (category === "aml_high_risk_measures") facts.aml = { highRiskMeasuresOn: on, highRiskNoticeReceivedOn: on };
  }
  return facts;
}
