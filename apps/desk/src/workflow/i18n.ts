// The words of a case's work: its stage, the transitions a role may take,
// the return for rework with its reason, the journal of who did what, when
// and why, and the handover of the assistant's draft. Russian first,
// English second; the stages' own names are the engine's language
// modules'.
import type { Action, CopyKind, QueryView, ReturnReason, TransitionError } from "@ariadne/grid";
import type { SignDecision } from "./caseFile";
import type { Lang } from "../i18n";

export type WorkflowStrings = {
  panel: string;
  /** Who the page acts as, and on what. */
  actingAs: (role: string, name: string) => string;
  notYours: (name: string) => string;
  notYoursSigner: (name: string) => string;
  /** Nothing the role can do on the case at its stage. */
  nothingToDo: (stage: string) => string;
  returned: string;
  /** A button per transition, by action. */
  act: Partial<Record<Action, string>>;
  /** What each transition does, read under its button. */
  actHelp: Partial<Record<Action, string>>;
  returnTitle: (id: string) => string;
  returnFrom: (stage: string) => string;
  reason: string;
  reasonNone: string;
  reasons: Record<ReturnReason, string>;
  comment: string;
  commentHelp: (min: string) => string;
  returnConfirm: string;
  cancel: string;
  errors: Record<TransitionError["code"], string>;
  commentRequired: (min: string) => string;
  commentTooLong: (max: string, length: string) => string;
  /** Announced and toasted once a transition is made. */
  done: (id: string, stage: string) => string;

  journal: string;
  journalCaption: string;
  /** The journal's line for an entry, by action. */
  action: Record<Action, string>;
  move: (from: string, to: string) => string;
  why: (reason: string) => string;
  said: (comment: string) => string;
  generated: string;
  system: string;
  colleague: string;
  assistant: (name: string) => string;
  person: (role: string, name: string) => string;

  /** Refusals of the desk beyond the transition table, by the letter. */
  letterRefusal: { "letter-undecided": string; "letter-not-signed": string; "letter-signed": string; "dispatch-from-case": string };

  /** The letter: the assistant's draft, the text as it stands, the
   * signatory named on it. */
  letter: {
    panel: string;
    asItStands: string;
    signedPanel: string;
    toBeSigned: (name: string, position: string) => string;
    signedBy: (name: string, position: string, time: string) => string;
    position: string;
    editedBy: (who: string, time: string) => string;
    otherLanguage: string;
    fromRegister: string;
    handedOver: (time: string) => string;
    notKept: string;
  };
  /** The review of a reply: findings, the diff, the edit. */
  review: {
    findings: string;
    findingsNote: string;
    diff: string;
    diffCaption: string;
    diffNone: string;
    /** The share the measure of light edits counts: per changed passage,
     * the longer side, over the draft's characters. */
    diffStats: (changed: string, base: string, share: string) => string;
    edit: string;
    editTitle: (id: string) => string;
    editLabel: string;
    editHelp: (max: string) => string;
    save: string;
    saved: (id: string) => string;
    errors: { "letter-empty": string; "letter-too-long": (max: string, length: string) => string; "letter-unchanged": string; "letter-signed": string };
    readOnly: string;
  };
  /** The signature step: the decision record, then the signature. */
  signature: {
    panel: string;
    basis: string;
    decision: string;
    decisions: Record<SignDecision, string>;
    decisionHelp: Record<SignDecision, string>;
    concerns: string;
    concernsHelp: (min: string) => string;
    wrong: string;
    wrongHelp: (min: string) => string;
    sign: string;
    defer: string;
    signed: (id: string) => string;
    deferred: (id: string) => string;
    frozen: string;
    sendNext: string;
    deferrals: string;
    record: (decision: string) => string;
    concernsSaid: (text: string) => string;
    wrongSaid: (text: string) => string;
    errors: {
      "not-awaiting-signature": string;
      "letter-signed": string;
      "wrong-required": (min: string) => string;
      "concerns-required": (min: string) => string;
      "record-too-long": (max: string) => string;
      "edit-first": string;
      "edited-so-modify": string;
      "letter-undecided": string;
    };
    notYours: (name: string) => string;
  };

  /** Dispatch, its copies, the breach mark, the supervisor's extension,
   * retention and the export for an inspection. */
  dispatch: {
    panel: string;
    dispatch: string;
    help: string;
    confirmTitle: (id: string) => string;
    confirmTo: (channel: string) => string;
    confirmCopies: string;
    confirmNoCopies: string;
    confirmDelay: (seconds: string) => string;
    confirm: string;
    keep: string;
    pending: (seconds: string) => string;
    pendingLabel: string;
    cancel: string;
    cancelled: (id: string) => string;
    sent: (id: string) => string;
    notYet: string;
    copies: string;
    copy: Record<CopyKind, string>;
    copyBasis: string;
    due: (day: string) => string;
    sentOn: (day: string) => string;
    markSent: string;
    markedSent: (copy: string) => string;
    noCopies: string;
    breach: string;
    breachHelp: string;
    breachRefused: string;
    extension: string;
    extensionHelp: string;
    extensionReason: string;
    extend: string;
    extended: (id: string, day: string) => string;
    extensionRefusedBy: (words: string) => string;
    reasonRequired: (min: string) => string;
    alreadyExtended: string;
    retention: (until: string, basis: string) => string;
    retentionNone: (until: string) => string;
    export: string;
    exportText: string;
    exportCsv: string;
    exported: string;
    file: (id: string, ext: string) => string;
  };
  /** The words of the export for an inspection. */
  inspection: {
    title: (id: string) => string;
    taken: (day: string) => string;
    synthetic: string;
    fields: { case: string; applicant: string; stream: string; organisation: string; source: string; received: string; registered: string; replyDue: string; stage: string; retention: string };
    derivation: string;
    journal: string;
    letter: string;
    noLetter: string;
    copies: string;
    columns: { section: string; when: string; who: string; what: string; detail: string };
  };

  /** The assistant's handover, on the case. */
  handover: {
    recorded: (stage: string, who: string, time: string) => string;
    draftKept: string;
    confirmTitle: string;
    confirmText: (stage: string) => string;
    confirm: string;
    noDraft: string;
    notOperator: string;
    already: (stage: string) => string;
    /** Under the run's step once the handover is on the case. */
    final: string;
  };

  /** The client's own data in the Bank of Russia's database, on the case:
   * the bank's own application to remove them. */
  database: {
    panel: string;
    /** What the bank's copy of the database record holds, as a term. */
    record: string;
    /** The day the bank received the database information, as a term. */
    received: string;
    own: string;
    ownHelp: string;
    reasons: string;
    reasonsHelp: (min: string) => string;
    apply: string;
    whoMay: string;
    confirmTitle: (id: string) => string;
    confirmText: string;
    confirm: string;
    keep: string;
    applied: (id: string) => string;
    sent: (day: string) => string;
    decidesBy: (day: string, basis: string) => string;
    errors: {
      "removal-not-client-data": string;
      "removal-role": string;
      "removal-already-sent": string;
      "removal-reason-required": (min: string) => string;
      "removal-reason-too-long": (max: string, length: string) => string;
    };
    /** The Bank of Russia's request about an application the client filed
     * with it directly, and the bank's answer. */
    query: string;
    queryHelp: string;
    queryThroughBank: string;
    recordQuery: string;
    queryWhoMay: string;
    queryRecorded: (id: string) => string;
    queryReceived: (day: string) => string;
    answerDue: (day: string, basis: string) => string;
    view: string;
    views: Record<QueryView, string>;
    viewSaid: (view: string) => string;
    answerReasons: string;
    answerHelp: (min: string) => string;
    answer: string;
    answerWhoMay: string;
    answeredToast: (id: string) => string;
    answered: (day: string, view: string) => string;
    afterAnswer: string;
    queryErrors: {
      "query-not-client-data": string;
      "query-through-bank": string;
      "query-role": string;
      "query-already-received": string;
      "query-not-received": string;
      "query-already-answered": string;
      "query-view-required": string;
      "query-reason-required": (min: string) => string;
      "query-reason-too-long": (max: string, length: string) => string;
    };
  };
};

