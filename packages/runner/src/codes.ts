/*
  Every code the engine emits, in one place.

  The engine carries no human language. Anything an application shows to a
  person is rendered by the application from a code in one of the lists below
  and from numeric or date parameters next to it. The lists are the closed
  vocabulary: a string with a letter in it that appears in an emitted event,
  a plan step or an exported log is either one of these codes or a step id
  (`s1` .. `s5`). The vocabulary test in test/vocabulary.test.ts checks that.

  Dates are ISO 8601 calendar dates (`2026-09-30`) and contain no letters.
*/

/* The version of the wire protocol: the plan payload carries it as `v`,
   and plan.started repeats it. A version names the closed lists a brief,
   an event and a log may draw from: a code added to one of them is a new
   version, since a reader of the old one refuses it. Version 1 was the
   procurement scenario of twelve supplier requests; version 2 the
   complaint before the grounds of 161-FZ art. 9 parts 11.6 and 11.7;
   version 3 the complaint before the client's option to apply for the
   removal of the client's data from the Bank of Russia's database (161-FZ
   art. 9 part 11.8); version 4 the brief and the draft before the
   restrictions they state for those data (MEASURE_CODES). None is
   served. */
export const PROTOCOL_VERSION = 5;

/* What a step does for the complaint */
export const ACTION_TYPES = [
  "classify",
  "request_facts",
  "reuse_facts",
  "draft_reply",
  "check_draft",
  "hand_to_review",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const RISKS = ["low", "medium", "high"] as const;
export type Risk = (typeof RISKS)[number];

/* How much the user lets the agent do without asking */
export const AUTONOMIES = ["ask_all", "high_only", "ask_none"] as const;
export type Autonomy = (typeof AUTONOMIES)[number];

/* User decisions the run accepts */
export const COMMANDS = ["confirm", "skip", "retry", "allow", "deny", "stop"] as const;
export type Command = (typeof COMMANDS)[number];

/* Events of a run, in the order they can first appear */
export const RUN_EVENT_TYPES = [
  "plan.started",
  "step.started",
  "step.deviation",
  "step.deviated",
  "step.awaiting",
  "step.running",
  "step.progress",
  "step.finished",
  "step.skipped",
  "step.error",
  "plan.finished",
  "plan.stopped",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/* Transport frame that ends a segment which needs a decision */
export const WAITING_EVENT = "stream.waiting";

/* The case, as the application describes it to the engine (CaseBrief in
   scenario.ts). The lists mirror ariadne-rules' and the desk's codes; the
   desk's tests check that they agree. */

/* The stream a complaint's reply runs under, as ariadne-rules names it */
export const STREAMS = ["general", "money_claim", "antifraud", "aml_refusal"] as const;
export type StreamCode = (typeof STREAMS)[number];

/* The reply regime ariadne-rules sets: a complaint, or a 123-FZ money claim */
export const REGIMES = ["complaint", "ombudsman_claim"] as const;
export type Regime = (typeof REGIMES)[number];

/* The operation behind the complaint */
export const OPERATIONS = [
  "none",
  "card_payment",
  "faster_payment",
  "bank_transfer",
  "cash_withdrawal",
  "account_opening",
  "account_service",
] as const;
export type OperationCode = (typeof OPERATIONS)[number];

/* Where the case is in the register */
export const CASE_STAGES = [
  "registered",
  "waiting_for_facts",
  "drafting",
  "legal_review",
  "awaiting_signature",
  "sent",
  "closed",
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

/* The decision on the complaint, as the register holds it; "pending" is
   left for the reviewer: the engine never decides a complaint */
export const OUTCOMES = ["pending", "upheld", "partly_upheld", "refused"] as const;
export type OutcomeCode = (typeof OUTCOMES)[number];

/* The signs of Bank of Russia Order No. OD-2506 (161-FZ reasons), in the
   order's order */
export const SIGN_CODES = [
  "od2506_1_1",
  "od2506_1_2",
  "od2506_1_3",
  "od2506_1_4",
  "od2506_1_5",
  "od2506_1_6",
  "od2506_1_7",
  "od2506_1_8",
  "od2506_1_9",
  "od2506_1_10",
  "od2506_1_11",
  "od2506_1_12",
  "od2506_2_1",
  "od2506_2_2",
] as const;
/* The 115-FZ reason categories */
export const AML_REASON_CODES = [
  "aml_operation_refused",
  "aml_account_refused",
  "aml_account_terminated",
  "aml_operation_suspended",
  "aml_operation_suspended_by_decision",
  "aml_funds_frozen",
  "aml_high_risk_measures",
] as const;
export type SignCode = (typeof SIGN_CODES)[number];
export type AmlReasonCode = (typeof AML_REASON_CODES)[number];
export const REASON_CODES = [...SIGN_CODES, ...AML_REASON_CODES] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/* The legal grounds a reply may name; the application maps each to an act,
   an article and a part (the desk takes them from the register's ground
   list, which ariadne-rules' tests pin). In the register's code order: a
   new ground is added at the end. */
export const GROUND_CODES = [
  "payment_8_3_4",
  "payment_8_3_10",
  "aml_operation_refused",
  "aml_account_refused",
  "aml_account_terminated",
  "aml_operation_suspended",
  "aml_operation_suspended_by_decision",
  "aml_funds_frozen",
  "aml_high_risk_measures",
  "contract",
  "payment_9_11_6",
  "payment_9_11_7",
] as const;
export type GroundCode = (typeof GROUND_CODES)[number];

/* What the law lets the client do next, as ariadne-rules' rubric names it.
   A new option is added at the end. */
export const CLIENT_OPTIONS = [
  "confirm_order",
  "repeat_operation",
  "submit_documents",
  "apply_to_commission",
  "apply_to_ombudsman",
  "apply_for_removal",
] as const;
export type ClientOption = (typeof CLIENT_OPTIONS)[number];

/* The deadlines a reply states to the client while they run, as
   ariadne-rules names them */
export const CLIENT_DEADLINE_KINDS = [
  "antifraud_suspension_ends",
  "antifraud_confirmation",
  "antifraud_repeat_suspension_ends",
  "antifraud_after_repeat_suspension",
  "antifraud_repeat_refusal_ends",
  "antifraud_after_repeat_refusal",
  "exclusion_decision",
  "antifraud_refund",
  "aml_documents_answer",
  "aml_commission_decision",
  "high_risk_commission_application",
  "high_risk_rating_review",
] as const;
export type ClientDeadlineKind = (typeof CLIENT_DEADLINE_KINDS)[number];

/* The restrictions a reply states for the client's own data in the Bank
   of Russia's database, as ariadne-rules names its measures: the card or
   online banking suspended (161-FZ art. 9 parts 11.6, 11.7), or instead
   the client's transfers to individuals capped at 100,000 roubles a
   month (part 11.6, sentence 2), and ATM cash capped at 100,000 roubles a
   month (Banking Law art. 30 part 16). A new one is added at the end. */
export const MEASURE_CODES = ["suspend_instrument", "cap_transfers", "cap_atm_cash"] as const;
export type MeasureCode = (typeof MEASURE_CODES)[number];

/* The next steps every reply states */
export const NEXT_STEPS = ["contact_bank", "apply_to_bank_of_russia"] as const;
export type NextStep = (typeof NEXT_STEPS)[number];

/* The team a fact request goes to, by stream */
export const TEAMS = ["antifraud", "aml", "operations"] as const;
export type Team = (typeof TEAMS)[number];

/* What a fact request asks */
export const FACT_QUESTIONS = [
  "sign_detected",
  "client_confirmation",
  "database_match",
  "decision_basis",
  "documents_received",
  "measure_status",
  "operation_record",
  "contract_terms",
  "charges",
] as const;
export type FactQuestion = (typeof FACT_QUESTIONS)[number];

/* Objects a step changes, and their statuses */
export const OBJECT_KINDS = ["classification", "fact_request", "linked_facts", "reply_draft", "case"] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export const CLASSIFICATION_STATUSES = ["unconfirmed", "confirmed"] as const;
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];

export const REQUEST_STATUSES = ["not_sent", "sent"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const LINK_STATUSES = ["not_linked", "linked"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export const DRAFT_STATUSES = ["none", "drafted", "checked"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/* What a step shows the user before it runs */
export const DRAFT_KINDS = ["change", "request", "reply"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_TEMPLATES = [
  "classify",
  "request_facts",
  "reuse_linked_facts",
  "reply",
  "check_draft",
  "hand_to_review",
] as const;
export type DraftTemplate = (typeof DRAFT_TEMPLATES)[number];

/* What a finished step reports */
export const SUMMARY_CODES = [
  "case_classified",
  "facts_requested",
  "linked_facts_reused",
  "reply_drafted",
  "draft_checked",
  "handed_to_review",
] as const;
export type SummaryCode = (typeof SUMMARY_CODES)[number];

/* What undoing a finished step rolls back */
export const UNDO_CODES = [
  "unconfirm_classification",
  "recall_fact_request",
  "unlink_facts",
  "discard_draft",
  "clear_check",
  "return_to_drafting",
] as const;
export type UndoCode = (typeof UNDO_CODES)[number];

/* Failures a step can report */
export const ERROR_CODES = ["service_timeout"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const SERVICES = ["fact_requests"] as const;
export type Service = (typeof SERVICES)[number];

/* Progress phases, two per action type */
export const PROGRESS_PHASES = [
  "reading_case_facts",
  "matching_reason_codes",
  "composing_request",
  "sending_request",
  "opening_linked_case",
  "copying_facts",
  "filling_template",
  "citing_grounds",
  "checking_grounds",
  "checking_deadlines",
  "assembling_package",
  "assigning_reviewer",
] as const;
export type ProgressPhase = (typeof PROGRESS_PHASES)[number];

export const SKIP_REASONS = ["skipped_by_user", "skipped_after_error", "stopped_by_user"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/* Why the agent asks to leave the plan, and what it proposes instead */
export const DEVIATION_REASONS = ["facts_in_linked_case"] as const;
export type DeviationReason = (typeof DEVIATION_REASONS)[number];

export const DEVIATION_PROPOSALS = ["reuse_linked_facts"] as const;
export type DeviationProposalCode = (typeof DEVIATION_PROPOSALS)[number];

/* Two steps in an order that defeats one of them */
export const CONFLICT_REASONS = ["draft_before_facts", "check_before_draft", "review_before_draft"] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

/* The task the scenario represents */
export const TASK_CODES = ["answer_complaint"] as const;
export type TaskCode = (typeof TASK_CODES)[number];

/* Entries of the plan machine's session log */
export const LOG_KINDS = ["approved", "event", "decision", "stop_requested", "undo"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/* The seven statuses a timeline shows for a step */
export const STEP_STATUSES = [
  "waiting",
  "running",
  "done",
  "awaiting",
  "skipped",
  "undone",
  "error",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/* Speeds of a streamed run */
export const SPEEDS = ["normal", "fast"] as const;
export type Speed = (typeof SPEEDS)[number];

/* Errors of plan resolution and of the request handler */
export const REQUEST_ERRORS = [
  "missing_plan",
  "invalid_plan",
  "invalid_decisions",
  "empty_plan",
  "too_many_steps",
  "unknown_step",
  "method_not_allowed",
  "unsupported_version",
  "invalid_case",
] as const;
export type RequestError = (typeof REQUEST_ERRORS)[number];

/* Identifiers of the exported session log */
export const EXPORT_FORMAT = "ariadne_runner.session_log";

/* The engine is a scripted scenario; the export says so */
export const AGENT_KINDS = ["scripted"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

/* The union of every list above, for membership checks */
export const ALL_CODES: ReadonlySet<string> = new Set<string>([
  ...ACTION_TYPES,
  ...RISKS,
  ...AUTONOMIES,
  ...COMMANDS,
  ...RUN_EVENT_TYPES,
  WAITING_EVENT,
  ...STREAMS,
  ...REGIMES,
  ...OPERATIONS,
  ...CASE_STAGES,
  ...OUTCOMES,
  ...REASON_CODES,
  ...GROUND_CODES,
  ...CLIENT_OPTIONS,
  ...CLIENT_DEADLINE_KINDS,
  ...MEASURE_CODES,
  ...NEXT_STEPS,
  ...TEAMS,
  ...FACT_QUESTIONS,
  ...OBJECT_KINDS,
  ...CLASSIFICATION_STATUSES,
  ...REQUEST_STATUSES,
  ...LINK_STATUSES,
  ...DRAFT_STATUSES,
  ...DRAFT_KINDS,
  ...DRAFT_TEMPLATES,
  ...SUMMARY_CODES,
  ...UNDO_CODES,
  ...ERROR_CODES,
  ...SERVICES,
  ...PROGRESS_PHASES,
  ...SKIP_REASONS,
  ...DEVIATION_REASONS,
  ...DEVIATION_PROPOSALS,
  ...CONFLICT_REASONS,
  ...TASK_CODES,
  ...LOG_KINDS,
  ...STEP_STATUSES,
  ...SPEEDS,
  ...REQUEST_ERRORS,
  EXPORT_FORMAT,
  ...AGENT_KINDS,
]);
