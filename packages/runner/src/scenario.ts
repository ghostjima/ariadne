/*
  Deterministic scenario of the agent run. Nothing here depends on the clock or
  on randomness outside the seeded generator, so the same seed and the same
  case give the same plan wherever it is generated (a page, a Service Worker,
  a test).

  Domain: one complaint to a bank. The application describes the case in a
  CaseBrief: codes, numbers and dates that it worked out from its register and
  from ariadne-rules (the stream, the reason, the reply's last day, the
  grounds, the client's options and deadlines). The brief never carries the
  complaint's text: what the applicant wrote is data for a person to read, and
  nothing in it can reach the plan. decodePlanPayload refuses a brief with a
  string that is not a code.

  The plan for a case is five steps: classify the complaint, request the facts
  from the team that holds them, draft the reply, check the draft with the
  rubric, hand it to legal review. Drafting the reply is high risk: it always
  waits for a person. The engine never sends anything to the client; sending
  stays with the signatory, outside the run.
*/

import type {
  ActionType,
  Autonomy,
  CaseStage,
  ClassificationStatus,
  ClientDeadlineKind,
  ClientOption,
  ConflictReason,
  DeviationProposalCode,
  DeviationReason,
  DraftStatus,
  ErrorCode,
  FactQuestion,
  GroundCode,
  LinkStatus,
  MeasureCode,
  NextStep,
  OperationCode,
  OutcomeCode,
  ReasonCode,
  Regime,
  RequestStatus,
  Risk,
  Service,
  StreamCode,
  TaskCode,
  Team,
} from "./codes.js";
import { NEXT_STEPS } from "./codes.js";

export const DEFAULT_SEED = 7;
export const DEFAULT_AUTONOMY: Autonomy = "high_only";
/* Undo window for a fact request sent to another team, in seconds (demo value) */
export const DEFAULT_UNDO_WINDOW_SEC = 60;
/* How long the fact request service waits before it reports a timeout */
export const SERVICE_TIMEOUT_SEC = 5;

/* ISO 8601 calendar date, for example 2026-09-30 */
export type IsoDate = string;

/* A deadline the reply states to the client */
export type ClientDeadline = { kind: ClientDeadlineKind; due: IsoDate };

/*
  The case, as the application describes it. Codes, numbers and dates only.
*/
export type CaseBrief = {
  /* The case number (C-000867 is 867) */
  caseNo: number;
  stream: StreamCode;
  regime: Regime;
  /* The OD-2506 sign or the 115-FZ category, when the stream has one */
  reason: ReasonCode | null;
  operation: OperationCode;
  /* The operation's reference number, 0 when there is no operation */
  opRef: number;
  opOn: IsoDate | null;
  amountKopecks: number;
  /* The money claimed, 0 when none */
  claimKopecks: number;
  /* Forwarded by the Bank of Russia: the reply is copied to it */
  forwarded: boolean;
  stage: CaseStage;
  outcome: OutcomeCode;
  receivedOn: IsoDate;
  /* The day the reply would be dated: the day the data is taken */
  asOf: IsoDate;
  /* The reply's last day */
  replyDue: IsoDate;
  /* The fact request's own deadline (an internal term, not the law's) */
  factsDue: IsoDate;
  /* A linked case whose facts may already answer the request */
  linkedCase: number | null;
  /* The grounds the reply names */
  grounds: GroundCode[];
  /* The options the law gives the client in this case */
  clientOptions: ClientOption[];
  /* The deadlines that concern the client and still run on asOf */
  deadlines: ClientDeadline[];
  /* The restrictions that apply for the client's own data in the Bank of
     Russia's database, which the reply states: the suspension or the
     transfer cap, and the ATM cash cap; empty for any other case */
  measures: MeasureCode[];
};

export type ClassificationObject = {
  kind: "classification";
  caseNo: number;
  before: { status: ClassificationStatus };
  after: { status: ClassificationStatus };
};