const en: WorkflowStrings = {
  panel: "Work on the case",
  actingAs: (role, name) => `You act as the ${role.toLowerCase()}, ${name}.`,
  notYours: (name) => `This case is assigned to ${name}; the operator acts on their own cases only.`,
  notYoursSigner: (name) => `This reply is signed by ${name}; the signatory acts on their own replies only.`,
  nothingToDo: (stage) => `At “${stage}” this role has nothing to do on the case.`,
  returned: "Returned for rework",
  act: {
    request_facts: "Request facts",
    start_drafting: "Start drafting",
    facts_received: "Facts received",
    hand_over: "Hand over to legal review",
    approve: "Approve for signature",
    return: "Return for rework",
    send: "Send the signed reply",
    close: "Close the case",
  },
  actHelp: {
    request_facts: "The case waits for facts from another team.",
    start_drafting: "The reply is drafted without asking for facts.",
    facts_received: "The facts are in: the reply is drafted.",
    hand_over: "The draft goes to the legal reviewer, who states the decision if it is not yet.",
    approve: "The reply goes to the signatory. It needs a decision, and a refusal its legal ground.",
    return: "The reply goes back to drafting, with the reason.",
    send: "The signed reply goes out to the applicant today.",
    close: "The answered case is closed.",
  },
  returnTitle: (id) => `Return ${id} for rework`,
  returnFrom: (stage) => `From “${stage}” back to drafting. The reason goes into the case's journal.`,
  reason: "Reason",
  reasonNone: "Not chosen",
  reasons: {
    facts_missing: "Facts are missing",
    ground_wrong: "The legal ground is wrong",
    deadline_wrong: "A deadline is wrong or missing",
    option_missing: "An option of the client is missing",
    wording: "The wording needs work",
    other: "Another reason",
  },
  comment: "Comment",
  commentHelp: (min) => `Required for another reason, at least ${min} characters.`,
  returnConfirm: "Return for rework",
  cancel: "Cancel",
  errors: {
    "transition-not-allowed": "A case does not go there from this stage.",
    "stage-not-for-role": "This role does not take this step.",
    "reason-required": "Choose a reason.",
    "comment-required": "Say what the other reason is.",
    "comment-too-long": "The comment is too long.",
    "reply-needs-outcome": "Decide the outcome first: a reply goes to signature decided.",
    "refusal-needs-ground": "A refusal needs its legal ground first.",
  },
  commentRequired: (min) => `Say what the other reason is, in at least ${min} characters.`,
  commentTooLong: (max, length) => `At most ${max} characters; this comment has ${length}.`,
  done: (id, stage) => `${id} is now at “${stage}”.`,

  journal: "Journal",
  journalCaption: "Every step of the case: who took it, when and why",
  action: {
    register: "Registered",
    request_facts: "Facts requested",
    facts_received: "Facts received",
    start_drafting: "Drafting started",
    hand_over: "Handed over to legal review",
    approve: "Approved for signature",
    return: "Returned for rework",
    send: "Sent",
    close: "Closed",
    extend: "Deadline extended by 10 working days",
    extension_withdrawn: "Extension withdrawn",
    undo: "Change undone",
    edit: "Letter edited",
    sign: "Letter signed",
    defer: "Signature deferred",
    breach_marked: "Breach of a standard found",
    breach_withdrawn: "Breach of a standard withdrawn",
    copy_sent: "Copy sent",
    dispatch_cancelled: "Dispatch cancelled before sending",
    removal_applied: "The bank applied to the Bank of Russia to remove the client's data",
    query_received: "The Bank of Russia's request on the client's application reached the bank",
    query_answered: "The bank answered the Bank of Russia's request",
  },
  move: (from, to) => `${from} → ${to}`,
  why: (reason) => `Reason: ${reason}`,
  said: (comment) => `Comment: ${comment}`,
  generated: "From the register",
  system: "The desk",
  colleague: "A colleague",
  assistant: (name) => `The assistant, confirmed by ${name}`,
  person: (role, name) => `${role} ${name}`,

  letterRefusal: {
    "letter-undecided": "The letter still leaves the decision open: state it, or edit the letter, first.",
    "letter-not-signed": "The reply goes out only signed: sign the letter first.",
    "letter-signed": "The letter is signed: it is not returned for rework.",
    "dispatch-from-case": "A signed reply goes out from its case: dispatched, with its send delay and its copies.",
  },
  letter: {
    panel: "The letter",
    asItStands: "The letter as it stands",
    signedPanel: "The signed letter",
    toBeSigned: (name, position) => `To be signed by ${name}, ${position}.`,
    signedBy: (name, position, time) => `Signed by ${name}, ${position}, ${time}.`,
    position: "authorised person of the bank",
    editedBy: (who, time) => `Edited by ${who}, ${time}.`,
    otherLanguage: "This text was written in the other language of the desk and is shown as written.",
    fromRegister: "The assistant's draft, worked out from the case as the assistant drafts it: this case was not handed over in this page.",
    handedOver: (time) => `The assistant's draft, handed over ${time}.`,
    notKept: "The letter of a case answered before this page opened is not kept here.",
  },
  review: {
    findings: "What the rubric finds",
    findingsNote: "Grounds, options and deadlines are checked as the draft names them; sentence length on the text as it stands.",
    diff: "Changes against the assistant's draft",
    diffCaption: "Removed and added text, in order",
    diffNone: "No changes: the letter is the assistant's draft.",
    diffStats: (changed, base, share) =>
      `For the measure of light edits: ${changed} of the draft's ${base} characters changed (${share}), counting the longer side of each changed passage.`,
    edit: "Edit the letter",
    editTitle: (id) => `Edit the letter of ${id}`,
    editLabel: "Text of the letter",
    editHelp: (max) => `One sentence a line reads best. At most ${max} characters.`,
    save: "Save the letter",
    saved: (id) => `The letter of ${id} is saved.`,
    errors: {
      "letter-empty": "The letter is empty.",
      "letter-too-long": (max, length) => `At most ${max} characters; this letter has ${length}.`,
      "letter-unchanged": "Nothing changed.",
      "letter-signed": "The letter is signed and is not changed any more.",
    },
    readOnly: "Only the legal reviewer edits the letter under review.",
  },
  signature: {
    panel: "Signature",
    basis:
      "No statute names who signs a reply; it must let the applicant identify the organisation and the authorised official (Bank of Russia, questions and answers on 442-FZ). The MFO base standard (art. 18 item 9, from 1 July 2026) and the insurers' base standard (item 4.1.3) require the head, a deputy or an authorised person.",
    decision: "Decision",
    decisions: { approve: "Approve", modify: "Modify", override: "Override", defer: "Defer" },
    decisionHelp: {
      approve: "Sign the letter as proposed.",
      modify: "Sign it with your own changes: edit the letter first.",
      override: "Replace what was proposed with your own letter: edit it first, and say why.",
      defer: "Do not sign now; the case stays at signature.",
    },
    concerns: "Concerns",
    concernsHelp: (min) => `What gives you pause. Required unless you approve, at least ${min} characters.`,
    wrong: "What would make this wrong",
    wrongHelp: (min) => `The fact that, if true, would make this decision wrong. At least ${min} characters.`,
    sign: "Sign the letter",
    defer: "Defer the signature",
    signed: (id) => `The letter of ${id} is signed.`,
    deferred: (id) => `The signature of ${id} is deferred.`,
    frozen: "Signed: the letter is not changed any more.",
    sendNext: "Next: send the signed reply.",
    deferrals: "Deferred signatures",
    record: (decision) => `Decision: ${decision}`,
    concernsSaid: (text) => `Concerns: ${text}`,
    wrongSaid: (text) => `What would make this wrong: ${text}`,
    errors: {
      "not-awaiting-signature": "The case is not at signature.",
      "letter-signed": "The letter is already signed.",
      "wrong-required": (min) => `Say what would make this wrong, in at least ${min} characters.`,
      "concerns-required": (min) => `Say what your concerns are, in at least ${min} characters.`,
      "record-too-long": (max) => `At most ${max} characters in each field.`,
      "edit-first": "Edit the letter first: a modification or an override is your own text.",
      "edited-so-modify": "You changed the letter: that is a modification or an override, not an approval as proposed.",
      "letter-undecided": "The letter still leaves the decision open; it is not signed.",
    },
    notYours: (name) => `The signature is ${name}'s.`,
  },
  dispatch: {
    panel: "Dispatch and copies",
    dispatch: "Dispatch the reply",
    help: "High risk: the reply goes to the applicant. It leaves after a send delay in which you can cancel it; once it has left it is not recalled.",
    confirmTitle: (id) => `Dispatch the reply in ${id}?`,
    confirmTo: (channel) => `To the applicant, by ${channel}.`,
    confirmCopies: "The same day, these copies become due:",
    confirmNoCopies: "No copies are owed for this reply.",
    confirmDelay: (seconds) => `It leaves in ${seconds} seconds; until then you can cancel it.`,
    confirm: "Dispatch",
    keep: "Do not dispatch",
    pending: (seconds) => `Leaves in ${seconds} s.`,
    pendingLabel: "Send delay",
    cancel: "Cancel sending",
    cancelled: (id) => `The reply in ${id} was not sent: dispatch cancelled.`,
    sent: (id) => `The reply in ${id} has gone out.`,
    notYet: "The reply goes out once it is signed.",
    copies: "Copies",
    copy: {
      bank_of_russia: "Copy of the reply to the Bank of Russia",
      sro: "Copy of the complaint and the reply to the self-regulatory organisation",
      notice: "Copy of the extension notice to the Bank of Russia",
    },
    copyBasis:
      "Each copy is due the day its original goes out: to the Bank of Russia for a complaint it forwarded (Banking Law art. 30.1 part 15 and the sector articles); to the self-regulatory organisation when a non-bank company finds a breach of a standard (151-FZ art. 9.1 part 12, 4015-1 art. 6.2 item 8, 39-FZ art. 15.11 item 5, 190-FZ art. 6.2 part 10).",
    due: (day) => `due ${day}`,
    sentOn: (day) => `sent ${day}`,
    markSent: "Mark sent",
    markedSent: (copy) => `${copy}: marked sent.`,
    noCopies: "No copies are owed for this case.",
    breach: "A breach of a base or internal standard was found",
    breachRefused: "A breach is marked for a non-bank company, before its reply goes out.",
    breachHelp: "For a microfinance company, an insurer, a broker or a credit cooperative: the complaint and the reply go to its self-regulatory organisation the day the reply goes out. Marked before the reply goes out.",
    extension: "Extend the reply term",
    extensionHelp: "By 10 working days, once, only to request documents, with a reasoned notice to the applicant.",
    extensionReason: "Reason: which documents, from whom",
    extend: "Extend by 10 working days",
    extended: (id, day) => `The reply term in ${id} is extended to ${day}.`,
    extensionRefusedBy: (words) => `Refused by the rules: ${words}`,
    reasonRequired: (min) => `Give the reason, in at least ${min} characters.`,
    alreadyExtended: "The term is already extended; it is extended once.",
    retention: (until, basis) => `Kept until ${until}: three years from registration (${basis}).`,
    retentionNone: (until) => `Kept until ${until}: 190-FZ art. 6.2 sets no term for a credit cooperative; the desk keeps it three years, as the other sectors, its own choice.`,
    export: "Export for an inspection",
    exportText: "Plain text",
    exportCsv: "CSV",
    exported: "The export is saved.",
    file: (id, ext) => `${id}-inspection.${ext}`,
  },
  inspection: {
    title: (id) => `Case ${id}: export for an inspection`,
    taken: (day) => `Deadlines as of ${day}.`,
    synthetic: "Synthetic data of a demonstration desk; no real client.",
    fields: {
      case: "Case",
      applicant: "Applicant",
      stream: "Stream",
      organisation: "Organisation",
      source: "Source",
      received: "Received",
      registered: "Registered",
      replyDue: "Reply due",
      stage: "Stage",
      retention: "Retention",
    },
    derivation: "How the reply's last day was worked out",
    journal: "Journal",
    letter: "Letter",
    noLetter: "No letter kept in this page.",
    copies: "Copies",
    columns: { section: "Section", when: "When", who: "Who", what: "What", detail: "Detail" },
  },
  handover: {
    recorded: (stage, who, time) => `On the case: “${stage}”, ${who}, ${time}.`,
    draftKept: "The draft is kept with the case for the reviewer; the run's log stays as it was.",
    confirmTitle: "The handover is not on the case yet",
    confirmText: (stage) => `Confirm it, and the case moves to “${stage}” with this draft. The run's log stays as it was.`,
    confirm: "Confirm the handover",
    noDraft: "No draft was written in this run, so there is nothing to hand over.",
    notOperator: "The handover is the operator's: switch to the operator role to confirm it.",
    already: (stage) => `The case is already at “${stage}”.`,
    final: "On the case now: a return for rework is the reviewer's.",
  },
  database: {
    panel: "The Bank of Russia's database",
    record: "The bank's copy of the record",
    received: "Received from the Bank of Russia",
    own: "The bank's own application to remove the data",
    ownHelp:
      "With grounds to think the client's data were included without basis, the bank may apply to the Bank of Russia on its own, without the client (161-FZ art. 9 part 11.9). The Bank of Russia decides within 15 working days and sends the decision to the bank. Once sent, the application is not recalled.",
    reasons: "The bank's reasons",
    reasonsHelp: (min) => `Why the data were included without basis, as the application states it; at least ${min} characters.`,
    apply: "Apply to the Bank of Russia",
    whoMay: "The legal reviewer or the supervisor files the bank's own application.",
    confirmTitle: (id) => `Apply to remove the client's data, case ${id}?`,
    confirmText: "The application goes to the Bank of Russia with these reasons and is not recalled. The client takes no part in it.",
    confirm: "Send the application",
    keep: "Not now",
    applied: (id) => `Case ${id}: the bank's application to remove the client's data went to the Bank of Russia.`,
    sent: (day) => `Sent to the Bank of Russia on ${day}.`,
    decidesBy: (day, basis) => `The Bank of Russia decides by ${day} (${basis}).`,
    errors: {
      "removal-not-client-data": "Only a case about the client's own data in the database has this application.",
      "removal-role": "The legal reviewer or the supervisor files the bank's own application.",
      "removal-already-sent": "The bank has already applied on this case.",
      "removal-reason-required": (min) => `State the bank's reasons, at least ${min} characters.`,
      "removal-reason-too-long": (max, length) => `The reasons are ${length} characters; at most ${max}.`,
    },
    query: "The Bank of Russia's request on the client's own application",
    queryHelp:
      "A client may apply to the Bank of Russia directly, through its internet reception. The bank learns of it from the Bank of Russia's request and answers within 3 working days with its view of whether the data were included with basis (Directive No. 6748-U items 2.2, 2.9). The Bank of Russia sends its decision to the client by email, so the bank passes nothing on; if the data are removed, the bank restores a suspended card at once (161-FZ art. 9 part 11.11).",
    queryThroughBank: "The client applied through the bank, which forwarded its view with the application (Directive No. 6748-U item 1.5).",
    recordQuery: "Record the request received today",
    queryWhoMay: "The operator of the case or the supervisor records the request.",
    queryRecorded: (id) => `Case ${id}: the Bank of Russia's request is on the case, and the answer is due in 3 working days.`,
    queryReceived: (day) => `The request reached the bank on ${day}.`,
    answerDue: (day, basis) => `The answer is due by ${day} (${basis}).`,
    view: "The bank's view",
    views: { justified: "Included with basis", unjustified: "Included without basis" },
    viewSaid: (view) => `View: ${view}`,
    answerReasons: "The reasons for the bank's view",
    answerHelp: (min) => `What the bank's view rests on, as the answer states it; at least ${min} characters.`,
    answer: "Record the answer",
    answerWhoMay: "The legal reviewer or the supervisor answers the request.",
    answeredToast: (id) => `Case ${id}: the bank's answer to the Bank of Russia's request is on the case.`,
    answered: (day, view) => `Answered on ${day}: ${view}.`,
    afterAnswer: "The Bank of Russia decides within 15 working days of receiving the client's application and tells the client by email.",
    queryErrors: {
      "query-not-client-data": "Only a case about the client's own data in the database has this request.",
      "query-through-bank": "The client applied through the bank, which forwarded its view with the application.",
      "query-role": "Another role records this step.",
      "query-already-received": "The request is already on the case.",
      "query-not-received": "No request from the Bank of Russia is on the case.",
      "query-already-answered": "The bank has already answered the request.",
      "query-view-required": "Choose the bank's view.",
      "query-reason-required": (min) => `State the bank's reasons, at least ${min} characters.`,
      "query-reason-too-long": (max, length) => `The reasons are ${length} characters; at most ${max}.`,
    },
  },
};

