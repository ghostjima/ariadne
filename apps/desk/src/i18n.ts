// Interface strings in English and Russian. Numbers reach these functions
// already formatted in the interface's locale (digits and grouping), and
// as numbers where a word has to agree with them. The data itself
// (applicants, stages, column headers, complaint texts) comes from the
// engine's language modules, @ariadne/grid/pools/{en,ru}.

export type Lang = "ru" | "en";
/** Russian first, and the default; English second. */
export const LANGUAGES: Lang[] = ["ru", "en"];

/** The locale given to React Aria and Intl for each language. */
export const LOCALES: Record<Lang, string> = { ru: "ru-RU", en: "en-US" };

export const isLang = (v: string): v is Lang => (LANGUAGES as string[]).includes(v);

/** Russian plural form: one, few or many. */
function ru(n: number, one: string, few: string, many: string): string {
  const d = Math.abs(n) % 100;
  const u = d % 10;
  if (d > 10 && d < 20) return many;
  if (u === 1) return one;
  if (u >= 2 && u <= 4) return few;
  return many;
}

export type Strings = {
  title: string;
  subtitle: string;
  gridLabel: string;

  view: string;
  viewModified: string;
  unsavedView: string;
  saveView: string;
  saveViewTitle: string;
  viewName: string;
  viewNameHint: string;
  save: string;
  viewSaved: (name: string) => string;
  viewApplied: (name: string) => string;
  deleteView: string;
  deleteViewTitle: (name: string) => string;
  deleteViewBody: string;
  deleteViewConfirm: string;
  viewDeleted: (name: string) => string;
  copyLink: string;
  linkCopied: string;
  linkInAddressBar: string;
  viewNameErrors: { empty: string; tooLong: (max: string, length: string) => string; isPreset: string };

  role: string;
  roles: { operator: string; reviewer: string; signatory: string; supervisor: string };
  /** What a restricted role works on and may not do. */
  roleNotes: { operator: (name: string) => string; reviewer: (name: string) => string; signatory: (name: string) => string };
  roleHidden: (columns: string) => string;

  filtersLabel: string;
  groups: { stage: string; deadline: string; stream: string; source: string; copy: string };
  search: string;
  searchHint: string;
  clearFilters: string;
  shownOf: (shown: string, total: string, n: number) => string;
  countLoading: string;
  /** In brackets after the count. */
  countPending: (count: string) => string;
  countFailed: (count: string) => string;
  updating: string;
  /** The day every deadline is counted from. */
  asOf: (day: string) => string;

  density: string;
  densities: { compact: string; default: string; comfortable: string };

  columns: string;
  narrowHint: string;


  bulkLabel: string;
  bulkAssign: string;
  bulkAssignTitle: (count: string, n: number) => string;
  bulkAssignee: string;
  apply: string;
  bulkNeedsSupervisor: string;
  bulkDone: (assignee: string, count: string, n: number) => string;
  bulkSkipped: (count: string) => string;
  undo: string;
  undone: (count: string, n: number) => string;
  undoConflicts: (count: string, n: number) => string;
  nothingToUndo: string;

  editSaved: (id: string, column: string, value: string) => string;
  editRefused: (id: string, reason: string) => string;
  editErrors: {
    valueUnknown: string;
    roleCannotEdit: (column: string) => string;
    stageNotForRole: string;
    transitionNotAllowed: string;
    reasonRequired: string;
    replyNeedsOutcome: string;
    refusalNeedsGround: string;
    groundOtherStream: string;
    sendNeedsSignature: string;
    replyLocked: string;
    extensionNotAllowed: string;
    extensionTooLate: (day: string) => string;
    extensionAfterReply: string;
    noteTooLong: (max: string, length: string) => string;
  };
  emptyNote: string;

  conflictTitle: string;
  conflictBody: (id: string, column: string) => string;
  theirs: string;
  yours: string;
  started: string;
  keepTheirs: string;
  useMine: string;
  conflictUndecided: string;
  keptTheirs: (id: string) => string;
  usedMine: (id: string) => string;
  colleagueEditing: (id: string, column: string, value: string) => string;
  colleagueChanged: (id: string, column: string, value: string) => string;
  simulateColleague: string;
  demoTitle: string;
  demoData: (total: string, open: string) => string;
  demoColleague: (seconds: string) => string;
  demoColleagueOff: string;

  exportCsv: string;
  exported: (count: string, n: number) => string;
  exportedCapped: (count: string, total: string) => string;
  csvFile: string;

  generating: string;
  emptyTitle: string;
  emptyBody: string;
  chunkErrorTitle: string;
  chunkErrorRange: (from: string, to: string) => string;
  retry: string;
  workerFallback: string;
  actionsLabel: string;

  shortcuts: string;
  shortcutsTitle: string;
  shortcutGroups: { grid: string; editing: string; selection: string; app: string };
  keys: {
    move: string;
    rowStart: string;
    rowEnd: string;
    gridStart: string;
    gridEnd: string;
    pageUp: string;
    pageDown: string;
    sort: string;
    edit: string;
    saveEdit: string;
    cancelEdit: string;
    selectRow: string;
    extend: string;
    selectAll: string;
    search: string;
    help: string;
    undo: string;
    grid: string;
    clear: string;
    export: string;
    colleague: string;
    saveView: string;
  };

  /** The open case: its card, and the way back to the queue. */
  case: CaseStrings;

  performance: string;
  perfNote: string;
  firstRows: string;
  filterLatency: string;
  sortLatency: string;
  roundTrip: string;
  workerCompute: string;
  rowsLoaded: string;
  computedOn: string;
  modeWorker: string;
  modeMain: string;
  ms: string;
  medianP95: (p50: string, p95: string) => string;
  samples: (n: string) => string;
  notYet: string;
};

export type CountUnit = "working_days" | "calendar_days" | "calendar_days_to_working_day" | "next_working_day" | "same_day" | "months" | "years";

