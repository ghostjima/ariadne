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
  replyProvisions,
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

  it("runs the ATM cash cap from the day the bank received the database information, and ends each measure when the data leave the database", () => {
    // Received on Thursday 7 May 2026, the card suspended under part 11.6
    // on Saturday 9 May, the data removed on 20 May: ATM cash is capped
    // from 7 May (Banking Law art. 30 part 16), the transfer cap of part
    // 11.6, sentence 2 ran on 7 and 8 May, and the suspension and the ATM
    // cash cap end on 20 May.
    const facts = {
      stream: "antifraud",
      receivedOn: "2026-05-12",
      database: { informationReceivedOn: "2026-05-07", instrumentSuspendedOn: "2026-05-09", dataRemovedOn: "2026-05-20" },
    } as const;
    const c = clock(facts);
    expect(c.measures.map((m) => [m.kind, m.on, m.until, m.basis.part])).toEqual([
      ["suspend_instrument", "2026-05-09", "2026-05-20", "11.6"],
      ["cap_transfers", "2026-05-07", "2026-05-09", "11.6, sentence 2"],
      ["cap_atm_cash", "2026-05-07", "2026-05-20", "16"],
    ]);
    expect(c.warnings).not.toContain("database_information_date_assumed");
    // Without the day of receipt the cap is dated by the day the bank
    // acted, and the clock says the start is assumed; no end is known.
    const assumed = clock({ stream: "antifraud", receivedOn: "2026-05-12", database: { instrumentSuspendedOn: "2026-05-09" } });
    expect(assumed.measures.map((m) => [m.kind, m.on, m.until])).toEqual([
      ["suspend_instrument", "2026-05-09", null],
      ["cap_atm_cash", "2026-05-09", null],
    ]);
    expect(assumed.warnings).toContain("database_information_date_assumed");
    expect(() => clock({ ...facts, database: { ...facts.database, informationReceivedOn: "2026-05-10" } })).toThrow("dates_out_of_order");
  });

  it("lifts a suspension chosen under part 11.6 in favour of the transfer cap, and refuses the lift under part 11.7", () => {
    // Suspended on Saturday 9 May 2026 and lifted on Wednesday 13 May: the
    // suspension ends that day and the cap of part 11.6, sentence 2 starts
    // (a conservative reading); ATM cash stays capped from the receipt.
    const facts = {
      stream: "antifraud",
      receivedOn: "2026-05-12",
      database: { informationReceivedOn: "2026-05-09", instrumentSuspendedOn: "2026-05-09", suspensionLiftedOn: "2026-05-13" },
    } as const;
    const c = clock(facts);
    expect(c.refusals).toEqual([]);
    expect(c.measures.map((m) => [m.kind, m.on, m.until, m.basis.part, m.basis.reading])).toEqual([
      ["suspend_instrument", "2026-05-09", "2026-05-13", "11.6", "text"],
      ["cap_transfers", "2026-05-13", null, "11.6, sentence 2", "conservative"],
      ["cap_atm_cash", "2026-05-09", null, "16", "text"],
    ]);
    const police = clock({ ...facts, database: { ...facts.database, policeInformation: true } });
    expect(police.refusals).toEqual(["suspension_lift_not_allowed"]);
    expect(police.measures.map((m) => [m.kind, m.until, m.basis.part])).toEqual([
      ["suspend_instrument", null, "11.7"],
      ["cap_atm_cash", null, "16"],
    ]);
    expect(() => clock({ stream: "antifraud", receivedOn: "2026-05-12", database: { suspensionLiftedOn: "2026-05-13" } })).toThrow("missing_date");
  });

  it("gives every option, deadline and restriction of a reply its own provision, and each finding the provision of what it misses", () => {
    // The client's card suspended on Saturday 9 May 2026 for the client's
    // own data, the Bank of Russia reviewing the client's application
    // since 12 May: the option is 161-FZ art. 9 part 11.8, the decision's
    // 15 working days part 11.10, the suspension part 11.6, the ATM cash
    // cap the Banking Law art. 30 part 16.
    const facts = {
      stream: "antifraud",
      receivedOn: "2026-05-12",
      database: { informationReceivedOn: "2026-05-09", instrumentSuspendedOn: "2026-05-09", exclusionReceivedByBankOfRussiaOn: "2026-05-12" },
    } as const;
    const cite = (b: { source: string; article: string; part: string }) => [b.source, b.article, b.part];
    const p = replyProvisions(facts, "2026-05-12");
    expect(p.options.map((x) => [x.code, ...cite(x.basis)])).toEqual([["apply_for_removal", "payment_law_9", "9", "11.8"]]);
    expect(p.deadlines.map((x) => [x.code, ...cite(x.basis)])).toEqual([["exclusion_decision", "payment_law_9", "9", "11.10"]]);
    expect(p.measures.map((x) => [x.code, ...cite(x.basis)])).toEqual([
      ["suspend_instrument", "payment_law_9", "9", "11.6"],
      ["cap_atm_cash", "banking_law_30", "30", "16"],
    ]);
    expect(cite(p.content)).toEqual(["banking_law_30_1", "30.1", "9"]);
    expect(cite(p.complaintToBankOfRussia!)).toEqual(["central_bank_law_79_3", "79.3", "1"]);
    expect(replyProvisions({ ...facts, applicant: "legal_entity" }, "2026-05-12").complaintToBankOfRussia).toBeNull();
    // An empty reply: every finding about one of them cites the same
    // provision, and the letter stays the source of the duty to state it.
    const found = rubric({ repliedOn: "2026-05-12", text: "" }, facts);
    const own = (code: string, subject: string | null) => found.find((f) => f.code === code && f.subject === subject)?.provision;
    expect(cite(own("client_option_missing", "apply_for_removal")!)).toEqual(["payment_law_9", "9", "11.8"]);
    expect(cite(own("deadline_missing", "exclusion_decision")!)).toEqual(["payment_law_9", "9", "11.10"]);
    expect(cite(own("measure_missing", "cap_atm_cash")!)).toEqual(["banking_law_30", "30", "16"]);
    expect(cite(own("ground_missing", null)!)).toEqual(["banking_law_30_1", "30.1", "9"]);
    expect(own("text_empty", null)).toBeNull();
    expect(found.find((f) => f.code === "measure_missing")?.source).toBe("letter_in_03_59_11");
    expect(() => replyProvisions(facts, "2026-5-12")).toThrow("invalid_date");
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
      // A refusal to forward an incomplete application: the directive's
      // item, with no article.
      ["directive_6748_u_1_3", "directive_6748_u", "", "1.3"],
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