const ru: WorkflowStrings = {
  panel: "Работа с обращением",
  actingAs: (role, name) => `Вы действуете в роли «${role}»: ${name}.`,
  notYours: (name) => `Обращение назначено на исполнителя ${name}; оператор работает только со своими обращениями.`,
  notYoursSigner: (name) => `Ответ подписывает ${name}; подписант работает только со своими ответами.`,
  nothingToDo: (stage) => `На этапе «${stage}» у этой роли нет действий по обращению.`,
  returned: "Возвращено на доработку",
  act: {
    request_facts: "Запросить факты",
    start_drafting: "Начать проект ответа",
    facts_received: "Факты получены",
    hand_over: "Передать на юридическую проверку",
    approve: "Согласовать на подпись",
    return: "Вернуть на доработку",
    send: "Отправить подписанный ответ",
    close: "Закрыть обращение",
  },
  actHelp: {
    request_facts: "Обращение ждёт фактов от другого подразделения.",
    start_drafting: "Проект ответа готовится без запроса фактов.",
    facts_received: "Факты получены: готовится проект ответа.",
    hand_over: "Проект уходит юристу; если решение ещё не принято, его указывает юрист.",
    approve: "Ответ уходит подписанту. Нужно решение, для отказа также его правовое основание.",
    return: "Ответ возвращается на подготовку проекта с указанием причины.",
    send: "Подписанный ответ уходит заявителю сегодня.",
    close: "Обращение с отправленным ответом закрывается.",
  },
  returnTitle: (id) => `Вернуть ${id} на доработку`,
  returnFrom: (stage) => `С этапа «${stage}» на подготовку проекта. Причина попадёт в журнал обращения.`,
  reason: "Причина",
  reasonNone: "Не выбрана",
  reasons: {
    facts_missing: "Не хватает фактов",
    ground_wrong: "Неверное правовое основание",
    deadline_wrong: "Срок указан неверно или не указан",
    option_missing: "Не указана возможность клиента",
    wording: "Нужно поправить формулировки",
    other: "Другая причина",
  },
  comment: "Комментарий",
  commentHelp: (min) => `Обязателен для другой причины, не короче ${min} знаков.`,
  returnConfirm: "Вернуть на доработку",
  cancel: "Отмена",
  errors: {
    "transition-not-allowed": "С этого этапа обращение туда не переходит.",
    "stage-not-for-role": "Этот шаг делает другая роль.",
    "reason-required": "Выберите причину.",
    "comment-required": "Опишите другую причину.",
    "comment-too-long": "Комментарий слишком длинный.",
    "reply-needs-outcome": "Сначала примите решение: на подпись уходит ответ с решением.",
    "refusal-needs-ground": "Сначала укажите правовое основание отказа.",
  },
  commentRequired: (min) => `Опишите другую причину, не короче ${min} знаков.`,
  commentTooLong: (max, length) => `Не больше ${max} знаков, в комментарии ${length}.`,
  done: (id, stage) => `${id} теперь на этапе «${stage}».`,

  journal: "Журнал",
  journalCaption: "Каждый шаг по обращению: кто, когда и почему",
  action: {
    register: "Зарегистрировано",
    request_facts: "Запрошены факты",
    facts_received: "Факты получены",
    start_drafting: "Начат проект ответа",
    hand_over: "Передано на юридическую проверку",
    approve: "Согласовано на подпись",
    return: "Возвращено на доработку",
    send: "Отправлено",
    close: "Закрыто",
    extend: "Срок продлён на 10 рабочих дней",
    extension_withdrawn: "Продление отменено",
    undo: "Изменение отменено",
    edit: "Письмо отредактировано",
    sign: "Письмо подписано",
    defer: "Подпись отложена",
    breach_marked: "Выявлено нарушение стандарта",
    breach_withdrawn: "Отметка о нарушении стандарта снята",
    copy_sent: "Копия направлена",
    dispatch_cancelled: "Отправка отменена до ухода",
    removal_applied: "Банк подал в Банк России заявление об исключении сведений о клиенте",
    query_received: "В банк поступил запрос Банка России по заявлению клиента",
    query_answered: "Банк ответил на запрос Банка России",
  },
  move: (from, to) => `${from} → ${to}`,
  why: (reason) => `Причина: ${reason}`,
  said: (comment) => `Комментарий: ${comment}`,
  generated: "Из реестра",
  system: "Система",
  colleague: "Коллега",
  assistant: (name) => `Ассистент, подтвердил(а) ${name}`,
  person: (role, name) => `${role} ${name}`,

  letterRefusal: {
    "letter-undecided": "В письме ещё не указано решение: сначала укажите его или отредактируйте письмо.",
    "letter-not-signed": "Ответ уходит только подписанным: сначала подпишите письмо.",
    "letter-signed": "Письмо подписано: на доработку оно не возвращается.",
    "dispatch-from-case": "Подписанный ответ отправляется из обращения: с задержкой отправки и копиями.",
  },
  letter: {
    panel: "Письмо",
    asItStands: "Письмо в текущем виде",
    signedPanel: "Подписанное письмо",
    toBeSigned: (name, position) => `Подписывает ${name}, ${position}.`,
    signedBy: (name, position, time) => `Подписал(а) ${name}, ${position}, ${time}.`,
    position: "уполномоченное лицо банка",
    editedBy: (who, time) => `Отредактировал(а) ${who}, ${time}.`,
    otherLanguage: "Этот текст написан на другом языке стола и показан как написан.",
    fromRegister: "Проект ассистента, построенный по обращению так, как его готовит ассистент: в этой вкладке обращение не передавалось.",
    handedOver: (time) => `Проект ассистента, передан ${time}.`,
    notKept: "Письмо по обращению, отвеченному до открытия этой страницы, здесь не хранится.",
  },
  review: {
    findings: "Что находит рубрика",
    findingsNote: "Основания, возможности и сроки проверяются по проекту; длина предложений по тексту в текущем виде.",
    diff: "Изменения относительно проекта ассистента",
    diffCaption: "Удалённый и добавленный текст по порядку",
    diffNone: "Изменений нет: письмо совпадает с проектом ассистента.",
    diffStats: (changed, base, share) =>
      `Для показателя лёгкой правки: изменено ${changed} из ${base} знаков проекта (${share}), по большей стороне каждого изменённого фрагмента.`,
    edit: "Редактировать письмо",
    editTitle: (id) => `Письмо по ${id}`,
    editLabel: "Текст письма",
    editHelp: (max) => `Удобнее по одному предложению в строке. Не больше ${max} знаков.`,
    save: "Сохранить письмо",
    saved: (id) => `Письмо по ${id} сохранено.`,
    errors: {
      "letter-empty": "Письмо пустое.",
      "letter-too-long": (max, length) => `Не больше ${max} знаков, в письме ${length}.`,
      "letter-unchanged": "Ничего не изменилось.",
      "letter-signed": "Письмо подписано и больше не меняется.",
    },
    readOnly: "Письмо на проверке редактирует только юрист.",
  },
  signature: {
    panel: "Подпись",
    basis:
      "Закон не называет, кто подписывает ответ; ответ должен позволять заявителю установить организацию и уполномоченное должностное лицо (Банк России, вопросы и ответы по 442-ФЗ). Базовый стандарт МФО (ст. 18 п. 9, с 1 июля 2026 года) и базовый стандарт страховщиков (п. 4.1.3) требуют подписи руководителя, заместителя или уполномоченного лица.",
    decision: "Решение",
    decisions: { approve: "Согласовать", modify: "Изменить", override: "Заменить", defer: "Отложить" },
    decisionHelp: {
      approve: "Подписать письмо в предложенном виде.",
      modify: "Подписать со своими правками: сначала отредактируйте письмо.",
      override: "Заменить предложенное своим письмом: сначала отредактируйте его и объясните почему.",
      defer: "Не подписывать сейчас; обращение остаётся на подписи.",
    },
    concerns: "Сомнения",
    concernsHelp: (min) => `Что вас настораживает. Обязательно, кроме согласования, не короче ${min} знаков.`,
    wrong: "Что сделало бы это решение неверным",
    wrongHelp: (min) => `Факт, при котором это решение было бы ошибкой. Не короче ${min} знаков.`,
    sign: "Подписать письмо",
    defer: "Отложить подпись",
    signed: (id) => `Письмо по ${id} подписано.`,
    deferred: (id) => `Подпись по ${id} отложена.`,
    frozen: "Подписано: письмо больше не меняется.",
    sendNext: "Дальше: отправить подписанный ответ.",
    deferrals: "Отложенные подписи",
    record: (decision) => `Решение: ${decision}`,
    concernsSaid: (text) => `Сомнения: ${text}`,
    wrongSaid: (text) => `Что сделало бы решение неверным: ${text}`,
    errors: {
      "not-awaiting-signature": "Обращение не на подписи.",
      "letter-signed": "Письмо уже подписано.",
      "wrong-required": (min) => `Опишите, что сделало бы решение неверным, не короче ${min} знаков.`,
      "concerns-required": (min) => `Опишите сомнения, не короче ${min} знаков.`,
      "record-too-long": (max) => `Не больше ${max} знаков в каждом поле.`,
      "edit-first": "Сначала отредактируйте письмо: изменение или замена означают ваш собственный текст.",
      "edited-so-modify": "Вы изменили письмо: это изменение или замена, а не согласование в предложенном виде.",
      "letter-undecided": "В письме ещё не указано решение; оно не подписывается.",
    },
    notYours: (name) => `Подпись за подписантом ${name}.`,
  },
  dispatch: {
    panel: "Отправка и копии",
    dispatch: "Отправить ответ",
    help: "Высокий риск: ответ уходит заявителю. Он уходит после задержки, в течение которой отправку можно отменить; ушедший ответ не отзывается.",
    confirmTitle: (id) => `Отправить ответ по ${id}?`,
    confirmTo: (channel) => `Заявителю, канал: ${channel}.`,
    confirmCopies: "В тот же день нужно будет направить копии:",
    confirmNoCopies: "Копии по этому ответу не нужны.",
    confirmDelay: (seconds) => `Ответ уйдёт через ${seconds} с; до этого отправку можно отменить.`,
    confirm: "Отправить",
    keep: "Не отправлять",
    pending: (seconds) => `Уйдёт через ${seconds} с.`,
    pendingLabel: "Задержка отправки",
    cancel: "Отменить отправку",
    cancelled: (id) => `Ответ по ${id} не отправлен: отправка отменена.`,
    sent: (id) => `Ответ по ${id} отправлен.`,
    notYet: "Ответ уходит после подписи.",
    copies: "Копии",
    copy: {
      bank_of_russia: "Копия ответа в Банк России",
      sro: "Копии обращения и ответа в СРО",
      notice: "Копия уведомления о продлении в Банк России",
    },
    copyBasis:
      "Каждая копия направляется в день отправки подлинника: в Банк России по переданному им обращению (Закон о банках, ст. 30.1, ч. 15, и отраслевые статьи); в СРО, если небанковская организация выявила нарушение стандарта (151-ФЗ, ст. 9.1, ч. 12; закон № 4015-1, ст. 6.2, п. 8; 39-ФЗ, ст. 15.11, п. 5; 190-ФЗ, ст. 6.2, ч. 10).",
    due: (day) => `срок ${day}`,
    sentOn: (day) => `направлена ${day}`,
    markSent: "Отметить направленной",
    markedSent: (copy) => `${copy}: отмечена направленной.`,
    noCopies: "Копии по этому обращению не нужны.",
    breach: "Выявлено нарушение базового или внутреннего стандарта",
    breachRefused: "Нарушение отмечается для небанковской организации до отправки ответа.",
    breachHelp: "Для МФО, страховщика, брокера или кредитного кооператива: обращение и ответ уходят в СРО в день отправки ответа. Отмечается до отправки ответа.",
    extension: "Продлить срок ответа",
    extensionHelp: "На 10 рабочих дней, один раз, только для запроса документов, с мотивированным уведомлением заявителя.",
    extensionReason: "Причина: какие документы и у кого",
    extend: "Продлить на 10 рабочих дней",
    extended: (id, day) => `Срок ответа по ${id} продлён до ${day}.`,
    extensionRefusedBy: (words) => `Отказ по правилам: ${words}`,
    reasonRequired: (min) => `Укажите причину, не короче ${min} знаков.`,
    alreadyExtended: "Срок уже продлён; продление бывает один раз.",
    retention: (until, basis) => `Хранится до ${until}: три года со дня регистрации (${basis}).`,
    retentionNone: (until) => `Хранится до ${until}: 190-ФЗ, ст. 6.2, не устанавливает срок для кредитного кооператива; стол хранит обращение три года, как в других отраслях, по собственному решению.`,
    export: "Выгрузка для проверки",
    exportText: "Текст",
    exportCsv: "CSV",
    exported: "Выгрузка сохранена.",
    file: (id, ext) => `${id}-proverka.${ext}`,
  },
  inspection: {
    title: (id) => `Обращение ${id}: выгрузка для проверки`,
    taken: (day) => `Сроки на ${day}.`,
    synthetic: "Синтетические данные демонстрационного стола; реальных клиентов нет.",
    fields: {
      case: "Обращение",
      applicant: "Заявитель",
      stream: "Поток",
      organisation: "Организация",
      source: "Источник",
      received: "Поступило",
      registered: "Зарегистрировано",
      replyDue: "Срок ответа",
      stage: "Этап",
      retention: "Хранение",
    },
    derivation: "Как получен последний день ответа",
    journal: "Журнал",
    letter: "Письмо",
    noLetter: "Письмо в этой вкладке не хранится.",
    copies: "Копии",
    columns: { section: "Раздел", when: "Когда", who: "Кто", what: "Что", detail: "Подробности" },
  },
  handover: {
    recorded: (stage, who, time) => `В обращении: «${stage}», ${who}, ${time}.`,
    draftKept: "Проект сохранён в обращении для юриста; журнал запуска не меняется.",
    confirmTitle: "Передача ещё не отражена в обращении",
    confirmText: (stage) => `Подтвердите её, и обращение перейдёт на этап «${stage}» с этим проектом. Журнал запуска не меняется.`,
    confirm: "Подтвердить передачу",
    noDraft: "В этом запуске проект не подготовлен, передавать нечего.",
    notOperator: "Передачу подтверждает оператор: переключитесь на роль оператора.",
    already: (stage) => `Обращение уже на этапе «${stage}».`,
    final: "Отражено в обращении: вернуть на доработку может юрист.",
  },
  database: {
    panel: "База данных Банка России",
    record: "Копия записи в банке",
    received: "Получена от Банка России",
    own: "Заявление банка об исключении сведений",
    ownHelp:
      "Если у банка есть основания полагать, что сведения о клиенте включены необоснованно, банк вправе сам, без участия клиента, направить в Банк России мотивированное заявление (ч. 11.9 ст. 9 161-ФЗ). Банк России решает в течение 15 рабочих дней и направляет решение банку. Отправленное заявление не отзывается.",
    reasons: "Основания банка",
    reasonsHelp: (min) => `Почему сведения включены необоснованно, как это будет сказано в заявлении; не короче ${min} знаков.`,
    apply: "Подать заявление в Банк России",
    whoMay: "Заявление банка подаёт юрист или руководитель.",
    confirmTitle: (id) => `Подать заявление об исключении сведений по обращению ${id}?`,
    confirmText: "Заявление уйдёт в Банк России с этими основаниями и не отзывается. Клиент в нём не участвует.",
    confirm: "Направить заявление",
    keep: "Не сейчас",
    applied: (id) => `Обращение ${id}: заявление банка об исключении сведений о клиенте направлено в Банк России.`,
    sent: (day) => `Направлено в Банк России ${day}.`,
    decidesBy: (day, basis) => `Банк России решает не позднее ${day} (${basis}).`,
    errors: {
      "removal-not-client-data": "Такое заявление есть только в обращении о сведениях самого клиента в базе.",
      "removal-role": "Заявление банка подаёт юрист или руководитель.",
      "removal-already-sent": "Банк уже подал заявление по этому обращению.",
      "removal-reason-required": (min) => `Укажите основания банка, не короче ${min} знаков.`,
      "removal-reason-too-long": (max, length) => `В основаниях ${length} знаков; не больше ${max}.`,
    },
    query: "Запрос Банка России по заявлению самого клиента",
    queryHelp:
      "Клиент может подать заявление в Банк России сам, через интернет-приёмную. Банк узнаёт о нём из запроса Банка России и в течение 3 рабочих дней сообщает, обоснованно ли включены сведения (пп. 2.2, 2.9 Указания Банка России № 6748-У). Решение Банк России направляет клиенту по электронной почте, банку передавать нечего; если сведения исключены, банк сразу возобновляет приостановленную карту (ч. 11.11 ст. 9 161-ФЗ).",
    queryThroughBank: "Клиент подал заявление через банк, и банк передал свою позицию вместе с ним (п. 1.5 Указания Банка России № 6748-У).",
    recordQuery: "Отметить запрос, поступивший сегодня",
    queryWhoMay: "Запрос отмечает исполнитель обращения или руководитель.",
    queryRecorded: (id) => `Обращение ${id}: запрос Банка России отмечен, ответ нужен в течение 3 рабочих дней.`,
    queryReceived: (day) => `Запрос поступил в банк ${day}.`,
    answerDue: (day, basis) => `Ответить не позднее ${day} (${basis}).`,
    view: "Позиция банка",
    views: { justified: "Включены обоснованно", unjustified: "Включены необоснованно" },
    viewSaid: (view) => `Позиция: ${view}`,
    answerReasons: "Основания позиции банка",
    answerHelp: (min) => `На чём основана позиция банка, как это будет сказано в ответе; не короче ${min} знаков.`,
    answer: "Отметить ответ",
    answerWhoMay: "На запрос отвечает юрист или руководитель.",
    answeredToast: (id) => `Обращение ${id}: ответ банка на запрос Банка России отмечен.`,
    answered: (day, view) => `Ответ направлен ${day}: ${view}.`,
    afterAnswer: "Банк России решает в течение 15 рабочих дней со дня поступления заявления клиента и сообщает клиенту по электронной почте.",
    queryErrors: {
      "query-not-client-data": "Такой запрос бывает только в обращении о сведениях самого клиента в базе.",
      "query-through-bank": "Клиент подал заявление через банк, и банк уже передал свою позицию.",
      "query-role": "Этот шаг отмечает другая роль.",
      "query-already-received": "Запрос уже отмечен в обращении.",
      "query-not-received": "Запроса Банка России в обращении нет.",
      "query-already-answered": "Банк уже ответил на запрос.",
      "query-view-required": "Выберите позицию банка.",
      "query-reason-required": (min) => `Укажите основания банка, не короче ${min} знаков.`,
      "query-reason-too-long": (max, length) => `В основаниях ${length} знаков; не больше ${max}.`,
    },
  },
};

export const workflowStrings: Record<Lang, WorkflowStrings> = { ru, en };
