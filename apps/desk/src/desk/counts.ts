// The line above the grid that counts the requests: how many are shown of
// all of them, and, until every row is in, how many are still loading or
// did not load. Counting against the rows loaded so far would read "0 of
// 0" while loading and "45,000 of 45,000" with 5,000 missing.
import type { Strings } from "../i18n";

export type CountState = {
  /** Rows the view shows, or null before the first result. */
  shown: number | null;
  /** Every request in the dataset. */
  total: number;
  loaded: number;
  loading: boolean;
  /** Rows in chunks that failed to load. */
  failed: number;
};

export function countText(t: Strings, integer: (n: number) => string, s: CountState): string {
  if (s.shown === null) return t.countLoading;
  const count = t.shownOf(integer(s.shown), integer(s.total), s.shown);
  if (s.failed > 0 && !s.loading) return `${count} ${t.countFailed(integer(s.failed))}`;
  const pending = s.total - s.loaded;
  if (pending > 0) return `${count} ${t.countPending(integer(pending))}`;
  return count;
}
