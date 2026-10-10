import { describe, expect, it } from "vitest";
import { clock } from "@ariadne/rules";
import { generateAll } from "../src/generator.js";
import { isoDay } from "../src/days.js";
import { caseFacts, queryAnsweredOn, queryReceivedOn, removalAppliedOn } from "../src/legal.js";
import { selfActor } from "../src/history.js";
import { Applicant, CORPUS_CHUNK, CORPUS_ROWS, DEFAULT_SEED, Database, Path, Restriction, Stream } from "../src/schema.js";
import { AS_OF_DAY } from "../src/store.js";
import { caseJournal, deskNow } from "../src/workflow.js";
import {
  ANSWER_REASON_MIN,
  LIFT_REASON_MAX,
  LIFT_REASON_MIN,
  REMOVAL_REASON_MAX,
  REMOVAL_REASON_MIN,
  answerQuery,
  applyForRemoval,
  checkLift,
  checkQueryAnswer,
  checkQueryIntake,
  checkRemoval,
  isClientDataCase,
  liftAllowed,
  liftSuspension,
  liftedOn,
  queryAnswerOf,
  recordQuery,
} from "../src/database.js";

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

describe("the Bank of Russia's request on an application the client filed with it directly", () => {
  it("is recorded the day it arrives, gives the bank 3 working days from the rules engine, and is answered with the bank's view and reasons", () => {
    const store = fresh();
    const row = rows(store, (i) => isClientDataCase(store, i) && store.path[i] !== Path.DatabaseRemoval)[0]!;
    const stage = store.stage[row];
    expect(checkQueryAnswer(store, row, "reviewer", "unjustified", REASONS)).toEqual({ code: "query-not-received" });
    expect(recordQuery(store, row, { role: "operator", actor: selfActor("operator"), at: NOW })).toBeNull();
    expect(store.stage[row]).toBe(stage);
    expect(caseJournal(store, row).at(-1)).toMatchObject({ action: "query_received", from: stage, to: stage });
    expect(queryReceivedOn(store, row)).toBe(AS_OF_DAY);
    const facts = caseFacts(store, row);
    expect(facts.database?.bankOfRussiaQueryReceivedOn).toBe(isoDay(AS_OF_DAY));
    // Tuesday 6 October 2026: 7, 8, 9 October (Directive No. 6748-U item
    // 2.9). The client filed directly, so no relay and no forwarding.
    const c = clock(facts);
    const answer = c.deadlines.find((d) => d.kind === "bank_of_russia_query_answer")!;
    expect([answer.due, answer.forOthers, answer.basis.part]).toEqual(["2026-10-09", false, "2.9"]);
    expect(c.deadlines.map((d) => d.kind)).not.toEqual(expect.arrayContaining(["exclusion_decision_relay", "exclusion_forwarding"]));
    expect(recordQuery(store, row, { role: "supervisor", actor: selfActor("supervisor"), at: NOW })).toEqual({ code: "query-already-received" });
    // The answer: the view and the reasons, by the legal reviewer.
    expect(checkQueryAnswer(store, row, "reviewer", null, REASONS)).toEqual({ code: "query-view-required" });
    expect(checkQueryAnswer(store, row, "reviewer", "unjustified", "short")).toEqual({ code: "query-reason-required", min: ANSWER_REASON_MIN });
    for (const role of ["operator", "signatory"] as const) expect(checkQueryAnswer(store, row, role, "unjustified", REASONS)).toEqual({ code: "query-role" });
    expect(answerQuery(store, row, { role: "reviewer", actor: selfActor("reviewer"), at: NOW, view: "unjustified", reason: ` ${REASONS} ` })).toBeNull();
    expect(caseJournal(store, row).at(-1)).toMatchObject({ action: "query_answered", view: "unjustified", comment: REASONS });
    expect(queryAnsweredOn(store, row)).toBe(AS_OF_DAY);
    expect(queryAnswerOf(store, row)).toEqual({ on: AS_OF_DAY, view: "unjustified" });
    expect(answerQuery(store, row, { role: "supervisor", actor: selfActor("supervisor"), at: NOW, view: "justified", reason: REASONS })).toEqual({
      code: "query-already-answered",
    });
  });

  it("is not recorded where the client applied through the bank, for any other case, or by the legal reviewer or the signatory", () => {
    const store = fresh();
    const through = rows(store, (i) => store.path[i] === Path.DatabaseRemoval)[0]!;
    const block = rows(store, (i) => store.stream[i] === Stream.Antifraud && store.database[i] === Database.None)[0]!;
    const row = rows(store, (i) => isClientDataCase(store, i) && store.path[i] !== Path.DatabaseRemoval)[0]!;
    expect(checkQueryIntake(store, through, "supervisor")).toEqual({ code: "query-through-bank" });
    expect(checkQueryIntake(store, block, "supervisor")).toEqual({ code: "query-not-client-data" });
    for (const role of ["reviewer", "signatory"] as const) expect(checkQueryIntake(store, row, role)).toEqual({ code: "query-role" });
    expect(recordQuery(store, row, { role: "reviewer", actor: selfActor("reviewer"), at: NOW })).toEqual({ code: "query-role" });
    expect(store.journal.get(row)).toBeUndefined();
    expect(caseFacts(store, row).database?.bankOfRussiaQueryReceivedOn).toBeUndefined();
  });
});


