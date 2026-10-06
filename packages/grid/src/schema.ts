/*
  Vocabulary of the complaints register as codes, and the column catalogue.
  Nothing here is displayed text: enum fields are small integers, and every
  label lives in a language module (see pools/ru.ts and pools/en.ts) that
  the caller picks. The legal facts (deadlines, extension, the signs of
  Order No. OD-2506, the 115-FZ categories) come from ariadne-rules through
  @ariadne/rules; this file only names the codes the rows store.
*/

/* What the complaint is about, which sets the law its reply runs under */
export const Stream = {
  /* A written complaint under 442-FZ (Banking Law art. 30.1) */
  General: 0,
  /* A money claim up to 500,000 roubles under 123-FZ: no extension */
  MoneyClaim: 1,
  /* A block or refusal under 161-FZ art. 8, with an OD-2506 sign */
  Antifraud: 2,
  /* A refusal under 115-FZ, with its reason category */
  Aml: 3,
} as const;
export const STREAM_COUNT = 4;
/* The stream codes as ariadne-rules names them */
export const STREAM_RULES = ["general", "money_claim", "antifraud", "aml_refusal"] as const;

/* Who sent it */
export const Source = {
  Client: 0,
  Representative: 1,
  /* Forwarded by the Bank of Russia (86-FZ art. 79.3): every notice and
     the reply are copied back to it on the day they go out */
  BankOfRussia: 2,
} as const;
export const SOURCE_COUNT = 3;

/* How it arrived */
export const Channel = {
  Email: 0,
  /* A form in the internet bank or the app */
  Online: 1,
  Post: 2,
  /* Handed in at an office */
  Office: 3,
  /* A messenger channel the contract lists */
  Chat: 4,
  /* The participant's personal account on the Bank of Russia's site */
  BankOfRussiaAccount: 5,
} as const;
export const CHANNEL_COUNT = 6;
/* Channels whose complaints are electronic (a registration notice is due) */
export const ELECTRONIC_CHANNELS: readonly number[] = [0, 1, 4, 5];

/* Who complains */
export const Applicant = { Individual: 0, LegalEntity: 1 } as const;
export const APPLICANT_COUNT = 2;

/* Where the case is. The order matters: codes >= SENT are answered. */
export const Stage = {
  Registered: 0,
  WaitingForFacts: 1,
  Drafting: 2,
  LegalReview: 3,
  AwaitingSignature: 4,
  Sent: 5,
  Closed: 6,
} as const;
export const STAGE_COUNT = 7;

/* What the reply decides */
export const Outcome = { Pending: 0, Upheld: 1, PartlyUpheld: 2, Refused: 3 } as const;
export const OUTCOME_COUNT = 4;

/* The legal ground a reply names. Each cites an act, an article and a
   part as ariadne-rules' rubric takes them; the 115-FZ ones are the
   crate's reason categories, and a test checks they cite what the crate
   cites. Code 0 is no ground. */
export type GroundSpec = {
  id: string;
  act: "payment_system" | "anti_money_laundering" | "contract";
  article: string;
  part: string;
  /* The streams whose replies may name it */
  streams: readonly number[];
};
export const GROUNDS: readonly (GroundSpec | null)[] = [
  null,
  /* 161-FZ art. 8 part 3.4: the first action on an operation that matches
     a sign, for every kind of operation (sentence 1 suspends a transfer by
     bank details for two days; sentence 2 refuses a card operation, an
     e-money transfer or a Faster Payments transfer) */
  { id: "payment_8_3_4", act: "payment_system", article: "8", part: "3.4", streams: [Stream.Antifraud] },
  /* Part 3.10: only the second action, when the Bank of Russia's database
     answered after the client confirmed the order or repeated the
     operation. The register holds no such second step, so the generator
     never draws it; a person may still name it. */
  { id: "payment_8_3_10", act: "payment_system", article: "8", part: "3.10", streams: [Stream.Antifraud] },
  { id: "aml_operation_refused", act: "anti_money_laundering", article: "7", part: "11", streams: [Stream.Aml] },
  { id: "aml_account_refused", act: "anti_money_laundering", article: "7", part: "5.2, paragraph 2", streams: [Stream.Aml] },
  { id: "aml_account_terminated", act: "anti_money_laundering", article: "7", part: "5.2, paragraph 3", streams: [Stream.Aml] },
  { id: "aml_operation_suspended", act: "anti_money_laundering", article: "7", part: "10", streams: [Stream.Aml] },
  {
    id: "aml_operation_suspended_by_decision",
    act: "anti_money_laundering",
    article: "7",
    part: "10.1",
    streams: [Stream.Aml],
  },
  { id: "aml_funds_frozen", act: "anti_money_laundering", article: "7", part: "1, subitem 6", streams: [Stream.Aml] },
  { id: "aml_high_risk_measures", act: "anti_money_laundering", article: "7.7", part: "5", streams: [Stream.Aml] },
  {
    id: "contract",
    act: "contract",
    article: "",
    part: "",
    streams: [Stream.General, Stream.MoneyClaim, Stream.Antifraud, Stream.Aml],
  },
];
export const GROUND_COUNT = GROUNDS.length;
export const Ground = { None: 0, Contract: GROUND_COUNT - 1 } as const;
/* The ground of each 115-FZ category: the categories in order, from code 3 */
export const AML_GROUND_OFFSET = 3;

