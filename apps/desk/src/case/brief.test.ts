// The case brief: what the assistant is told about a case. Built from the
// register's codes and ariadne-rules, never from the complaint's text: the
// adversarial corpus (complaints with instructions addressed to an
// assistant) gives the same brief as the same rows without them, and no
// string of the brief is anything but a code of the engine or a date.
import { describe, expect, it } from "vitest";
import { AML_REASON_CODES as GRID_AML, AS_OF, Database, GROUNDS, Path, Restriction, Stage, Stream, caseFacts, complaintText, generateAll } from "@ariadne/grid";
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
import { amlReasons, clock, factRequestDue, od2506Signs, rubric } from "@ariadne/rules";
import { POOLS } from "../data/query";
import { caseBrief, factsDueOf, instrumentGround } from "./brief";

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
      const payload = { v: 7 as const, seed: 7, autonomy: "high_only" as const, brief, steps: [{ id: "s1", askFirst: false }] };
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

  it("gives the fact request ariadne-rules' last day: two working days, capped by the earliest term that binds the answering unit", () => {
    const capped = new Map<string, number>();
    for (const row of rows) {
      const facts = caseFacts(store, row);
      const due = factRequestDue(facts, AS_OF);
      expect(caseBrief(store, row).factsDue, `row ${row}`).toBe(due.due);
      // The policy's two working days from the day the data is taken.
      expect(due.policyDue).toBe("2026-10-08");
      if (due.cappedBy) {
        capped.set(due.cappedBy, (capped.get(due.cappedBy) ?? 0) + 1);
        expect(clock(facts).deadlines.find((d) => d.kind === due.cappedBy)?.due, `row ${row}`).toBe(due.due);
      } else expect(due.due).toBe(due.policyDue);
    }
    // A reply due before the policy's day caps it, the reply due today
    // included; so does the bank's answer to the commission's request.
    expect(capped.get("reply")).toBeGreaterThan(0);
    expect(capped.get("commission_request_answer")).toBeGreaterThan(0);
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

  it("a block rests on 161-FZ art. 8 part 3.4 whatever the operation; part 3.10 follows only for the second action, after a confirmation or a repeat", () => {
    const blocks = rows.filter((i) => store.stream[i] === Stream.Antifraud && store.database[i] === Database.None);
    expect(new Set(blocks.map((i) => store.operation[i])).size).toBeGreaterThan(2);
    const second = blocks.filter((i) => store.path[i] === Path.SecondStep);
    expect(second.length).toBeGreaterThan(0);
    for (const row of blocks) {
      const grounds = caseBrief(store, row).grounds;
      expect(grounds[0], `row ${row}`).toBe("payment_8_3_4");
      if (second.includes(row)) expect(grounds[1], `row ${row}`).toBe("payment_8_3_10");
      else expect(grounds, `row ${row}`).not.toContain("payment_8_3_10");
    }
  });

  it("a reply about the client's own data in the database names 161-FZ art. 9 part 11.6, or 11.7 with the Ministry of Internal Affairs' information, and no art. 8 action, with or without an application to remove the data", () => {
    const clientData = rows.filter((i) => store.database[i] !== Database.None);
    const removal = clientData.filter((i) => store.path[i] === Path.DatabaseRemoval);
    expect(removal.length).toBeGreaterThan(0);
    expect(clientData.length).toBeGreaterThan(removal.length);
    // The part follows the register's copy of the database record.
    const police = (row: number) => store.database[row] === Database.ClientDataWithPoliceInformation;
    expect(clientData.some(police) && !clientData.every(police)).toBe(true);
    for (const row of clientData) {
      const grounds = caseBrief(store, row).grounds;
      expect(grounds, `row ${row}`).toEqual([police(row) ? "payment_9_11_7" : "payment_9_11_6"]);
      expect(caseBrief(store, row).reason, `row ${row}`).toBeNull();
    }
    for (const row of rows.filter((i) => store.stream[i] === Stream.Antifraud && store.database[i] === Database.None))
      expect(caseBrief(store, row).grounds.filter((g) => g.startsWith("payment_9_")), `row ${row}`).toEqual([]);
    // The part is the rules engine's: with the Ministry's information the
    // suspension is a duty, under part 11.7.
    const facts = caseFacts(store, removal.find((i) => store.restriction[i] === Restriction.InstrumentSuspended)!);
    expect(instrumentGround(facts)).toBe("payment_9_11_6");
    expect(instrumentGround({ ...facts, database: { ...facts.database, policeInformation: true } })).toBe("payment_9_11_7");
    expect(instrumentGround({ ...facts, database: undefined })).toBeNull();
    // A person who names the other part in the register is followed: the
    // two parts exclude each other.
    const row = removal[0]!;
    const held = store.ground[row]!;
    try {
      store.ground[row] = GROUNDS.findIndex((g) => g?.id === "payment_9_11_7");
      expect(caseBrief(store, row).grounds).toEqual(["payment_9_11_7"]);
      expect(caseBrief(store, row).grounds).not.toContain("payment_9_11_6");
    } finally {
      store.ground[row] = held;
    }
  });

  it("a reply about the client's own data in the database offers the right to apply to the Bank of Russia for their removal, and a block does not", () => {
    // 161-FZ art. 9 part 11.8: after the suspension, the client is told of
    // the right to apply, also through the bank. The rubric asks for it,
    // so the brief carries it, with or without an application already made.
    const clientData = rows.filter((i) => store.database[i] !== Database.None);
    expect(clientData.length).toBeGreaterThan(0);
    for (const row of clientData) expect(caseBrief(store, row).clientOptions, `row ${row}`).toContain("apply_for_removal");
    for (const row of rows.filter((i) => store.stream[i] !== Stream.Antifraud || store.database[i] === Database.None))
      expect(caseBrief(store, row).clientOptions, `row ${row}`).not.toContain("apply_for_removal");
  });

  it("a reply about the client's own data in the database says which restriction applies: the suspension, or the transfer cap the bank chose instead, and ATM cash either way", () => {
    // 161-FZ art. 9 part 11.6: "вправе приостановить"; if not, transfers
    // to individuals up to 100,000 roubles a month (sentence 2); Banking
    // Law art. 30 part 16 caps ATM cash. The brief carries what the rubric
    // asks the reply to state, and the ground is part 11.6 for the cap.
    const clientData = rows.filter((i) => store.database[i] !== Database.None);
    const capped = clientData.filter((i) => store.restriction[i] === Restriction.TransfersCapped);
    expect(capped.length).toBeGreaterThan(0);
    for (const row of clientData) {
      const brief = caseBrief(store, row);
      if (store.restriction[row] === Restriction.TransfersCapped) {
        expect(brief.measures, `row ${row}`).toEqual(["cap_transfers", "cap_atm_cash"]);
        expect(brief.grounds, `row ${row}`).toEqual(["payment_9_11_6"]);
      } else expect(brief.measures, `row ${row}`).toEqual(["suspend_instrument", "cap_atm_cash"]);
      expect(brief.clientOptions, `row ${row}`).toContain("apply_for_removal");
    }
    for (const row of rows.filter((i) => store.database[i] === Database.None)) expect(caseBrief(store, row).measures, `row ${row}`).toEqual([]);
    expect(instrumentGround(caseFacts(store, capped[0]!))).toBe("payment_9_11_6");
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