export type FactRequestObject = {
  kind: "fact_request";
  caseNo: number;
  team: Team;
  before: { status: RequestStatus };
  after: { status: RequestStatus };
};

export type LinkedFactsObject = {
  kind: "linked_facts";
  caseNo: number;
  linkedCase: number;
  before: { status: LinkStatus };
  after: { status: LinkStatus };
};

export type ReplyDraftObject = {
  kind: "reply_draft";
  caseNo: number;
  before: { status: DraftStatus };
  after: { status: DraftStatus };
};

export type CaseObject = {
  kind: "case";
  caseNo: number;
  before: { stage: CaseStage };
  after: { stage: CaseStage };
};

/* An object a step changes, with its state before and after the step */
export type AffectedObject =
  | ClassificationObject
  | FactRequestObject
  | LinkedFactsObject
  | ReplyDraftObject
  | CaseObject;

/* Identity of an affected object, without its states */
export type ObjectRef = { kind: AffectedObject["kind"]; caseNo: number };

/* The reply as the agent drafts it: what the application writes out, in the
   reader's language, and what the rubric checks */
export type ReplyDraft = {
  kind: "reply";
  template: "reply";
  caseNo: number;
  repliedOn: IsoDate;
  stream: StreamCode;
  regime: Regime;
  outcome: OutcomeCode;
  operation: OperationCode;
  opRef: number;
  opOn: IsoDate | null;
  amountKopecks: number;
  claimKopecks: number;
  receivedOn: IsoDate;
  grounds: GroundCode[];
  reasons: ReasonCode[];
  clientOptions: ClientOption[];
  deadlines: ClientDeadline[];
  measures: MeasureCode[];
  nextSteps: NextStep[];
};

/* What the user sees before a step runs */
export type Draft =
  | {
      kind: "change";
      template: "classify";
      caseNo: number;
      stream: StreamCode;
      regime: Regime;
      reason: ReasonCode | null;
    }
  | {
      kind: "request";
      template: "request_facts";
      caseNo: number;
      team: Team;
      questions: FactQuestion[];
      operation: OperationCode;
      opRef: number;
      opOn: IsoDate | null;
      factsDue: IsoDate;
    }
  | {
      kind: "change";
      template: "reuse_linked_facts";
      caseNo: number;
      linkedCase: number;
      sendsRequest: boolean;
    }
  | ReplyDraft
  | { kind: "change"; template: "check_draft"; caseNo: number }
  | {
      kind: "change";
      template: "hand_to_review";
      caseNo: number;
      stageBefore: CaseStage;
      replyDue: IsoDate;
      /* The reply is still sent by a person, after review and signature */
      sends: boolean;
    };

/* What a finished step reports */
export type Summary =
  | { code: "case_classified"; caseNo: number; stream: StreamCode; reason: ReasonCode | null }
  | { code: "facts_requested"; caseNo: number; team: Team; factsDue: IsoDate }
  | { code: "linked_facts_reused"; caseNo: number; linkedCase: number }
  | { code: "reply_drafted"; caseNo: number }
  | { code: "draft_checked"; caseNo: number }
  | { code: "handed_to_review"; caseNo: number; replyDue: IsoDate };

/* What undoing a finished step rolls back */
export type UndoEffect =
  | { code: "unconfirm_classification"; caseNo: number }
  | { code: "recall_fact_request"; caseNo: number; team: Team }
  | { code: "unlink_facts"; caseNo: number; linkedCase: number }
  | { code: "discard_draft"; caseNo: number }
  | { code: "clear_check"; caseNo: number }
  | { code: "return_to_drafting"; caseNo: number; stage: CaseStage };

export type StepError = { code: ErrorCode; service: Service; timeoutSec: number };

/* A proposal to leave the plan, which the user allows or denies */
export type Deviation = {
  reason: DeviationReason;
  /* The linked case whose facts are already on file */
  linkedCase: number;
  proposal: DeviationProposalCode;
  newType: ActionType;
  newRisk: Risk;
};