describe("lifting a suspension the bank chose under 161-FZ art. 9 part 11.6", () => {
  const WHY = "The client explained the transfer; antifraud agreed to the cap instead.";
  const suspended = (s: ReturnType<typeof fresh>, applicant: number) =>
    rows(s, (i) => s.database[i] === Database.ClientData && s.restriction[i] === Restriction.InstrumentSuspended && s.applicant[i] === applicant)[0]!;

  it("ends the suspension that day, starts an individual's transfer cap on a conservative reading, keeps the ATM cash cap, and is journaled with the bank's reasons", () => {
    const store = fresh();
    const row = suspended(store, Applicant.Individual);
    expect(liftedOn(store, row)).toBe(-1);
    expect(liftAllowed(store, row)).toBe(true);
    const stage = store.stage[row];
    const before = clock(caseFacts(store, row));
    expect(before.measures.find((m) => m.kind === "suspend_instrument")).toMatchObject({ until: null });
    expect(liftSuspension(store, row, { role: "reviewer", actor: selfActor("reviewer"), at: NOW, reason: ` ${WHY} ` })).toBeNull();
    expect(store.stage[row]).toBe(stage);
    expect(caseJournal(store, row).at(-1)).toMatchObject({ action: "suspension_lifted", from: stage, to: stage, comment: WHY, actor: { kind: "person", role: "reviewer" } });
    expect(liftedOn(store, row)).toBe(AS_OF_DAY);
    // The register shows the cap from now on; the facts keep the history.
    expect(store.restriction[row]).toBe(Restriction.TransfersCapped);
    const facts = caseFacts(store, row);
    expect(facts.database).toMatchObject({ instrumentSuspendedOn: isoDay(store.opOn[row]!), suspensionLiftedOn: isoDay(AS_OF_DAY) });
    expect(facts.database?.transfersCappedOn).toBeUndefined();
    const c = clock(facts);
    expect(c.refusals).toEqual([]);
    const today = isoDay(AS_OF_DAY);
    expect(c.measures.find((m) => m.kind === "suspend_instrument")).toMatchObject({ on: isoDay(store.opOn[row]!), until: today });
    const cap = c.measures.filter((m) => m.kind === "cap_transfers").at(-1)!;
    expect([cap.on, cap.until, cap.basis.source, cap.basis.part, cap.basis.reading]).toEqual([today, null, "payment_law_9", "11.6, sentence 2", "conservative"]);
    expect(c.measures.find((m) => m.kind === "cap_atm_cash")).toMatchObject({ on: isoDay(store.recordOn[row]!), until: null });
    // Once only.
    expect(liftSuspension(store, row, { role: "supervisor", actor: selfActor("supervisor"), at: NOW, reason: WHY })).toEqual({ code: "lift-already-lifted" });
  });

  it("leaves a legal entity with no restriction of its transfers: the cap is an individual's", () => {
    const store = fresh();
    const row = suspended(store, Applicant.LegalEntity);
    expect(liftSuspension(store, row, { role: "supervisor", actor: selfActor("supervisor"), at: NOW, reason: WHY })).toBeNull();
    expect(store.restriction[row]).toBe(Restriction.None);
    const c = clock(caseFacts(store, row));
    expect(c.measures.map((m) => [m.kind, m.until])).toEqual([
      ["suspend_instrument", isoDay(AS_OF_DAY)],
      ["cap_atm_cash", null],
    ]);
    expect(c.warnings).toContain("transfer_cap_for_individuals_only");
  });

  it("is refused by the rules where the suspension is a duty (part 11.7), where the bank chose the cap, for any other case, for the operator and the signatory, and without reasons", () => {
    const store = fresh();
    const police = rows(store, (i) => store.database[i] === Database.ClientDataWithPoliceInformation)[0]!;
    const capped = rows(store, (i) => store.restriction[i] === Restriction.TransfersCapped)[0]!;
    const block = rows(store, (i) => store.stream[i] === Stream.Antifraud && store.database[i] === Database.None)[0]!;
    const row = suspended(store, Applicant.Individual);
    expect(liftAllowed(store, police)).toBe(false);
    expect(checkLift(store, police, "supervisor", WHY)).toEqual({ code: "lift-not-allowed" });
    expect(liftAllowed(store, capped)).toBe(false);
    expect(checkLift(store, capped, "supervisor", WHY)).toEqual({ code: "lift-not-suspended" });
    expect(checkLift(store, block, "supervisor", WHY)).toEqual({ code: "lift-not-client-data" });
    for (const role of ["operator", "signatory"] as const) expect(checkLift(store, row, role, WHY)).toEqual({ code: "lift-role" });
    expect(checkLift(store, row, "supervisor", "too short")).toEqual({ code: "lift-reason-required", min: LIFT_REASON_MIN });
    const long = "x".repeat(LIFT_REASON_MAX + 1);
    expect(checkLift(store, row, "supervisor", long)).toEqual({ code: "lift-reason-too-long", max: LIFT_REASON_MAX, length: LIFT_REASON_MAX + 1 });
    expect(liftSuspension(store, police, { role: "supervisor", actor: selfActor("supervisor"), at: NOW, reason: WHY })).toEqual({ code: "lift-not-allowed" });
    expect(store.journal.get(police)).toBeUndefined();
    expect(store.restriction[police]).toBe(Restriction.InstrumentSuspended);
    expect(caseFacts(store, police).database?.suspensionLiftedOn).toBeUndefined();
  });
});
