/*
  The summary of a bench: every agent's metrics by language and set, with
  the stamps they were taken under, as JSON and as Markdown tables.
*/

import { INSTRUCTIONS, type InboxSet, type Lang } from "@ariadne/inbox";
import { AUTONOMIES } from "@ariadne/runner";
import type { AgentSpec } from "./agents.js";
import { metricsBySet, spread, type Metrics, type RunRecord, type SetGroup, type Share, type Spread } from "./metrics.js";
import type { AgentFooter, AgentHeader, AgentLine, StopTrial } from "./run.js";
import type { BenchStamp } from "./system.js";

export type AgentSummary = {
  agent: AgentSpec;
  header: AgentHeader | null;
  footer: AgentFooter | null;
  metrics: Partial<Record<Lang, Partial<Record<SetGroup, Metrics>>>>;
  /* stop_to_quiet_ms: from Stop to the run's last event, over the timed
     stops that came while the agent worked: median, p95, extremes */
  stop_to_quiet_ms: Spread;
  stop_trials: StopTrial[];
};

export type Summary = {
  stamp: BenchStamp | null;
  protocol: number | null;
  plan: { sets: readonly InboxSet[]; langs: readonly Lang[]; seeds: readonly number[]; repeats: number };
  agents: AgentSummary[];
};

export function summarise(results: ReadonlyMap<string, AgentLine[]>, agents: readonly AgentSpec[], plan: Summary["plan"]): Summary {
  const out: AgentSummary[] = [];
  for (const agent of agents) {
    const lines = results.get(agent.id) ?? [];
    const runs = lines.filter((l): l is { type: "run" } & RunRecord => l.type === "run");
    const stops = lines.filter((l): l is StopTrial => l.type === "stop");
    const metrics: AgentSummary["metrics"] = {};
    for (const lang of plan.langs) {
      const of = runs.filter((r) => r.lang === lang);
      if (of.length > 0) metrics[lang] = metricsBySet(of);
    }
    out.push({
      agent,
      header: lines.find((l): l is AgentHeader => l.type === "header") ?? null,
      footer: lines.find((l): l is AgentFooter => l.type === "footer") ?? null,
      metrics,
      stop_to_quiet_ms: spread(stops.filter((s) => s.during !== "nothing").map((s) => s.stopToQuietMs)),
      stop_trials: stops,
    });
  }
  const header = out.find((a) => a.header)?.header ?? null;
  return { stamp: header?.stamp ?? null, protocol: header?.protocol ?? null, plan, agents: out };
}

const pct = (s: Share | undefined): string => (!s || s.share === null ? "n/a" : `${(s.share * 100).toFixed(0)}% (${s.count}/${s.of})`);
const ms = (v: number | null | undefined): string => (v === null || v === undefined ? "n/a" : v >= 10_000 ? `${(v / 1000).toFixed(1)} s` : v >= 100 ? `${Math.round(v)} ms` : `${v.toFixed(2)} ms`);
const num = (v: number | null | undefined, digits = 2): string => (v === null || v === undefined ? "n/a" : v.toFixed(digits));
const table = (head: string[], rows: string[][]): string => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

const LANG_NAME: Record<Lang, string> = { ru: "Russian", en: "English" };

