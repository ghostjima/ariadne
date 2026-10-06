import { COLUMN_BY_ID, DEFAULT_COLUMNS, DeadlineClass, PRESET_IDS, Source, Stage } from "./schema.js";
import type { Criteria, Sort } from "./filter.js";
import { roleScope, type Role } from "./roles.js";

/*
  A "view" is everything the user configured: filters, search, visible
  columns in order, sort and density. Views serialise to a URL-safe string
  (base64url of compact JSON), which also serves as the storage format for
  a list of saved views. Preset views are named by their preset id; the
  language module supplies the displayed name.
*/

export type Density = "compact" | "default" | "comfortable";

export type ViewFilters = {
  stage: number[];
  stream: number[];
  source: number[];
  deadline: number[];
};

export type View = {
  /* A preset id for presets, the user's name for saved views, "" when unnamed */
  name: string;
  filters: ViewFilters;
  search: string;
  columns: string[];
  sort: Sort;
  density: Density;
};

export const EMPTY_FILTERS: ViewFilters = { stage: [], stream: [], source: [], deadline: [] };

const OPEN_STAGES = [
  Stage.Registered,
  Stage.WaitingForFacts,
  Stage.Drafting,
  Stage.LegalReview,
  Stage.AwaitingSignature,
];

export const DEFAULT_VIEW: View = {
  name: "all",
  filters: EMPTY_FILTERS,
  search: "",
  columns: [...DEFAULT_COLUMNS],
  sort: null,
  density: "default",
};

/* The least time left first, in every working view */
const BY_TIME_LEFT: Sort = { id: "left", desc: false };

export const PRESET_VIEWS: readonly View[] = [
  {
    /* Every case still to answer */
    name: "open",
    filters: { ...EMPTY_FILTERS, stage: OPEN_STAGES },
    search: "",
    columns: ["id", "client", "stream", "stage", "left", "due", "source", "assignee"],
    sort: BY_TIME_LEFT,
    density: "default",
  },
  {
    name: "dueSoon",
    filters: { ...EMPTY_FILTERS, deadline: [DeadlineClass.DueSoon] },
    search: "",
    columns: ["id", "client", "left", "due", "stage", "stream", "extension", "assignee"],
    sort: BY_TIME_LEFT,
    density: "default",
  },
  {
    name: "overdue",
    filters: { ...EMPTY_FILTERS, deadline: [DeadlineClass.Overdue] },
    search: "",
    columns: ["id", "client", "left", "due", "stage", "stream", "source", "assignee"],
    sort: BY_TIME_LEFT,
    density: "default",
  },
  {
    /* A same-day copy of every notice and the reply goes to the regulator */
    name: "forwarded",
    filters: { ...EMPTY_FILTERS, stage: OPEN_STAGES, source: [Source.BankOfRussia] },
    search: "",
    columns: ["id", "client", "stream", "left", "due", "stage", "received", "assignee"],
    sort: BY_TIME_LEFT,
    density: "default",
  },
  {
    name: "waitingForFacts",
    filters: { ...EMPTY_FILTERS, stage: [Stage.WaitingForFacts] },
    search: "",
    columns: ["id", "client", "stream", "reason", "left", "due", "extension", "assignee"],
    sort: BY_TIME_LEFT,
    density: "default",
  },
  {
    name: "awaitingSignature",
    filters: { ...EMPTY_FILTERS, stage: [Stage.AwaitingSignature] },
    search: "",
    columns: ["id", "client", "stream", "outcome", "ground", "left", "due", "signatory"],
    sort: BY_TIME_LEFT,
    density: "default",
  },
  DEFAULT_VIEW,
];

export function isPreset(name: string): boolean {
  return (PRESET_IDS as readonly string[]).includes(name);
}

export function hasActiveFilters(f: ViewFilters): boolean {
  return f.stage.length > 0 || f.stream.length > 0 || f.source.length > 0 || f.deadline.length > 0;
}

export function activeFilterCount(f: ViewFilters): number {
  return f.stage.length + f.stream.length + f.source.length + f.deadline.length;
}

