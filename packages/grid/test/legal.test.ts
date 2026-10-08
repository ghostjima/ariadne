import { describe, expect, it } from "vitest";
import { amlReasons, clock, isWorkingDay, nextWorkingDay, od2506Signs, paymentGrounds, workingDaysBetween } from "@ariadne/rules";
import { generateAll } from "../src/generator.js";
import { dayNumber, isoDay } from "../src/days.js";
import { caseFacts, replyFacts, rowReplyFacts } from "../src/legal.js";
import {
  AML_GROUND_OFFSET,
  AML_REASON_CODES,
  AS_OF,
  CORPUS_CHUNK,
  CORPUS_ROWS,
  DEFAULT_SEED,
  Extension,
  GROUNDS,
  GROUND_ORDER,
  Ground,
  Outcome,
  PAYMENT_GROUND_CODES,
  Path,
  SIGN_COUNT,
  Source,
  Stage,
  Stream,
} from "../src/schema.js";
import { RulesFlag, effectiveDue, hasFlag, isAnswered, type ColumnStore } from "../src/store.js";
import { labels as en } from "../src/pools/en.js";
import { labels as ru } from "../src/pools/ru.js";

/*
  The register's legal facts are ariadne-rules' answers, not a second
  implementation: these tests ask the rules module the same questions for
  the generated rows and compare.
*/

const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
const asOf = dayNumber(AS_OF);

/* The facts the generator asked about, read back from the row */
const factsOf = (s: ColumnStore, i: number) => rowReplyFacts(s, i);

const rows = (pred: (i: number) => boolean) => Array.from({ length: store.size }, (_, i) => i).filter(pred);

describe("deadlines come from ariadne-rules", () => {
  it("every row's reply date, extended date and extension notice are the module's", () => {
    for (let i = 0; i < store.size; i += 7) {
      const plain = clock(replyFacts(factsOf(store, i), false));
      expect(isoDay(store.due[i]!), `row ${i}`).toBe(plain.deadlines.find((d) => d.kind === "reply")!.due);
      const asked = clock(replyFacts(factsOf(store, i), true));
      const extended = asked.deadlines.find((d) => d.kind === "reply_extended");
      if (extended) {
        expect(isoDay(store.dueExt[i]!)).toBe(extended.due);
        expect(isoDay(store.extNotice[i]!)).toBe(asked.deadlines.find((d) => d.kind === "extension_notice")!.due);
      } else {
        expect([store.dueExt[i], store.extNotice[i]]).toEqual([-1, -1]);
      }
    }
  });

  it("the working days left are the module's count from the day the data is taken", () => {
    for (let i = 0; i < store.size; i += 11) {
      expect(store.leftBase[i]).toBe(workingDaysBetween(AS_OF, isoDay(store.due[i]!)));
      if (store.dueExt[i]! >= 0) expect(store.leftExt[i]).toBe(workingDaysBetween(AS_OF, isoDay(store.dueExt[i]!)));
    }
  });

  it("registers on a working day, by the next working day after receipt, except the ones flagged late", () => {
    let late = 0;
    for (let i = 0; i < store.size; i++) {
      const received = store.received[i]!;
      const registered = store.registered[i]!;
      expect(registered).toBeGreaterThanOrEqual(received);
      expect(registered).toBeLessThanOrEqual(asOf);
      expect(isWorkingDay(isoDay(registered))).toBe(true);
      const due = dayNumber(nextWorkingDay(isoDay(received)));
      if (hasFlag(store, i, RulesFlag.RegisteredLate)) {
        late++;
        expect(registered).toBeGreaterThan(due);
      } else {
        expect(registered).toBeLessThanOrEqual(due);
      }
    }
    expect(late).toBeGreaterThan(0);
  });

  it("never extends a money claim under 123-FZ: the module refuses it", () => {
    const claims = rows((i) => hasFlag(store, i, RulesFlag.Ombudsman));
    expect(claims.length).toBeGreaterThan(50);
    for (const i of claims) {
      expect(store.stream[i]).toBe(Stream.MoneyClaim);
      expect(hasFlag(store, i, RulesFlag.ExtensionAllowed)).toBe(false);
      expect(store.extension[i]).toBe(Extension.None);
      expect(clock(replyFacts(factsOf(store, i), true)).refusals).toContain("extension_not_allowed");
    }
    /* A claim above 500,000 roubles is a complaint again, and may be extended */
    const above = rows((i) => store.stream[i] === Stream.MoneyClaim && store.claim[i]! > 500_000);
    for (const i of above) expect(hasFlag(store, i, RulesFlag.Ombudsman)).toBe(false);
  });

  it("copies to the Bank of Russia exactly the complaints it forwarded", () => {
    for (let i = 0; i < store.size; i++) {
      expect(hasFlag(store, i, RulesFlag.CopyToBankOfRussia)).toBe(store.source[i] === Source.BankOfRussia);
    }
  });

  it("sends a reply no earlier than registration and no later than the day the data is taken", () => {
    for (let i = 0; i < store.size; i++) {
      if (store.stage[i]! >= Stage.Sent) {
        expect(store.sentOn[i]).toBeGreaterThan(store.registered[i]!);
        expect(store.sentOn[i]).toBeLessThanOrEqual(asOf);
      } else {
        expect(store.sentOn[i]).toBe(-1);
      }
    }
  });
});

