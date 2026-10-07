/*
  The desk's adapter over ariadne-rules, the legal rules engine in Rust
  compiled to WebAssembly. Nothing here computes a date or reads a law:
  every answer comes from the WebAssembly module. The adapter loads the
  module once, turns plain objects into the module's inputs, turns its
  outputs into plain objects (and frees the module's copies), and caches
  the two fixed lists (the ОД-2506 signs and the 115-FZ categories).

  Dates are `YYYY-MM-DD` strings, as the module takes them. Errors are
  thrown as `RulesError` with the module's code (`invalid_date`,
  `outside_calendar`, ...), never a sentence.
*/
import init, * as wasm from "../wasm/ariadne_rules.js";

export type Day = string;

export type StreamCode = wasm.StreamCode;
export type ApplicantCode = wasm.ApplicantCode;
export type OriginCode = wasm.OriginCode;
export type SectorCode = wasm.SectorCode;
export type OperationCode = wasm.OperationCode;
export type AmlDecisionCode = wasm.AmlDecisionCode;
export type ExtensionGroundCode = wasm.ExtensionGroundCode;
export type ActCode = wasm.ActCode;
export type NoSubstanceCode = wasm.NoSubstanceCode;

export class RulesError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RulesError";
  }
}

let loaded = false;
let loading: Promise<void> | null = null;

/* Loads the module in a browser or a worker, from the file the bundler
   placed beside the glue, or from `source`. Safe to call again. */
export function loadRules(source?: wasm.InitInput): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (source === undefined ? init() : init({ module_or_path: source })).then(() => {
    loaded = true;
  });
  return loading;
}

/* Loads the module from bytes already in hand (tests, Node). */
export function loadRulesSync(module: wasm.SyncInitInput): void {
  if (loaded) return;
  wasm.initSync({ module });
  loaded = true;
}

export function rulesLoaded(): boolean {
  return loaded;
}

function ready(): void {
  if (!loaded) throw new RulesError("rules_not_loaded");
}

/* Runs a module call, turning its thrown Error into a RulesError */
function call<T>(f: () => T): T {
  ready();
  try {
    return f();
  } catch (e) {
    throw new RulesError(e instanceof Error ? e.message : String(e));
  }
}

/* The crate version, as built. */
export function rulesVersion(): string {
  return call(() => wasm.version());
}

/* Calendar */

export type DayKind = "working" | "working_weekend" | "holiday" | "weekend" | "transferred_day_off";

/* The first and the last day the calendar covers. */
export function calendarRange(): { first: Day; last: Day } {
  const [first, last] = call(() => wasm.calendarRange());
  return { first: first ?? "", last: last ?? "" };
}

export function isWorkingDay(day: Day): boolean {
  return call(() => wasm.isWorkingDay(day));
}

export function dayKind(day: Day): DayKind {
  return call(() => wasm.dayKind(day)) as DayKind;
}

/* The first working day strictly after `day`. */
export function nextWorkingDay(day: Day): Day {
  return call(() => wasm.nextWorkingDay(day));
}

/* The `n`-th working day after `day`; `day` itself never counts. */
export function addWorkingDays(day: Day, n: number): Day {
  return call(() => wasm.addWorkingDays(day, n));
}

/* The working days after `from` up to and including `to`, negative when
   `to` is earlier. */
export function workingDaysBetween(from: Day, to: Day): number {
  return call(() => wasm.workingDaysBetween(from, to));
}

/* Clocks */

/* One complaint and the facts around it. Anything left out is unknown,
   as in the module's CaseInput. */
