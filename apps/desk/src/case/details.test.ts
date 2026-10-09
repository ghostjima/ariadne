import { describe, expect, it } from "vitest";
import { AS_OF, Database, Operation, Path, Restriction, Sector, Stage, Stream, caseFacts, effectiveDue, generateAll, isoDay, retentionOf } from "@ariadne/grid";
import { clock, od2506Signs, workingDaysBetween, type CaseFacts } from "@ariadne/rules";
import { strings } from "../i18n";
import { REPLY_TERMS, caseDetails, termDays } from "./details";
import { storageOf } from "./retention";
import { NAMED_SOURCES, basisName } from "./sources";

const store = generateAll(20261006, 1_200, 400);
const rows = (pred: (i: number) => boolean) => Array.from({ length: store.size }, (_, i) => i).filter(pred);

describe("the case card's facts", () => {
  it("a 161-FZ transfer: the sign with the order's own wording, the suspension and the confirmation", () => {
    const row = rows((i) => store.stream[i] === Stream.Antifraud && store.operation[i] === Operation.BankTransfer)[0]!;
    const d = caseDetails(store, row);
    const sign = d.flags.find((f) => f.kind === "sign");
    expect(sign?.kind === "sign" && sign.sign).toEqual(od2506Signs()[store.reason[row]! - 1]);
    expect(sign?.kind === "sign" && sign.suspended).toBe(true);
    expect(d.flags.filter((f) => f.kind === "deadline").map((f) => f.kind === "deadline" && f.deadline.kind)).toEqual(
      expect.arrayContaining(["antifraud_suspension_ends", "antifraud_confirmation"]),
    );
  });

  it("a 115-FZ refusal: the category with its article, and the reasons notice", () => {
    const row = rows((i) => store.stream[i] === Stream.Aml && store.reason[i] === 1)[0]!;
    const d = caseDetails(store, row);
    const aml = d.flags.find((f) => f.kind === "aml");
    expect(aml?.kind === "aml" && [aml.reason.code, aml.reason.article, aml.reason.part]).toEqual(["aml_operation_refused", "7", "11"]);
    expect(d.flags.some((f) => f.kind === "deadline" && f.deadline.kind === "aml_reasons_notice")).toBe(true);
  });

  it("counts the days off the reply term skips on the production calendar", () => {
    for (const row of [0, 300, 600, 900, 1199]) {
      const d = caseDetails(store, row);
      const due = effectiveDue(store, row);
      expect(d.term.working).toBe(workingDaysBetween(isoDay(store.registered[row]!), isoDay(due)));
      expect(d.term.calendar).toBe(due - store.registered[row]!);
      expect(d.term.calendar - d.term.working).toBe(d.term.weekend + d.term.daysOff.length - d.term.workingWeekends);
      expect(d.reply?.due).toBe(isoDay(store.due[row]!));
    }
    // The November holiday of 2026 (4 November) falls in a term that spans it.
    const nov = termDays(Math.round(Date.UTC(2026, 9, 30) / 86_400_000), Math.round(Date.UTC(2026, 10, 6) / 86_400_000));
    expect(nov.daysOff.map((d) => isoDay(d.day))).toEqual(["2026-11-04"]);
  });

  it("an extension: taken, possible with its notice day, or refused by the rules for a money claim", () => {
    const taken = rows((i) => store.extension[i] === 1)[0]!;
    expect(caseDetails(store, taken).extension.status).toBe("taken");
    const possible = rows((i) => store.extension[i] === 0 && store.dueExt[i]! >= 0)[0]!;
    const p = caseDetails(store, possible).extension;
    expect(p.status === "possible" && p.notice.due).toBe(isoDay(store.extNotice[possible]!));
    const claim = rows((i) => store.stream[i] === Stream.MoneyClaim && store.dueExt[i] === -1)[0]!;
    expect(caseDetails(store, claim).extension).toEqual({ status: "refused", refusals: ["extension_not_allowed"] });
  });

  it("a timeline from receipt to the reply, and the cases linked to it", () => {
    const sent = rows((i) => store.stage[i] === Stage.Sent && store.source[i] === 2)[0]!;
    const kinds = caseDetails(store, sent).timeline.map((e) => e.kind);
    expect(kinds[0]).toBe("received");
    expect(kinds).toEqual(expect.arrayContaining(["registered", "reply_sent", "copy_to_bank_of_russia"]));
    const linked = rows((i) => store.linked[i]! >= 0)[0]!;
    expect(caseDetails(store, linked).related[0]).toEqual({ row: store.linked[linked], relation: "linked" });
    expect(caseDetails(store, store.linked[linked]!).related).toContainEqual({ row: linked, relation: "links_here" });
  });

  it("names every source the clocks of the register cite, in both languages", () => {
    const cited = new Set<string>();
    for (let i = 0; i < store.size; i += 1) {
      const d = caseDetails(store, i);
      for (const deadline of d.clock.deadlines) cited.add(deadline.basis.source);
      for (const duty of d.clock.duties) cited.add(duty.basis.source);
      for (const measure of d.clock.measures) cited.add(measure.basis.source);
    }
    // The paths of the register cite the directive and the regulation too.
    expect(cited).toContain("directive_6748_u");
    expect(cited).toContain("regulation_842_p");
    expect([...cited].filter((s) => !NAMED_SOURCES.includes(s))).toEqual([]);
    const basis = { source: "banking_law_30_1", act: "", article: "30.1", part: "7", revision: "2026-08-04", url: "", reading: "text" as const };
    expect(basisName(basis, "ru")).toBe("Закон о банках № 395-1, ст. 30.1, ч. 7");
    expect(basisName(basis, "en")).toBe("Banking Law No. 395-1, art. 30.1, part 7");
    const aml = { ...basis, source: "aml_law_7", article: "7", part: "5.2, paragraph 2" };
    expect(basisName(aml, "ru")).toBe("115-ФЗ, ст. 7, п. 5.2, абз. 2");
    expect(basisName(aml, "en")).toBe("115-FZ, art. 7, item 5.2, paragraph 2");
    // A Bank of Russia directive or regulation has no article: it is cited
    // by item, and a list of items takes the plural.
    const directive = { ...basis, source: "directive_6748_u", article: "", part: "1.5" };
    expect(basisName(directive, "ru")).toBe("Указание Банка России № 6748-У, п. 1.5");
    expect(basisName(directive, "en")).toBe("Bank of Russia Directive No. 6748-U, item 1.5");
    const decision = { ...directive, part: "2.1, 2.3, 2.4" };
    expect(basisName(decision, "ru")).toBe("Указание Банка России № 6748-У, пп. 2.1, 2.3, 2.4");
    expect(basisName(decision, "en")).toBe("Bank of Russia Directive No. 6748-U, items 2.1, 2.3, 2.4");
    const regulation = { ...basis, source: "regulation_842_p", article: "", part: "2.8" };
    expect(basisName(regulation, "ru")).toBe("Положение Банка России № 842-П, п. 2.8");
    expect(basisName(regulation, "en")).toBe("Bank of Russia Regulation No. 842-P, item 2.8");
    // A sentence and a range of items, in Russian words.
    const payment = { ...basis, source: "payment_law_8", article: "8" };
    expect(basisName({ ...payment, part: "3.4, sentence 2" }, "ru")).toBe("161-ФЗ, ст. 8, ч. 3.4, предл. 2");
    expect(basisName({ ...payment, part: "3.6, items 1 to 3" }, "ru")).toBe("161-ФЗ, ст. 8, ч. 3.6, пп. 1\u20133");
    expect(basisName({ ...payment, part: "3.4, sentence 2" }, "en")).toBe("161-FZ, art. 8, part 3.4, sentence 2");
  });
});