describe("the register is consistent", () => {
  it("past drafting, a reply is decided and a refusal names a ground of its stream", () => {
    for (let i = 0; i < store.size; i++) {
      const outcome = store.outcome[i]!;
      if (store.stage[i]! >= Stage.LegalReview) expect(outcome).not.toBe(Outcome.Pending);
      if (store.stage[i]! >= Stage.LegalReview && outcome === Outcome.Refused) expect(store.ground[i]).not.toBe(Ground.None);
      const g = GROUNDS[store.ground[i]!];
      if (g) expect(g.streams).toContain(store.stream[i]);
    }
    /* Drafts with a refusal and no ground yet: what the validation stops */
    expect(rows((i) => store.stage[i] === Stage.Drafting && store.outcome[i] === Outcome.Refused && store.ground[i] === 0).length).toBeGreaterThan(0);
  });

  it("a 161-FZ case carries a sign in force on the day of its operation, a 115-FZ case a category", () => {
    const signs = od2506Signs();
    for (let i = 0; i < store.size; i++) {
      const reason = store.reason[i]!;
      if (store.stream[i] === Stream.Antifraud) {
        expect(reason).toBeGreaterThan(0);
        expect(signs[reason - 1]!.appliesFrom <= isoDay(store.opOn[i]!)).toBe(true);
      } else if (store.stream[i] === Stream.Aml) {
        expect(reason).toBeGreaterThan(0);
        expect(reason).toBeLessThanOrEqual(AML_REASON_CODES.length);
      } else {
        expect(reason).toBe(0);
      }
    }
  });

  it("a linked case is an earlier one of the same client about the same operation", () => {
    const linked = rows((i) => store.linked[i]! >= 0);
    expect(linked.length).toBeGreaterThan(30);
    for (const i of linked) {
      const j = store.linked[i]!;
      expect(j).toBeLessThan(i);
      expect([store.client[i], store.applicant[i], store.opRef[i], store.stream[i]]).toEqual([
        store.client[j],
        store.applicant[j],
        store.opRef[j],
        store.stream[j],
      ]);
    }
  });
});

describe("codes and labels follow ariadne-rules' lists", () => {
  it("one sign label per OD-2506 sign, each starting with the sign's number", () => {
    const signs = od2506Signs();
    expect(signs).toHaveLength(SIGN_COUNT);
    for (const labels of [ru, en]) {
      signs.forEach((s, k) => expect(labels.signs[k]!.startsWith(`${s.number} `), `${s.number}`).toBe(true));
    }
  });

  it("the 115-FZ categories and their grounds cite what the crate cites", () => {
    const list = amlReasons();
    expect(list.map((r) => r.code)).toEqual([...AML_REASON_CODES]);
    list.forEach((r, k) => {
      const ground = GROUNDS[AML_GROUND_OFFSET + k]!;
      expect(ground.id).toBe(r.code);
      expect([ground.act, ground.article, ground.part]).toEqual(["anti_money_laundering", r.article, r.part]);
      expect(en.ground[AML_GROUND_OFFSET + k]).toContain(`art. ${r.article}`);
    });
  });
});

