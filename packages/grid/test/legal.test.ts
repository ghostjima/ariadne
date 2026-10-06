import { describe, expect, it } from "vitest";
import { amlReasons, clock, isWorkingDay, nextWorkingDay, od2506Signs, workingDaysBetween } from "@ariadne/rules";
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
  Ground,
  Outcome,
  SIGN_COUNT,
  Source,
  Stage,
  Stream,
} from "../src/schema.js";
import { RulesFlag, effectiveDue, hasFlag, type ColumnStore } from "../src/store.js";
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
});