export type CaseStrings = {
  open: string;
  openCase: (id: string) => string;
  back: string;
  region: (id: string, name: string) => string;
  /** On a narrow screen the card and the assistant are two tabs. */
  panels: string;
  card: string;
  notFound: (id: string) => string;
  shortcuts: string;
  keysGroup: string;
  keys: { open: string; back: string };
  complaint: string;
  subject: string;
  text: string;
  channel: string;
  received: string;
  source: string;
  forwarded: string;
  /** The complaint holds text addressed to an assistant or a system. */
  injected: string;
  applicant: string;
  name: string;
  applicantType: string;
  operation: string;
  operationKind: string;
  reference: string;
  operationDay: string;
  amount: string;
  claim: string;
  claimOmbudsman: string;
  claimAbove: string;
  noOperation: string;
  flags: string;
  noFlags: string;
  sign: (number: string) => string;
  signRefused: (operation: string) => string;
  signSuspended: (operation: string) => string;
  signWording: string;
  signSummary: string;
  amlDecision: (category: string, basis: string) => string;
  /** Every dated term ariadne-rules gives beyond the reply's own, by code */
  flagDeadline: Record<string, string>;
  /** The measures taken, by code */
  measure: Record<string, string>;
  /** The day a measure stopped applying, under it */
  measureEnded: (day: string) => string;
  /** Under a monthly limit: what the law leaves open about the month */
  monthNote: string;
  /** The provision a measure or a term rests on, under it */
  basisLine: (basis: string) => string;
  /** The duties tied to an event, the storage term and the rules' notes */
  duties: string;
  noDuties: string;
  duty: Record<string, string>;
  dutyWhen: Record<string, string>;
  dutyLine: (when: string, basis: string) => string;
  keptUntil: string;
  warnings: string;
  warning: Record<string, string>;
  timeline: string;
  event: {
    received: (channel: string) => string;
    forwarded: string;
    registered: string;
    registeredLate: string;
    registrationNotice: (channel: string) => string;
    extended: (until: string) => string;
    replySent: (channel: string) => string;
    replySentLate: string;
    copy: string;
    closed: string;
    replyDue: string;
  };
  related: string;
  relatedNone: string;
  relation: { linked: string; links_here: string; same_applicant: string };
  relatedColumns: { case: string; relation: string; stream: string; stage: string; left: string };
  deadline: string;
  derivation: string;
  step: { received: string; registration: string; reply: string; daysOff: string; extension: string; left: string };
  count: (from: string, value: string, unit: CountUnit, n: number) => string;
  daysOffFormula: (calendar: string, working: string) => string;
  daysOffValue: (total: string, n: number, weekend: string, holidays: string) => string;
  holidays: (list: string) => string;
  workingWeekends: (count: string) => string;
  registeredLateNote: string;
  extensionTaken: (due: string) => string;
  extensionPossible: (notice: string) => string;
  extensionRefused: string;
  extensionRefusal: Record<string, string>;
  leftFormula: (from: string, to: string) => string;
  conservative: string;
};

