// Timings taken in the page, as standard performance entries (so a
// measurement script reads the same numbers with getEntriesByName) and in a
// small external store for the performance panel.
import { useSyncExternalStore } from "react";

export type MetricName = "first-rows" | "filter" | "sort" | "round-trip" | "compute";

export type MetricsState = {
  firstRowsMs: number | null;
  samples: Record<Exclude<MetricName, "first-rows">, number[]>;
};

const MAX_SAMPLES = 200;
let state: MetricsState = { firstRowsMs: null, samples: { filter: [], sort: [], "round-trip": [], compute: [] } };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Calls `then` after the next frame has been painted: a frame callback,
 * then a message task, which runs once that frame is on screen. */
export function afterPaint(then: () => void): void {
  requestAnimationFrame(() => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => then();
    channel.port2.postMessage(null);
  });
}

export function record(name: Exclude<MetricName, "first-rows">, ms: number, start?: number): void {
  if (start !== undefined) performance.measure(`ariadne:${name}`, { start, duration: ms });
  const list = [...state.samples[name], ms].slice(-MAX_SAMPLES);
  state = { ...state, samples: { ...state.samples, [name]: list } };
  emit();
}

/** Time from navigation start to the first painted frame with rows. */
export function recordFirstRows(): void {
  if (state.firstRowsMs !== null) return;
  afterPaint(() => {
    if (state.firstRowsMs !== null) return;
    const end = performance.now();
    performance.measure("ariadne:first-rows", { start: 0, end });
    state = { ...state, firstRowsMs: end };
    emit();
  });
}

export function useMetrics(): MetricsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Nearest-rank percentile, or null without samples. */
export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? null;
}