export type CaseFacts = {
  stream: StreamCode;
  receivedOn: Day;
  sector?: SectorCode;
  applicant?: ApplicantCode;
  origin?: OriginCode;
  registeredOn?: Day;
  electronic?: boolean;
  /* A money claim, in whole kopecks */
  claimKopecks?: number;
  claimStandardForm?: boolean;
  breachOn?: Day;
  extension?: { ground: ExtensionGroundCode; workingDays: number };
  standardBreachFound?: boolean;
  /* Left without a reply on substance, on this ground */
  noSubstance?: NoSubstanceCode;
  /* The correspondence stopped on a repeated complaint */
  stopCorrespondence?: boolean;
  blocked?: {
    operation: OperationCode;
    on: Day;
    confirmedOn?: Day;
    databaseMatchAfterConfirmation?: boolean;
    refundClaimReceivedOn?: Day;
  };
  /* The client's own data in the Bank of Russia's database (161-FZ
     art. 9, Directive No. 6748-U) */
  database?: {
    instrumentSuspendedOn?: Day;
    policeInformation?: boolean;
    dataRemovedOn?: Day;
    exclusionReceivedByOperatorOn?: Day;
    exclusionDataMissing?: boolean;
    exclusionReceivedByBankOfRussiaOn?: Day;
    exclusionDecisionReceivedOn?: Day;
    bankOfRussiaQueryReceivedOn?: Day;
  };
  aml?: {
    decision?: { kind: AmlDecisionCode; on: Day };
    documentsSubmittedOn?: Day;
    commissionAppliedOn?: Day;
    /* The commission's request to the organisation, and the working days
       it gives (at least 3) */
    commissionRequest?: { receivedOn: Day; workingDays?: number };
    commissionDecidedOn?: Day;
    highRiskMeasuresOn?: Day;
    highRiskNoticeReceivedOn?: Day;
    ratingReviewReceivedOn?: Day;
  };
};

export type Basis = {
  source: string;
  /* The act's title, in Russian */
  act: string;
  article: string;
  part: string;
  revision: string;
  url: string;
  reading: "text" | "conservative";
};

export type Deadline = {
  kind: string;
  due: Day;
  from: Day;
  count: string;
  countValue: number;
  forOthers: boolean;
  basis: Basis;
};

export type Duty = { kind: string; when: string; basis: Basis };

/* A measure taken (`suspend_order`, `refuse_operation`, ...), the day it
   takes effect, and its ground */
export type Measure = { kind: string; on: Day; basis: Basis };

export type Clock = {
  regime: "complaint" | "ombudsman_claim";
  deadlines: Deadline[];
  duties: Duty[];
  measures: Measure[];
  warnings: string[];
  refusals: string[];
  /* The reply's last day, extended when an extension was allowed */
  replyDue: Day | null;
};