describe("the paths beyond the first step, on the card", () => {
  const withPath = (path: number) => rows((i) => store.path[i] === path);
  const flagKinds = (row: number) => caseDetails(store, row).flags.map((f) => (f.kind === "deadline" ? f.deadline.kind : f.kind === "measure" ? f.measure.kind : f.kind));

  it("a second step: the first action and the second, each with its ground, and the two days that follow", () => {
    for (const row of withPath(Path.SecondStep)) {
      const d = caseDetails(store, row);
      const transfer = store.operation[row] === Operation.BankTransfer;
      const measures = d.flags.flatMap((f) => (f.kind === "measure" ? [[f.measure.kind, f.measure.basis.part]] : []));
      expect(measures, `row ${row}`).toEqual(
        transfer
          ? [
              ["suspend_order", "3.4, sentence 1"],
              ["suspend_confirmed_order", "3.10, sentence 1"],
            ]
          : [
              ["refuse_operation", "3.4, sentence 2"],
              ["refuse_repeat", "3.10, sentence 1"],
            ],
      );
      expect(flagKinds(row)).toEqual(
        expect.arrayContaining(transfer ? ["antifraud_repeat_suspension_ends", "antifraud_after_repeat_suspension"] : ["antifraud_repeat_refusal_ends", "antifraud_after_repeat_refusal"]),
      );
      expect(d.duties.map((x) => x.kind)).toEqual(expect.arrayContaining(["notify_client_of_block", "notify_client_of_repeat_block"]));
    }
  });

  it("an application to remove the client's data: the card suspended under art. 9, the same-day notice, the right to apply, and the bank's and the Bank of Russia's terms", () => {
    for (const row of withPath(Path.DatabaseRemoval)) {
      const d = caseDetails(store, row);
      const atm = d.flags.find((f) => f.kind === "measure" && f.measure.kind === "cap_atm_cash");
      expect(atm?.kind === "measure" && basisName(atm.measure.basis, "en")).toBe("Banking Law No. 395-1, art. 30, part 16");
      expect(flagKinds(row)).toContain("exclusion_forwarding");
      if (store.restriction[row] === Restriction.TransfersCapped) {
        const capped = d.flags.find((f) => f.kind === "measure" && f.measure.kind === "cap_transfers");
        expect(capped?.kind === "measure" && basisName(capped.measure.basis, "ru")).toBe("161-ФЗ, ст. 9, ч. 11.6, предл. 2");
        expect(flagKinds(row)).not.toContain("instrument_suspension_notice");
        continue;
      }
      const suspended = d.flags.find((f) => f.kind === "measure" && f.measure.kind === "suspend_instrument");
      const part = store.database[row] === Database.ClientDataWithPoliceInformation ? "11.7" : "11.6";
      expect(suspended?.kind === "measure" && basisName(suspended.measure.basis, "en")).toBe(`161-FZ, art. 9, part ${part}`);
      expect(flagKinds(row)).toContain("instrument_suspension_notice");
      expect(d.duties.map((x) => x.kind)).toContain("notify_client_of_right_to_apply");
      const forwarding = d.flags.find((f) => f.kind === "deadline" && f.deadline.kind === "exclusion_forwarding");
      expect(forwarding?.kind === "deadline" && basisName(forwarding.deadline.basis, "ru")).toBe("Указание Банка России № 6748-У, п. 1.5");
      if (store.pathThen[row]! >= 0) expect(flagKinds(row)).toContain("exclusion_decision");
    }
  });

  it("the commission's request: the bank's answer by the request's term, 3 working days when it gave none, with the rules' note", () => {
    for (const row of withPath(Path.CommissionRequest)) {
      const d = caseDetails(store, row);
      expect(flagKinds(row)).toEqual(expect.arrayContaining(["commission_request_answer", "aml_commission_decision"]));
      const answer = d.flags.find((f) => f.kind === "deadline" && f.deadline.kind === "commission_request_answer");
      expect(answer?.kind === "deadline" && answer.deadline.basis.source).toBe(store.pathTerm[row] === 0 ? "aml_law_7" : "regulation_842_p");
      expect(d.warnings.includes("commission_term_assumed")).toBe(store.pathTerm[row] === 0);
    }
  });

  it("the reply's own terms stay in the derivation; storage goes with the duties, three years from registration as before", () => {
    for (let row = 0; row < store.size; row += 1) {
      const d = caseDetails(store, row);
      for (const f of d.flags) if (f.kind === "deadline") expect(REPLY_TERMS.has(f.deadline.kind), `row ${row}`).toBe(false);
      // The engine's storage term is the day the desk kept before (the
      // grid's retention), except where the article sets none.
      if (store.sector[row] === Sector.CreditCooperative) {
        expect(d.storage).toBeNull();
        expect(d.warnings).toContain("storage_term_not_set");
      } else expect(d.storage?.due, `row ${row}`).toBe(isoDay(retentionOf(store, row).until));
      expect(storageOf(store, row)).toEqual(d.storage);
    }
  });
});