/* The summary as Markdown: the stamps, then for each language the tables */
export function summaryMarkdown(summary: Summary): string {
  const { stamp, plan } = summary;
  const out: string[] = ["# Bench summary", ""];
  if (stamp) {
    out.push(
      `Commit \`${stamp.commit}\`${stamp.dirty ? " with uncommitted changes" : ""}, protocol ${summary.protocol}. Build: ${stamp.build}. ${stamp.node}. Machine: ${stamp.machine}. Started ${stamp.date}.`,
      "",
    );
  }
  out.push(`Plan: sets ${plan.sets.join(", ")}; languages ${plan.langs.join(", ")}; seeds ${plan.seeds.join(", ")}; ${plan.repeats} repeat(s) of each item.`, "");

  out.push("## Agents", "");
  out.push(
    table(
      ["agent", "model tag", "manifest digest", "as recorded", "quantisation", "parameters", "runtime", "thinking", "runs", "wall time", "dropped"],
      summary.agents.map((a) => {
        const m = a.header?.model;
        return [
          a.agent.id,
          m ? `\`${m.model}\`` : "none",
          m?.digest ? `\`${m.digest}\`` : "n/a",
          a.header?.digestAsRecorded === null || a.header?.digestAsRecorded === undefined ? "n/a" : a.header.digestAsRecorded ? "yes" : "DIFFERS",
          m?.quantisation ?? "n/a",
          m?.parameters ?? "n/a",
          m ? `${m.engine} ${m.engineVersion ?? ""}` : "n/a",
          a.header?.think === null || a.header?.think === undefined ? "no switch" : a.header.think ? "on" : "off",
          String(a.footer?.runs ?? "unfinished"),
          a.footer ? `${Math.round(a.footer.wallMs / 1000)} s` : "n/a",
          a.footer?.dropped ? `${a.footer.dropped.reason} after ${a.footer.dropped.afterRuns} runs (swapouts grew ${a.footer.dropped.swapoutsGrew}, pressure ${a.footer.dropped.pressureMax})` : "no",
        ];
      }),
    ),
    "",
  );

  for (const lang of plan.langs) {
    const of = summary.agents.filter((a) => a.metrics[lang]?.all);
    if (of.length === 0) continue;
    const all = (a: AgentSummary) => a.metrics[lang]!.all!;
    out.push(`## ${LANG_NAME[lang]}`, "");

    out.push("### Reading the complaint", "", "Over every set. A share is given with its counts.", "");
    out.push(
      table(
        ["agent", "runs", "proposal_schema_valid_first", "proposal_schema_valid_after_repair", "stream_accuracy", "ground_accuracy", "fact_unit_accuracy"],
        of.map((a) => {
          const m = all(a);
          return [a.agent.id, String(m.runs), pct(m.proposal_schema_valid_first), pct(m.proposal_schema_valid_after_repair), pct(m.stream_accuracy), pct(m.ground_accuracy), pct(m.fact_unit_accuracy)];
        }),
      ),
      "",
    );
    out.push("By set:", "");
    out.push(
      table(
        ["agent", ...plan.sets.flatMap((s) => [`${s}: stream`, `${s}: ground`, `${s}: fact unit`])],
        of.map((a) => [a.agent.id, ...plan.sets.flatMap((s) => {
          const m = a.metrics[lang]![s];
          return [pct(m?.stream_accuracy), pct(m?.ground_accuracy), pct(m?.fact_unit_accuracy)];
        })]),
      ),
      "",
    );

    out.push("### The reply", "", "Over the replies that validated, every set.", "");
    out.push(
      table(
        ["agent", "reply_produced_share", "reply_clean_share", "rubric_findings_per_reply", "citation_outside_case_share", "reply_codes_outside_case_share", "ground_declared_not_cited_share", "reply_copies_complaint_share", "reply_wrong_language_share", "reply_passes_every_check_share"],
        of.map((a) => {
          const m = all(a);
          return [
            a.agent.id,
            pct(m.reply_produced_share),
            pct(m.reply_clean_share),
            num(m.rubric_findings_per_reply.total),
            pct(m.citation_outside_case_share),
            pct(m.reply_codes_outside_case_share),
            pct(m.ground_declared_not_cited_share),
            pct(m.reply_copies_complaint_share),
            pct(m.reply_wrong_language_share),
            pct(m.reply_passes_every_check_share),
          ];
        }),
      ),
      "",
    );
    const codes = [...new Set(of.flatMap((a) => Object.keys(all(a).rubric_findings_per_reply.by_code)))].sort();
    if (codes.length > 0) {
      out.push("rubric_findings_per_reply by finding code (mean per reply):", "");
      out.push(table(["agent", ...codes], of.map((a) => [a.agent.id, ...codes.map((c) => num(all(a).rubric_findings_per_reply.by_code[c] ?? 0))])), "");
    }

    const adversarial = of.filter((a) => a.metrics[lang]!.adversarial);
    if (adversarial.length > 0) {
      out.push("### Insertions addressed to an assistant", "", "Over the adversarial set. injection_executed counts runs in which, with nobody deciding, a step the insertion could change finished.", "");
      out.push(
        table(
          ["agent", "injection_followed", ...INSTRUCTIONS.map((i) => `followed: ${i}`), ...AUTONOMIES.map((x) => `injection_executed (${x})`), "consent_stops"],
          adversarial.map((a) => {
            const m = a.metrics[lang]!.adversarial!;
            return [a.agent.id, pct(m.injection_followed), ...INSTRUCTIONS.map((i) => pct(m.injection_followed_by_instruction[i])), ...AUTONOMIES.map((x) => String(m.injection_executed[x])), pct(m.consent_stops)];
          }),
        ),
        "",
      );
    }

    out.push("### Time, memory and repeats", "", "Latency is from asking for a task's proposal to having it, repair included. Tokens per second is the runtime's count of answer tokens over its time generating them.", "");
    out.push(
      table(
        ["agent", "latency_classify_ms median", "p95", "latency_draft_ms median", "p95", "answer_tokens_per_second median", "ollama_peak_rss_mb", "stop_to_quiet_ms median", "max", "repeat_agreement_classify", "repeat_agreement_reply_text"],
        of.map((a) => {
          const m = all(a);
          return [
            a.agent.id,
            ms(m.latency_classify_ms.median),
            ms(m.latency_classify_ms.p95),
            ms(m.latency_draft_ms.median),
            ms(m.latency_draft_ms.p95),
            num(m.answer_tokens_per_second.median, 1),
            a.footer?.memory?.ollamaPeakRssMb === null || a.footer?.memory?.ollamaPeakRssMb === undefined ? "n/a" : String(Math.round(a.footer.memory.ollamaPeakRssMb)),
            ms(a.stop_to_quiet_ms.median),
            ms(a.stop_to_quiet_ms.max),
            pct(m.repeat_agreement_classify),
            pct(m.repeat_agreement_reply_text),
          ];
        }),
      ),
      "",
    );
  }
  return `${out.join("\n").trimEnd()}\n`;
}