const en: Strings = {
  title: "Ariadne Desk",
  subtitle: "Complaints and refusals, each with its legal deadline",
  gridLabel: "Cases",

  view: "View",
  viewModified: "Modified",
  unsavedView: "Unsaved view",
  saveView: "Save view",
  saveViewTitle: "Save the view",
  viewName: "Name",
  viewNameHint: "Filters, search, columns, sort and density are saved in this browser.",
  save: "Save",
  viewSaved: (name) => `View “${name}” saved.`,
  viewApplied: (name) => `View “${name}” applied.`,
  deleteView: "Delete view",
  deleteViewTitle: (name) => `Delete the view “${name}”?`,
  deleteViewBody: "The saved filters, columns and sort of this view are removed from this browser.",
  deleteViewConfirm: "Delete view",
  viewDeleted: (name) => `View “${name}” deleted.`,
  copyLink: "Copy link",
  linkCopied: "A link to this view is in the address bar and on the clipboard.",
  linkInAddressBar: "A link to this view is in the address bar.",
  viewNameErrors: {
    empty: "Give the view a name.",
    tooLong: (max, length) => `At most ${max} characters; this name has ${length}.`,
    isPreset: "That name belongs to a built-in view.",
  },

  role: "Role",
  roles: { operator: "Operator", reviewer: "Reviewer", signatory: "Signatory", supervisor: "Supervisor" },
  roleNotes: {
    operator: (name) => `The operator works the cases assigned to ${name}: facts, the decision and its ground, then the handover to legal review. Approval, sending, extensions, bulk changes and export are not theirs.`,
    reviewer: (name) => `The legal reviewer (${name}) sees every case, approves a reply for signature or returns it for rework with a reason, and states the decision and its ground.`,
    signatory: (name) => `The signatory signs and sends the replies assigned to ${name}, or returns one for rework with a reason.`,
  },
  roleHidden: (columns) => `Hidden for this role: ${columns}.`,

  filtersLabel: "Filters",
  groups: { stage: "Stage", deadline: "Deadline", stream: "Stream", source: "Source", copy: "Copies" },
  search: "Search",
  searchHint: "Case, applicant, subject, operation, assignee or note",
  clearFilters: "Clear filters",
  // The noun agrees with the total: "1 of 1,200 cases".
  shownOf: (shown, total) => `${shown} of ${total} ${total === "1" ? "case" : "cases"}`,
  countLoading: "Loading cases",
  countPending: (count) => `(${count} still loading)`,
  countFailed: (count) => `(${count} did not load)`,
  updating: "Updating",
  asOf: (day) => `Deadlines as of ${day}`,

  density: "Density",
  densities: { compact: "Compact", default: "Regular", comfortable: "Comfortable" },

  columns: "Columns",
  narrowHint: "Scroll the grid sideways for the other columns.",


  bulkLabel: "Bulk change",
  bulkAssign: "Reassign",
  bulkAssignTitle: (count, n) => `Reassign ${count} ${n === 1 ? "case" : "cases"}`,
  bulkAssignee: "Assign to",
  apply: "Apply",
  bulkNeedsSupervisor: "Reassigning cases needs the supervisor role.",
  bulkDone: (assignee, count, n) => `${count} ${n === 1 ? "case" : "cases"} assigned to ${assignee}.`,
  bulkSkipped: (count) => `Skipped ${count}.`,
  undo: "Undo",
  undone: (count, n) => `Undone on ${count} ${n === 1 ? "case" : "cases"}.`,
  undoConflicts: (count, n) => `${count} ${n === 1 ? "was" : "were"} changed by a colleague since and kept as they are.`,
  nothingToUndo: "Nothing to undo.",

  editSaved: (id, column, value) => `${id}: ${column} is now “${value}”.`,
  editRefused: (id, reason) => `${id} not changed: ${reason}`,
  editErrors: {
    valueUnknown: "Choose one of the listed values.",
    roleCannotEdit: (column) => `This role does not change ${column}.`,
    stageNotForRole: "This role cannot move a case to that stage.",
    transitionNotAllowed: "A case does not go to that stage from this one.",
    reasonRequired: "A return for rework needs a reason: return the case from its page.",
    replyNeedsOutcome: "Decide the outcome before signature.",
    refusalNeedsGround: "A refusal needs a legal ground. Choose the ground first.",
    groundOtherStream: "This ground belongs to another stream: 161-FZ and 115-FZ grounds are not mixed.",
    sendNeedsSignature: "A reply goes out only after the signatory has it.",
    replyLocked: "The reply is with the signatory. Return it to drafting to change it.",
    extensionNotAllowed: "A money claim under 123-FZ cannot be extended.",
    extensionTooLate: (day) => `Too late to extend: the notice was due by ${day}.`,
    extensionAfterReply: "The reply has gone out; there is nothing to extend.",
    noteTooLong: (max, length) => `At most ${max} characters; this note has ${length}.`,
  },
  emptyNote: "(empty)",

  conflictTitle: "Changed while you were editing",
  conflictBody: (id, column) => `A colleague changed ${column} of ${id} after you opened it. Choose the value to keep.`,
  theirs: "Colleague’s value",
  yours: "Your value",
  started: "When you started",
  keepTheirs: "Keep theirs",
  useMine: "Use mine",
  conflictUndecided: "Your value is not saved yet. “Use mine” saves it; “Keep theirs” discards it.",
  keptTheirs: (id) => `${id}: the colleague’s value was kept.`,
  usedMine: (id) => `${id}: your value was saved.`,
  colleagueEditing: (id, column, value) => `A colleague changed the cell you are editing (${id}, ${column}) to “${value}”.`,
  colleagueChanged: (id, column, value) => `A colleague set ${column} of ${id} to “${value}”.`,
  simulateColleague: "Colleague’s edit",
  demoTitle: "About this demo",
  demoData: (total, open) => `Demo: ${total} invented complaints, ${open} of them open.`,
  demoColleague: (seconds) => `A simulated colleague edits one about every ${seconds} seconds; edit the same cell to see a conflict.`,
  demoColleagueOff: "The simulated colleague is off on this page; “Colleague’s edit” makes one change.",

  exportCsv: "Export CSV",
  exported: (count, n) => `Exported ${count} ${n === 1 ? "row" : "rows"}.`,
  exportedCapped: (count, total) => `Exported the first ${count} of ${total} rows.`,
  csvFile: "complaints.csv",

  generating: "Generating the register",
  emptyTitle: "No cases match",
  emptyBody: "No case fits these filters and this search.",
  chunkErrorTitle: "Some cases did not load",
  chunkErrorRange: (from, to) => `Rows ${from} to ${to} are missing.`,
  retry: "Retry",
  workerFallback: "The background worker is unavailable, so filtering and sorting run on the page itself and may be slower.",
  actionsLabel: "Actions",

  shortcuts: "Shortcuts",
  shortcutsTitle: "Keyboard shortcuts",
  shortcutGroups: { grid: "Grid", editing: "Editing", selection: "Selection", app: "Desk" },
  keys: {
    move: "Move the active cell",
    rowStart: "First cell of the row",
    rowEnd: "Last cell of the row",
    gridStart: "First cell of the grid",
    gridEnd: "Last cell of the grid",
    pageUp: "A page up",
    pageDown: "A page down",
    sort: "On a header: sort by the column",
    edit: "Edit the cell",
    saveEdit: "Save the edit",
    cancelEdit: "Cancel the edit",
    selectRow: "Select or release the row",
    extend: "Extend the selection",
    selectAll: "Select every row shown",
    search: "Search",
    help: "Show these shortcuts",
    undo: "Undo the last change",
    grid: "Go to the grid",
    clear: "Clear filters",
    export: "Export CSV",
    colleague: "Simulate a colleague’s edit",
    saveView: "Save the view",
  },

  case: {
    open: "Open case",
    openCase: (id) => `Open case ${id}`,
    back: "Back to the queue",
    region: (id, name) => `${id}, ${name}`,
    panels: "The case and the assistant",
    card: "Case",
    notFound: (id) => `There is no case ${id}.`,
    shortcuts: "Shortcuts",
    keysGroup: "Case",
    keys: { open: "Open the case of the active row", back: "Back to the queue" },
    complaint: "Complaint",
    subject: "Subject",
    text: "As the applicant wrote it",
    channel: "Channel",
    received: "Received",
    source: "Source",
    forwarded: "Forwarded by the Bank of Russia: every notice and the reply are copied to it on the day they go out.",
    injected: "This complaint contains instructions addressed to an assistant or a system. They are the applicant's words: shown here, never followed. The assistant is not given the complaint's text.",
    applicant: "Applicant",
    name: "Name",
    applicantType: "Type",
    operation: "Operation",
    operationKind: "Kind",
    reference: "Reference",
    operationDay: "Day",
    amount: "Amount",
    claim: "Money claimed",
    claimOmbudsman: "Within 123-FZ: the reply term is the financial ombudsman law's, and it cannot be extended.",
    claimAbove: "Above 500,000 roubles: outside the financial ombudsman's limit, so a complaint under 442-FZ.",
    noOperation: "No operation",
    flags: "Flags",
    noFlags: "No antifraud or anti-money-laundering flag on this case.",
    sign: (number) => `Sign ${number} of Bank of Russia Order No. OD-2506`,
    signRefused: (operation) => `${operation}: refused`,
    signSuspended: (operation) => `${operation}: suspended`,
    signWording: "The order's wording",
    signSummary: "In short",
    amlDecision: (category, basis) => `${category} (${basis})`,
    flagDeadline: {
      antifraud_suspension_ends: "The suspension ends",
      antifraud_confirmation: "Last day for the client to confirm the order",
      aml_reasons_notice: "The date and the reasons of the decision are due to the client",
      aml_documents_answer: "The answer to the client's documents is due",
      high_risk_notice: "The notice of the measures is due",
      high_risk_commission_application: "Last day for the client to apply to the commission",
      no_substance_notice: "The notice of no reply on the substance is due",
      stop_correspondence_notice: "The notice of stopping the correspondence is due",
      antifraud_repeat_suspension_ends: "The second suspension ends",
      antifraud_after_repeat_suspension: "The confirmed order is carried out",
      antifraud_repeat_refusal_ends: "The two days after the refused repeat end",
      antifraud_after_repeat_refusal: "From this day the client's next repeat goes through",
      instrument_suspension_notice: "The client is told of the suspension and its reason",
      exclusion_forwarding: "The application goes to the Bank of Russia, with the bank's view",
      exclusion_refusal_notice: "The refusal to forward the application is due to the client",
      exclusion_decision: "The Bank of Russia decides on the application",
      exclusion_decision_relay: "The Bank of Russia's decision goes on to the client",
      bank_of_russia_query_answer: "The answer to the Bank of Russia's request is due",
      antifraud_refund: "The refund to the client is due",
      aml_commission_decision: "The commission decides",
      commission_request_answer: "The bank's justification is due to the commission",
      commission_decision_notice: "The commission's decision is due to the client and the bank",
      high_risk_rating_review: "The Bank of Russia answers on the risk rating",
      operator_application_decision: "The Bank of Russia decides on the bank's own application to remove the client's data",
    },
    measure: {
      suspend_order: "The transfer order suspended for two days",
      refuse_operation: "The operation refused",
      suspend_confirmed_order: "The confirmed order suspended again for two days: the Bank of Russia's database answered after the confirmation",
      refuse_repeat: "The repeated operation refused: the Bank of Russia's database answered after the repeat",
      order_not_accepted: "The order counts as not accepted: it was confirmed after its window",
      suspend_instrument: "The client's card or online banking suspended: the client's own data are in the Bank of Russia's database",
      cap_transfers: "Not suspended: the client's transfers to individuals capped at 100,000 roubles a month while the client's own data are in the Bank of Russia's database",
      cap_atm_cash:
        "ATM cash capped at 100,000 roubles a month from the day the bank received the database information, while the client's data are in the Bank of Russia's database",
    },
    measureEnded: (day) => `Ended on ${day}`,
    monthNote: "The law says \"a month\" and not how the month is counted. The desk states the limit and its first day; it counts no month.",
    basisLine: (basis) => `Ground: ${basis}`,
    duties: "Duties and storage",
    noDuties: "No duty tied to an event.",
    duty: {
      copy_to_bank_of_russia: "A copy of the reply and of each notice to the Bank of Russia",
      copy_to_sro: "A copy of the complaint and of the reply to the self-regulatory organisation",
      notify_client_of_block: "Tell the client of the block, advise against a repeat of the fraud, and say how to confirm or repeat",
      notify_client_of_repeat_block: "Tell the client of the second step: its reason, its term, and that a later repeat is possible",
      notify_client_of_right_to_apply: "Tell the client of the suspension and of the right to apply to the Bank of Russia, through the bank too, to remove the data",
      restore_instrument: "Restore the card or online banking and tell the client",
    },
    dutyWhen: {
      immediately: "at once",
      same_day_as_each_dispatch: "the day each goes to the applicant",
      same_day_as_reply: "the day the reply goes out",
    },
    dutyLine: (when, basis) => `${when}; ${basis}`,
    keptUntil: "Kept",
    warnings: "What the rules note",
    warning: {
      registration_date_assumed: "No registration day was given: the earliest possible one is assumed, which gives the earliest reply day.",
      registered_late: "Registered after the working day following receipt.",
      money_claim_outside_ombudsman: "A money claim with no amount or over 500,000 roubles: the complaint article's terms apply.",
      money_claim_from_legal_entity: "A money claim from a company: 123-FZ covers consumers only.",
      ombudsman_participation_unknown: "A securities market professional takes part in the ombudsman's procedure only by choice: the earlier reply day applies, with no extension.",
      breach_date_unknown: "A claim on the standard form with no day of the breach: the earlier reply day applies.",
      confirmation_late: "The client confirmed after the day following the suspension: the order counts as not accepted, and a later database answer suspends nothing.",
      confirmation_date_missing: "The database answered after a confirmation whose day is not given: no second step is counted.",
      refund_for_individuals_only: "The 30-day refund of 161-FZ art. 8 part 3.13 is owed to individuals only.",
      high_risk_for_legal_entities_only: "The high-risk group of 115-FZ art. 7.7 is for companies and sole traders only.",
      documents_answer_beyond_text: "115-FZ gives the 7-day answer on documents against a refused operation or contract; it is given for a terminated contract too, beyond the text.",
      sro_copy_not_applicable: "A bank has no self-regulatory organisation to copy a standard breach to.",
      ombudsman_term_may_have_passed:
        "More than three years passed between the breach and the claim: the ombudsman counts them from the day the consumer learned of the breach, and may restore the term (123-FZ art. 15 parts 1 and 4). The reply term is unchanged.",
      storage_term_not_set: "190-FZ art. 6.2 sets no term for a credit cooperative to keep complaints, replies and notices.",
      commission_term_below_minimum: "The commission's request gives less than the 3 working days 115-FZ art. 7 item 13.6 guarantees: its own, earlier day is kept.",
      commission_term_assumed: "The commission's request gives no term: the least the law allows, 3 working days, is taken.",
      transfer_cap_for_individuals_only: "The transfer cap of 161-FZ art. 9 part 11.6 is an individual's: a company whose card is not suspended has none.",
      database_information_date_assumed:
        "The day the bank received the database information is not known. The ATM cash cap runs from that day (Banking Law art. 30 part 16); it is dated here by the day the bank acted on the data, the latest it can have started.",
    },
    timeline: "Channel timeline",
    event: {
      received: (channel) => `Received: ${channel}`,
      forwarded: "forwarded by the Bank of Russia",
      registered: "Registered",
      registeredLate: "Registered after the next working day",
      registrationNotice: (channel) => `Registration notice: ${channel}`,
      extended: (until) => `Extension notice due; the reply is now due by ${until}`,
      replySent: (channel) => `Reply sent: ${channel}`,
      replySentLate: "Reply sent after its last day",
      copy: "Copy of the reply to the Bank of Russia",
      closed: "Closed",
      replyDue: "Reply due",
    },
    related: "Linked cases",
    relatedNone: "No linked case.",
    relation: { linked: "This case is linked to it", links_here: "Linked to this case", same_applicant: "Same applicant" },
    relatedColumns: { case: "Case", relation: "Relation", stream: "Stream", stage: "Stage", left: "Time left" },
    deadline: "Deadline",
    derivation: "How the reply's last day was worked out",
    step: {
      received: "Received",
      registration: "Registration",
      reply: "Reply term",
      daysOff: "Days off in the term",
      extension: "Extension",
      left: "Time left",
    },
    count: (from, value, unit, n) =>
      ({
        working_days: `${from} + ${value} working ${n === 1 ? "day" : "days"}`,
        calendar_days: `${from} + ${value} calendar ${n === 1 ? "day" : "days"}`,
        calendar_days_to_working_day: `${from} + ${value} calendar ${n === 1 ? "day" : "days"}, then the next working day`,
        next_working_day: `the working day after ${from}`,
        same_day: from,
        months: `${from} + ${value} ${n === 1 ? "month" : "months"}`,
        years: `${from} + ${value} ${n === 1 ? "year" : "years"}`,
      })[unit] ?? `${from} + ${value}`,
    daysOffFormula: (calendar, working) => `${calendar} − ${working}`,
    daysOffValue: (total, n, weekend, holidays) => `${total} ${n === 1 ? "day" : "days"} off: weekend days ${weekend}${holidays ? `; ${holidays}` : ""}`,
    holidays: (list) => `holidays and moved days off ${list}`,
    workingWeekends: (count) => `${count} Saturday made a working day, counted`,
    registeredLateNote: "registered late",
    extensionTaken: (due) => `Extended to ${due}`,
    extensionPossible: (notice) => `Not asked; possible with a notice by ${notice}`,
    extensionRefused: "Not allowed",
    extensionRefusal: {
      extension_not_allowed: "Not allowed: a money claim under 123-FZ is not extended",
      extension_ground_not_allowed: "Not allowed on this ground",
      extension_too_long: "Longer than the law allows",
    },
    leftFormula: (from, to) => `working days from ${from} to ${to}`,
    conservative: "conservative reading",
  },

  performance: "Performance",
  perfNote:
    "Measured in this tab. First rows: from navigation to the first painted frame with rows. Filter and sort: from the input to the repainted grid. Worker round trip: from posting a query to receiving its result. Compute: sorting, search and filtering inside the worker.",
  firstRows: "First rows",
  filterLatency: "Filter",
  sortLatency: "Sort",
  roundTrip: "Worker round trip",
  workerCompute: "Compute",
  rowsLoaded: "Rows loaded",
  computedOn: "Computed on",
  modeWorker: "Worker",
  modeMain: "Main thread",
  ms: "ms",
  medianP95: (p50, p95) => `median ${p50}, p95 ${p95}`,
  samples: (n) => `samples: ${n}`,
  notYet: "not yet",
};