/* The extension of the reply term by ten working days, only to request
   documents (Banking Law art. 30.1 part 8); refused by ariadne-rules for a
   money claim under 123-FZ */
export const Extension = { None: 0, Extended: 1 } as const;
export const EXTENSION_COUNT = 2;
export const EXTENSION_WORKING_DAYS = 10;

/* The deadline class of a row, for the filter and the views: computed
   from the stage and the working days left, never stored */
export const DeadlineClass = { Overdue: 0, DueSoon: 1, Later: 2, Answered: 3 } as const;
export const DEADLINE_COUNT = 4;
/* "Due soon": at most this many working days left */
export const DUE_SOON_WORKING_DAYS = 3;

/* The operation behind the complaint */
export const Operation = {
  None: 0,
  CardPayment: 1,
  FasterPayment: 2,
  BankTransfer: 3,
  CashWithdrawal: 4,
  AccountOpening: 5,
  AccountService: 6,
} as const;
export const OPERATION_COUNT = 7;

/* The 115-FZ categories, in ariadne-rules' order */
export const AML_REASON_CODES = [
  "aml_operation_refused",
  "aml_account_refused",
  "aml_account_terminated",
  "aml_operation_suspended",
  "aml_operation_suspended_by_decision",
  "aml_funds_frozen",
  "aml_high_risk_measures",
] as const;
export const AML_REASON_COUNT = AML_REASON_CODES.length;
/* The number of OD-2506 signs ariadne-rules lists */
export const SIGN_COUNT = 14;

/* Sizes every language pool must match exactly, so the generator draws the
   same codes whatever language is displayed. */
export const SURNAME_COUNT = 40;
export const FIRST_NAME_COUNT = 20;
export const COMPANY_COUNT = 30;
export const ASSIGNEE_COUNT = 8;
export const SIGNATORY_COUNT = 3;
export const NOTE_COUNT = 9;
/* Complaint templates per stream, and the adversarial insertions */
export const TEMPLATE_COUNT = 5;
export const INJECTION_COUNT = 6;

export type ColumnKind = "id" | "text" | "date" | "datetime" | "money" | "enum" | "days";

export type EditColumn = "stage" | "outcome" | "ground" | "extension" | "assignee" | "note";
/* The editable columns whose values are codes */
export type EnumField = Exclude<EditColumn, "note">;

export type ColumnSpec = {
  id: string;
  kind: ColumnKind;
  /* Inline editable */
  editable?: EditColumn;
  /* Part of the full-text search string */
  searchable?: boolean;
};

/* Column catalogue. The first two are always pinned. */
export const COLUMNS: readonly ColumnSpec[] = [
  { id: "id", kind: "id", searchable: true },
  { id: "client", kind: "text", searchable: true },
  { id: "applicant", kind: "enum" },
  { id: "stream", kind: "enum" },
  { id: "reason", kind: "enum" },
  { id: "subject", kind: "text", searchable: true },
  { id: "source", kind: "enum" },
  { id: "channel", kind: "enum" },
  { id: "received", kind: "datetime" },
  { id: "registered", kind: "date" },
  { id: "left", kind: "days" },
  { id: "due", kind: "date" },
  { id: "extension", kind: "enum", editable: "extension" },
  { id: "stage", kind: "enum", editable: "stage" },
  { id: "outcome", kind: "enum", editable: "outcome" },
  { id: "ground", kind: "enum", editable: "ground" },
  { id: "assignee", kind: "text", editable: "assignee", searchable: true },
  { id: "signatory", kind: "text" },
  { id: "linked", kind: "id" },
  { id: "operation", kind: "text", searchable: true },
  { id: "opAmount", kind: "money" },
  { id: "claim", kind: "money" },
  { id: "note", kind: "text", editable: "note", searchable: true },
  { id: "updatedAt", kind: "date" },
];

export const COLUMN_IDS: readonly string[] = COLUMNS.map((c) => c.id);
export const PINNED_COLUMNS = ["id", "client"] as const;
export const DEFAULT_COLUMNS = ["id", "client", "stream", "stage", "left", "due", "source", "assignee"] as const;

export const COLUMN_BY_ID: ReadonlyMap<string, ColumnSpec> = new Map(COLUMNS.map((c) => [c.id, c]));

/* The register as the desk opens it: four months of a bank ranked 50 to
   250 by assets, about 300 complaints a month, a few hundred of them open
   on the day the data is taken. */
export const CORPUS_ROWS = 1_200;
export const CORPUS_CHUNK = 400;
/* The scale mode: the same generator over 50,000 rows, a performance proof */
export const SCALE_ROWS = 50_000;
export const SCALE_CHUNK = 5_000;
export const TOTAL_ROWS = CORPUS_ROWS;
export const CHUNK_SIZE = CORPUS_CHUNK;
export const DEFAULT_SEED = 20261006;
/* The day the data is taken: "today" for every deadline in the register */
export const AS_OF = "2026-10-06";
/* Complaints are received over this many calendar days up to AS_OF */
export const WINDOW_DAYS = 120;
export const NOTE_MAX = 200;

/* The person each role works as in the demo: the first operator and the
   first signatory */
export const SELF_ASSIGNEE = 0;
export const SELF_SIGNATORY = 0;

/* Preset views. Their display names come from the language module. */
export const PRESET_IDS = [
  "open",
  "dueSoon",
  "overdue",
  "forwarded",
  "waitingForFacts",
  "awaitingSignature",
  "all",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];
