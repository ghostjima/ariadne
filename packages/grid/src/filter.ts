import { COLUMN_BY_ID, METRIC_COUNT, METRIC_IDS, PRIORITY_COUNT, STATUS_COUNT } from "./schema.js";
import { convertedAmount, getComment, type ColumnStore } from "./store.js";
import { commentText, tagsText, type SearchIndex, type TextPools } from "./text.js";

/*
  Filtering and sorting over the columnar store. Everything works on index
  arrays: the store itself is never copied. Filters within a group are OR,
  groups are AND. The pass also produces facet counts for every chip group
  (counts of rows that would match if only that group changed).
*/

export type Criteria = {
  status: readonly number[];
  priority: readonly number[];
  slaBreached: boolean;
  regions: readonly number[];
  search: string;
  /* Role restriction, applied on top of user filters */
  allowedRegions: readonly number[] | null;
};

export const EMPTY_CRITERIA: Criteria = {
  status: [],
  priority: [],
  slaBreached: false,
  regions: [],
  search: "",
  allowedRegions: null,
};

export type Facets = {
  status: Uint32Array;
  priority: Uint32Array;
  /* Indexed by region code; regions outside the role's allowance stay 0 */
  region: Uint32Array;
  slaBreached: number;
};

export type FilterResult = {
  index: Uint32Array;
  facets: Facets;
  /* Milliseconds spent inside filterRows (pure compute) */
  computeMs: number;
};

const CODE_SPACE = 256;

function mask(values: readonly number[], size: number): Uint8Array | null {
  if (values.length === 0) return null;
  const m = new Uint8Array(size);
  for (const v of values) if (v >= 0 && v < size) m[v] = 1;
  return m;
}

export function normalizeSearch(q: string): string {
  return q.trim().toLowerCase();
}

/*
  `order` is the sorted list of all row indices (or null for natural order).
  Only loaded rows are considered, so a partially loaded dataset filters fine.
  `search` is the index of the displayed language; it is required only when
  the criteria carry a text query.
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
  const statusMask = mask(criteria.status, STATUS_COUNT);
  const priorityMask = mask(criteria.priority, PRIORITY_COUNT);
  const regionMask = mask(criteria.regions, CODE_SPACE);
  const allowedMask = criteria.allowedRegions ? mask(criteria.allowedRegions, CODE_SPACE) : null;
  const q = normalizeSearch(criteria.search);
  const hasQ = q.length > 0;
  if (hasQ && search === null) {
    throw new TypeError("argus-grid: filterRows needs a search index for a text query");
  }
  const sla = criteria.slaBreached;

  const facetStatus = new Uint32Array(STATUS_COUNT);
  const facetPriority = new Uint32Array(PRIORITY_COUNT);
  const facetRegion = new Uint32Array(CODE_SPACE);
  let facetSla = 0;

  const { status, priority, slaBreached, region, loaded } = store;

  for (let p = 0; p < n; p++) {
    const i = order ? (order[p] ?? p) : p;
    if (loaded[i] === 0) continue;
    const r = region[i] ?? 0;
    if (allowedMask && allowedMask[r] === 0) continue;
    if (hasQ && !(search![i] ?? "").includes(q)) continue;
    /* Base matches; now the four facet groups */
    const s = status[i] ?? 0;
    const pr = priority[i] ?? 0;
    const br = (slaBreached[i] ?? 0) === 1;
    const mS = !statusMask || statusMask[s] === 1;
    const mP = !priorityMask || priorityMask[pr] === 1;
    const mB = !sla || br;
    const mR = !regionMask || regionMask[r] === 1;
    if (mP && mB && mR) facetStatus[s] = (facetStatus[s] ?? 0) + 1;
    if (mS && mB && mR) facetPriority[pr] = (facetPriority[pr] ?? 0) + 1;
    if (mS && mP && mR && br) facetSla++;
    if (mS && mP && mB) facetRegion[r] = (facetRegion[r] ?? 0) + 1;
    if (mS && mP && mB && mR) out[k++] = i;
  }
  return {
    index: out.subarray(0, k),
    facets: {
      status: facetStatus,
      priority: facetPriority,
      region: facetRegion,
      slaBreached: facetSla,
    },
    computeMs: performance.now() - t0,
  };
}