describe("ground codes", () => {
  it("the 161-FZ grounds cite what the crate cites, art. 9 parts 11.6 and 11.7 among them", () => {
    const list = paymentGrounds();
    expect(list.map((g) => g.code)).toEqual(["payment_8_3_4", "payment_8_3_10", "payment_9_11_6", "payment_9_11_7"]);
    list.forEach((g, k) => {
      const code = PAYMENT_GROUND_CODES[k]!;
      const ground = GROUNDS[code]!;
      expect(ground.id).toBe(g.code);
      expect([ground.act, ground.article, ground.part]).toEqual(["payment_system", g.article, g.part]);
      expect(ground.streams).toEqual([Stream.Antifraud]);
      expect(en.ground[code]).toBe(`161-FZ, art. ${g.article}, part ${g.part}`);
      expect(ru.ground[code]).toBe(`161-ФЗ, ст. ${g.article}, ч. ${g.part}`);
    });
  });

  it("are never renumbered: the earlier codes keep their meaning, new grounds are at the end, and a person is offered them in reading order", () => {
    expect(GROUNDS.map((g) => g?.id ?? null)).toEqual([
      null,
      "payment_8_3_4",
      "payment_8_3_10",
      "aml_operation_refused",
      "aml_account_refused",
      "aml_account_terminated",
      "aml_operation_suspended",
      "aml_operation_suspended_by_decision",
      "aml_funds_frozen",
      "aml_high_risk_measures",
      "contract",
      "payment_9_11_6",
      "payment_9_11_7",
    ]);
    expect([Ground.None, Ground.Contract, AML_GROUND_OFFSET]).toEqual([0, 10, 3]);
    expect([...GROUND_ORDER].sort((a, b) => a - b)).toEqual(GROUNDS.map((_, k) => k));
    expect(GROUND_ORDER.map((k) => en.ground[k])).toEqual([
      "None",
      "161-FZ, art. 8, part 3.4",
      "161-FZ, art. 8, part 3.10",
      "161-FZ, art. 9, part 11.6",
      "161-FZ, art. 9, part 11.7",
      "115-FZ, art. 7, item 11",
      "115-FZ, art. 7, item 5.2, paragraph 2",
      "115-FZ, art. 7, item 5.2, paragraph 3",
      "115-FZ, art. 7, item 10",
      "115-FZ, art. 7, item 10.1",
      "115-FZ, art. 7, item 1, subitem 6",
      "115-FZ, art. 7.7, item 5",
      "Contract",
    ]);
  });
});

describe("a case's whole clock", () => {
  it("adds the antifraud and anti-money-laundering facts, so the module gives their deadlines too", () => {
    const blocked = rows((i) => store.stream[i] === Stream.Antifraud && store.operation[i] === 3)[0]!;
    const refusal = rows((i) => store.stream[i] === Stream.Aml && store.reason[i] === 1)[0]!;
    const general = rows((i) => store.stream[i] === Stream.General)[0]!;
    expect(caseFacts(store, blocked).blocked).toEqual({ operation: "transfer", on: isoDay(store.opOn[blocked]!) });
    expect(clock(caseFacts(store, blocked)).deadlines.map((d) => d.kind)).toContain("antifraud_suspension_ends");
    expect(caseFacts(store, refusal).aml).toEqual({ decision: { kind: "refuse_operation", on: isoDay(store.opOn[refusal]!) } });
    expect(clock(caseFacts(store, refusal)).deadlines.map((d) => d.kind)).toContain("aml_reasons_notice");
    const plain = caseFacts(store, general);
    expect([plain.blocked, plain.aml]).toEqual([undefined, undefined]);
    /* The reply's date is the same as the register's */
    for (const i of [blocked, refusal, general]) {
      expect(clock(caseFacts(store, i)).replyDue).toBe(isoDay(effectiveDue(store, i)));
    }
  });

  it("a block rests on 161-FZ art. 8 part 3.4, the first action, for a transfer and for a card, e-money or Faster Payments operation alike", () => {
    const first = GROUNDS.findIndex((g) => g?.id === "payment_8_3_4");
    const second = GROUNDS.findIndex((g) => g?.id === "payment_8_3_10");
    expect([GROUNDS[first]?.part, GROUNDS[second]?.part]).toEqual(["3.4", "3.10"]);
    const blocked = rows((i) => store.stream[i] === Stream.Antifraud && store.ground[i] !== Ground.None);
    expect(blocked.some((i) => store.operation[i] !== 3)).toBe(true);
    /* The register's ground is never part 3.10: a second action (a
       database answer after a confirmation or a repeat, Path.SecondStep)
       is named after part 3.4 by the reply, not stored as the ground */
    for (const i of blocked) expect([first, Ground.Contract], `row ${i}`).toContain(store.ground[i]);
  });

  it("high-risk measures: the notice is taken as received the day they were applied, the earliest end of the client's six months", () => {
    const highRisk = rows((i) => store.stream[i] === Stream.Aml && AML_REASON_CODES[store.reason[i]! - 1] === "aml_high_risk_measures");
    expect(highRisk.length).toBeGreaterThan(0);
    for (const i of highRisk) {
      const on = isoDay(store.opOn[i]!);
      expect(caseFacts(store, i).aml).toEqual({ highRiskMeasuresOn: on, highRiskNoticeReceivedOn: on });
      const application = clock(caseFacts(store, i)).deadlines.find((d) => d.kind === "high_risk_commission_application");
      expect(application?.from, `row ${i}`).toBe(on);
    }
  });
});

