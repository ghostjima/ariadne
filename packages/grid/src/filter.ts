import { COLUMN_BY_ID, DEADLINE_COUNT, SOURCE_COUNT, STAGE_COUNT, STREAM_COUNT } from "./schema.js";
import { deadlineClass, effectiveDue, getNote, workingDaysLeft, type ColumnStore } from "./store.js";
import { clientName, noteText, subjectText, type SearchIndex, type TextPools } from "./text.js";

/*
  Filtering and sorting over the columnar store. Everything works on index
  arrays: the store itself is never copied. Filters within a group are OR,
  groups are AND. The pass also produces facet counts for every chip group
  (counts of rows that would match if only that group changed).
*/

/* The rows a role may see: by assignee, by signatory, or all (null) */
export type Scope = { assignees: readonly number[] | null; signatories: readonly number[] | null };

export const ALL_ROWS: Scope = { assignees: null, signatories: null };

export type Criteria = {
  stage: readonly number[];
  stream: readonly number[];
  source: readonly number[];
  /* DeadlineClass codes */
  deadline: readonly number[];
  search: string;
  /* Role restriction, applied on top of user filters */
  scope: Scope;
};

export const EMPTY_CRITERIA: Criteria = {
  stage: [],
  stream: [],
  source: [],
  deadline: [],
  search: "",
  scope: ALL_ROWS,
};

export type Facets = {
  stage: Uint32Array;
  stream: Uint32Array;
  source: Uint32Array;
  deadline: Uint32Array;
};

export type FilterResult = {
  index: Uint32Array;
  facets: Facets;
  /* Milliseconds spent inside filterRows (pure compute) */
  computeMs: number;
};

const CODE_SPACE = 256;

function mask(values: readonly number[] | null, size: number): Uint8Array | null {
  if (values === null || values.length === 0) return null;
  const m = new Uint8Array(size);
  for (const v of values) if (v >= 0 && v < size) m[v] = 1;
  return m;
}

/* A scope list that is set but empty lets no row through */
function scopeMask(values: readonly number[] | null): Uint8Array | null {
  return values === null ? null : (mask(values, CODE_SPACE) ?? new Uint8Array(CODE_SPACE));
}

export function normalizeSearch(q: string): string {
  return q.trim().toLowerCase();
}

/* Whether the role's scope lets a row through */
export function inScope(store: ColumnStore, i: number, scope: Scope): boolean {
  if (scope.assignees !== null && !scope.assignees.includes(store.assignee[i] ?? -1)) return false;
  if (scope.signatories !== null && !scope.signatories.includes(store.signatory[i] ?? -1)) return false;
  return true;
}

/*
  `order` is the sorted list of all row indices (or null for natural order).
  Only loaded rows are considered, so a partially loaded register filters
  fine. `search` is the index of the displayed language; it is required
  only when the criteria carry a text query.
*/
export function filterRows(
  store: ColumnStore,
  order: Uint32Array | null,
  criteria: Criteria,
  search: SearchIndex | null = null,
): FilterResult {
  const t0 = performance.now();
  const n = store.size;
  const out = new Uint32Array(n);
  let k = 0;
  const stageMask = mask(criteria.stage, STAGE_COUNT);
  const streamMask = mask(criteria.stream, STREAM_COUNT);
  const sourceMask = mask(criteria.source, SOURCE_COUNT);
  const deadlineMask = mask(criteria.deadline, DEADLINE_COUNT);
  const assignees = scopeMask(criteria.scope.assignees);
  const signatories = scopeMask(criteria.scope.signatories);
  const q = normalizeSearch(criteria.search);
  const hasQ = q.length > 0;
  if (hasQ && search === null) {
    throw new TypeError("@ariadne/grid: filterRows needs a search index for a text query");
  }

  const facetStage = new Uint32Array(STAGE_COUNT);
  const facetStream = new Uint32Array(STREAM_COUNT);
  const facetSource = new Uint32Array(SOURCE_COUNT);
  const facetDeadline = new Uint32Array(DEADLINE_COUNT);

  const { stage, stream, source, assignee, signatory, loaded } = store;

  for (let p = 0; p < n; p++) {
    const i = order ? (order[p] ?? p) : p;
    if (loaded[i] === 0) continue;
    if (assignees && assignees[assignee[i] ?? 0] === 0) continue;
    if (signatories && signatories[signatory[i] ?? 0] === 0) continue;
    if (hasQ && !(search![i] ?? "").includes(q)) continue;
    /* Base matches; now the four facet groups */
    const st = stage[i] ?? 0;
    const sm = stream[i] ?? 0;
    const so = source[i] ?? 0;
    const dl = deadlineClass(store, i);
    const mSt = !stageMask || stageMask[st] === 1;
    const mSm = !streamMask || streamMask[sm] === 1;
    const mSo = !sourceMask || sourceMask[so] === 1;
    const mDl = !deadlineMask || deadlineMask[dl] === 1;
    if (mSm && mSo && mDl) facetStage[st] = (facetStage[st] ?? 0) + 1;
    if (mSt && mSo && mDl) facetStream[sm] = (facetStream[sm] ?? 0) + 1;
    if (mSt && mSm && mDl) facetSource[so] = (facetSource[so] ?? 0) + 1;
    if (mSt && mSm && mSo) facetDeadline[dl] = (facetDeadline[dl] ?? 0) + 1;
    if (mSt && mSm && mSo && mDl) out[k++] = i;
  }
  return {
    index: out.subarray(0, k),
    facets: { stage: facetStage, stream: facetStream, source: facetSource, deadline: facetDeadline },
    computeMs: performance.now() - t0,
  };
}