function caseInput(f: CaseFacts): wasm.CaseInput {
  const i = new wasm.CaseInput(f.stream, f.receivedOn);
  if (f.sector !== undefined) i.sector = f.sector;
  if (f.applicant !== undefined) i.applicant = f.applicant;
  if (f.origin !== undefined) i.origin = f.origin;
  if (f.registeredOn !== undefined) i.registeredOn = f.registeredOn;
  if (f.electronic !== undefined) i.electronic = f.electronic;
  if (f.claimKopecks !== undefined) i.claimKopecks = f.claimKopecks;
  if (f.claimStandardForm !== undefined) i.claimStandardForm = f.claimStandardForm;
  if (f.breachOn !== undefined) i.breachOn = f.breachOn;
  if (f.extension !== undefined) {
    i.extensionGround = f.extension.ground;
    i.extensionWorkingDays = f.extension.workingDays;
  }
  if (f.standardBreachFound !== undefined) i.standardBreachFound = f.standardBreachFound;
  if (f.noSubstance !== undefined) i.noSubstance = f.noSubstance;
  if (f.stopCorrespondence !== undefined) i.stopCorrespondence = f.stopCorrespondence;
  if (f.blocked !== undefined) {
    const b = f.blocked;
    i.blockedOperation = b.operation;
    i.blockedOn = b.on;
    if (b.confirmedOn !== undefined) i.confirmedOn = b.confirmedOn;
    if (b.databaseMatchAfterConfirmation !== undefined) i.databaseMatchAfterConfirmation = b.databaseMatchAfterConfirmation;
    if (b.refundClaimReceivedOn !== undefined) i.refundClaimReceivedOn = b.refundClaimReceivedOn;
  }
  if (f.database !== undefined) {
    const db = f.database;
    if (db.instrumentSuspendedOn !== undefined) i.instrumentSuspendedOn = db.instrumentSuspendedOn;
    if (db.policeInformation !== undefined) i.policeInformation = db.policeInformation;
    if (db.dataRemovedOn !== undefined) i.dataRemovedOn = db.dataRemovedOn;
    if (db.exclusionReceivedByOperatorOn !== undefined) i.exclusionReceivedByOperatorOn = db.exclusionReceivedByOperatorOn;
    if (db.exclusionDataMissing !== undefined) i.exclusionDataMissing = db.exclusionDataMissing;
    if (db.exclusionReceivedByBankOfRussiaOn !== undefined) i.exclusionReceivedByBankOfRussiaOn = db.exclusionReceivedByBankOfRussiaOn;
    if (db.exclusionDecisionReceivedOn !== undefined) i.exclusionDecisionReceivedOn = db.exclusionDecisionReceivedOn;
    if (db.bankOfRussiaQueryReceivedOn !== undefined) i.bankOfRussiaQueryReceivedOn = db.bankOfRussiaQueryReceivedOn;
  }
  if (f.aml !== undefined) {
    const a = f.aml;
    if (a.decision !== undefined) {
      i.amlDecision = a.decision.kind;
      i.amlDecisionOn = a.decision.on;
    }
    if (a.documentsSubmittedOn !== undefined) i.documentsSubmittedOn = a.documentsSubmittedOn;
    if (a.commissionAppliedOn !== undefined) i.commissionAppliedOn = a.commissionAppliedOn;
    if (a.commissionRequest !== undefined) {
      i.commissionRequestReceivedOn = a.commissionRequest.receivedOn;
      if (a.commissionRequest.workingDays !== undefined) i.commissionRequestWorkingDays = a.commissionRequest.workingDays;
    }
    if (a.commissionDecidedOn !== undefined) i.commissionDecidedOn = a.commissionDecidedOn;
    if (a.ratingReviewReceivedOn !== undefined) i.ratingReviewReceivedOn = a.ratingReviewReceivedOn;
    if (a.highRiskMeasuresOn !== undefined) i.highRiskMeasuresOn = a.highRiskMeasuresOn;
    if (a.highRiskNoticeReceivedOn !== undefined) i.highRiskNoticeReceivedOn = a.highRiskNoticeReceivedOn;
  }
  return i;
}

function basis(b: wasm.BasisOutput): Basis {
  const out: Basis = {
    source: b.source,
    act: b.act,
    article: b.article,
    part: b.part,
    revision: b.revision,
    url: b.url,
    reading: b.reading === "conservative" ? "conservative" : "text",
  };
  b.free();
  return out;
}

/* The legal clocks of a case: deadlines with their basis, duties,
   warnings and refusals. */
export function clock(facts: CaseFacts): Clock {
  return call(() => {
    const input = caseInput(facts);
    try {
      const c = wasm.clock(input);
      const out: Clock = {
        regime: c.regime === "ombudsman_claim" ? "ombudsman_claim" : "complaint",
        deadlines: c.deadlines.map((d) => {
          const deadline: Deadline = {
            kind: d.kind,
            due: d.due,
            from: d.from,
            count: d.count,
            countValue: d.countValue,
            forOthers: d.forOthers,
            basis: basis(d.basis),
          };
          d.free();
          return deadline;
        }),
        duties: c.duties.map((d) => {
          const duty: Duty = { kind: d.kind, when: d.when, basis: basis(d.basis) };
          d.free();
          return duty;
        }),
        measures: c.measures.map((m) => {
          const measure: Measure = { kind: m.kind, on: m.on, basis: basis(m.basis) };
          m.free();
          return measure;
        }),
        warnings: c.warnings,
        refusals: c.refusals,
        replyDue: c.replyDue ?? null,
      };
      c.free();
      return out;
    } finally {
      input.free();
    }
  });
}

/* The last day of a request for facts to another unit: two working days,
   an internal policy and not a term of any law, capped by the earliest
   external term that binds the answering unit (`cappedBy`, a deadline
   code, or null when the policy's day stands). */