describe("the card's words for what the rules give", () => {
  // Every code of ariadne-rules' clock (its README lists them).
  const DEADLINES = [
    "no_substance_notice", "stop_correspondence_notice",
    "antifraud_suspension_ends", "antifraud_confirmation", "antifraud_repeat_suspension_ends", "antifraud_after_repeat_suspension",
    "antifraud_repeat_refusal_ends", "antifraud_after_repeat_refusal", "instrument_suspension_notice", "exclusion_forwarding",
    "exclusion_refusal_notice", "exclusion_decision", "exclusion_decision_relay", "bank_of_russia_query_answer", "antifraud_refund",
    "aml_reasons_notice", "aml_documents_answer", "aml_commission_decision", "commission_request_answer", "commission_decision_notice",
    "high_risk_notice", "high_risk_commission_application", "high_risk_rating_review", "operator_application_decision",
  ];
  const MEASURES = [
    "suspend_order", "refuse_operation", "suspend_confirmed_order", "refuse_repeat", "order_not_accepted", "suspend_instrument", "cap_transfers",
    "cap_atm_cash",
  ];
  const DUTIES = ["copy_to_bank_of_russia", "copy_to_sro", "notify_client_of_block", "notify_client_of_repeat_block", "notify_client_of_right_to_apply", "restore_instrument"];
  const WHEN = ["same_day_as_each_dispatch", "same_day_as_reply", "immediately"];
  const WARNINGS = [
    "registration_date_assumed", "registered_late", "money_claim_outside_ombudsman", "money_claim_from_legal_entity",
    "ombudsman_participation_unknown", "breach_date_unknown", "confirmation_late", "confirmation_date_missing",
    "refund_for_individuals_only", "high_risk_for_legal_entities_only", "documents_answer_beyond_text", "sro_copy_not_applicable",
    "ombudsman_term_may_have_passed", "storage_term_not_set", "commission_term_below_minimum", "commission_term_assumed",
    "transfer_cap_for_individuals_only",
  ];

  it("names every term, measure, duty and note in Russian and English", () => {
    for (const lang of ["ru", "en"] as const) {
      const c = strings[lang].case;
      expect(DEADLINES.filter((k) => !c.flagDeadline[k]), lang).toEqual([]);
      expect(MEASURES.filter((k) => !c.measure[k]), lang).toEqual([]);
      expect(DUTIES.filter((k) => !c.duty[k]), lang).toEqual([]);
      expect(WHEN.filter((k) => !c.dutyWhen[k]), lang).toEqual([]);
      expect(WARNINGS.filter((k) => !c.warning[k]), lang).toEqual([]);
    }
  });

  it("names what the rules give for a case beyond the register: no reply on the substance, stopped correspondence, a claim three years after the breach, a refund, a refused documents answer", () => {
    const base: CaseFacts = { stream: "general", receivedOn: "2026-10-01", registeredOn: "2026-10-01", sector: "bank", applicant: "individual" };
    const cases: CaseFacts[] = [
      { ...base, noSubstance: "offensive" },
      { ...base, stopCorrespondence: true },
      { ...base, stream: "money_claim", claimKopecks: 10_000_000, claimStandardForm: false, breachOn: "2023-06-01" },
      { ...base, stream: "antifraud", blocked: { operation: "transfer", on: "2026-09-28", confirmedOn: "2026-10-01", refundClaimReceivedOn: "2026-10-02" } },
      { ...base, stream: "antifraud", database: { instrumentSuspendedOn: "2026-09-28", exclusionReceivedByOperatorOn: "2026-10-01", exclusionDataMissing: true, bankOfRussiaQueryReceivedOn: "2026-10-02", dataRemovedOn: "2026-10-05" } },
      { ...base, stream: "antifraud", applicant: "legal_entity", database: { transfersCappedOn: "2026-09-28" } },
      { ...base, sector: "credit_cooperative" },
    ];
    const seen = { deadlines: new Set<string>(), measures: new Set<string>(), duties: new Set<string>(), warnings: new Set<string>() };
    for (const facts of cases) {
      const c = clock(facts);
      for (const d of c.deadlines) if (!REPLY_TERMS.has(d.kind)) seen.deadlines.add(d.kind);
      for (const m of c.measures) seen.measures.add(m.kind);
      for (const d of c.duties) seen.duties.add(d.kind);
      for (const w of c.warnings) seen.warnings.add(w);
    }
    expect([...seen.deadlines]).toEqual(
      expect.arrayContaining(["no_substance_notice", "stop_correspondence_notice", "antifraud_refund", "exclusion_refusal_notice", "bank_of_russia_query_answer"]),
    );
    expect([...seen.measures]).toEqual(expect.arrayContaining(["order_not_accepted", "suspend_instrument"]));
    expect([...seen.duties]).toContain("restore_instrument");
    expect([...seen.warnings]).toEqual(expect.arrayContaining(["ombudsman_term_may_have_passed", "confirmation_late", "storage_term_not_set", "transfer_cap_for_individuals_only"]));
    for (const lang of ["ru", "en"] as const) {
      const c = strings[lang].case;
      expect([...seen.deadlines].filter((k) => !c.flagDeadline[k])).toEqual([]);
      expect([...seen.measures].filter((k) => !c.measure[k])).toEqual([]);
      expect([...seen.duties].filter((k) => !c.duty[k])).toEqual([]);
      expect([...seen.warnings].filter((k) => !c.warning[k])).toEqual([]);
    }
  });

  it("names every term, measure, duty and note the register's clocks give", () => {
    for (let row = 0; row < store.size; row += 1) {
      const c = clock(caseFacts(store, row));
      for (const lang of ["ru", "en"] as const) {
        const words = strings[lang].case;
        for (const d of c.deadlines) if (!REPLY_TERMS.has(d.kind)) expect(words.flagDeadline[d.kind], `${lang} ${d.kind}`).toBeTruthy();
        for (const m of c.measures) expect(words.measure[m.kind], `${lang} ${m.kind}`).toBeTruthy();
        for (const d of c.duties) expect(words.duty[d.kind] && words.dutyWhen[d.when], `${lang} ${d.kind}`).toBeTruthy();
        for (const w of c.warnings) expect(words.warning[w], `${lang} ${w}`).toBeTruthy();
      }
    }
    expect(AS_OF).toBe("2026-10-06");
  });
});
