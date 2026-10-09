// Every word of the assistant panel, in Russian and English, with the same
// keys in both (i18n.test.ts checks). The engine sends codes and
// numbers only; each code has its words here, typed as a Record over the
// engine's own list, so a code without words does not compile. Functions
// take numbers and dates already formatted (format.ts), so the digits are
// the locale's.
import type {
  ActionType,
  AmlReasonCode,
  Autonomy,
  ClassificationStatus,
  ClientDeadlineKind,
  ClientOption,
  Command,
  ConflictReason,
  Decidable,
  DeviationProposalCode,
  DeviationReason,
  DraftKind,
  DraftStatus,
  MeasureCode,
  ErrorCode,
  FactQuestion,
  LinkStatus,
  NextStep,
  ObjectKind,
  OutcomeCode,
  ProgressPhase,
  Regime,
  RequestStatus,
  Risk,
  Service,
  SkipReason,
  StepStatus,
  TaskCode,
  Team,
} from "@ariadne/runner";

import type { StreamStatus } from "./session";
import type { StreamError } from "./transport";
import type { WorkerError } from "./worker";
import type { FindingCode } from "./rubric";

import { LOCALES, type Lang } from "../i18n";

export { LOCALES };
export type { Lang };

const ruRules = new Intl.PluralRules("ru-RU");
/** Russian plural: one (1, 21), few (2-4, 22-24), many (5-20, 25...). */
const ru = (n: number, one: string, few: string, many: string) => {
  const rule = ruRules.select(n);
  return rule === "one" ? one : rule === "few" ? few : many;
};

/** Numbers come in twice: the value (for a plural) and its text in the
 * locale's digits. */
type Count = { n: number; text: string };

export type Strings = {
  title: string;
  subtitle: string;
  shortcutsButton: string;
  shortcuts: { title: string; run: string; general: string; start: string; stop: string; pauseResume: string; help: string; other: string };
  service: {
    starting: string;
    startingText: string;
    failedTitle: string;
    errors: Record<WorkerError, string>;
    retry: string;
    usePage: string;
    pageNote: string;
    updated: string;
  };
  task: {
    panel: string;
    task: string;
    scenario: string;
    scenarioHelp: string;
    autonomy: string;
    scripted: string;
    /** What the assistant is given about the case, and what it is not. */
    untrusted: string;
    /** The case is past drafting: there is no reply left to draft. */
    pastDrafting: (stage: string) => string;
  };
  plan: {
    panel: string;
    list: string;
    summary: (steps: string, asks: string) => string;
    askFirst: string;
    askFirstHelp: string;
    alwaysAsks: string;
    ignoredAtLevel: string;
    confidence: (value: string) => string;
    conflictTitle: string;
    run: string;
    restore: string;
    emptyTitle: string;
    emptyText: string;
  };
  run: {
    panel: string;
    controls: string;
    list: string;
    stop: string;
    pause: string;
    resume: string;
    newPlan: string;
    progress: (done: string, total: string) => string;
    status: Record<StreamStatus, string>;
    stoppingTitle: string;
    stoppingText: string;
    pausedText: string;
    reconnectingText: (event: string) => string;
    failedTitle: string;
    retry: string;
    waitingTitle: string;
  };
  step: {
    awaiting: string;
    deviationAwaiting: string;
    phaseStart: string;
    attempt: (n: string) => string;
    undo: string;
    undoWindow: (n: string) => string;
    undoLeft: (left: string, total: string) => string;
    undoPermanent: string;
    irreversible: (time: string) => string;
    undoneAt: (time: string, text: string) => string;
    retry: string;
    skip: string;
    stopRun: string;
    errorTitle: (attempt: string) => string;
    nothingChanged: string;
    willAsk: string;
  };
  confirm: {
    title: (n: string, title: string) => string;
    intro: string;
    changes: string;
    stopHint: string;
    /** Follows the Escape key: what it does in a confirmation. */
    escapeSkips: string;
    skip: string;
    confirm: Record<DraftKind, string>;
  };
  deviation: {
    title: (n: string) => string;
    instead: (title: string, risk: string) => string;
    allow: string;
    deny: string;
    /** Follows the Escape key: what it does in the agent's request. */
    escapeKeeps: string;
  };
  /** New plan while finished steps can still be undone within a window. */
  newPlanAsk: { title: string; open: (steps: Count) => string; ends: string; keep: string; confirm: string };
  toast: { undoable: (summary: string, time: string) => string; undone: (text: string) => string; reconnected: string };
  log: {
    panel: string;
    label: string;
    emptyTitle: string;
    emptyText: string;
    agent: string;
    you: string;
    approved: (steps: string, autonomy: string, asks: string) => string;
    planStarted: (steps: string) => string;
    stepStarted: (n: string, title: string) => string;
    deviation: (n: string) => string;
    deviated: (n: string, title: string) => string;
    awaiting: (n: string) => string;
    running: (n: string, attempt: Count) => string;
    finished: (n: string, summary: string) => string;
    skipped: (n: string, reason: string) => string;
    failed: (n: string, error: string) => string;
    planFinished: string;
    planStopped: (n: string | null) => string;
    decision: Record<Decidable, (n: string) => string>;
    stopRequested: string;
    undo: (n: string, text: string) => string;
  };
  summary: {
    panel: string;
    label: string;
    finished: string;
    stopped: (n: string | null) => string;
    done: string;
    skipped: string;
    /** Steps the run never reached: it was stopped before them. */
    notRun: string;
    undone: string;
    asked: string;
    errors: string;
    duration: string;
    seconds: string;
    events: string;
    basisRun: string;
  };
  announce: {
    started: string;
    stopping: string;
    stopped: string;
    finished: (done: string, total: string) => string;
    paused: string;
    resumed: string;
    waiting: (n: string) => string;
    failed: (n: string) => string;
    reconnecting: string;
    streamFailed: string;
  };
  // The engine's codes.
  actionType: Record<ActionType, string>;
  risk: Record<Risk, string>;
  autonomy: Record<Autonomy, string>;
  autonomyHelp: Record<Autonomy, string>;
  command: Record<Command, string>;
  phase: Record<ProgressPhase, string>;
  skipReason: Record<SkipReason, string>;
  stepStatus: Record<StepStatus, string>;
  objectKind: Record<ObjectKind, string>;
  classificationStatus: Record<ClassificationStatus, string>;
  requestStatus: Record<RequestStatus, string>;
  linkStatus: Record<LinkStatus, string>;
  draftStatus: Record<DraftStatus, string>;
  regime: Record<Regime, string>;
  /** The team a fact request goes to. */
  team: Record<Team, string>;
  /** What a fact request asks, as a question. */
  question: Record<FactQuestion, string>;
  draftKind: Record<DraftKind, string>;
  serviceName: Record<Service, string>;
  streamError: Record<StreamError, string>;
  taskName: Record<TaskCode, (caseId: string) => string>;
  stepTitle: {
    classify: string;
    request_facts: (team: string) => string;
    reuse_facts: (linkedCase: string) => string;
    draft_reply: string;
    check_draft: string;
    hand_to_review: string;
  };
  draft: {
    classify: (stream: string, reason: string | null, regime: string) => string[];
    request_facts: (caseId: string, team: string, operation: string | null, questions: string[], due: string) => string[];
    reuse_linked_facts: (linkedCase: string, sendsRequest: boolean) => string[];
    /** Above the reply itself, in the confirmation. */
    reply: string[];
    check_draft: string[];
    hand_to_review: (caseId: string, stage: string, due: string, sends: boolean) => string[];
  };
  object: {
    classification: (caseId: string, before: string, after: string) => string;
    fact_request: (team: string, before: string, after: string) => string;
    linked_facts: (linkedCase: string, before: string, after: string) => string;
    reply_draft: (before: string, after: string) => string;
    case: (caseId: string, before: string, after: string) => string;
  };
  summaryText: {
    case_classified: (caseId: string, stream: string, reason: string | null) => string;
    facts_requested: (team: string, due: string) => string;
    linked_facts_reused: (linkedCase: string) => string;
    reply_drafted: (caseId: string) => string;
    draft_checked: string;
    handed_to_review: (caseId: string, due: string) => string;
  };
  undoText: {
    unconfirm_classification: (caseId: string) => string;
    recall_fact_request: (team: string) => string;
    unlink_facts: (linkedCase: string) => string;
    discard_draft: string;
    clear_check: string;
    return_to_drafting: (caseId: string, stage: string) => string;
  };
  errorText: Record<ErrorCode, (service: string, seconds: string) => string>;
  deviationReason: Record<DeviationReason, (linkedCase: string) => string>;
  deviationProposal: Record<DeviationProposalCode, string>;
  conflict: Record<ConflictReason, (a: string, b: string) => string>;
  /** The rubric's findings on the drafted reply. */
  rubric: {
    title: string;
    clean: string;
    count: (n: Count) => string;
    finding: Record<FindingCode, (subject: string, words: string) => string>;
    /** The subjects of option, deadline and restriction findings. */
    option: Record<ClientOption, string>;
    deadline: Record<ClientDeadlineKind, string>;
    measure: Record<MeasureCode, string>;
    /** The draft as written, under a finished drafting step. */
    draftShown: string;
    /** The check ran with no draft written (skipped, undone, or later). */
    noDraft: string;
  };
  /** The reply, written out from the draft's codes. One sentence a line. */
  reply: {
    greeting: string;
    reviewed: (received: string, caseId: string) => string;
    operation: (operation: string, reference: string, day: string, amount: string) => string;
    claim: (amount: string) => string;
    outcome: Record<OutcomeCode, string>;
    suspended: (sign: string) => string;
    refused: (sign: string) => string;
    aml: Record<AmlReasonCode, string>;
    /** The restrictions for the client's own data in the Bank of
     * Russia's database: which apply, each on its ground. */
    measure: Record<MeasureCode, string>;
    ground: (citation: string) => string;
    contract: string;
    option: Record<ClientOption, string>;
    deadline: Record<ClientDeadlineKind, (day: string) => string>;
    next: Record<NextStep, string>;
  };
};