/* Filter criteria for a view as seen by a role */
export function criteriaFor(view: View, role: Role): Criteria {
  return {
    stage: view.filters.stage,
    stream: view.filters.stream,
    source: view.filters.source,
    deadline: view.filters.deadline,
    search: view.search,
    scope: roleScope(role),
  };
}

/* Saved views */

export const VIEW_NAME_MAX = 60;

export type ViewNameError =
  | { code: "name-empty" }
  | { code: "name-too-long"; max: number; length: number }
  | { code: "name-is-preset" };

export function validateViewName(name: string): ViewNameError | null {
  const n = name.trim();
  if (!n) return { code: "name-empty" };
  if (n.length > VIEW_NAME_MAX) return { code: "name-too-long", max: VIEW_NAME_MAX, length: n.length };
  if (isPreset(n)) return { code: "name-is-preset" };
  return null;
}

/* Saves `view` under `name`, replacing a saved view of the same name */
export function saveView(saved: readonly View[], view: View, name: string): View[] {
  const n = name.trim();
  return [...saved.filter((v) => v.name !== n), { ...view, name: n }];
}

export function removeView(saved: readonly View[], name: string): View[] {
  return saved.filter((v) => v.name !== name);
}

/* URL serialization: compact JSON in base64url. `v` is the wire version:
   views saved before the complaints register (no `v`) do not parse. */

const WIRE_VERSION = 2;

type Wire = {
  v: number;
  n: string;
  f: [number[], number[], number[], number[]];
  q: string;
  c: string[];
  s: [string, 0 | 1] | null;
  d: Density;
};

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function serializeView(view: View): string {
  const w: Wire = {
    v: WIRE_VERSION,
    n: view.name,
    f: [view.filters.stage, view.filters.stream, view.filters.source, view.filters.deadline],
    q: view.search,
    c: view.columns,
    s: view.sort ? [view.sort.id, view.sort.desc ? 1 : 0] : null,
    d: view.density,
  };
  return toBase64Url(JSON.stringify(w));
}

const DENSITIES: readonly Density[] = ["compact", "default", "comfortable"];

function numList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x >= 0) : [];
}

export function parseView(raw: string | null | undefined): View | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(fromBase64Url(raw)) as Partial<Wire>;
    if (!w || typeof w !== "object" || w.v !== WIRE_VERSION) return null;
    const f = Array.isArray(w.f) ? w.f : [];
    const columns = Array.isArray(w.c)
      ? w.c.filter((c): c is string => typeof c === "string" && COLUMN_BY_ID.has(c))
      : [...DEFAULT_COLUMNS];
    const sort =
      Array.isArray(w.s) && typeof w.s[0] === "string" && COLUMN_BY_ID.has(w.s[0])
        ? { id: w.s[0], desc: w.s[1] === 1 }
        : null;
    return {
      name: typeof w.n === "string" && w.n.trim() ? w.n.slice(0, VIEW_NAME_MAX) : "",
      filters: { stage: numList(f[0]), stream: numList(f[1]), source: numList(f[2]), deadline: numList(f[3]) },
      search: typeof w.q === "string" ? w.q.slice(0, 100) : "",
      columns: columns.length > 0 ? columns : [...DEFAULT_COLUMNS],
      sort,
      density: DENSITIES.includes(w.d as Density) ? (w.d as Density) : "default",
    };
  } catch {
    return null;
  }
}

export function viewToUrl(view: View, base: string): string {
  const url = new URL(base);
  url.searchParams.set("view", serializeView(view));
  return url.toString();
}

/* A list of saved views as one string (JSON array of serialised views) */
export function serializeViews(views: readonly View[]): string {
  return JSON.stringify(views.map(serializeView));
}

/* Reads a saved list back; unreadable entries are dropped */
export function parseViews(raw: string | null | undefined): View[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => (typeof item === "string" ? parseView(item) : null))
      .filter((v): v is View => v !== null);
  } catch {
    return [];
  }
}