export type Sort = { id: string; desc: boolean } | null;

/*
  Returns a full permutation of row indices sorted by the given column, ties
  in row order. Text columns sort by their displayed strings with the pool's
  collation, so they need `pools`; numeric, date and code columns sort by
  value. "left" and "due" sort by the deadline as it stands (extended or
  not), so an edit of the extension moves the row.
*/
export function sortOrder(store: ColumnStore, sort: Sort, pools: TextPools | null = null): Uint32Array | null {
  if (!sort || !COLUMN_BY_ID.has(sort.id)) return null;
  const n = store.size;
  const dir = sort.desc ? -1 : 1;
  let data: ArrayLike<number> | null = numericKeys(store, sort.id);
  if (!data) {
    if (pools === null) throw new TypeError(`@ariadne/grid: sorting by ${sort.id} needs text pools`);
    data = textKeys(store, sort.id, pools);
    if (!data) return null;
  }
  const keys = data;
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) arr[i] = i;
  arr.sort((a, b) => {
    const d = (keys[a] ?? 0) - (keys[b] ?? 0);
    return d !== 0 ? d * dir : a - b;
  });
  return Uint32Array.from(arr);
}

/* Sort keys of a column that sorts by number, or null for a text column */
function numericKeys(store: ColumnStore, id: string): ArrayLike<number> | null {
  const n = store.size;
  const computed = (f: (i: number) => number) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = f(i);
    return out;
  };
  switch (id) {
    case "id":
    case "linked":
      return id === "id" ? computed((i) => i) : store.linked;
    case "received":
      return computed((i) => (store.received[i] ?? 0) * 1440 + (store.receivedMinute[i] ?? 0));
    case "registered":
      return store.registered;
    case "due":
      return computed((i) => effectiveDue(store, i));
    case "left":
      return computed((i) => workingDaysLeft(store, i));
    case "reason":
      return computed((i) => (store.stream[i] ?? 0) * 256 + (store.reason[i] ?? 0));
    case "operation":
      return store.opRef;
    case "applicant":
    case "stream":
    case "source":
    case "channel":
    case "extension":
    case "stage":
    case "outcome":
    case "ground":
    case "opAmount":
    case "claim":
    case "updatedAt":
      return store[id];
    default:
      return null;
  }
}

/* Rank of each string in collation order, ties sharing a rank */
function rankStrings(strings: readonly string[], locale: string): Uint32Array {
  const collator = new Intl.Collator(locale);
  const order = strings.map((_, i) => i).sort((a, b) => collator.compare(strings[a]!, strings[b]!));
  const rank = new Uint32Array(strings.length);
  let r = 0;
  order.forEach((i, p) => {
    if (p > 0 && collator.compare(strings[order[p - 1]!]!, strings[i]!) !== 0) r = p;
    rank[i] = r;
  });
  return rank;
}

/* Per-row sort keys for text columns: the rank of the displayed string,
   over the distinct strings only */
function textKeys(store: ColumnStore, id: string, pools: TextPools): Uint32Array | null {
  const text = (i: number): string | null => {
    switch (id) {
      case "client":
        return clientName(store.applicant[i] ?? 0, store.client[i] ?? 0, pools);
      case "subject":
        return subjectText(store, i, pools);
      case "assignee":
        return pools.assignees[store.assignee[i] ?? 0] ?? "";
      case "signatory":
        return pools.signatories[store.signatory[i] ?? 0] ?? "";
      case "note":
        return noteText(getNote(store, i), pools);
      default:
        return null;
    }
  };
  if (text(0) === null) return null;
  const n = store.size;
  const distinct = new Map<string, number>();
  const slot = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const t = text(i) ?? "";
    let s = distinct.get(t);
    if (s === undefined) {
      s = distinct.size;
      distinct.set(t, s);
    }
    slot[i] = s;
  }
  const rank = rankStrings([...distinct.keys()], pools.locale);
  const keys = new Uint32Array(n);
  for (let i = 0; i < n; i++) keys[i] = rank[slot[i] ?? 0] ?? 0;
  return keys;
}

/* Nearest-rank percentile over a sample list */
export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? null;
}

/* Splits text into [plain, match, plain, ...] fragments for highlighting */
export function splitMatches(text: string, query: string): string[] {
  const q = normalizeSearch(query);
  if (!q) return [text];
  const lower = text.toLowerCase();
  const parts: string[] = [];
  let pos = 0;
  for (;;) {
    const at = lower.indexOf(q, pos);
    if (at === -1) break;
    parts.push(text.slice(pos, at), text.slice(at, at + q.length));
    pos = at + q.length;
  }
  parts.push(text.slice(pos));
  return parts;
}