export type ScenarioStep = {
  id: string;
  type: ActionType;
  caseNo: number;
  risk: Risk;
  /* 0..1, two decimals */
  confidence: number;
  objects: AffectedObject[];
  draft: Draft;
  summary: Summary;
  undo: UndoEffect;
  /* null means no window: the change is internal and can always be reverted */
  undoWindowSec: number | null;
  /* Base execution time in ms at normal speed */
  durationMs: number;
  deviation?: Deviation;
  /* Set once a deviation has been applied: which proposal the step now follows */
  deviatedTo?: DeviationProposalCode;
  /* Fails on the first attempt with this error */
  error?: StepError;
};

export type Scenario = {
  seed: number;
  brief: CaseBrief;
  steps: ScenarioStep[];
  /* The step that fails once (odd seeds), or null */
  errorStepId: string | null;
  /* The step that asks to leave the plan (cases with a linked case), or null */
  deviationStepId: string | null;
};

export type PlanStep = ScenarioStep & { askFirst: boolean };

/* The task the scenario represents: answer one complaint */
export function taskOf(brief: CaseBrief): { code: TaskCode; caseNo: number } {
  return { code: "answer_complaint", caseNo: brief.caseNo };
}

/* Small deterministic PRNG (mulberry32) */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The five steps, in the order the agent proposes them */
const BLUEPRINT: readonly ActionType[] = [
  "classify",
  "request_facts",
  "draft_reply",
  "check_draft",
  "hand_to_review",
];

export const RISK_BY_TYPE: Record<ActionType, Risk> = {
  classify: "low",
  request_facts: "medium",
  reuse_facts: "low",
  /* A regulated reply: always a person's decision */
  draft_reply: "high",
  check_draft: "low",
  hand_to_review: "medium",
};

const CONFIDENCE_RANGE: Record<ActionType, [number, number]> = {
  classify: [0.88, 0.98],
  request_facts: [0.8, 0.93],
  reuse_facts: [0.75, 0.9],
  draft_reply: [0.62, 0.84],
  check_draft: [0.9, 0.99],
  hand_to_review: [0.85, 0.97],
};

/* The team that holds the facts of a stream */
export function teamOf(stream: StreamCode): Team {
  if (stream === "antifraud") return "antifraud";
  if (stream === "aml_refusal") return "aml";
  return "operations";
}

/* What the fact request asks the team */
export const QUESTIONS_BY_TEAM: Record<Team, readonly FactQuestion[]> = {
  antifraud: ["sign_detected", "client_confirmation", "database_match", "measure_status"],
  aml: ["decision_basis", "documents_received", "measure_status"],
  operations: ["operation_record", "contract_terms", "charges"],
};

const FACT_SERVICE_TIMEOUT: StepError = {
  code: "service_timeout",
  service: "fact_requests",
  timeoutSec: SERVICE_TIMEOUT_SEC,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* The case number mixed into the seed, so two cases differ under one seed */
function mix(seed: number, caseNo: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ caseNo) >>> 0;
}

/* The reply the agent drafts for a case */
export function replyDraft(brief: CaseBrief): ReplyDraft {
  return {
    kind: "reply",
    template: "reply",
    caseNo: brief.caseNo,
    repliedOn: brief.asOf,
    stream: brief.stream,
    regime: brief.regime,
    outcome: brief.outcome,
    operation: brief.operation,
    opRef: brief.opRef,
    opOn: brief.opOn,
    amountKopecks: brief.amountKopecks,
    claimKopecks: brief.claimKopecks,
    receivedOn: brief.receivedOn,
    grounds: [...brief.grounds],
    reasons: brief.reason === null ? [] : [brief.reason],
    clientOptions: [...brief.clientOptions],
    deadlines: brief.deadlines.map((d) => ({ ...d })),
    measures: [...brief.measures],
    nextSteps: [...NEXT_STEPS],
  };
}

