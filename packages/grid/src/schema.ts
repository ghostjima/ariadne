/*
  Vocabulary of the "requests" dataset as codes, and the column catalogue.
  Nothing here is displayed text: enum fields are small integers, and every
  label lives in a language module (see pools/en.ts, pools/ru.ts,
  pools/ar.ts) that the caller picks.
*/

/* Status codes. The order matters: codes >= APPROVED are settled. */
export const Status = {
  New: 0,
  InProgress: 1,
  AwaitingClient: 2,
  InReview: 3,
  Approved: 4,
  Rejected: 5,
  Closed: 6,
} as const;
export const STATUS_COUNT = 7;

export const Priority = { Low: 0, Medium: 1, High: 2 } as const;
export const PRIORITY_COUNT = 3;

export const Channel = { Web: 0, App: 1, Partner: 2, Office: 3 } as const;
export const CHANNEL_COUNT = 4;

/* ISO 4217 codes are language-neutral, so they live here rather than in a pool */
export const CURRENCIES = ["RUB", "USD", "EUR"] as const;
export const CURRENCY_COUNT = CURRENCIES.length;

/* The value of one unit of each currency in the reference currency, by
   currency code. These are the dataset's own fixed rates (the generator
   draws every amount in roubles and converts it at them), not market
   rates; amounts in different currencies are compared at them. */
export const REFERENCE_CURRENCY = "RUB";
export const CURRENCY_RATES: readonly number[] = [1, 80, 80];

/* Sizes every language pool must match exactly, so the generator draws the
   same codes whatever language is displayed. */
export const REGION_COUNT = 8;
export const CLIENT_COUNT = 24;
export const OWNER_COUNT = 10;
export const AUTHOR_COUNT = 12;
export const COMMENT_COUNT = 9;
export const TAG_COUNT = 8;

export const METRIC_IDS = [
  "revenue",
  "cost",
  "marginAbs",
  "marginPct",
  "marginPlan",
  "discount",
  "commission",
  "tax",
  "refunds",
  "ltv",
  "conversion",
  "weight",
  "items",
  "daysOpen",
  "touches",
] as const;
export type MetricId = (typeof METRIC_IDS)[number];
export const METRIC_COUNT = METRIC_IDS.length;

/* Metrics hidden from the operator role */
export const MARGIN_METRICS: readonly MetricId[] = ["marginAbs", "marginPct", "marginPlan"];

export type ColumnKind =
  | "id"
  | "text"
  | "date"
  | "money"
  | "enum"
  | "number"
  | "hours"
  | "tags";

export type ColumnSpec = {
  id: string;
  kind: ColumnKind;
  /* Hidden from the operator role */
  margin?: boolean;
  /* Inline editable */
  editable?: "status" | "comment";
  /* Part of the full-text search string */
  searchable?: boolean;
};

/* Column catalogue, 30 columns. The first two are always pinned. */
export const COLUMNS: readonly ColumnSpec[] = [
  { id: "id", kind: "id", searchable: true },
  { id: "client", kind: "text", searchable: true },
  { id: "date", kind: "date" },
  { id: "amount", kind: "money" },
  { id: "currency", kind: "enum" },
  { id: "status", kind: "enum", editable: "status" },
  { id: "owner", kind: "text", searchable: true },
  { id: "region", kind: "enum" },
  { id: "priority", kind: "enum" },
  { id: "sla", kind: "hours" },
  { id: "tags", kind: "tags", searchable: true },
  ...METRIC_IDS.map<ColumnSpec>((id) =>
    MARGIN_METRICS.includes(id) ? { id, kind: "number", margin: true } : { id, kind: "number" },
  ),
  { id: "comment", kind: "text", editable: "comment", searchable: true },
  { id: "channel", kind: "enum" },
  { id: "updatedAt", kind: "date" },
  { id: "createdBy", kind: "text", searchable: true },
];

export const COLUMN_IDS: readonly string[] = COLUMNS.map((c) => c.id);
export const PINNED_COLUMNS = ["id", "client"] as const;
export const DEFAULT_COLUMNS = [
  "id",
  "client",
  "date",
  "amount",
  "status",
  "owner",
  "region",
  "priority",
] as const;
export const MARGIN_COLUMNS: readonly string[] = COLUMNS.filter((c) => c.margin).map((c) => c.id);

export const COLUMN_BY_ID: ReadonlyMap<string, ColumnSpec> = new Map(COLUMNS.map((c) => [c.id, c]));

export const TOTAL_ROWS = 50_000;
export const DEFAULT_SEED = 20260904;
export const CHUNK_SIZE = 5_000;
export const COMMENT_MAX = 200;

/* Regions the operator role is allowed to see */
export const OPERATOR_REGIONS: readonly number[] = [0, 1, 2];

/* Preset views. Their display names come from the language module. */
export const PRESET_IDS = ["all", "urgent", "finance", "action"] as const;
export type PresetId = (typeof PRESET_IDS)[number];
