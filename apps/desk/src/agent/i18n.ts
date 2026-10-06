// Every word of the assistant panel, in Russian and English, with the same
// keys in both (i18n.test.ts checks). The engine sends codes and
// numbers only; each code has its words here, typed as a Record over the
// engine's own list, so a code without words does not compile. Functions
// take numbers and dates already formatted (format.ts), so the digits are
// the locale's.
import type {
  ActionType,
  Autonomy,
  Command,
  ConflictReason,
  Decidable,
  DeviationProposalCode,
  DeviationReason,
  DocumentCode,
  DraftKind,
  ErrorCode,
  LetterStatus,
  MatchField,
  ObjectKind,
  ProgressPhase,
  RequestStatus,
  Risk,
  Service,
  SkipReason,
  StepStatus,
  TaskCode,
} from "@ariadne/runner";
import type { StreamStatus } from "./session";
import type { StreamError } from "./transport";
import type { WorkerError } from "./worker";

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
  /** The suppliers' names, by the engine's supplier index. */
  suppliers: string[];
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
  task: { panel: string; task: string; scenario: string; scenarioHelp: string; autonomy: string; scripted: string };
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
  requestStatus: Record<RequestStatus, string>;
  letterStatus: Record<LetterStatus, string>;
  document: Record<DocumentCode, string>;
  documentAge: (document: string, days: Count) => string;
  matchField: Record<MatchField, string>;
  draftKind: Record<DraftKind, string>;
  serviceName: Record<Service, string>;
  streamError: Record<StreamError, string>;
  taskName: Record<TaskCode, (requests: string) => string>;
  stepTitle: {
    check: (request: string, supplier: string) => string;
    extend: (contract: string, supplier: string) => string;
    reject_duplicate: (request: string, supplier: string) => string;
    request_documents: (request: string, supplier: string) => string;
    check_by_archive: (request: string) => string;
  };
  draft: {
    check_request: (request: string, supplier: string, external: boolean) => string[];
    extend_contract: (contract: string, supplier: string, months: Count, before: string, after: string, termsChanged: boolean) => string[];
    reject_duplicate: (request: string, supplier: string, duplicateOf: string, date: string, fields: string, notify: boolean) => string[];
    request_documents: (request: string, supplier: string, documents: string, due: string) => string[];
    check_by_archive: (request: string, archiveRequest: string, uploaded: string, sendsLetter: boolean) => string[];
  };
  object: {
    request: (request: string, before: string, after: string) => string;
    contract: (contract: string, before: string, after: string) => string;
    letter: (supplier: string, request: string, before: string, after: string) => string;
  };
  summaryText: {
    request_checked: (request: string, registryMatch: boolean) => string;
    contract_extended: (contract: string, until: string, request: string) => string;
    request_rejected_duplicate: (request: string, duplicateOf: string, notified: boolean) => string;
    documents_requested: (supplier: string, request: string) => string;
    request_checked_by_archive: (request: string, letterSent: boolean) => string;
  };
  undoText: {
    unmark_checked: (request: string) => string;
    restore_contract_term: (contract: string, until: string, request: string) => string;
    return_to_queue: (request: string, recalled: boolean) => string;
    recall_letter: (supplier: string, request: string) => string;
    unmark_checked_by_archive: (request: string) => string;
  };
  errorText: Record<ErrorCode, (service: string, seconds: string) => string>;
  deviationReason: Record<DeviationReason, (archiveRequest: string, uploaded: string) => string>;
  deviationProposal: Record<DeviationProposalCode, string>;
  conflict: Record<ConflictReason, (a: string, b: string, request: string) => string>;
};

