// Filtering, sorting, search and CSV over one @ariadne/grid store. The same
// class runs inside the worker (on the worker's copy of the store) and, when
// no worker is available, on the main thread (on the loader's store).
import {
  buildSearchIndex,
  filterRows,
  refreshSearch,
  sortOrder,
  toCsv,
  type ColumnStore,
  type Criteria,
  type Facets,
  type Labels,
  type SearchIndex,
  type Sort,
  type TextPools,
} from "@ariadne/grid";
import { labels as enLabels, pools as enPools } from "@ariadne/grid/pools/en";
import { labels as ruLabels, pools as ruPools } from "@ariadne/grid/pools/ru";
import type { Lang } from "../i18n";

export const POOLS: Record<Lang, { pools: TextPools; labels: Labels }> = {
  en: { pools: enPools, labels: enLabels },
  ru: { pools: ruPools, labels: ruLabels },
};

/** Columns whose sort keys are the displayed text, so they depend on the
 * language. */
const TEXT_SORT = new Set(["client", "subject", "assignee", "signatory", "note"]);
/** Columns an edit can change, so a sort by them goes stale. */
const EDITED_SORT = new Set(["stage", "outcome", "ground", "extension", "assignee", "left", "due", "updatedAt", "note"]);

export type Query = { criteria: Criteria; sort: Sort; lang: Lang };

export type QueryOutput = {
  index: Uint32Array;
  facets: Facets;
  /** Time spent sorting (0 when the order came from the cache). */
  sortMs: number;
  /** Time spent building the search index (0 when cached). */
  searchMs: number;
  /** Time inside filterRows. */
  filterMs: number;
};

export class QueryEngine {
  private sortCache: { key: string; order: Uint32Array | null } | null = null;
  private search: { lang: Lang; index: SearchIndex } | null = null;

  constructor(readonly store: ColumnStore) {}

  /** New rows arrived: every cached order and the search index are stale. */
  rowsLoaded(): void {
    this.sortCache = null;
    this.search = null;
  }

  /** Rows were edited (a code field, a note, updatedAt). */
  rowsEdited(rows: ArrayLike<number>): void {
    const sorted = this.sortCache?.key.split("|")[0];
    if (sorted && EDITED_SORT.has(sorted)) this.sortCache = null;
    if (this.search) {
      const { pools } = POOLS[this.search.lang];
      for (let k = 0; k < rows.length; k++) refreshSearch(this.search.index, this.store, pools, rows[k]!);
    }
  }

  run(q: Query): QueryOutput {
    const { pools } = POOLS[q.lang];
    let sortMs = 0;
    let searchMs = 0;
    const key = q.sort ? `${q.sort.id}|${q.sort.desc ? 1 : 0}|${TEXT_SORT.has(q.sort.id) ? q.lang : ""}` : "";
    if (this.sortCache?.key !== key) {
      const t0 = performance.now();
      this.sortCache = { key, order: sortOrder(this.store, q.sort, pools) };
      sortMs = performance.now() - t0;
    }
    let index: SearchIndex | null = null;
    if (q.criteria.search.trim() !== "") {
      if (this.search?.lang !== q.lang) {
        const t0 = performance.now();
        this.search = { lang: q.lang, index: buildSearchIndex(this.store, pools) };
        searchMs = performance.now() - t0;
      }
      index = this.search.index;
    }
    const result = filterRows(this.store, this.sortCache.order, q.criteria, index);
    return { index: result.index, facets: result.facets, sortMs, searchMs, filterMs: result.computeMs };
  }

  /** The rows of `index` (at most `limit`) as CSV, headers and cells in the
   * language's words, with a byte order mark for spreadsheet programs. */
  csv(index: ArrayLike<number>, columns: string[], lang: Lang, limit?: number): string {
    const { pools, labels } = POOLS[lang];
    return `﻿${toCsv(this.store, index, columns, { headers: labels.columns, pools, labels, limit })}`;
  }
}