const ruStrings: Strings = {
  title: "Ariadne Стол заявок",
  subtitle: "Жалобы и отказы, у каждой свой законный срок",
  gridLabel: "Обращения",

  view: "Вид",
  viewModified: "Изменён",
  unsavedView: "Несохранённый вид",
  saveView: "Сохранить вид",
  saveViewTitle: "Сохранение вида",
  viewName: "Название",
  viewNameHint: "Фильтры, поиск, столбцы, сортировка и плотность сохранятся в этом браузере.",
  save: "Сохранить",
  viewSaved: (name) => `Вид «${name}» сохранён.`,
  viewApplied: (name) => `Применён вид «${name}».`,
  deleteView: "Удалить вид",
  deleteViewTitle: (name) => `Удалить вид «${name}»?`,
  deleteViewBody: "Сохранённые фильтры, столбцы и сортировка этого вида будут удалены из браузера.",
  deleteViewConfirm: "Удалить вид",
  viewDeleted: (name) => `Вид «${name}» удалён.`,
  copyLink: "Скопировать ссылку",
  linkCopied: "Ссылка на этот вид в адресной строке и в буфере обмена.",
  linkInAddressBar: "Ссылка на этот вид в адресной строке.",
  viewNameErrors: {
    empty: "Дайте виду название.",
    tooLong: (max, length) => `Не больше ${max} символов, а в названии ${length}.`,
    isPreset: "Это название встроенного вида.",
  },

  role: "Роль",
  roles: { operator: "Оператор", reviewer: "Юрист", signatory: "Подписант", supervisor: "Руководитель" },
  roleNotes: {
    operator: (name) => `Оператор ведёт обращения, назначенные на исполнителя ${name}: факты, решение и его основание, затем передача на юридическую проверку. Согласование, отправка, продление, массовые изменения и выгрузка ему недоступны.`,
    reviewer: (name) => `Юрист (${name}) видит все обращения, согласует ответ на подпись или возвращает его на доработку с причиной, указывает решение и его основание.`,
    signatory: (name) => `Подписант (${name}) подписывает и отправляет назначенные ему ответы или возвращает ответ на доработку с причиной.`,
  },
  roleHidden: (columns) => `Скрыто для этой роли: ${columns}.`,

  filtersLabel: "Фильтры",
  groups: { stage: "Этап", deadline: "Срок", stream: "Поток", source: "Источник", copy: "Копии" },
  search: "Поиск",
  searchHint: "Номер, заявитель, тема, операция, исполнитель или заметка",
  clearFilters: "Сбросить фильтры",
  shownOf: (shown, total, n) => `${shown} ${ru(n, "обращение", "обращения", "обращений")} из ${total}`,
  countLoading: "Загрузка обращений",
  countPending: (count) => `(ещё загружается: ${count})`,
  countFailed: (count) => `(не загружено: ${count})`,
  updating: "Обновление",
  asOf: (day) => `Сроки на ${day}`,

  density: "Плотность",
  densities: { compact: "Плотно", default: "Обычно", comfortable: "Просторно" },

  columns: "Столбцы",
  narrowHint: "Остальные столбцы видны при прокрутке таблицы вбок.",


  bulkLabel: "Массовое изменение",
  bulkAssign: "Переназначить",
  bulkAssignTitle: (count, n) => `Переназначить ${count} ${ru(n, "обращение", "обращения", "обращений")}`,
  bulkAssignee: "Исполнитель",
  apply: "Применить",
  bulkNeedsSupervisor: "Переназначать обращения может руководитель.",
  bulkDone: (assignee, count, n) => `${count} ${ru(n, "обращение назначено", "обращения назначены", "обращений назначено")} на исполнителя ${assignee}.`,
  bulkSkipped: (count) => `Пропущено: ${count}.`,
  undo: "Отменить",
  undone: (count, n) => `Отменено у ${count} ${ru(n, "обращения", "обращений", "обращений")}.`,
  undoConflicts: (count) => `Изменённые коллегой после этого оставлены как есть: ${count}.`,
  nothingToUndo: "Отменять нечего.",

  editSaved: (id, column, value) => `${id}: ${column} теперь «${value}».`,
  editRefused: (id, reason) => `${id} не изменено: ${reason}`,
  editErrors: {
    valueUnknown: "Выберите одно из значений списка.",
    roleCannotEdit: (column) => `Эта роль не меняет поле «${column}».`,
    stageNotForRole: "Эта роль не может перевести обращение на этот этап.",
    transitionNotAllowed: "С этого этапа обращение не переходит на выбранный.",
    reasonRequired: "Возврат на доработку требует причины: верните обращение на его странице.",
    replyNeedsOutcome: "До подписи нужно принять решение.",
    refusalNeedsGround: "Для отказа нужно правовое основание. Сначала выберите основание.",
    groundOtherStream: "Это основание другого потока: основания 161-ФЗ и 115-ФЗ не смешиваются.",
    sendNeedsSignature: "Ответ отправляется только после передачи на подпись.",
    replyLocked: "Ответ на подписи. Чтобы изменить его, верните его в черновик.",
    extensionNotAllowed: "Денежное требование по 123-ФЗ продлить нельзя.",
    extensionTooLate: (day) => `Продлевать поздно: уведомление нужно было направить до ${day}.`,
    extensionAfterReply: "Ответ уже отправлен, продлевать нечего.",
    noteTooLong: (max, length) => `Не больше ${max} символов, а в заметке ${length}.`,
  },
  emptyNote: "(пусто)",

  conflictTitle: "Изменено, пока вы редактировали",
  conflictBody: (id, column) => `Коллега изменил поле «${column}» обращения ${id} после того, как вы его открыли. Выберите, какое значение оставить.`,
  theirs: "Значение коллеги",
  yours: "Ваше значение",
  started: "Когда вы начали",
  keepTheirs: "Оставить их",
  useMine: "Сохранить моё",
  conflictUndecided: "Ваше значение ещё не сохранено. «Сохранить моё» сохранит его, «Оставить их» отбросит.",
  keptTheirs: (id) => `${id}: оставлено значение коллеги.`,
  usedMine: (id) => `${id}: сохранено ваше значение.`,
  colleagueEditing: (id, column, value) => `Коллега изменил ячейку, которую вы редактируете (${id}, ${column}), на «${value}».`,
  colleagueChanged: (id, column, value) => `Коллега изменил поле «${column}» обращения ${id} на «${value}».`,
  simulateColleague: "Правка коллеги",
  demoTitle: "Об этой демонстрации",
  demoData: (total, open) => `Демонстрация: ${total} выдуманных обращений, в работе ${open}.`,
  demoColleague: (seconds) => `Имитируемый коллега меняет одно из них примерно раз в ${seconds} с; измените ту же ячейку, чтобы увидеть конфликт.`,
  demoColleagueOff: "Имитируемый коллега на этой странице выключен; «Правка коллеги» вносит одну правку.",

  exportCsv: "Выгрузить CSV",
  exported: (count, n) => `Выгружено: ${count} ${ru(n, "строка", "строки", "строк")}.`,
  exportedCapped: (count, total) => `Выгружены первые ${count} строк из ${total}.`,
  csvFile: "obrashcheniya.csv",

  generating: "Создание реестра",
  emptyTitle: "Обращений не найдено",
  emptyBody: "Ни одно обращение не подходит под эти фильтры и поиск.",
  chunkErrorTitle: "Часть обращений не загрузилась",
  chunkErrorRange: (from, to) => `Нет строк с ${from} по ${to}.`,
  retry: "Повторить",
  workerFallback: "Фоновый поток недоступен, поэтому фильтры и сортировка выполняются на самой странице и могут работать медленнее.",
  actionsLabel: "Действия",

  shortcuts: "Клавиши",
  shortcutsTitle: "Сочетания клавиш",
  shortcutGroups: { grid: "Таблица", editing: "Редактирование", selection: "Выбор", app: "Рабочее место" },
  keys: {
    move: "Перейти к соседней ячейке",
    rowStart: "Первая ячейка строки",
    rowEnd: "Последняя ячейка строки",
    gridStart: "Первая ячейка таблицы",
    gridEnd: "Последняя ячейка таблицы",
    pageUp: "На страницу вверх",
    pageDown: "На страницу вниз",
    sort: "На заголовке: сортировать по столбцу",
    edit: "Изменить ячейку",
    saveEdit: "Сохранить правку",
    cancelEdit: "Отменить правку",
    selectRow: "Выбрать строку или снять выбор",
    extend: "Расширить выбор",
    selectAll: "Выбрать все показанные строки",
    search: "Поиск",
    help: "Показать эти сочетания",
    undo: "Отменить последнее изменение",
    grid: "Перейти к таблице",
    clear: "Сбросить фильтры",
    export: "Выгрузить CSV",
    colleague: "Сымитировать правку коллеги",
    saveView: "Сохранить вид",
  },

  case: {
    open: "Открыть обращение",
    openCase: (id) => `Открыть обращение ${id}`,
    back: "К очереди",
    region: (id, name) => `${id}, ${name}`,
    panels: "Обращение и ассистент",
    card: "Обращение",
    notFound: (id) => `Обращения ${id} нет.`,
    shortcuts: "Клавиши",
    keysGroup: "Обращение",
    keys: { open: "Открыть обращение активной строки", back: "Вернуться к очереди" },
    complaint: "Жалоба",
    subject: "Тема",
    text: "Как написал заявитель",
    channel: "Канал",
    received: "Поступила",
    source: "Источник",
    forwarded: "Перенаправлена Банком России: копию каждого уведомления и ответа направляем ему в день отправки заявителю.",
    injected: "В обращении есть указания, адресованные ассистенту или системе. Это слова заявителя: они показаны здесь и не выполняются. Текст обращения ассистенту не передаётся.",
    applicant: "Заявитель",
    name: "Имя",
    applicantType: "Тип",
    operation: "Операция",
    operationKind: "Вид",
    reference: "Номер",
    operationDay: "Дата",
    amount: "Сумма",
    claim: "Требование",
    claimOmbudsman: "В рамках 123-ФЗ: срок ответа по закону о финансовом уполномоченном, продлить его нельзя.",
    claimAbove: "Больше 500 000 ₽: за пределом финансового уполномоченного, поэтому жалоба по 442-ФЗ.",
    noOperation: "Без операции",
    flags: "Признаки и решения",
    noFlags: "По этому обращению нет признаков антифрода и решений по 115-ФЗ.",
    sign: (number) => `Признак ${number} приказа Банка России № ОД-2506`,
    signRefused: (operation) => `${operation}: отказ`,
    signSuspended: (operation) => `${operation}: приостановлено`,
    signWording: "Формулировка приказа",
    signSummary: "Кратко",
    amlDecision: (category, basis) => `${category} (${basis})`,
    flagDeadline: {
      antifraud_suspension_ends: "Окончание приостановления",
      antifraud_confirmation: "Последний день, чтобы клиент подтвердил распоряжение",
      aml_reasons_notice: "Срок сообщить клиенту дату и причины решения",
      aml_documents_answer: "Срок ответа на документы клиента",
      high_risk_notice: "Срок уведомить о мерах",
      high_risk_commission_application: "Последний день, чтобы клиент обратился в комиссию",
      no_substance_notice: "Срок уведомить об оставлении без ответа по существу",
      stop_correspondence_notice: "Срок уведомить о прекращении переписки",
      antifraud_repeat_suspension_ends: "Окончание повторного приостановления",
      antifraud_after_repeat_suspension: "Подтверждённое распоряжение исполняется",
      antifraud_repeat_refusal_ends: "Окончание двух дней после отказа в повторной операции",
      antifraud_after_repeat_refusal: "С этого дня следующая повторная операция клиента проходит",
      instrument_suspension_notice: "Срок сообщить клиенту о приостановлении и его причине",
      exclusion_forwarding: "Срок передать заявление в Банк России с позицией банка",
      exclusion_refusal_notice: "Срок сообщить клиенту об отказе передать заявление",
      exclusion_decision: "Банк России решает по заявлению",
      exclusion_decision_relay: "Срок передать клиенту решение Банка России",
      bank_of_russia_query_answer: "Срок ответить на запрос Банка России",
      antifraud_refund: "Срок вернуть средства клиенту",
      aml_commission_decision: "Комиссия принимает решение",
      commission_request_answer: "Срок направить комиссии обоснование банка",
      commission_decision_notice: "Срок сообщить клиенту и банку решение комиссии",
      high_risk_rating_review: "Банк России отвечает об уровне риска",
      operator_application_decision: "Банк России решает по заявлению банка об исключении сведений о клиенте",
    },
    measure: {
      suspend_order: "Приём распоряжения к исполнению приостановлен на два дня",
      refuse_operation: "В операции отказано",
      suspend_confirmed_order: "Подтверждённое распоряжение снова приостановлено на два дня: база Банка России ответила после подтверждения",
      refuse_repeat: "В повторной операции отказано: база Банка России ответила после повтора",
      order_not_accepted: "Распоряжение считается не принятым к исполнению: подтверждено после срока",
      suspend_instrument: "Карта или онлайн-банк клиента приостановлены: данные самого клиента есть в базе Банка России",
      cap_transfers: "Без приостановления: переводы клиента физическим лицам ограничены 100 000 ₽ в месяц, пока данные самого клиента в базе Банка России",
      cap_atm_cash:
        "Выдача наличных в банкоматах ограничена 100 000 ₽ в месяц со дня, когда банк получил информацию из базы Банка России, пока данные клиента в этой базе",
    },
    measureEnded: (day) => `Прекращено ${day}`,
    monthNote: "Закон говорит «в месяц» и не говорит, как считать месяц. Здесь указаны предел и его первый день; месяц не отсчитывается.",
    basisLine: (basis) => `Основание: ${basis}`,
    duties: "Обязанности и хранение",
    noDuties: "Обязанностей, привязанных к событию, нет.",
    duty: {
      copy_to_bank_of_russia: "Копия ответа и каждого уведомления в Банк России",
      copy_to_sro: "Копия обращения и ответа в саморегулируемую организацию",
      notify_client_of_block: "Сообщить клиенту об ограничении, дать рекомендации против повторного мошенничества и сказать, как подтвердить или повторить операцию",
      notify_client_of_repeat_block: "Сообщить клиенту о повторном ограничении: причину, срок и возможность последующей повторной операции",
      notify_client_of_right_to_apply: "Сообщить клиенту о приостановлении и о праве подать в Банк России, в том числе через банк, заявление об исключении сведений",
      restore_instrument: "Восстановить карту или онлайн-банк и сообщить клиенту",
    },
    dutyWhen: {
      immediately: "незамедлительно",
      same_day_as_each_dispatch: "в день отправки каждого заявителю",
      same_day_as_reply: "в день отправки ответа",
    },
    dutyLine: (when, basis) => `${when}; ${basis}`,
    keptUntil: "Хранение",
    warnings: "Что отмечают правила",
    warning: {
      registration_date_assumed: "День регистрации не указан: взят самый ранний возможный, он даёт самый ранний срок ответа.",
      registered_late: "Зарегистрировано позже рабочего дня, следующего за днём поступления.",
      money_claim_outside_ombudsman: "Денежное требование без суммы или больше 500 000 рублей: применяются сроки статьи об обращениях.",
      money_claim_from_legal_entity: "Денежное требование организации: 123-ФЗ распространяется только на потребителей.",
      ombudsman_participation_unknown: "Профессиональный участник рынка ценных бумаг участвует в процедуре финансового уполномоченного только добровольно: применяется более ранний срок ответа, без продления.",
      breach_date_unknown: "Требование по стандартной форме без дня нарушения: применяется более ранний срок ответа.",
      confirmation_late: "Клиент подтвердил позже дня, следующего за днём приостановления: распоряжение считается не принятым, и последующий ответ базы ничего не приостанавливает.",
      confirmation_date_missing: "База ответила после подтверждения, но день подтверждения не указан: повторное ограничение не считается.",
      refund_for_individuals_only: "Возврат в течение 30 дней по 161-ФЗ, ст. 8, ч. 3.13, положен только физическим лицам.",
      high_risk_for_legal_entities_only: "Группа высокого риска по 115-ФЗ, ст. 7.7, только для организаций и ИП.",
      documents_answer_beyond_text: "115-ФЗ даёт 7 рабочих дней на ответ по документам при отказе в операции или договоре; срок дан и для расторгнутого договора, шире текста.",
      sro_copy_not_applicable: "У банка нет саморегулируемой организации, куда направлять копию о нарушении стандарта.",
      ombudsman_term_may_have_passed:
        "С нарушения до требования прошло больше трёх лет: финансовый уполномоченный считает их со дня, когда потребитель узнал о нарушении, и может восстановить срок (123-ФЗ, ст. 15, ч. 1 и 4). Срок ответа не меняется.",
      storage_term_not_set: "190-ФЗ, ст. 6.2, не устанавливает кредитному кооперативу срок хранения обращений, ответов и уведомлений.",
      commission_term_below_minimum: "Запрос комиссии даёт меньше трёх рабочих дней, гарантированных 115-ФЗ, ст. 7, п. 13.6: сохранён его собственный, более ранний срок.",
      commission_term_assumed: "В запросе комиссии нет срока: взят наименьший по закону, три рабочих дня.",
      transfer_cap_for_individuals_only: "Ограничение переводов по ч. 11.6 ст. 9 161-ФЗ касается физических лиц: у компании без приостановления его нет.",
      database_information_date_assumed:
        "День, когда банк получил информацию из базы данных, неизвестен. Ограничение выдачи наличных в банкоматах действует с этого дня (ч. 16 ст. 30 Закона о банках); здесь оно датировано днём, когда банк применил сведения, то есть самым поздним возможным.",
    },
    timeline: "Каналы и события",
    event: {
      received: (channel) => `Поступила: ${channel}`,
      forwarded: "перенаправлена Банком России",
      registered: "Зарегистрирована",
      registeredLate: "Зарегистрирована позже следующего рабочего дня",
      registrationNotice: (channel) => `Уведомление о регистрации: ${channel}`,
      extended: (until) => `Уведомление о продлении; ответ теперь до ${until}`,
      replySent: (channel) => `Ответ отправлен: ${channel}`,
      replySentLate: "Ответ отправлен после срока",
      copy: "Копия ответа в Банк России",
      closed: "Закрыта",
      replyDue: "Срок ответа",
    },
    related: "Связанные обращения",
    relatedNone: "Связанных обращений нет.",
    relation: { linked: "С ним связано это обращение", links_here: "Связано с этим обращением", same_applicant: "Тот же заявитель" },
    relatedColumns: { case: "Номер", relation: "Связь", stream: "Поток", stage: "Этап", left: "Осталось" },
    deadline: "Срок",
    derivation: "Как рассчитан последний день ответа",
    step: {
      received: "Поступление",
      registration: "Регистрация",
      reply: "Срок ответа",
      daysOff: "Нерабочие дни в сроке",
      extension: "Продление",
      left: "Осталось",
    },
    count: (from, value, unit, n) =>
      ({
        working_days: `${from} + ${value} ${ru(n, "рабочий день", "рабочих дня", "рабочих дней")}`,
        calendar_days: `${from} + ${value} ${ru(n, "календарный день", "календарных дня", "календарных дней")}`,
        calendar_days_to_working_day: `${from} + ${value} ${ru(n, "календарный день", "календарных дня", "календарных дней")}, затем ближайший рабочий`,
        next_working_day: `рабочий день после ${from}`,
        same_day: from,
        months: `${from} + ${value} ${ru(n, "месяц", "месяца", "месяцев")}`,
        years: `${from} + ${value} ${ru(n, "год", "года", "лет")}`,
      })[unit] ?? `${from} + ${value}`,
    daysOffFormula: (calendar, working) => `${calendar} − ${working}`,
    daysOffValue: (total, n, weekend, holidays) => `${total} ${ru(n, "нерабочий день", "нерабочих дня", "нерабочих дней")}: выходных ${weekend}${holidays ? `; ${holidays}` : ""}`,
    holidays: (list) => `праздники и перенесённые выходные ${list}`,
    workingWeekends: (count) => `рабочих суббот по постановлению: ${count}, учтены`,
    registeredLateNote: "зарегистрирована с опозданием",
    extensionTaken: (due) => `Продлён до ${due}`,
    extensionPossible: (notice) => `Не продлевали; можно, если уведомить до ${notice}`,
    extensionRefused: "Нельзя",
    extensionRefusal: {
      extension_not_allowed: "Нельзя: денежное требование по 123-ФЗ не продлевается",
      extension_ground_not_allowed: "Нельзя по этому основанию",
      extension_too_long: "Дольше, чем позволяет закон",
    },
    leftFormula: (from, to) => `рабочие дни от ${from} до ${to}`,
    conservative: "осторожное прочтение",
  },

  performance: "Производительность",
  perfNote:
    "Измерено в этой вкладке. Первые строки: от начала перехода до первого кадра со строками. Фильтр и сортировка: от ввода до перерисованной таблицы. Обмен с потоком: от отправки запроса до получения ответа. Вычисление: сортировка, поиск и фильтрация в фоновом потоке.",
  firstRows: "Первые строки",
  filterLatency: "Фильтр",
  sortLatency: "Сортировка",
  roundTrip: "Обмен с потоком",
  workerCompute: "Вычисление",
  rowsLoaded: "Загружено строк",
  computedOn: "Где считается",
  modeWorker: "Фоновый поток",
  modeMain: "Основной поток",
  ms: "мс",
  medianP95: (p50, p95) => `медиана ${p50}, p95 ${p95}`,
  samples: (n) => `замеров: ${n}`,
  notYet: "пока нет",
};

export const strings: Record<Lang, Strings> = { ru: ruStrings, en };