const en: Strings = {
  title: "Assistant",
  subtitle: "It proposes, you decide, and you can stop it at any step",
  suppliers: [
    "Northwind Metals",
    "Harbour Logistics",
    "Cedar Office Supply",
    "Bluestone Packaging",
    "Meridian Electric",
    "Willow Textiles",
    "Summit Fasteners",
    "Riverside Printing",
    "Granite Tools",
    "Lakeshore Foods",
    "Orchard Chemicals",
  ],
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
    scenarioHelp: "Each number gives a different set of requests, the same every time.",
    autonomy: "Autonomy",
    scripted: "The agent is a script: the same scenario and the same decisions always give the same run. It is here to show the controls, not the answers.",
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
    confirm: { email: "Send letter", decision: "Reject request", change: "Apply change" },
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
  actionType: { check: "Check", extend: "Extension", reject_duplicate: "Duplicate rejection", request_documents: "Document request" },
  risk: { low: "low risk", medium: "medium risk", high: "high risk" },
  autonomy: { ask_all: "Ask every time", high_only: "Ask for marked steps", ask_none: "Ask only when required" },
  autonomyHelp: {
    ask_all: "Every step waits for your confirmation.",
    high_only: "Steps marked Ask first wait for you; high-risk steps always do.",
    ask_none: "Only high-risk steps wait for you; the marks are not used.",
  },
  command: { confirm: "Confirm", skip: "Skip", retry: "Retry", allow: "Allow", deny: "Deny", stop: "Stop" },
  phase: {
    matching_registry: "Matching against the registry",
    reviewing_supplier_history: "Reviewing the supplier's history",
    preparing_amendment: "Preparing the amendment",
    recording_new_term: "Recording the new term",
    changing_request_status: "Changing the request's status",
    notifying_supplier: "Notifying the supplier",
    composing_letter: "Composing the letter",
    sending_letter: "Sending the letter",
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
  objectKind: { request: "Request", contract: "Contract", letter: "Letter" },
  requestStatus: {
    under_review: "under review",
    checked: "checked",
    checked_by_archive: "checked against the archive",
    approved: "approved",
    rejected_duplicate: "rejected as a duplicate",
    documents_requested: "documents requested",
  },
  letterStatus: { not_sent: "not sent", sent: "sent" },
  document: { registry_extract: "a registry extract", company_card: "the company card", license_copy: "a copy of the licence" },
  documentAge: (document, days) => `${document} no older than ${days.text} ${days.n === 1 ? "day" : "days"}`,
  matchField: { tax_id: "tax number", subject: "subject", amount: "amount" },
  draftKind: { email: "Letter", decision: "Decision", change: "Change" },
  serviceName: { contracts: "The contracts service" },
  streamError: {
    missing_plan: "The run request carried no plan.",
    invalid_plan: "The plan in the run request could not be read.",
    invalid_decisions: "The decisions in the run request could not be read.",
    empty_plan: "The plan has no steps.",
    too_many_steps: "The plan has more steps than the scenario.",
    unknown_step: "The plan names a step the scenario does not have.",
    method_not_allowed: "The run service answers only requests to read.",
    stream_lost: "The connection to the run service was lost.",
  },
  taskName: { triage_supplier_requests: (requests) => `Triage ${requests} incoming supplier requests` },
  stepTitle: {
    check: (r, s) => `Check request ${r} from ${s}`,
    extend: (c, s) => `Extend contract ${c} with ${s}`,
    reject_duplicate: (r, s) => `Reject request ${r} from ${s} as a duplicate`,
    request_documents: (r, s) => `Ask ${s} for documents on request ${r}`,
    check_by_archive: (r) => `Check request ${r} against archived documents`,
  },
  draft: {
    check_request: (r, s, external) => [
      `Mark request ${r} from ${s} as checked.`,
      external ? "This reaches outside the organisation." : "Nothing leaves the organisation.",
    ],
    extend_contract: (c, s, months, before, after, termsChanged) => [
      `Extend contract ${c} with ${s} by ${months.text} ${months.n === 1 ? "month" : "months"}: valid until ${after} instead of ${before}.`,
      termsChanged ? "The terms change." : "The terms stay the same.",
    ],
    reject_duplicate: (r, s, d, date, fields, notify) => [
      `Reject request ${r} from ${s} as a duplicate of request ${d} of ${date}.`,
      `Matched on ${fields}.`,
      notify ? "The supplier is notified." : "The supplier is not notified.",
    ],
    request_documents: (r, s, documents, due) => [`Letter to ${s} about request ${r}.`, `Please send ${documents} by ${due}.`],
    check_by_archive: (r, a, uploaded, sendsLetter) => [
      `Check request ${r} with the documents uploaded on ${uploaded} for request ${a}.`,
      sendsLetter ? "A letter is sent." : "No letter is sent.",
    ],
  },
  object: {
    request: (r, before, after) => `Request ${r}: ${before} → ${after}`,
    contract: (c, before, after) => `Contract ${c}: valid until ${before} → ${after}`,
    letter: (s, r, before, after) => `Letter to ${s} about request ${r}: ${before} → ${after}`,
  },
  summaryText: {
    request_checked: (r, match) => `Request ${r} checked; ${match ? "it matches the registry" : "it does not match the registry"}.`,
    contract_extended: (c, until, r) => `Contract ${c} extended to ${until}; request ${r} approved.`,
    request_rejected_duplicate: (r, d, notified) =>
      `Request ${r} rejected as a duplicate of ${d}; ${notified ? "the supplier was notified" : "the supplier was not notified"}.`,
    documents_requested: (s, r) => `Letter sent to ${s} about request ${r}.`,
    request_checked_by_archive: (r, sent) => `Request ${r} checked against the archive; ${sent ? "a letter was sent" : "no letter was sent"}.`,
  },
  undoText: {
    unmark_checked: (r) => `Request ${r} is back under review.`,
    restore_contract_term: (c, until, r) => `Contract ${c} is valid until ${until} again; request ${r} is back under review.`,
    return_to_queue: (r, recalled) => `Request ${r} is back in the queue${recalled ? "; the notice was recalled" : ""}.`,
    recall_letter: (s, r) => `The letter to ${s} about request ${r} was recalled.`,
    unmark_checked_by_archive: (r) => `Request ${r} is back under review.`,
  },
  errorText: { service_timeout: (service, seconds) => `${service} did not answer within ${seconds} s.` },
  deviationReason: {
    fresh_documents_in_archive: (a, uploaded) => `Fresh documents from this supplier were uploaded on ${uploaded} with request ${a}.`,
  },
  deviationProposal: { check_by_archive: "Check the request against those documents instead of writing to the supplier." },
  conflict: {
    extend_and_reject_duplicate: (a, b, r) => `Steps ${a} and ${b} both act on request ${r}: one approves it, the other rejects it as a duplicate.`,
  },
};

const ruStrings: Strings = {
  title: "Ассистент",
  subtitle: "Предлагает он, решаете вы, и его можно остановить на любом шаге",
  suppliers: [
    "«Северметалл»",
    "«Гавань-Логистик»",
    "«Кедр-Офис»",
    "«Синий камень»",
    "«Меридиан-Электро»",
    "«Ива-Текстиль»",
    "«Вершина-Крепёж»",
    "«Прибрежная типография»",
    "«Гранит-Инструмент»",
    "«Озёрные продукты»",
    "«Сад-Химия»",
  ],
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
    scenarioHelp: "Каждый номер даёт свой набор заявок, каждый раз один и тот же.",
    autonomy: "Самостоятельность",
    scripted: "Агент — это сценарий: один и тот же номер и одни и те же решения всегда дают один и тот же запуск. Он показывает управление, а не качество ответов.",
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
    confirm: { email: "Отправить письмо", decision: "Отклонить заявку", change: "Применить изменение" },
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
  actionType: { check: "Проверка", extend: "Продление", reject_duplicate: "Отклонение дубликата", request_documents: "Запрос документов" },
  risk: { low: "низкий риск", medium: "средний риск", high: "высокий риск" },
  autonomy: { ask_all: "Спрашивать всегда", high_only: "Спрашивать по отметке", ask_none: "Спрашивать только обязательное" },
  autonomyHelp: {
    ask_all: "Каждый шаг ждёт вашего подтверждения.",
    high_only: "Шаги с отметкой «Спросить заранее» ждут вас; шаги с высоким риском ждут всегда.",
    ask_none: "Ждут вас только шаги с высоким риском; отметки не учитываются.",
  },
  command: { confirm: "Подтвердить", skip: "Пропустить", retry: "Повторить", allow: "Разрешить", deny: "Отказать", stop: "Остановить" },
  phase: {
    matching_registry: "Сверка с реестром",
    reviewing_supplier_history: "Просмотр истории поставщика",
    preparing_amendment: "Подготовка допсоглашения",
    recording_new_term: "Запись нового срока",
    changing_request_status: "Смена статуса заявки",
    notifying_supplier: "Уведомление поставщика",
    composing_letter: "Составление письма",
    sending_letter: "Отправка письма",
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
  objectKind: { request: "Заявка", contract: "Договор", letter: "Письмо" },
  requestStatus: {
    under_review: "на рассмотрении",
    checked: "проверена",
    checked_by_archive: "проверена по архиву",
    approved: "одобрена",
    rejected_duplicate: "отклонена как дубликат",
    documents_requested: "документы запрошены",
  },
  letterStatus: { not_sent: "не отправлено", sent: "отправлено" },
  document: { registry_extract: "выписку из реестра", company_card: "карточку компании", license_copy: "копию лицензии" },
  documentAge: (document, days) => `${document} не старше ${days.text} ${ru(days.n, "дня", "дней", "дней")}`,
  matchField: { tax_id: "ИНН", subject: "предмет", amount: "сумма" },
  draftKind: { email: "Письмо", decision: "Решение", change: "Изменение" },
  serviceName: { contracts: "Сервис договоров" },
  streamError: {
    missing_plan: "В запросе на запуск нет плана.",
    invalid_plan: "План в запросе на запуск не удалось прочитать.",
    invalid_decisions: "Решения в запросе на запуск не удалось прочитать.",
    empty_plan: "В плане нет шагов.",
    too_many_steps: "В плане больше шагов, чем в сценарии.",
    unknown_step: "В плане есть шаг, которого нет в сценарии.",
    method_not_allowed: "Служба выполнения отвечает только на запросы чтения.",
    stream_lost: "Соединение со службой выполнения потеряно.",
  },
  taskName: { triage_supplier_requests: (requests) => `Разобрать входящие заявки поставщиков: ${requests}` },
  stepTitle: {
    check: (r, s) => `Проверить заявку ${r} от ${s}`,
    extend: (c, s) => `Продлить договор ${c} с ${s}`,
    reject_duplicate: (r, s) => `Отклонить заявку ${r} от ${s} как дубликат`,
    request_documents: (r, s) => `Запросить у ${s} документы по заявке ${r}`,
    check_by_archive: (r) => `Проверить заявку ${r} по документам из архива`,
  },
  draft: {
    check_request: (r, s, external) => [
      `Отметить заявку ${r} от ${s} как проверенную.`,
      external ? "Это затрагивает внешних получателей." : "Ничего не уходит за пределы организации.",
    ],
    extend_contract: (c, s, months, before, after, termsChanged) => [
      `Продлить договор ${c} с ${s} на ${months.text} ${ru(months.n, "месяц", "месяца", "месяцев")} (срок действия: до ${after} вместо ${before}).`,
      termsChanged ? "Условия меняются." : "Условия не меняются.",
    ],
    reject_duplicate: (r, s, d, date, fields, notify) => [
      `Отклонить заявку ${r} от ${s} как дубликат заявки ${d} (${date}).`,
      `Совпали: ${fields}.`,
      notify ? "Поставщик получит уведомление." : "Поставщик не получит уведомления.",
    ],
    request_documents: (r, s, documents, due) => [`Письмо для ${s} по заявке ${r}.`, `До ${due} просим прислать ${documents}.`],
    check_by_archive: (r, a, uploaded, sendsLetter) => [
      `Проверить заявку ${r} по документам, загруженным ${uploaded} с заявкой ${a}.`,
      sendsLetter ? "Письмо отправляется." : "Письмо не отправляется.",
    ],
  },
  object: {
    request: (r, before, after) => `Заявка ${r}: ${before} → ${after}`,
    contract: (c, before, after) => `Договор ${c}: срок до ${before} → до ${after}`,
    letter: (s, r, before, after) => `Письмо для ${s} по заявке ${r}: ${before} → ${after}`,
  },
  summaryText: {
    request_checked: (r, match) => `Заявка ${r} проверена; ${match ? "совпадает с реестром" : "не совпадает с реестром"}.`,
    contract_extended: (c, until, r) => `Договор ${c} продлён до ${until}; заявка ${r} одобрена.`,
    request_rejected_duplicate: (r, d, notified) =>
      `Заявка ${r} отклонена как дубликат ${d}; ${notified ? "поставщик уведомлён" : "поставщик не уведомлён"}.`,
    documents_requested: (s, r) => `Письмо для ${s} по заявке ${r} отправлено.`,
    request_checked_by_archive: (r, sent) => `Заявка ${r} проверена по архиву; ${sent ? "письмо отправлено" : "письмо не отправлялось"}.`,
  },
  undoText: {
    unmark_checked: (r) => `Заявка ${r} снова на рассмотрении.`,
    restore_contract_term: (c, until, r) => `Договор ${c} снова действует до ${until}; заявка ${r} снова на рассмотрении.`,
    return_to_queue: (r, recalled) => `Заявка ${r} вернулась в очередь${recalled ? "; уведомление отозвано" : ""}.`,
    recall_letter: (s, r) => `Письмо для ${s} по заявке ${r} отозвано.`,
    unmark_checked_by_archive: (r) => `Заявка ${r} снова на рассмотрении.`,
  },
  errorText: { service_timeout: (service, seconds) => `${service} не ответил за ${seconds} с.` },
  deviationReason: {
    fresh_documents_in_archive: (a, uploaded) => `Свежие документы этого поставщика загружены ${uploaded} с заявкой ${a}.`,
  },
  deviationProposal: { check_by_archive: "Проверить заявку по этим документам, не отправляя письмо поставщику." },
  conflict: {
    extend_and_reject_duplicate: (a, b, r) => `Шаги ${a} и ${b} относятся к одной заявке ${r}: один её одобряет, другой отклоняет как дубликат.`,
  },
};

export const strings: Record<Lang, Strings> = { en, ru: ruStrings };
