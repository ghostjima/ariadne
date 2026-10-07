// The case brief: what the assistant is told about a case. Built from the
// register's codes and ariadne-rules, never from the complaint's text: the
// adversarial corpus (complaints with instructions addressed to an
// assistant) gives the same brief as the same rows without them, and no
// string of the brief is anything but a code of the engine or a date.
import { describe, expect, it } from "vitest";
import { AML_REASON_CODES as GRID_AML, GROUNDS, Stage, Stream, caseFacts, complaintText, generateAll } from "@ariadne/grid";
import {
  ALL_CODES,
  AML_REASON_CODES,
  CLIENT_OPTIONS,
  GROUND_CODES,
  SIGN_CODES,
  decodePlanPayload,
  encodePlanPayload,
  generatePlan,
  type CaseBrief,
} from "@ariadne/runner";
import { amlReasons, od2506Signs, rubric } from "@ariadne/rules";
import { POOLS } from "../data/query";
import { caseBrief, factsDueOf } from "./brief";

const store = generateAll(20261006, 1_200, 400);
const rows = Array.from({ length: store.size }, (_, i) => i);
const adversarial = rows.filter((i) => (store.injection[i] ?? 0) > 0);

/** Every string value of a value, with its path. */
function strings(value: unknown, path = "$"): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

describe("the engine's lists agree with the register and the rules", () => {
  it("signs, 115-FZ categories and grounds are the same codes in the same order", () => {
    expect([...SIGN_CODES]).toEqual(od2506Signs().map((s) => s.code));
    expect([...AML_REASON_CODES]).toEqual(amlReasons().map((r) => r.code));
    expect([...AML_REASON_CODES]).toEqual([...GRID_AML]);
    expect([...GROUND_CODES]).toEqual(GROUNDS.flatMap((g) => (g ? [g.id] : [])));
  });
});

describe("caseBrief", () => {
  it("decodes as a valid brief for every case of the corpus", () => {
    for (const row of rows) {
      const brief = caseBrief(store, row);
      const payload = { v: 2 as const, seed: 7, autonomy: "high_only" as const, brief, steps: [{ id: "s1", askFirst: false }] };
      expect(decodePlanPayload(encodePlanPayload(payload)), `row ${row}`).toEqual({ ok: true, payload });
    }
  });

  it("is built from codes only: every string is an engine code or a date", () => {
    for (const row of rows)
      for (const [path, value] of strings(caseBrief(store, row)))
        expect(ALL_CODES.has(value) || /^\d{4}-\d{2}-\d{2}$/.test(value), `row ${row} ${path} = ${value}`).toBe(true);
  });

  it("the adversarial corpus: the same brief and plan with and without the insertions", () => {
    // The corpus has its insertions: about 3% of the cases.
    expect(adversarial.length).toBeGreaterThan(20);
    const clean = generateAll(20261006, 1_200, 400);
    clean.injection.fill(0);
    for (const row of adversarial) {
      const lang = row % 2 === 0 ? "en" : "ru";
      const injected = complaintText(store, row, POOLS[lang].pools).injection;
      expect(injected, `row ${row}`).toBeTruthy();
      expect(complaintText(clean, row, POOLS[lang].pools).injection).toBeNull();
      const brief = caseBrief(store, row);
      expect(brief, `row ${row}`).toEqual(caseBrief(clean, row));
      expect(generatePlan(7, brief)).toEqual(generatePlan(7, caseBrief(clean, row)));
      // Nothing of the applicant's words travels with the brief or the plan.
      const json = JSON.stringify([brief, generatePlan(7, brief)]);
      const words = injected!.split(/\s+/);
      for (let k = 1; k < words.length; k++) expect(json, `row ${row}`).not.toContain(`${words[k - 1]} ${words[k]}`);
    }
  });

  it("gives the facts their own term, never after the reply's last day still ahead", () => {
    expect(factsDueOf("2026-10-30")).toBe("2026-10-08");
    expect(factsDueOf("2026-10-07")).toBe("2026-10-07");
    // Already overdue: the term counts from the day the data is taken.
    expect(factsDueOf("2026-09-25")).toBe("2026-10-08");
  });

  it("names the stream's law, the reason, the options and the deadlines the rules ask for", () => {
    const transfer = rows.find((i) => store.stream[i] === Stream.Antifraud && store.operation[i] === 3 && store.stage[i]! < Stage.LegalReview)!;
    const brief: CaseBrief = caseBrief(store, transfer);
    expect(brief.stream).toBe("antifraud");
    expect(brief.grounds[0]).toBe("payment_8_3_4");
    expect(brief.reason).toBe(od2506Signs()[store.reason[transfer]! - 1]!.code);
    expect(brief.clientOptions).toContain("confirm_order");
    for (const row of rows) {
      const b = caseBrief(store, row);
      expect(b.clientOptions.every((o) => (CLIENT_OPTIONS as readonly string[]).includes(o))).toBe(true);
      if (b.stream === "money_claim" && b.regime === "ombudsman_claim") expect(b.clientOptions).toContain("apply_to_ombudsman");
      if (b.stream === "aml_refusal") expect(b.grounds.some((g) => g.startsWith("aml_"))).toBe(true);
    }
  });

  it("a block rests on 161-FZ art. 8 part 3.4 whatever the operation: part 3.10 is the second action, not the first", () => {
    const blocks = rows.filter((i) => store.stream[i] === Stream.Antifraud);
    expect(new Set(blocks.map((i) => store.operation[i])).size).toBeGreaterThan(2);
    for (const row of blocks) {
      const grounds = caseBrief(store, row).grounds;
      expect(grounds[0], `row ${row}`).toBe("payment_8_3_4");
      expect(grounds, `row ${row}`).not.toContain("payment_8_3_10");
    }
  });

  it("a reply stating what the brief carries leaves the rules nothing to ask for", () => {
    for (const row of rows.filter((i) => store.stage[i]! < Stage.LegalReview)) {
      const b = caseBrief(store, row);
      const findings = rubric(
        { repliedOn: b.asOf, text: "", clientOptions: b.clientOptions, statedDeadlines: b.deadlines },
        // The same facts the brief was asked with.
        caseFacts(store, row),
      ).filter((f) => f.code === "client_option_missing" || f.code === "deadline_missing" || f.code === "deadline_mismatch");
      expect(findings, `row ${row}`).toEqual([]);
    }
  });
});