const en: Strings = {
  title: "Assistant",
  subtitle: "It proposes, you decide, and you can stop it at any step",
  shortcutsButton: "Shortcuts",
  shortcuts: {
    title: "Keyboard shortcuts",
    run: "Run",
    general: "General",
    start: "Run the plan",
    stop: "Stop the run",
    pauseResume: "Pause or resume",
    help: "Show shortcuts",
    other: "Other",
  },
  service: {
    starting: "Starting the run service",
    startingText: "The run streams from a service worker in this browser. It is starting.",
    failedTitle: "The run service did not start",
    errors: {
      sw_unsupported: "This browser cannot run service workers on this page. A private window or a privacy setting can turn them off.",
      sw_registration_failed: "The service worker could not be registered.",
      sw_not_controlling: "The service worker started but did not take control of this page.",
    },
    retry: "Try again",
    usePage: "Run in this tab instead",
    pageNote: "The run streams inside this tab, without the service worker.",
    updated: "The run service was updated. The run goes on from where it was.",
  },
  task: {
    panel: "Task",
    task: "Task",
    scenario: "Scenario number",
    scenarioHelp: "The same number gives the same run of this case every time. It sets the agent's confidence and how long each step takes; with an odd number the fact request times out once.",
    autonomy: "Autonomy",
    scripted: "The agent is a script: the same case, scenario number and decisions always give the same run. It is here to show the controls; its replies are templates over the case's facts, not a model's answers.",
    untrusted: "The assistant is given the case's codes, dates and amounts from the register, never the complaint's text: nothing the applicant wrote can instruct it.",
    pastDrafting: (stage) => `This case is at "${stage}": its reply is past drafting, so the assistant has nothing to draft. It drafts replies for cases before legal review.`,
  },
  plan: {
    panel: "Plan",
    list: "Plan steps",
    summary: (steps, asks) => `Steps: ${steps}. Will ask before running: ${asks}.`,
    askFirst: "Ask first",
    askFirstHelp: "Wait for your confirmation before this step.",
    alwaysAsks: "High-risk steps always ask",
    ignoredAtLevel: "Not used at this autonomy level",
    confidence: (value) => `Confidence ${value}`,
    conflictTitle: "Conflicting steps",
    run: "Run plan",
    restore: "Restore plan",
    emptyTitle: "The plan is empty",
    emptyText: "Every step was removed. Restore the plan to run it.",
  },
  run: {
    panel: "Run",
    controls: "Run controls",
    list: "Run steps",
    stop: "Stop",
    pause: "Pause",
    resume: "Resume",
    newPlan: "New plan",
    progress: (done, total) => `Processed ${done} of ${total}`,
    status: {
      idle: "Not started",
      connecting: "Connecting",
      streaming: "Running",
      paused: "Paused",
      waiting: "Waiting for you",
      reconnecting: "Reconnecting",
      failed: "Connection failed",
      ended: "Ended",
    },
    stoppingTitle: "Stopping",
    stoppingText: "The step in progress finishes; no new step starts. Cutting an action in half would be worse than finishing it.",
    pausedText: "Paused between two events. Nothing runs and nothing is sent until you resume.",
    reconnectingText: (event) => `The connection dropped. Resuming after event ${event}.`,
    failedTitle: "The run stopped receiving events",
    retry: "Reconnect",
    waitingTitle: "Your decision is needed",
  },
  step: {
    awaiting: "Waiting for your confirmation.",
    deviationAwaiting: "The agent asks to change this step.",
    phaseStart: "Starting",
    attempt: (n) => `attempt ${n}`,
    undo: "Undo",
    undoWindow: (n) => `Undo window of step ${n}`,
    undoLeft: (left, total) => `${left} left of ${total}`,
    undoPermanent: "An internal change: it can be undone at any time.",
    irreversible: (time) => `Final since ${time}: the undo window has closed.`,
    undoneAt: (time, text) => `Undone at ${time}. ${text}`,
    retry: "Retry",
    skip: "Skip step",
    stopRun: "Stop run",
    errorTitle: (attempt) => `Failed on attempt ${attempt}`,
    nothingChanged: "Nothing was sent or changed.",
    willAsk: "Will ask first",
  },
  confirm: {
    title: (n, title) => `Step ${n}: ${title}`,
    intro: "Nothing has been sent or changed yet.",
    changes: "What changes",
    stopHint: "To stop the whole run instead, press",
    escapeSkips: "skips this step, like the Skip step button.",
    skip: "Skip step",
    confirm: { change: "Apply change", request: "Send request", reply: "Write the draft" },
  },
  deviation: {
    title: (n) => `Step ${n}: the agent asks to change the plan`,
    instead: (title, risk) => `Instead: ${title} (${risk}).`,
    allow: "Allow the change",
    deny: "Keep the plan",
    escapeKeeps: "keeps the plan as it is, like the Keep the plan button.",
  },
  newPlanAsk: {
    title: "Start a new plan?",
    open: (steps) => `Undo is still possible for ${steps.text} ${steps.n === 1 ? "step" : "steps"} of this run.`,
    ends: "A new plan ends those undo windows; what was done stays done.",
    keep: "Keep this run",
    confirm: "Start a new plan",
  },
  toast: {
    undoable: (summary, time) => `${summary} Undo is possible until ${time}.`,
    undone: (text) => `Undone. ${text}`,
    reconnected: "Reconnected. No events were lost.",
  },
  log: {
    panel: "Event log",
    label: "Events and decisions",
    emptyTitle: "No events yet",
    emptyText: "Events and your decisions appear here once the plan runs.",
    agent: "agent",
    you: "you",
    approved: (steps, autonomy, asks) => `Plan approved: ${steps} steps, ${autonomy}, ${asks} will ask first.`,
    planStarted: (steps) => `Run started: ${steps} steps.`,
    stepStarted: (n, title) => `Step ${n} started: ${title}.`,
    deviation: (n) => `Step ${n}: the agent asks to change the plan.`,
    deviated: (n, title) => `Step ${n} changed: ${title}.`,
    awaiting: (n) => `Step ${n} waits for confirmation.`,
    running: (n, attempt) => (attempt.n > 1 ? `Step ${n} running, attempt ${attempt.text}.` : `Step ${n} running.`),
    finished: (n, summary) => `Step ${n} done. ${summary}`,
    skipped: (n, reason) => `Step ${n} skipped: ${reason}.`,
    failed: (n, error) => `Step ${n} failed. ${error}`,
    planFinished: "Run finished.",
    planStopped: (n) => (n ? `Run stopped after step ${n}.` : "Run stopped before any step was done."),
    decision: {
      confirm: (n) => `You confirmed step ${n}.`,
      skip: (n) => `You skipped step ${n}.`,
      retry: (n) => `You asked to retry step ${n}.`,
      allow: (n) => `You allowed the change to step ${n}.`,
      deny: (n) => `You kept step ${n} as planned.`,
    },
    stopRequested: "You asked to stop.",
    undo: (n, text) => `You undid step ${n}. ${text}`,
  },
  summary: {
    panel: "Summary",
    label: "Run summary",
    finished: "The run finished.",
    stopped: (n) => (n ? `The run was stopped after step ${n}.` : "The run was stopped before any step was done."),
    done: "Done",
    skipped: "Skipped",
    notRun: "Not run",
    undone: "Undone",
    asked: "Asked you",
    errors: "Errors",
    duration: "Duration",
    seconds: "s",
    events: "Events",
    basisRun: "from the first event to the last",
  },
  announce: {
    started: "Run started.",
    stopping: "Stopping after the step in progress.",
    stopped: "Run stopped.",
    finished: (done, total) => `Run finished: ${done} of ${total} steps done.`,
    paused: "Paused.",
    resumed: "Resumed.",
    waiting: (n) => `Step ${n} waits for your decision.`,
    failed: (n) => `Step ${n} failed.`,
    reconnecting: "Connection dropped, reconnecting.",
    streamFailed: "The run stopped receiving events.",
  },
  actionType: {
    classify: "Classification",
    request_facts: "Fact request",
    reuse_facts: "Facts from a linked case",
    draft_reply: "Reply draft",
    check_draft: "Rubric check",
    hand_to_review: "Handover",
  },
  risk: { low: "low risk", medium: "medium risk", high: "high risk" },
  autonomy: { ask_all: "Ask every time", high_only: "Ask for marked steps", ask_none: "Ask only when required" },
  autonomyHelp: {
    ask_all: "Every step waits for your confirmation.",
    high_only: "Steps marked Ask first wait for you; high-risk steps always do.",
    ask_none: "Only high-risk steps wait for you; the marks are not used.",
  },
  command: { confirm: "Confirm", skip: "Skip", retry: "Retry", allow: "Allow", deny: "Deny", stop: "Stop" },
  phase: {
    reading_case_facts: "Reading the case's facts",
    matching_reason_codes: "Matching the reason codes",
    composing_request: "Composing the request",
    sending_request: "Sending the request",
    opening_linked_case: "Opening the linked case",
    copying_facts: "Copying the facts",
    filling_template: "Filling in the template",
    citing_grounds: "Citing the grounds",
    checking_grounds: "Checking the grounds",
    checking_deadlines: "Checking the deadlines",
    assembling_package: "Assembling the package",
    assigning_reviewer: "Assigning a reviewer",
  },
  skipReason: {
    skipped_by_user: "you skipped it",
    skipped_after_error: "skipped after an error",
    stopped_by_user: "the run was stopped",
  },
  stepStatus: {
    waiting: "Waiting",
    running: "Running",
    done: "Done",
    awaiting: "Awaiting decision",
    skipped: "Skipped",
    undone: "Undone",
    error: "Error",
  },
  objectKind: { classification: "Classification", fact_request: "Fact request", linked_facts: "Linked facts", reply_draft: "Reply draft", case: "Case" },
  classificationStatus: { unconfirmed: "not confirmed", confirmed: "confirmed" },
  requestStatus: { not_sent: "not sent", sent: "sent" },
  linkStatus: { not_linked: "not used", linked: "used for this case" },
  draftStatus: { none: "none", drafted: "drafted", checked: "checked" },
  regime: { complaint: "a complaint under the sector's law", ombudsman_claim: "a money claim under 123-FZ" },
  team: { antifraud: "the antifraud team", aml: "the AML compliance team", operations: "operations" },
  question: {
    sign_detected: "Which sign was detected, and on what data?",
    client_confirmation: "Did the client confirm the order, and when?",
    database_match: "Is the recipient in the Bank of Russia's database?",
    decision_basis: "Which category was the decision taken under, and on what day?",
    documents_received: "Which documents has the client submitted?",
    measure_status: "Is the measure still in force?",
    operation_record: "What does the operation's record show, and what is its status?",
    contract_terms: "Which terms of the contract applied?",
    charges: "Which fees or sums were charged?",
  },
  draftKind: { change: "Change", request: "Request", reply: "Reply draft" },
  serviceName: { fact_requests: "The fact request service" },
  streamError: {
    missing_plan: "The run request carried no plan.",
    invalid_plan: "The plan in the run request could not be read.",
    invalid_decisions: "The decisions in the run request could not be read.",
    empty_plan: "The plan has no steps.",
    too_many_steps: "The plan has more steps than the scenario.",
    unknown_step: "The plan names a step the scenario does not have.",
    method_not_allowed: "The run service answers only requests to read.",
    unsupported_version: "The run service speaks another version of the protocol.",
    invalid_case: "The case in the run request could not be read.",
    stream_lost: "The connection to the run service was lost.",
  },
  taskName: { answer_complaint: (caseId) => `Prepare the reply in case ${caseId}` },
  stepTitle: {
    classify: "Classify the complaint",
    request_facts: (team) => `Request the facts from ${team}`,
    reuse_facts: (linked) => `Use the facts of linked case ${linked}`,
    draft_reply: "Draft the reply",
    check_draft: "Check the draft against the rubric",
    hand_to_review: "Hand the draft to legal review",
  },
  draft: {
    classify: (stream, reason, regime) => [
      `Stream: ${stream}.`,
      reason ? `Reason: ${reason}.` : "No reason code.",
      `Regime: ${regime}.`,
      "Nothing leaves the complaints team.",
    ],
    request_facts: (caseId, team, operation, questions, due) => [
      `To ${team}, on case ${caseId}.`,
      ...(operation ? [`Operation: ${operation}.`] : []),
      ...questions,
      `Answer by ${due}.`,
    ],
    reuse_linked_facts: (linked, sendsRequest) => [
      `Use the facts already on file in case ${linked}.`,
      sendsRequest ? "A request is sent." : "No request is sent.",
    ],
    reply: [
      "The agent writes this reply from the case's facts and its templates, citing the law from ariadne-rules.",
      "Nothing is sent: the draft goes to legal review, and a signatory sends the reply.",
    ],
    check_draft: [
      "Check the draft with the rubric of ariadne-rules: grounds, the client's options and deadlines, sentence length.",
      "Its findings are shown to you; the draft is not changed.",
    ],
    hand_to_review: (caseId, stage, due, sends) => [
      `Move case ${caseId} from "${stage}" to legal review.`,
      `The reply is due by ${due}.`,
      sends ? "The reply is sent." : "The assistant does not send the reply: a signatory does, after the review.",
    ],
  },
  object: {
    classification: (c, before, after) => `Classification of case ${c}: ${before} → ${after}`,
    fact_request: (team, before, after) => `Request to ${team}: ${before} → ${after}`,
    linked_facts: (linked, before, after) => `Facts of case ${linked}: ${before} → ${after}`,
    reply_draft: (before, after) => `Reply draft: ${before} → ${after}`,
    case: (c, before, after) => `Case ${c}: ${before} → ${after}`,
  },
  summaryText: {
    case_classified: (c, stream, reason) => `Case ${c} classified: ${stream}${reason ? `, ${reason}` : ""}.`,
    facts_requested: (team, due) => `Facts requested from ${team}, due ${due}.`,
    linked_facts_reused: (linked) => `Facts of case ${linked} used; no request sent.`,
    reply_drafted: (c) => `Reply in case ${c} drafted.`,
    draft_checked: "Draft checked against the rubric.",
    handed_to_review: (c, due) => `Case ${c} handed to legal review; the reply is due by ${due}.`,
  },
  undoText: {
    unconfirm_classification: (c) => `The classification of case ${c} is unconfirmed again.`,
    recall_fact_request: (team) => `The request to ${team} was recalled.`,
    unlink_facts: (linked) => `The facts of case ${linked} are no longer used.`,
    discard_draft: "The draft of the reply was discarded.",
    clear_check: "The rubric check was cleared.",
    return_to_drafting: (c, stage) => `Case ${c} is back at "${stage}".`,
  },
  errorText: { service_timeout: (service, seconds) => `${service} did not answer within ${seconds} s.` },
  deviationReason: {
    facts_in_linked_case: (linked) => `Linked case ${linked} already holds the facts this request asks for.`,
  },
  deviationProposal: { reuse_linked_facts: "Use those facts instead of sending a new request to another team." },
  conflict: {
    draft_before_facts: (a, b) => `Step ${a} drafts the reply before step ${b} asks for the facts.`,
    check_before_draft: (a, b) => `Step ${a} checks a draft that step ${b} has not written yet.`,
    review_before_draft: (a, b) => `Step ${a} hands over a draft that step ${b} has not written yet.`,
  },
  rubric: {
    title: "Rubric findings",
    clean: "The rubric found nothing to flag. That is not a verdict: a person decides.",
    count: (n) => `${n.text} ${n.n === 1 ? "finding" : "findings"} for a person to weigh.`,
    finding: {
      ground_missing: () => "No legal ground is named.",
      ground_without_article: () => "A law is named without its article.",
      grounds_mixed: () => "161-FZ and 115-FZ grounds are mixed.",
      stream_ground_missing: () => "The law of the case's stream is not named.",
      next_steps_missing: () => "No next step is stated.",
      client_option_missing: (subject) => `An option the law gives the client is not offered: ${subject}.`,
      deadline_missing: (subject) => `A running deadline is not stated: ${subject}.`,
      deadline_mismatch: (subject) => `A deadline is stated with another date: ${subject}.`,
      measure_missing: (subject) => `A restriction that applies is not stated: ${subject}.`,
      measure_not_taken: (subject) => `A restriction is stated that does not apply: ${subject}.`,
      text_empty: () => "The reply has no text.",
      sentence_too_long: (_subject, words) => `A sentence of ${words} words.`,
      sentences_long_on_average: (_subject, words) => `Sentences of ${words} words on average.`,
    },
    option: {
      confirm_order: "confirming the order",
      repeat_operation: "repeating the operation",
      submit_documents: "submitting documents",
      apply_to_commission: "applying to the interagency commission",
      apply_to_ombudsman: "applying to the financial ombudsman",
      apply_for_removal: "applying to the Bank of Russia to remove the client's data from its database",
    },
    measure: {
      suspend_instrument: "the suspension of the card and online banking",
      cap_transfers: "the cap on transfers to individuals instead of the suspension",
      cap_atm_cash: "the cap on cash at ATMs",
    },
    deadline: {
      antifraud_suspension_ends: "the end of the suspension",
      antifraud_confirmation: "the last day to confirm the order",
      antifraud_repeat_suspension_ends: "the end of the second suspension",
      antifraud_after_repeat_suspension: "the day the order is carried out",
      antifraud_repeat_refusal_ends: "the end of the two days after the refused repeat",
      antifraud_after_repeat_refusal: "the day a next repeat goes through",
      exclusion_decision: "the decision on the exclusion request",
      antifraud_refund: "the refund",
      aml_documents_answer: "the answer on the documents",
      aml_commission_decision: "the commission's decision",
      high_risk_commission_application: "the last day to apply to the commission",
      high_risk_rating_review: "the Bank of Russia's answer on the risk rating",
    },
    draftShown: "The draft",
    noDraft: "There was no draft to check: the drafting step has not written one.",
  },
  reply: {
    greeting: "Dear client,",
    reviewed: (received, caseId) => `We have reviewed your complaint of ${received}, case ${caseId}.`,
    operation: (operation, reference, day, amount) => `It concerns this operation: ${operation}, reference ${reference}, of ${day}, for ${amount}.`,
    claim: (amount) => `You claim ${amount}.`,
    outcome: {
      pending: "[The decision on the complaint: for the reviewer to state.]",
      upheld: "We find your complaint justified.",
      partly_upheld: "We find your complaint partly justified.",
      refused: "We find no grounds to uphold your complaint.",
    },
    suspended: (sign) => `We suspended the transfer: it matched sign ${sign} of Bank of Russia Order OD-2506.`,
    refused: (sign) => `We refused the operation: it matched sign ${sign} of Bank of Russia Order OD-2506.`,
    aml: {
      aml_operation_refused: "We refused to carry out the operation under the anti-money-laundering law.",
      aml_account_refused: "We refused to open the account under the anti-money-laundering law.",
      aml_account_terminated: "We terminated the account contract under the anti-money-laundering law.",
      aml_operation_suspended: "We suspended the operation under the anti-money-laundering law.",
      aml_operation_suspended_by_decision: "We suspended the operation by a decision under the anti-money-laundering law.",
      aml_funds_frozen: "We froze the funds under the anti-money-laundering law.",
      aml_high_risk_measures: "We applied the measures for a high-risk client under the anti-money-laundering law.",
    },
    measure: {
      suspend_instrument: "We suspended your card and online banking while your data are in the Bank of Russia's database.",
      cap_transfers:
        "We did not suspend your card or online banking. Your transfers to individuals are limited to RUB 100,000 a month while your data are in the Bank of Russia's database.",
      cap_atm_cash: "Cash withdrawals at ATMs are limited to RUB 100,000 a month while your data are there, under the Banking Law, art. 30, part 16.",
    },
    ground: (citation) => `The ground is ${citation}.`,
    contract: "Our position rests on the terms of your contract with the bank.",
    option: {
      confirm_order: "You can confirm the transfer order, and we will carry it out.",
      repeat_operation: "You can repeat the operation.",
      submit_documents: "You can send us documents that explain the operation.",
      apply_to_commission: "After our answer on the documents, you can apply to the interagency commission at the Bank of Russia.",
      apply_to_ombudsman: "If you disagree, you can apply to the financial ombudsman.",
      apply_for_removal: "You can apply to remove your data from the Bank of Russia's database through us or its internet reception at cbr.ru/contactBR/161-FZ.",
    },
    deadline: {
      antifraud_suspension_ends: (d) => `The suspension ends on ${d}.`,
      antifraud_confirmation: (d) => `Please confirm the order by ${d}.`,
      antifraud_repeat_suspension_ends: (d) => `The second suspension ends on ${d}.`,
      antifraud_after_repeat_suspension: (d) => `After it, the order is carried out on ${d}.`,
      antifraud_repeat_refusal_ends: (d) => `The repeated operation was refused; the two days after it end on ${d}.`,
      antifraud_after_repeat_refusal: (d) => `From ${d}, the bank carries out your next repeat of the operation.`,
      exclusion_decision: (d) => `The decision on your exclusion request is due by ${d}.`,
      antifraud_refund: (d) => `The money is to be returned by ${d}.`,
      aml_documents_answer: (d) => `We will answer on your documents by ${d}.`,
      aml_commission_decision: (d) => `The commission decides by ${d}.`,
      high_risk_commission_application: (d) => `You can apply to the commission until ${d}.`,
      high_risk_rating_review: (d) => `The Bank of Russia answers on your risk rating by ${d}.`,
    },
    next: {
      contact_bank: "If you have questions, reply to this letter or call us.",
      apply_to_bank_of_russia: "You can also apply to the Bank of Russia.",
    },
  },
};