describe("the paths beyond the first action or decision", () => {
  const withPath = (path: number) => rows((i) => store.path[i] === path);
  const kinds = (i: number) => clock(caseFacts(store, i)).deadlines.map((d) => d.kind);
  const measures = (i: number) => clock(caseFacts(store, i)).measures.map((m) => m.kind);

  it("are drawn for open cases only, on days no later than the day the data is taken", () => {
    const drawn = rows((i) => store.path[i] !== Path.None);
    expect(drawn.every((i) => !isAnswered(store, i))).toBe(true);
    for (const i of drawn) {
      expect(store.pathOn[i], `row ${i}`).toBeLessThanOrEqual(asOf);
      expect(store.pathThen[i], `row ${i}`).toBeLessThanOrEqual(asOf);
    }
    const none = rows((i) => store.path[i] === Path.None);
    expect(none.every((i) => store.pathOn[i] === -1 && store.pathThen[i] === -1 && store.pathTerm[i] === 0)).toBe(true);
    for (const path of [Path.SecondStep, Path.DatabaseRemoval, Path.CommissionRequest]) expect(withPath(path).length, `path ${path}`).toBeGreaterThan(2);
  });

  it("a second step: confirmed or repeated within the window, then the database answered: part 3.10, and part 3.11 two days on", () => {
    const second = withPath(Path.SecondStep);
    for (const i of second) {
      expect(store.stream[i]).toBe(Stream.Antifraud);
      expect(store.pathOn[i]! - store.opOn[i]!, `row ${i}`).toBeGreaterThanOrEqual(0);
      expect(store.pathOn[i]! - store.opOn[i]!, `row ${i}`).toBeLessThanOrEqual(1);
      expect(caseFacts(store, i).blocked).toMatchObject({ confirmedOn: isoDay(store.pathOn[i]!), databaseMatchAfterConfirmation: true });
      const transfer = store.operation[i] === 3;
      expect(measures(i)).toEqual(transfer ? ["suspend_order", "suspend_confirmed_order"] : ["refuse_operation", "refuse_repeat"]);
      expect(kinds(i)).toEqual(
        expect.arrayContaining(transfer ? ["antifraud_repeat_suspension_ends", "antifraud_after_repeat_suspension"] : ["antifraud_repeat_refusal_ends", "antifraud_after_repeat_refusal"]),
      );
    }
    expect(second.some((i) => store.operation[i] === 3) && second.some((i) => store.operation[i] !== 3)).toBe(true);
    /* Some still run on the day the data is taken: the reply states them */
    expect(second.some((i) => clock(caseFacts(store, i)).deadlines.some((d) => d.kind === "antifraud_repeat_refusal_ends" && d.due >= AS_OF))).toBe(true);
  });

  it("an application to remove the client's data, through the bank: the card suspended under 161-FZ art. 9, forwarded by the next working day, decided in 15 working days from the Bank of Russia's receipt", () => {
    const removal = withPath(Path.DatabaseRemoval);
    for (const i of removal) {
      expect([store.stream[i], store.reason[i]]).toEqual([Stream.Antifraud, 1]);
      expect(store.pathOn[i]).toBeGreaterThanOrEqual(store.received[i]!);
      const c = clock(caseFacts(store, i));
      expect(c.measures.find((m) => m.kind === "suspend_instrument")?.basis).toMatchObject({ source: "payment_law_9", article: "9", part: "11.6" });
      const forwarding = c.deadlines.find((d) => d.kind === "exclusion_forwarding");
      expect(forwarding?.basis).toMatchObject({ source: "directive_6748_u", part: "1.5" });
      expect(c.duties.map((d) => d.kind)).toContain("notify_client_of_right_to_apply");
      if (store.pathThen[i]! >= 0) {
        expect(store.pathThen[i]).toBe(dayNumber(nextWorkingDay(isoDay(store.pathOn[i]!))));
        expect(c.deadlines.find((d) => d.kind === "exclusion_decision")?.from).toBe(isoDay(store.pathThen[i]!));
      } else expect(kinds(i)).not.toContain("exclusion_decision");
    }
  });

  it("the commission's request: the bank's answer in the term it gives, at least 3 working days, 3 when it gives none", () => {
    const requests = withPath(Path.CommissionRequest);
    for (const i of requests) {
      expect(store.stream[i]).toBe(Stream.Aml);
      expect([1, 2]).toContain(store.reason[i]);
      expect(store.pathOn[i]).toBeLessThan(store.pathThen[i]!);
      const c = clock(caseFacts(store, i));
      const answer = c.deadlines.find((d) => d.kind === "commission_request_answer");
      const term = store.pathTerm[i]!;
      expect(answer?.countValue, `row ${i}`).toBe(term === 0 ? 3 : term);
      expect(c.warnings.includes("commission_term_assumed"), `row ${i}`).toBe(term === 0);
      expect(c.deadlines.find((d) => d.kind === "aml_commission_decision")?.from).toBe(isoDay(store.pathOn[i]!));
    }
    expect(requests.some((i) => store.pathTerm[i] === 0) && requests.some((i) => store.pathTerm[i]! > 0)).toBe(true);
  });
});
