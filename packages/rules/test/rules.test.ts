import { beforeAll, describe, expect, it } from "vitest";
import {
  RulesError,
  addWorkingDays,
  amlReasons,
  calendarRange,
  clock,
  dayKind,
  factRequestDue,
  isWorkingDay,
  nextWorkingDay,
  od2506Signs,
  paymentGrounds,
  rubric,
  rulesLoaded,
  rulesVersion,
  workingDaysBetween,
  type Clock,
} from "../src/index.js";
import { loadRulesFromFile } from "../src/node.js";

/*
  The adapter computes nothing itself: these are the crate's own worked
  examples (crates/ariadne-rules/tests), asked through the WebAssembly
  build, so a broken conversion at the boundary shows here.
*/

const due = (c: Clock, kind: string) => c.deadlines.find((d) => d.kind === kind)?.due;

describe("before the module is loaded", () => {
  it("refuses with a code rather than answering", () => {
    expect(rulesLoaded()).toBe(false);
    expect(() => nextWorkingDay("2026-05-08")).toThrow(RulesError);
    expect(() => nextWorkingDay("2026-05-08")).toThrow("rules_not_loaded");
  });
});

describe("through the WebAssembly build", () => {
  beforeAll(() => loadRulesFromFile());

  it("reports the crate's version and the calendar's range", () => {
    expect(rulesVersion()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(calendarRange()).toEqual({ first: "2025-01-01", last: "2027-12-31" });
  });

  it("counts working days across the May holidays of 2026", () => {
    expect(dayKind("2026-05-09")).toBe("holiday");
    expect(dayKind("2026-05-11")).toBe("transferred_day_off");
    expect(isWorkingDay("2026-05-12")).toBe(true);
    expect(nextWorkingDay("2026-05-08")).toBe("2026-05-12");
    expect(addWorkingDays("2026-05-12", 15)).toBe("2026-06-02");
    expect(workingDaysBetween("2026-05-12", "2026-06-02")).toBe(15);
    expect(workingDaysBetween("2026-06-02", "2026-05-12")).toBe(-15);
  });

  it("throws the module's error code for a bad or uncovered date", () => {
    expect(() => nextWorkingDay("2026-02-30")).toThrow("invalid_date");
    expect(() => nextWorkingDay("2030-01-01")).toThrow("outside_calendar");
  });

  it("a complaint received before the May holidays, with the registration assumed", () => {
    const c = clock({ stream: "general", receivedOn: "2026-05-08", electronic: true });
    expect(c.regime).toBe("complaint");
    expect(due(c, "registration")).toBe("2026-05-12");
    expect(due(c, "registration_notice")).toBe("2026-05-08");
    expect(due(c, "reply")).toBe("2026-06-01");
    expect(c.warnings).toEqual(["registration_date_assumed"]);
    const reply = c.deadlines.find((d) => d.kind === "reply")!;
    expect([reply.count, reply.countValue]).toEqual(["working_days", 15]);
    expect([reply.basis.article, reply.basis.part, reply.basis.reading]).toEqual(["30.1", "7", "text"]);
  });

  it("a forwarded complaint extended to obtain documents, with the copy to the Bank of Russia", () => {
    const c = clock({
      stream: "antifraud",
      receivedOn: "2026-05-08",
      registeredOn: "2026-05-12",
      origin: "forwarded_by_bank_of_russia",
      extension: { ground: "request_documents", workingDays: 10 },
    });
    expect(due(c, "reply")).toBe("2026-06-02");
    expect(due(c, "extension_notice")).toBe("2026-06-02");
    expect(due(c, "reply_extended")).toBe("2026-06-17");
    expect(c.replyDue).toBe("2026-06-17");
    expect(c.refusals).toEqual([]);
    expect(c.duties.map((d) => [d.kind, d.when, d.basis.article, d.basis.part])).toEqual([
      ["copy_to_bank_of_russia", "same_day_as_each_dispatch", "30.1", "15"],
    ]);
  });

  it("a money claim under 123-FZ is never extended", () => {
    const c = clock({
      stream: "money_claim",
      receivedOn: "2026-04-27",
      claimKopecks: 120_000 * 100,
      claimStandardForm: true,
      breachOn: "2026-03-01",
      extension: { ground: "request_documents", workingDays: 10 },
    });
    expect(c.regime).toBe("ombudsman_claim");
    expect(due(c, "reply")).toBe("2026-05-20");
    expect(c.refusals).toEqual(["extension_not_allowed"]);
    expect(due(c, "reply_extended")).toBeUndefined();
    expect(c.replyDue).toBe("2026-05-20");
  });

  it("an antifraud block brings its own deadlines, an AML refusal its own", () => {
    const block = clock({ stream: "antifraud", receivedOn: "2026-05-08", blocked: { operation: "transfer", on: "2026-05-06" } });
    expect(block.deadlines.map((d) => d.kind)).toContain("antifraud_suspension_ends");
    const aml = clock({ stream: "aml_refusal", receivedOn: "2026-05-08", aml: { decision: { kind: "refuse_operation", on: "2026-05-06" } } });
    expect(aml.deadlines.map((d) => d.kind)).toContain("aml_reasons_notice");
  });

  it("names part 3.4 as the first ground and part 3.10 as the second, and the database's terms", () => {
    // The crate's worked example: a card operation refused on Friday 8 May
    // 2026 and repeated the same day into a database match; the client's
    // card suspended on 9 May; the Bank of Russia receives the application
    // to remove the data on 12 May and decides by 2 June.
    const c = clock({
      stream: "antifraud",
      receivedOn: "2026-05-08",
      blocked: { operation: "card_sbp_or_emoney", on: "2026-05-08", confirmedOn: "2026-05-08", databaseMatchAfterConfirmation: true },
      database: { instrumentSuspendedOn: "2026-05-09", exclusionReceivedByBankOfRussiaOn: "2026-05-12" },
    });
    expect(c.measures.map((m) => [m.kind, m.on, m.basis.part])).toEqual([
      ["refuse_operation", "2026-05-08", "3.4, sentence 2"],
      ["refuse_repeat", "2026-05-08", "3.10, sentence 1"],
      ["suspend_instrument", "2026-05-09", "11.6"],
      ["cap_atm_cash", "2026-05-09", "16"],
    ]);
    expect(due(c, "antifraud_after_repeat_refusal")).toBe("2026-05-10");
    expect(due(c, "antifraud_repeat_suspension_ends")).toBeUndefined();
    expect(due(c, "instrument_suspension_notice")).toBe("2026-05-09");
    const decision = c.deadlines.find((d) => d.kind === "exclusion_decision")!;
    expect([decision.due, decision.from, decision.basis.source, decision.basis.article]).toEqual(["2026-06-02", "2026-05-12", "directive_6748_u", ""]);
  });

  it("gives the Bank of Russia's 15 working days on the bank's own application to remove the client's data", () => {
    // Sent on Tuesday 12 May 2026 (161-FZ art. 9 part 11.9): decided by
    // 2 June, counted from the day it is sent (Directive No. 6748-U items
    // 2.6, 2.7, a conservative reading); with the client's application
    // received on 8 May and not decided, one decision by 1 June (item 2.8).
    const facts = { stream: "antifraud", receivedOn: "2026-05-12", database: { operatorApplicationSentOn: "2026-05-12" } } as const;
    const decision = clock(facts).deadlines.find((d) => d.kind === "operator_application_decision")!;
    expect([decision.due, decision.from, decision.forOthers, decision.basis.part, decision.basis.reading]).toEqual(["2026-06-02", "2026-05-12", true, "2.6, 2.7", "conservative"]);
    const joined = clock({ ...facts, database: { ...facts.database, exclusionReceivedByBankOfRussiaOn: "2026-05-08" } }).deadlines.find((d) => d.kind === "operator_application_decision")!;
    expect([joined.due, joined.from, joined.basis.part]).toEqual(["2026-06-01", "2026-05-08", "2.8"]);
  });

  it("caps the transfers instead of the suspension under part 11.6, and ATM cash either way; the rubric reads the restrictions a reply states", () => {
    // Not suspended but capped on Saturday 9 May 2026 (161-FZ art. 9 part
    // 11.6, sentence 2), and the ATM cash cap of the Banking Law art. 30
    // part 16 from the same day.
    const facts = { stream: "antifraud", receivedOn: "2026-05-12", database: { transfersCappedOn: "2026-05-09" } } as const;
    const c = clock(facts);
    expect(c.measures.map((m) => [m.kind, m.on, m.basis.source, m.basis.part])).toEqual([
      ["cap_transfers", "2026-05-09", "payment_law_9", "11.6, sentence 2"],
      ["cap_atm_cash", "2026-05-09", "banking_law_30", "16"],
    ]);
    expect(clock({ ...facts, database: { ...facts.database, policeInformation: true } }).refusals).toEqual(["transfer_cap_not_allowed"]);
    const reply = { repliedOn: "2026-05-12", text: "Переводы ограничены.", measures: ["suspend_instrument"] };
    expect(rubric(reply, facts).filter((f) => f.code.startsWith("measure_")).map((f) => [f.code, f.subject, f.source])).toEqual([
      ["measure_not_taken", "suspend_instrument", "letter_in_03_59_11"],
      ["measure_missing", "cap_transfers", "letter_in_03_59_11"],
      ["measure_missing", "cap_atm_cash", "letter_in_03_59_11"],
    ]);
    expect(rubric({ ...reply, measures: ["cap_transfers", "cap_atm_cash"] }, facts).filter((f) => f.code.startsWith("measure_"))).toEqual([]);
    expect(() => rubric({ ...reply, measures: ["cap_everything"] }, facts)).toThrow("unknown_code");
  });

  it("caps a fact request by the external terms that bind the answering unit", () => {
    // The crate's worked example: documents against a refused operation
    // submitted on 8 May 2026 are answered by 20 May; a fact request on
    // 19 May, two working days to 21 May by the internal policy, is due on
    // 20 May.
    const facts = {
      stream: "aml_refusal",
      receivedOn: "2026-05-08",
      aml: { decision: { kind: "refuse_operation", on: "2026-04-30" }, documentsSubmittedOn: "2026-05-08" },
    } as const;
    expect(factRequestDue(facts, "2026-05-19")).toEqual({ due: "2026-05-20", policyDue: "2026-05-21", cappedBy: "aml_documents_answer" });
    expect(factRequestDue(facts, "2026-05-08")).toEqual({ due: "2026-05-13", policyDue: "2026-05-13", cappedBy: null });
    expect(() => factRequestDue(facts, "2026-5-19")).toThrow("invalid_date");
  });

  it("the notices of the complaint article, the storage term and the commission's terms", () => {
    const c = clock({
      stream: "aml_refusal",
      receivedOn: "2026-05-12",
      registeredOn: "2026-05-12",
      noSubstance: "illegible",
      aml: { commissionRequest: { receivedOn: "2026-06-04" }, commissionDecidedOn: "2026-06-26", ratingReviewReceivedOn: "2026-06-01" },
      applicant: "legal_entity",
    });
    expect(due(c, "no_substance_notice")).toBe("2026-05-19");
    expect(due(c, "storage_until")).toBe("2029-05-12");
    expect(c.deadlines.find((d) => d.kind === "storage_until")!.count).toBe("years");
    expect(due(c, "commission_request_answer")).toBe("2026-06-09");
    expect(c.warnings).toContain("commission_term_assumed");
    expect(due(c, "commission_decision_notice")).toBe("2026-07-01");
    expect(due(c, "high_risk_rating_review")).toBe("2026-06-23");
  });

  it("lists the 14 signs of OD-2506, the 115-FZ categories and the 161-FZ grounds, once", () => {
    const signs = od2506Signs();
    expect(signs).toHaveLength(14);
    expect(signs[9]).toMatchObject({ number: "1.10", code: "od2506_1_10", group: "transfers" });
    expect(signs[9]!.wording.length).toBeGreaterThan(20);
    expect(od2506Signs()).toBe(signs);
    const aml = amlReasons();
    expect(aml.map((r) => r.code)).toEqual([
      "aml_operation_refused",
      "aml_account_refused",
      "aml_account_terminated",
      "aml_operation_suspended",
      "aml_operation_suspended_by_decision",
      "aml_funds_frozen",
      "aml_high_risk_measures",
    ]);
    expect(aml[0]).toMatchObject({ article: "7", part: "11" });
    const grounds = paymentGrounds();
    expect(grounds.map((g) => [g.code, g.source, g.article, g.part])).toEqual([
      ["payment_8_3_4", "payment_law_8", "8", "3.4"],
      ["payment_8_3_10", "payment_law_8", "8", "3.10"],
      ["payment_9_11_6", "payment_law_9", "9", "11.6"],
      ["payment_9_11_7", "payment_law_9", "9", "11.7"],
    ]);
    expect(paymentGrounds()).toBe(grounds);
  });

  it("the rubric finds a missing ground and mixed grounds", () => {
    const facts = { stream: "antifraud", receivedOn: "2026-05-08" } as const;
    const bare = rubric({ repliedOn: "2026-05-20", text: "Ваша операция приостановлена." }, facts);
    expect(bare.map((f) => f.code)).toContain("ground_missing");
    const mixed = rubric(
      {
        repliedOn: "2026-05-20",
        text: "Операция приостановлена.",
        grounds: [
          { act: "payment_system", article: "8", part: "3.4" },
          { act: "anti_money_laundering", article: "7", part: "11" },
        ],
      },
      facts,
    );
    expect(mixed.map((f) => f.code)).toContain("grounds_mixed");
  });
});