// A Russian date ends in "г.", which ends the sentence too: a sentence
// that ends with a date takes no full stop of its own.
const ruStrings: Strings = {
  title: "Ассистент",
  subtitle: "Предлагает он, решаете вы, и его можно остановить на любом шаге",
  shortcutsButton: "Клавиши",
  shortcuts: {
    title: "Сочетания клавиш",
    run: "Запуск",
    general: "Общие",
    start: "Запустить план",
    stop: "Остановить запуск",
    pauseResume: "Пауза или продолжение",
    help: "Показать сочетания клавиш",
    other: "Прочие",
  },
  service: {
    starting: "Запуск службы выполнения",
    startingText: "Запуск идёт из сервис-воркера в этом браузере. Он запускается.",
    failedTitle: "Служба выполнения не запустилась",
    errors: {
      sw_unsupported: "Этот браузер не может запускать сервис-воркеры на этой странице. Их отключают приватное окно или настройки конфиденциальности.",
      sw_registration_failed: "Не удалось зарегистрировать сервис-воркер.",
      sw_not_controlling: "Сервис-воркер запустился, но не взял страницу под управление.",
    },
    retry: "Попробовать снова",
    usePage: "Выполнять в этой вкладке",
    pageNote: "Запуск идёт внутри этой вкладки, без сервис-воркера.",
    updated: "Служба выполнения обновилась. Запуск продолжается с того же места.",
  },
  task: {
    panel: "Задача",
    task: "Задача",
    scenario: "Номер сценария",
    scenarioHelp: "Один и тот же номер каждый раз даёт один и тот же запуск по этому делу. Он задаёт уверенность агента и длительность шагов; при нечётном номере запрос фактов один раз не дождётся ответа.",
    autonomy: "Самостоятельность",
    scripted: "Агент — это сценарий: одно и то же дело, номер сценария и решения всегда дают один и тот же запуск. Он показывает управление; его ответы — шаблоны по фактам дела, а не ответы модели.",
    untrusted: "Ассистент получает из реестра коды, даты и суммы дела, но не текст обращения: ничто из написанного заявителем не может им управлять.",
    pastDrafting: (stage) => `Дело на этапе «${stage}»: ответ уже прошёл подготовку, и ассистенту нечего готовить. Он готовит ответы по делам до юридической проверки.`,
  },
  plan: {
    panel: "План",
    list: "Шаги плана",
    summary: (steps, asks) => `Шагов: ${steps}. Спросят перед выполнением: ${asks}.`,
    askFirst: "Спросить заранее",
    askFirstHelp: "Ждать вашего подтверждения перед этим шагом.",
    alwaysAsks: "Шаги с высоким риском спрашивают всегда",
    ignoredAtLevel: "На этом уровне самостоятельности не учитывается",
    confidence: (value) => `Уверенность ${value}`,
    conflictTitle: "Шаги противоречат друг другу",
    run: "Запустить план",
    restore: "Восстановить план",
    emptyTitle: "План пуст",
    emptyText: "Все шаги удалены. Восстановите план, чтобы его запустить.",
  },
  run: {
    panel: "Запуск",
    controls: "Управление запуском",
    list: "Шаги запуска",
    stop: "Стоп",
    pause: "Пауза",
    resume: "Продолжить",
    newPlan: "Новый план",
    progress: (done, total) => `Обработано ${done} из ${total}`,
    status: {
      idle: "Не запущен",
      connecting: "Подключение",
      streaming: "Выполняется",
      paused: "Пауза",
      waiting: "Ждёт вас",
      reconnecting: "Переподключение",
      failed: "Нет соединения",
      ended: "Завершён",
    },
    stoppingTitle: "Остановка",
    stoppingText: "Текущий шаг доводится до конца, новые не начинаются: оборвать действие на середине хуже, чем закончить его.",
    pausedText: "Пауза между двумя событиями. Пока вы не продолжите, ничего не выполняется и не отправляется.",
    reconnectingText: (event) => `Соединение прервалось. Продолжение после события ${event}.`,
    failedTitle: "Запуск перестал получать события",
    retry: "Переподключиться",
    waitingTitle: "Нужно ваше решение",
  },
  step: {
    awaiting: "Ждёт вашего подтверждения.",
    deviationAwaiting: "Агент просит изменить этот шаг.",
    phaseStart: "Начало",
    attempt: (n) => `попытка ${n}`,
    undo: "Отменить",
    undoWindow: (n) => `Окно отмены шага ${n}`,
    undoLeft: (left, total) => `осталось ${left} из ${total}`,
    undoPermanent: "Внутреннее изменение: его можно отменить в любое время.",
    irreversible: (time) => `Окончательно с ${time}: окно отмены закрылось.`,
    undoneAt: (time, text) => `Отменено в ${time}. ${text}`,
    retry: "Повторить",
    skip: "Пропустить шаг",
    stopRun: "Остановить запуск",
    errorTitle: (attempt) => `Ошибка на попытке ${attempt}`,
    nothingChanged: "Ничего не отправлено и не изменено.",
    willAsk: "Спросит заранее",
  },
  confirm: {
    title: (n, title) => `Шаг ${n}: ${title}`,
    intro: "Пока ничего не отправлено и не изменено.",
    changes: "Что изменится",
    stopHint: "Чтобы вместо этого остановить весь запуск, нажмите",
    escapeSkips: "пропускает этот шаг, как кнопка «Пропустить шаг».",
    skip: "Пропустить шаг",
    confirm: { change: "Применить изменение", request: "Отправить запрос", reply: "Подготовить проект" },
  },
  deviation: {
    title: (n) => `Шаг ${n}: агент просит изменить план`,
    instead: (title, risk) => `Вместо этого: ${title} (${risk}).`,
    allow: "Разрешить изменение",
    deny: "Оставить план",
    escapeKeeps: "оставляет план как есть, как кнопка «Оставить план».",
  },
  newPlanAsk: {
    title: "Начать новый план?",
    open: (steps) => `Отменить ещё можно ${steps.text} ${ru(steps.n, "шаг", "шага", "шагов")} этого запуска.`,
    ends: "Новый план закроет эти окна отмены; сделанное останется сделанным.",
    keep: "Оставить этот запуск",
    confirm: "Начать новый план",
  },
  toast: {
    undoable: (summary, time) => `${summary} Отменить можно до ${time}.`,
    undone: (text) => `Отменено. ${text}`,
    reconnected: "Соединение восстановлено. События не потеряны.",
  },
  log: {
    panel: "Журнал событий",
    label: "События и решения",
    emptyTitle: "Событий пока нет",
    emptyText: "События и ваши решения появятся здесь, когда план запустится.",
    agent: "агент",
    you: "вы",
    approved: (steps, autonomy, asks) => `План утверждён: шагов ${steps}, «${autonomy}», спросят заранее: ${asks}.`,
    planStarted: (steps) => `Запуск начат: шагов ${steps}.`,
    stepStarted: (n, title) => `Шаг ${n} начат: ${title}.`,
    deviation: (n) => `Шаг ${n}: агент просит изменить план.`,
    deviated: (n, title) => `Шаг ${n} изменён: ${title}.`,
    awaiting: (n) => `Шаг ${n} ждёт подтверждения.`,
    running: (n, attempt) => (attempt.n > 1 ? `Шаг ${n} выполняется, попытка ${attempt.text}.` : `Шаг ${n} выполняется.`),
    finished: (n, summary) => `Шаг ${n} готов. ${summary}`,
    skipped: (n, reason) => `Шаг ${n} пропущен: ${reason}.`,
    failed: (n, error) => `Шаг ${n}: ошибка. ${error}`,
    planFinished: "Запуск завершён.",
    planStopped: (n) => (n ? `Запуск остановлен после шага ${n}.` : "Запуск остановлен до завершения первого шага."),
    decision: {
      confirm: (n) => `Вы подтвердили шаг ${n}.`,
      skip: (n) => `Вы пропустили шаг ${n}.`,
      retry: (n) => `Вы попросили повторить шаг ${n}.`,
      allow: (n) => `Вы разрешили изменить шаг ${n}.`,
      deny: (n) => `Вы оставили шаг ${n} по плану.`,
    },
    stopRequested: "Вы попросили остановить запуск.",
    undo: (n, text) => `Вы отменили шаг ${n}. ${text}`,
  },
  summary: {
    panel: "Итог",
    label: "Итог запуска",
    finished: "Запуск завершён.",
    stopped: (n) => (n ? `Запуск остановлен после шага ${n}.` : "Запуск остановлен до завершения первого шага."),
    done: "Выполнено",
    skipped: "Пропущено",
    notRun: "Не запускалось",
    undone: "Отменено",
    asked: "Спросили вас",
    errors: "Ошибок",
    duration: "Длительность",
    seconds: "с",
    events: "Событий",
    basisRun: "от первого события до последнего",
  },
  announce: {
    started: "Запуск начат.",
    stopping: "Остановка после текущего шага.",
    stopped: "Запуск остановлен.",
    finished: (done, total) => `Запуск завершён: выполнено ${done} из ${total}.`,
    paused: "Пауза.",
    resumed: "Продолжено.",
    waiting: (n) => `Шаг ${n} ждёт вашего решения.`,
    failed: (n) => `Шаг ${n}: ошибка.`,
    reconnecting: "Соединение прервалось, переподключение.",
    streamFailed: "Запуск перестал получать события.",
  },
  actionType: {
    classify: "Классификация",
    request_facts: "Запрос фактов",
    reuse_facts: "Факты из связанного дела",
    draft_reply: "Проект ответа",
    check_draft: "Проверка по критериям",
    hand_to_review: "Передача на проверку",
  },
  risk: { low: "низкий риск", medium: "средний риск", high: "высокий риск" },
  autonomy: { ask_all: "Спрашивать всегда", high_only: "Спрашивать по отметке", ask_none: "Спрашивать только обязательное" },
  autonomyHelp: {
    ask_all: "Каждый шаг ждёт вашего подтверждения.",
    high_only: "Шаги с отметкой «Спросить заранее» ждут вас; шаги с высоким риском ждут всегда.",
    ask_none: "Ждут вас только шаги с высоким риском; отметки не учитываются.",
  },
  command: { confirm: "Подтвердить", skip: "Пропустить", retry: "Повторить", allow: "Разрешить", deny: "Отказать", stop: "Остановить" },
  phase: {
    reading_case_facts: "Чтение фактов дела",
    matching_reason_codes: "Сверка кодов причин",
    composing_request: "Составление запроса",
    sending_request: "Отправка запроса",
    opening_linked_case: "Открытие связанного дела",
    copying_facts: "Перенос фактов",
    filling_template: "Заполнение шаблона",
    citing_grounds: "Ссылки на основания",
    checking_grounds: "Проверка оснований",
    checking_deadlines: "Проверка сроков",
    assembling_package: "Сборка пакета",
    assigning_reviewer: "Назначение проверяющего",
  },
  skipReason: {
    skipped_by_user: "вы его пропустили",
    skipped_after_error: "пропущен после ошибки",
    stopped_by_user: "запуск остановлен",
  },
  stepStatus: {
    waiting: "Ожидает",
    running: "Выполняется",
    done: "Готово",
    awaiting: "Ждёт решения",
    skipped: "Пропущено",
    undone: "Отменено",
    error: "Ошибка",
  },
  objectKind: { classification: "Классификация", fact_request: "Запрос фактов", linked_facts: "Факты связанного дела", reply_draft: "Проект ответа", case: "Дело" },
  classificationStatus: { unconfirmed: "не подтверждена", confirmed: "подтверждена" },
  requestStatus: { not_sent: "не отправлен", sent: "отправлен" },
  linkStatus: { not_linked: "не использованы", linked: "использованы в этом деле" },
  draftStatus: { none: "нет", drafted: "подготовлен", checked: "проверен" },
  regime: { complaint: "жалоба по отраслевому закону", ombudsman_claim: "имущественное требование по 123-ФЗ" },
  team: { antifraud: "Антифрод", aml: "ПОД/ФТ", operations: "Операционный отдел" },
  question: {
    sign_detected: "Какой признак выявлен и по каким данным?",
    client_confirmation: "Подтверждал ли клиент распоряжение и когда?",
    database_match: "Есть ли получатель в базе данных Банка России?",
    decision_basis: "По какой категории и в какой день принято решение?",
    documents_received: "Какие документы представил клиент?",
    measure_status: "Действует ли мера сейчас?",
    operation_record: "Что показывает запись об операции и каков её статус?",
    contract_terms: "Какие условия договора применены?",
    charges: "Какие комиссии или суммы списаны?",
  },
  draftKind: { change: "Изменение", request: "Запрос", reply: "Проект ответа" },
  serviceName: { fact_requests: "Сервис запросов фактов" },
  streamError: {
    missing_plan: "В запросе на запуск нет плана.",
    invalid_plan: "План в запросе на запуск не удалось прочитать.",
    invalid_decisions: "Решения в запросе на запуск не удалось прочитать.",
    empty_plan: "В плане нет шагов.",
    too_many_steps: "В плане больше шагов, чем в сценарии.",
    unknown_step: "В плане есть шаг, которого нет в сценарии.",
    method_not_allowed: "Служба выполнения отвечает только на запросы чтения.",
    unsupported_version: "Служба выполнения работает с другой версией протокола.",
    invalid_case: "Дело в запросе на запуск не удалось прочитать.",
    stream_lost: "Соединение со службой выполнения потеряно.",
  },
  taskName: { answer_complaint: (caseId) => `Подготовить ответ по делу ${caseId}` },
  stepTitle: {
    classify: "Классифицировать обращение",
    request_facts: (team) => `Запросить факты: ${team}`,
    reuse_facts: (linked) => `Взять факты из связанного дела ${linked}`,
    draft_reply: "Подготовить проект ответа",
    check_draft: "Проверить проект по критериям",
    hand_to_review: "Передать проект на юридическую проверку",
  },
  draft: {
    classify: (stream, reason, regime) => [
      `Поток: ${stream}.`,
      reason ? `Причина: ${reason}.` : "Кода причины нет.",
      `Режим: ${regime}.`,
      "Ничего не уходит из отдела обращений.",
    ],
    request_facts: (caseId, team, operation, questions, due) => [
      `Кому: ${team}, по делу ${caseId}.`,
      ...(operation ? [`Операция: ${operation}`] : []),
      ...questions,
      `Ответить до ${due}`,
    ],
    reuse_linked_facts: (linked, sendsRequest) => [
      `Взять факты, которые уже есть в деле ${linked}.`,
      sendsRequest ? "Запрос отправляется." : "Запрос не отправляется.",
    ],
    reply: [
      "Агент пишет этот ответ по фактам дела и своим шаблонам, со ссылками на закон из ariadne-rules.",
      "Ничего не отправляется: проект уходит на юридическую проверку, а ответ отправляет подписант.",
    ],
    check_draft: [
      "Проверить проект по критериям ariadne-rules: основания, возможности и сроки клиента, длина предложений.",
      "Замечания показываются вам; проект не меняется.",
    ],
    hand_to_review: (caseId, stage, due, sends) => [
      `Перевести дело ${caseId} с этапа «${stage}» на юридическую проверку.`,
      `Срок ответа: ${due}`,
      sends ? "Ответ отправляется." : "Ассистент не отправляет ответ: это делает подписант после проверки.",
    ],
  },
  object: {
    classification: (c, before, after) => `Классификация дела ${c}: ${before} → ${after}`,
    fact_request: (team, before, after) => `Запрос (${team}): ${before} → ${after}`,
    linked_facts: (linked, before, after) => `Факты дела ${linked}: ${before} → ${after}`,
    reply_draft: (before, after) => `Проект ответа: ${before} → ${after}`,
    case: (c, before, after) => `Дело ${c}: ${before} → ${after}`,
  },
  summaryText: {
    case_classified: (c, stream, reason) => `Дело ${c} классифицировано: ${stream}${reason ? `, ${reason}` : ""}.`,
    facts_requested: (team, due) => `Факты запрошены (${team}), срок ${due}`,
    linked_facts_reused: (linked) => `Использованы факты дела ${linked}; запрос не отправлялся.`,
    reply_drafted: (c) => `Проект ответа по делу ${c} подготовлен.`,
    draft_checked: "Проект проверен по критериям.",
    handed_to_review: (c, due) => `Дело ${c} передано на юридическую проверку; срок ответа ${due}`,
  },
  undoText: {
    unconfirm_classification: (c) => `Классификация дела ${c} снова не подтверждена.`,
    recall_fact_request: (team) => `Запрос (${team}) отозван.`,
    unlink_facts: (linked) => `Факты дела ${linked} больше не используются.`,
    discard_draft: "Проект ответа удалён.",
    clear_check: "Проверка по критериям снята.",
    return_to_drafting: (c, stage) => `Дело ${c} вернулось на этап «${stage}».`,
  },
  errorText: { service_timeout: (service, seconds) => `${service} не ответил за ${seconds} с.` },
  deviationReason: {
    facts_in_linked_case: (linked) => `В связанном деле ${linked} уже есть факты, о которых спрашивает этот запрос.`,
  },
  deviationProposal: { reuse_linked_facts: "Взять эти факты вместо нового запроса в другое подразделение." },
  conflict: {
    draft_before_facts: (a, b) => `Шаг ${a} готовит ответ раньше, чем шаг ${b} запрашивает факты.`,
    check_before_draft: (a, b) => `Шаг ${a} проверяет проект, который шаг ${b} ещё не подготовил.`,
    review_before_draft: (a, b) => `Шаг ${a} передаёт проект, который шаг ${b} ещё не подготовил.`,
  },
  rubric: {
    title: "Замечания по критериям",
    clean: "Замечаний по критериям нет. Это не вывод: решает человек.",
    count: (n) => `${n.text} ${ru(n.n, "замечание", "замечания", "замечаний")} для оценки человеком.`,
    finding: {
      ground_missing: () => "Не названо правовое основание.",
      ground_without_article: () => "Закон назван без статьи.",
      grounds_mixed: () => "Смешаны основания 161-ФЗ и 115-ФЗ.",
      stream_ground_missing: () => "Не назван закон потока этого дела.",
      next_steps_missing: () => "Не указаны дальнейшие действия.",
      client_option_missing: (subject) => `Не предложена возможность, которую закон даёт клиенту: ${subject}.`,
      deadline_missing: (subject) => `Не указан текущий срок: ${subject}.`,
      deadline_mismatch: (subject) => `Срок указан с другой датой: ${subject}.`,
      measure_missing: (subject) => `Не указано ограничение, которое действует: ${subject}.`,
      measure_not_taken: (subject) => `Указано ограничение, которое не действует: ${subject}.`,
      text_empty: () => "В ответе нет текста.",
      sentence_too_long: (_subject, words) => `Предложение из ${words} слов.`,
      sentences_long_on_average: (_subject, words) => `В среднем ${words} слов в предложении.`,
    },
    option: {
      confirm_order: "подтвердить распоряжение",
      repeat_operation: "повторить операцию",
      submit_documents: "представить документы",
      apply_to_commission: "обратиться в межведомственную комиссию",
      apply_to_ombudsman: "обратиться к финансовому уполномоченному",
      apply_for_removal: "подать в Банк России заявление об исключении сведений о клиенте из его базы данных",
    },
    measure: {
      suspend_instrument: "приостановление карты и онлайн-банка",
      cap_transfers: "ограничение переводов физическим лицам вместо приостановления",
      cap_atm_cash: "ограничение выдачи наличных в банкоматах",
    },
    deadline: {
      antifraud_suspension_ends: "окончание приостановления",
      antifraud_confirmation: "последний день подтверждения распоряжения",
      antifraud_repeat_suspension_ends: "окончание повторного приостановления",
      antifraud_after_repeat_suspension: "день исполнения распоряжения",
      antifraud_repeat_refusal_ends: "окончание двух дней после отказа в повторной операции",
      antifraud_after_repeat_refusal: "день, с которого проходит следующая повторная операция",
      exclusion_decision: "решение по запросу об исключении",
      antifraud_refund: "возврат средств",
      aml_documents_answer: "ответ по документам",
      aml_commission_decision: "решение комиссии",
      high_risk_commission_application: "последний день обращения в комиссию",
      high_risk_rating_review: "ответ Банка России об уровне риска",
    },
    draftShown: "Проект",
    noDraft: "Проверять было нечего: шаг подготовки проекта его не написал.",
  },
  reply: {
    greeting: "Уважаемый клиент!",
    reviewed: (received, caseId) => `Мы рассмотрели вашу жалобу от ${received}, дело ${caseId}.`,
    operation: (operation, reference, day, amount) => `Жалоба касается операции «${operation}» № ${reference} от ${day} на сумму ${amount}.`,
    claim: (amount) => `Вы требуете ${amount}.`,
    outcome: {
      pending: "[Решение по жалобе: указывает проверяющий.]",
      upheld: "Мы признаём вашу жалобу обоснованной.",
      partly_upheld: "Мы признаём вашу жалобу обоснованной частично.",
      refused: "Оснований для удовлетворения жалобы мы не нашли.",
    },
    suspended: (sign) => `Мы приостановили перевод: он соответствовал признаку ${sign} приказа Банка России № ОД-2506.`,
    refused: (sign) => `Мы отказали в операции: она соответствовала признаку ${sign} приказа Банка России № ОД-2506.`,
    aml: {
      aml_operation_refused: "Мы отказали в проведении операции по закону о противодействии отмыванию доходов.",
      aml_account_refused: "Мы отказали в открытии счёта по закону о противодействии отмыванию доходов.",
      aml_account_terminated: "Мы расторгли договор счёта по закону о противодействии отмыванию доходов.",
      aml_operation_suspended: "Мы приостановили операцию по закону о противодействии отмыванию доходов.",
      aml_operation_suspended_by_decision: "Мы приостановили операцию по решению на основании закона о противодействии отмыванию доходов.",
      aml_funds_frozen: "Мы заморозили средства по закону о противодействии отмыванию доходов.",
      aml_high_risk_measures: "Мы применили меры для клиента с высоким уровнем риска по закону о противодействии отмыванию доходов.",
    },
    measure: {
      suspend_instrument: "Мы приостановили использование вашей карты и онлайн-банка, пока сведения о вас есть в базе данных Банка России.",
      cap_transfers:
        "Мы не приостанавливали вашу карту и онлайн-банк. Пока сведения о вас есть в базе данных Банка России, переводы физическим лицам ограничены суммой 100 000 ₽ в месяц.",
      cap_atm_cash: "На то же время выдача наличных в банкоматах ограничена суммой 100 000 ₽ в месяц по ч. 16 ст. 30 Закона о банках.",
    },
    ground: (citation) => `Основание: ${citation}.`,
    contract: "Наша позиция основана на условиях вашего договора с банком.",
    option: {
      confirm_order: "Вы можете подтвердить распоряжение о переводе, и мы его исполним.",
      repeat_operation: "Вы можете повторить операцию.",
      submit_documents: "Вы можете представить нам документы, поясняющие операцию.",
      apply_to_commission: "После нашего ответа по документам вы можете обратиться в межведомственную комиссию при Банке России.",
      apply_to_ombudsman: "Если вы не согласны, вы можете обратиться к финансовому уполномоченному.",
      apply_for_removal: "Вы можете подать заявление об исключении сведений о вас из базы данных Банка России через наш банк или интернет-приёмную cbr.ru/contactBR/161-FZ.",
    },
    deadline: {
      antifraud_suspension_ends: (d) => `Приостановление заканчивается ${d}`,
      antifraud_confirmation: (d) => `Подтвердите распоряжение не позднее ${d}`,
      antifraud_repeat_suspension_ends: (d) => `Повторное приостановление заканчивается ${d}`,
      antifraud_after_repeat_suspension: (d) => `После него распоряжение исполняется ${d}`,
      antifraud_repeat_refusal_ends: (d) => `В повторной операции отказано; два дня после неё заканчиваются ${d}`,
      antifraud_after_repeat_refusal: (d) => `С ${d} банк проведёт вашу следующую повторную операцию`,
      exclusion_decision: (d) => `Решение по вашему запросу об исключении будет принято не позднее ${d}`,
      antifraud_refund: (d) => `Средства должны быть возвращены не позднее ${d}`,
      aml_documents_answer: (d) => `Мы ответим по вашим документам не позднее ${d}`,
      aml_commission_decision: (d) => `Комиссия примет решение не позднее ${d}`,
      high_risk_commission_application: (d) => `Обратиться в комиссию можно до ${d}`,
      high_risk_rating_review: (d) => `Банк России ответит об уровне риска не позднее ${d}`,
    },
    next: {
      contact_bank: "Если у вас есть вопросы, ответьте на это письмо или позвоните нам.",
      apply_to_bank_of_russia: "Вы также можете обратиться в Банк России.",
    },
  },
};

export const strings: Record<Lang, Strings> = { en, ru: ruStrings };