function stepOf(
  type: ActionType,
  brief: CaseBrief,
  base: { id: string; confidence: number; durationMs: number },
  odd: boolean,
): ScenarioStep {
  const caseNo = brief.caseNo;
  const common = { ...base, caseNo, type, risk: RISK_BY_TYPE[type] };
  switch (type) {
    case "classify":
      return {
        ...common,
        objects: [
          {
            kind: "classification",
            caseNo,
            before: { status: "unconfirmed" },
            after: { status: "confirmed" },
          },
        ],
        draft: {
          kind: "change",
          template: "classify",
          caseNo,
          stream: brief.stream,
          regime: brief.regime,
          reason: brief.reason,
        },
        summary: { code: "case_classified", caseNo, stream: brief.stream, reason: brief.reason },
        undo: { code: "unconfirm_classification", caseNo },
        undoWindowSec: null,
      };
    case "request_facts": {
      const team = teamOf(brief.stream);
      return {
        ...common,
        objects: [
          {
            kind: "fact_request",
            caseNo,
            team,
            before: { status: "not_sent" },
            after: { status: "sent" },
          },
        ],
        draft: {
          kind: "request",
          template: "request_facts",
          caseNo,
          team,
          questions: [...QUESTIONS_BY_TEAM[team]],
          operation: brief.operation,
          opRef: brief.opRef,
          opOn: brief.opOn,
          factsDue: brief.factsDue,
        },
        summary: { code: "facts_requested", caseNo, team, factsDue: brief.factsDue },
        undo: { code: "recall_fact_request", caseNo, team },
        /* The request leaves the complaints team: it can be recalled only
           while the other team has not taken it */
        undoWindowSec: DEFAULT_UNDO_WINDOW_SEC,
        ...(odd ? { error: FACT_SERVICE_TIMEOUT } : {}),
        ...(brief.linkedCase !== null
          ? {
              deviation: {
                reason: "facts_in_linked_case",
                linkedCase: brief.linkedCase,
                proposal: "reuse_linked_facts",
                newType: "reuse_facts",
                newRisk: RISK_BY_TYPE.reuse_facts,
              } satisfies Deviation,
            }
          : {}),
      };
    }
    case "draft_reply":
      return {
        ...common,
        objects: [
          { kind: "reply_draft", caseNo, before: { status: "none" }, after: { status: "drafted" } },
        ],
        draft: replyDraft(brief),
        summary: { code: "reply_drafted", caseNo },
        undo: { code: "discard_draft", caseNo },
        undoWindowSec: null,
      };
    case "check_draft":
      return {
        ...common,
        objects: [
          {
            kind: "reply_draft",
            caseNo,
            before: { status: "drafted" },
            after: { status: "checked" },
          },
        ],
        draft: { kind: "change", template: "check_draft", caseNo },
        summary: { code: "draft_checked", caseNo },
        undo: { code: "clear_check", caseNo },
        undoWindowSec: null,
      };
    case "hand_to_review":
      return {
        ...common,
        objects: [
          {
            kind: "case",
            caseNo,
            before: { stage: brief.stage },
            after: { stage: "legal_review" },
          },
        ],
        draft: {
          kind: "change",
          template: "hand_to_review",
          caseNo,
          stageBefore: brief.stage,
          replyDue: brief.replyDue,
          sends: false,
        },
        summary: { code: "handed_to_review", caseNo, replyDue: brief.replyDue },
        undo: { code: "return_to_drafting", caseNo, stage: brief.stage },
        undoWindowSec: null,
      };
    case "reuse_facts":
      /* Not in the blueprint: a step becomes reuse_facts only through an
         allowed deviation (applyDeviation) */
      throw new RangeError("reuse_facts");
  }
}

