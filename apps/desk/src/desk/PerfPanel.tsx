// What this tab measured: time to the first rows, filter and sort latency
// (input to repainted grid), and the worker's round trip and compute time.
import { memo } from "react";
import { Disclosure, StatBar, type StatBarItem } from "@ghostjima/stoa-react";
import type { Strings } from "../i18n";
import { percentile, useMetrics } from "./metrics";

export const PerfPanel = memo(function PerfPanel({ t, mode, loaded, integer, decimal }: {
  t: Strings;
  mode: "worker" | "main";
  loaded: number;
  integer: (n: number) => string;
  decimal: (n: number) => string;
}) {
  const m = useMetrics();
  const dist = (samples: number[]): string => {
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    return p50 === null || p95 === null ? t.notYet : `${t.medianP95(decimal(p50), decimal(p95))} ${t.ms}`;
  };
  const items: StatBarItem[] = [
    { label: t.firstRows, value: m.firstRowsMs === null ? t.notYet : `${integer(m.firstRowsMs)} ${t.ms}` },
    { label: t.filterLatency, value: dist(m.samples.filter) },
    { label: t.sortLatency, value: dist(m.samples.sort) },
    { label: t.roundTrip, value: dist(m.samples["round-trip"]) },
    { label: t.workerCompute, value: dist(m.samples.compute) },
    { label: t.rowsLoaded, value: integer(loaded) },
    { label: t.computedOn, value: mode === "worker" ? t.modeWorker : t.modeMain },
  ];
  return (
    <Disclosure summary={t.performance} className="perf">
      <p className="muted">{t.perfNote}</p>
      <StatBar label={t.performance} items={items} />
    </Disclosure>
  );
});