export type FactRequestDue = { due: Day; policyDue: Day; cappedBy: string | null };

export function factRequestDue(facts: CaseFacts, sentOn: Day): FactRequestDue {
  return call(() => {
    const input = caseInput(facts);
    try {
      const f = wasm.factRequestDue(input, sentOn);
      const out: FactRequestDue = { due: f.due, policyDue: f.policyDue, cappedBy: f.cappedBy ?? null };
      f.free();
      return out;
    } finally {
      input.free();
    }
  });
}

/* Reason codes */

export type Threshold = { value: number; unit: string; bound: string; of: string };

/* A sign of the Bank of Russia's Order No. OD-2506 */
export type Sign = {
  /* The sign's number in the order ("1.10") */
  number: string;
  /* The reason code ("od2506_1_10") */
  code: string;
  group: "transfers" | "digital_rubles";
  /* A short English summary */
  summary: string;
  appliesFrom: Day;
  thresholds: Threshold[];
  /* The wording, transcribed from the order, in Russian: the law */
  wording: string;
};

/* A 115-FZ reason category, with the article and item it rests on */
export type AmlReason = { code: string; source: string; article: string; part: string; revision: string };

let signs: readonly Sign[] | null = null;
let amlList: readonly AmlReason[] | null = null;

/* The signs of Order No. OD-2506, in the order's order. */
export function od2506Signs(): readonly Sign[] {
  signs ??= call(() =>
    wasm.od2506Signs().map((s) => {
      const sign: Sign = {
        number: s.number,
        code: s.code,
        group: s.group === "digital_rubles" ? "digital_rubles" : "transfers",
        summary: s.summary,
        appliesFrom: s.appliesFrom,
        thresholds: s.thresholds.map((t) => {
          const th: Threshold = { value: t.value, unit: t.unit, bound: t.bound, of: t.of };
          t.free();
          return th;
        }),
        wording: s.wording,
      };
      s.free();
      return sign;
    }),
  );
  return signs;
}

/* The 115-FZ reason categories, in the crate's order. */
export function amlReasons(): readonly AmlReason[] {
  amlList ??= call(() =>
    wasm.amlReasons().map((r) => {
      const reason: AmlReason = { code: r.code, source: r.source, article: r.article, part: r.part, revision: r.revision };
      r.free();
      return reason;
    }),
  );
  return amlList;
}

/* Rubric */

export type Ground = { act: ActCode; article: string; part: string };

/* A reply, structured, for the rubric */
export type Reply = {
  repliedOn: Day;
  text: string;
  grounds?: Ground[];
  /* Reason codes (`od2506_1_6`, `aml_operation_refused`, ...) */
  reasons?: string[];
  nextSteps?: string[];
  /* Option codes (`confirm_order`, `apply_to_commission`, ...) */
  clientOptions?: string[];
  statedDeadlines?: { kind: string; due: Day }[];
};

export type Finding = {
  code: string;
  subject: string | null;
  sentence: number | null;
  words: number | null;
  source: string;
  reference: string;
};

/* The rubric's findings for a reply to a case; the module computes the
   case's clock from the same facts. */
export function rubric(reply: Reply, facts: CaseFacts): Finding[] {
  return call(() => {
    const r = new wasm.ReplyInput(reply.repliedOn, reply.text);
    const input = caseInput(facts);
    try {
      r.grounds = (reply.grounds ?? []).map((g) => new wasm.GroundInput(g.act, g.article, g.part));
      r.reasons = reply.reasons ?? [];
      r.nextSteps = reply.nextSteps ?? [];
      r.clientOptions = reply.clientOptions ?? [];
      r.statedDeadlines = (reply.statedDeadlines ?? []).map((s) => new wasm.StatedDeadlineInput(s.kind, s.due));
      return wasm.rubric(r, input).map((f) => {
        const finding: Finding = {
          code: f.code,
          subject: f.subject ?? null,
          sentence: f.sentence ?? null,
          words: f.words ?? null,
          source: f.source,
          reference: f.reference,
        };
        f.free();
        return finding;
      });
    } finally {
      r.free();
      input.free();
    }
  });
}
