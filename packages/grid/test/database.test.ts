import { describe, expect, it } from "vitest";
import { clock } from "@ariadne/rules";
import { generateAll } from "../src/generator.js";
import { isoDay } from "../src/days.js";
import { caseFacts, removalAppliedOn } from "../src/legal.js";
import { selfActor } from "../src/history.js";
import { CORPUS_CHUNK, CORPUS_ROWS, DEFAULT_SEED, Database, Path, Stream } from "../src/schema.js";
import { AS_OF_DAY } from "../src/store.js";
import { caseJournal, deskNow } from "../src/workflow.js";
import { REMOVAL_REASON_MAX, REMOVAL_REASON_MIN, applyForRemoval, checkRemoval, isClientDataCase } from "../src/database.js";

/*
  The bank's own reasoned application to the Bank of Russia to remove the
  client's data from its database (161-FZ art. 9 part 11.9): filed on a
  case about the client's own data by the legal reviewer or the
  supervisor, with the bank's reasons, once; journaled; and its day goes
  to ariadne-rules, which gives the Bank of Russia's 15 working days.
*/

const NOW = deskNow(Date.UTC(2026, 9, 6, 9));
const fresh = () => generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
const rows = (s: ReturnType<typeof fresh>, pred: (i: number) => boolean) => Array.from({ length: s.size }, (_, i) => i).filter(pred);
const REASONS = "The payer's bank confirmed the transfer was the client's own.";

describe("the bank's own application to remove the client's data", () => {
  it("is filed on a case about the client's own data, journaled with the reasons, and gives the Bank of Russia's 15 working days", () => {
    const store = fresh();
    const row = rows(store, (i) => isClientDataCase(store, i) && store.path[i] !== Path.DatabaseRemoval)[0]!;
    expect(removalAppliedOn(store, row)).toBe(-1);
    expect(caseFacts(store, row).database?.operatorApplicationSentOn).toBeUndefined();
    const stage = store.stage[row];
    const before = caseJournal(store, row).length;
    expect(applyForRemoval(store, row, { role: "supervisor", actor: selfActor("supervisor"), at: NOW, reason: `  ${REASONS} ` })).toBeNull();
    expect(store.stage[row]).toBe(stage);
    const journal = caseJournal(store, row);
    expect(journal).toHaveLength(before + 1);
    expect(journal.at(-1)).toMatchObject({ action: "removal_applied", from: stage, to: stage, comment: REASONS, actor: { kind: "person", role: "supervisor" } });
    expect(removalAppliedOn(store, row)).toBe(AS_OF_DAY);
    const facts = caseFacts(store, row);
    expect(facts.database?.operatorApplicationSentOn).toBe(isoDay(AS_OF_DAY));
    // Tuesday 6 October 2026: 15 working days, to 27 October, counted
    // from the day it is sent (Directive No. 6748-U items 2.6, 2.7).
    const decision = clock(facts).deadlines.find((d) => d.kind === "operator_application_decision")!;
    expect([decision.from, decision.due, decision.forOthers, decision.basis.part]).toEqual(["2026-10-06", "2026-10-27", true, "2.6, 2.7"]);
    // Once only: it cannot be recalled or sent again.
    expect(applyForRemoval(store, row, { role: "reviewer", actor: selfActor("reviewer"), at: NOW, reason: REASONS })).toEqual({ code: "removal-already-sent" });
  });

  it("joins the client's application the Bank of Russia is reviewing: one decision, 15 working days from the first (item 2.8)", () => {
    const store = fresh();
    const row = rows(store, (i) => store.path[i] === Path.DatabaseRemoval && store.pathThen[i]! >= 0)[0]!;
    expect(applyForRemoval(store, row, { role: "reviewer", actor: selfActor("reviewer"), at: NOW, reason: REASONS })).toBeNull();
    const c = clock(caseFacts(store, row));
    const decision = c.deadlines.find((d) => d.kind === "operator_application_decision")!;
    expect([decision.from, decision.basis.part]).toEqual([isoDay(store.pathThen[row]!), "2.8"]);
    expect(decision.due).toBe(c.deadlines.find((d) => d.kind === "exclusion_decision")!.due);
  });

  it("is refused for any other case, for the operator and the signatory, without reasons, or with too long a text", () => {
    const store = fresh();
    const block = rows(store, (i) => store.stream[i] === Stream.Antifraud && store.database[i] === Database.None)[0]!;
    const general = rows(store, (i) => store.stream[i] === Stream.General)[0]!;
    const row = rows(store, (i) => isClientDataCase(store, i))[0]!;
    for (const other of [block, general]) expect(checkRemoval(store, other, "supervisor", REASONS)).toEqual({ code: "removal-not-client-data" });
    for (const role of ["operator", "signatory"] as const) expect(checkRemoval(store, row, role, REASONS)).toEqual({ code: "removal-role" });
    expect(checkRemoval(store, row, "supervisor", "  too short ".slice(0, 9))).toEqual({ code: "removal-reason-required", min: REMOVAL_REASON_MIN });
    const long = "x".repeat(REMOVAL_REASON_MAX + 1);
    expect(checkRemoval(store, row, "supervisor", long)).toEqual({ code: "removal-reason-too-long", max: REMOVAL_REASON_MAX, length: REMOVAL_REASON_MAX + 1 });
    expect(applyForRemoval(store, row, { role: "operator", actor: selfActor("operator"), at: NOW, reason: REASONS })).toEqual({ code: "removal-role" });
    expect(store.journal.get(row)).toBeUndefined();
    expect(removalAppliedOn(store, row)).toBe(-1);
  });
});