export function generateScenario(seed: number, brief: CaseBrief): Scenario {
  const rng = createRng(mix(seed, brief.caseNo));
  /* Odd scenario numbers make the fact request service time out once */
  const odd = Math.abs(Math.trunc(seed)) % 2 === 1;
  const steps = BLUEPRINT.map((type, i): ScenarioStep => {
    const [lo, hi] = CONFIDENCE_RANGE[type];
    const confidence = round2(lo + rng() * (hi - lo));
    const durationMs = 300 + Math.floor(rng() * 600);
    return stepOf(type, brief, { id: `s${i + 1}`, confidence, durationMs }, odd);
  });
  return {
    seed,
    brief,
    steps,
    errorStepId: steps.find((s) => s.error)?.id ?? null,
    deviationStepId: steps.find((s) => s.deviation)?.id ?? null,
  };
}

export function generatePlan(seed: number, brief: CaseBrief): PlanStep[] {
  return generateScenario(seed, brief).steps.map((s) => ({ ...s, askFirst: false }));
}

/*
  The consent rule. High risk always pauses: this is a floor that no autonomy
  level can lower. "ask_none" ignores per-step flags, "high_only" honors them.
*/
export function requiresConfirmation(
  step: { risk: Risk; askFirst: boolean },
  autonomy: Autonomy,
): boolean {
  if (step.risk === "high") return true;
  if (autonomy === "ask_all") return true;
  if (autonomy === "high_only") return step.askFirst;
  return false;
}

/* The identity of an affected object, without its states */
export function objectRef(o: AffectedObject): ObjectRef {
  return { kind: o.kind, caseNo: o.caseNo };
}

/* Whether two affected objects are the same object */
export function sameObject(a: AffectedObject, b: AffectedObject): boolean {
  return a.kind === b.kind && a.caseNo === b.caseNo;
}

export type Conflict = { a: string; b: string; object: ObjectRef; reason: ConflictReason };

/* Pairs of step types that must run in this order, and the reason a plan
   that puts the second first is flagged */
const ORDER: readonly {
  first: ActionType;
  then: ActionType;
  object: ObjectRef["kind"];
  reason: ConflictReason;
}[] = [
  { first: "request_facts", then: "draft_reply", object: "fact_request", reason: "draft_before_facts" },
  { first: "draft_reply", then: "check_draft", object: "reply_draft", reason: "check_before_draft" },
  { first: "draft_reply", then: "hand_to_review", object: "reply_draft", reason: "review_before_draft" },
];

/* Two steps conflict when the plan puts a step before the one it needs: a
   reply drafted before the facts are asked for, a check or a review of a
   draft that does not exist yet. The pair is named in plan order. */
export function findConflicts(steps: readonly PlanStep[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const a = steps[i]!;
      const b = steps[j]!;
      const rule = ORDER.find((r) => r.then === a.type && r.first === b.type);
      if (!rule) continue;
      out.push({ a: a.id, b: b.id, object: { kind: rule.object, caseNo: a.caseNo }, reason: rule.reason });
    }
  }
  return out;
}

/* Applies an allowed deviation to a step: the facts of the linked case are
   taken instead of a new request, so nothing leaves the team and nothing can
   time out */
export function applyDeviation(step: ScenarioStep): ScenarioStep {
  const d = step.deviation;
  if (!d) return step;
  const { error: _error, deviation: _deviation, ...rest } = step;
  return {
    ...rest,
    type: d.newType,
    risk: d.newRisk,
    objects: [
      {
        kind: "linked_facts",
        caseNo: step.caseNo,
        linkedCase: d.linkedCase,
        before: { status: "not_linked" },
        after: { status: "linked" },
      },
    ],
    draft: {
      kind: "change",
      template: "reuse_linked_facts",
      caseNo: step.caseNo,
      linkedCase: d.linkedCase,
      sendsRequest: false,
    },
    summary: { code: "linked_facts_reused", caseNo: step.caseNo, linkedCase: d.linkedCase },
    undo: { code: "unlink_facts", caseNo: step.caseNo, linkedCase: d.linkedCase },
    undoWindowSec: null,
    deviatedTo: d.proposal,
  };
}