export type Sort = { id: string; desc: boolean } | null;

const metricOffset = new Map<string, number>(METRIC_IDS.map((m, i) => [m, i]));

/*
  Returns a full permutation of row indices sorted by the given column, ties
  in row order. Text columns sort by their displayed strings with the pool's
  collation, so they need `pools`; numeric and enum columns sort by value.
  Amounts sort by their value in the reference currency (CURRENCY_RATES).
*/
export function sortOrder(
  store: ColumnStore,
  sort: Sort,
  pools: TextPools | null = null,
): Uint32Array | null {
  if (!sort || !COLUMN_BY_ID.has(sort.id)) return null;
  const n = store.size;
  const dir = sort.desc ? -1 : 1;
  const numeric = numericColumn(store, sort.id);
  let data: ArrayLike<number>;
  let stride = 1;
  if (numeric) {
    data = numeric.data;
    stride = numeric.stride;
  } else {
    if (sort.id !== "id" && pools === null) {
      throw new TypeError(`argus-grid: sorting by ${sort.id} needs text pools`);
    }
    const keys = textKeys(store, sort.id, pools as TextPools);
    if (!keys) return null;
    data = keys;
  }
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) arr[i] = i;
  arr.sort((a, b) => {
    const d = (data[a * stride] ?? 0) - (data[b * stride] ?? 0);
    return d !== 0 ? d * dir : a - b;
  });
  return Uint32Array.from(arr);
}

function numericColumn(
  store: ColumnStore,
  id: string,
): { data: Float64Array | Uint8Array; stride: number } | null {
  switch (id) {
    case "date":
      return { data: store.date, stride: 1 };
    case "amount": {
      /* By value, not by the bare number: RUB 1,000 is less than USD 100 */
      const value = new Float64Array(store.size);
      for (let i = 0; i < store.size; i++) value[i] = convertedAmount(store, i);
      return { data: value, stride: 1 };
    }
    case "currency":
      return { data: store.currency, stride: 1 };
    case "status":
      return { data: store.status, stride: 1 };
    case "region":
      return { data: store.region, stride: 1 };
    case "priority":
      return { data: store.priority, stride: 1 };
    case "sla":
      return { data: store.sla, stride: 1 };
    case "channel":
      return { data: store.channel, stride: 1 };
    case "updatedAt":
      return { data: store.updatedAt, stride: 1 };
    default: {
      const off = metricOffset.get(id);
      if (off === undefined) return null;
      return { data: store.metrics.subarray(off), stride: METRIC_COUNT };
    }
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

/* Per-row sort keys for text columns: the rank of the displayed string */
function textKeys(store: ColumnStore, id: string, pools: TextPools): Uint32Array | null {
  const n = store.size;
  const keys = new Uint32Array(n);
  const byCode = (codes: Uint8Array, list: readonly string[]) => {
    const rank = rankStrings(list, pools.locale);
    for (let i = 0; i < n; i++) keys[i] = rank[codes[i] ?? 0] ?? 0;
    return keys;
  };
  switch (id) {
    case "id":
      for (let i = 0; i < n; i++) keys[i] = i;
      return keys;
    case "client":
      return byCode(store.client, pools.clients);
    case "owner":
      return byCode(store.owner, pools.owners);
    case "createdBy":
      return byCode(store.createdBy, pools.authors);
    case "tags": {
      const texts = Array.from({ length: 256 }, (_, m) => tagsText(m, pools));
      return byCode(store.tags, texts);
    }
    case "comment": {
      /* Distinct texts only: the pool plus whatever was edited */
      const distinct = new Map<string, number>();
      const slot = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        const t = commentText(getComment(store, i), pools);
        let s = distinct.get(t);
        if (s === undefined) {
          s = distinct.size;
          distinct.set(t, s);
        }
        slot[i] = s;
      }
      const rank = rankStrings([...distinct.keys()], pools.locale);
      for (let i = 0; i < n; i++) keys[i] = rank[slot[i] ?? 0] ?? 0;
      return keys;
    }
    default:
      return null;
  }
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
