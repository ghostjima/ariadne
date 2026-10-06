import { describe, expect, it } from "vitest";
import { clock } from "@ariadne/rules";
import { generateAll } from "../src/generator.js";
import { dayNumber } from "../src/days.js";
import { replyFacts, rowReplyFacts } from "../src/legal.js";
import { EMPTY_CRITERIA, filterRows } from "../src/filter.js";
import { selfActor } from "../src/history.js";
import { CORPUS_CHUNK, CORPUS_ROWS, Copy, CopyClass, DEFAULT_SEED, Extension, Outcome, Sector, Source, Stage, Stream } from "../src/schema.js";
import { AS_OF_DAY, RulesFlag, copyClass, isAnswered } from "../src/store.js";
import { caseJournal } from "../src/workflow.js";
import { PRESET_VIEWS, criteriaFor, parseView } from "../src/views.js";
import { copiesOwed, copiesSent, dispatchReply, extendDeadline, markBreach, markCopySent } from "../src/dispatch.js";
import { plusYears, retentionOf } from "../src/retention.js";

/*
  What goes out with a reply: the companies of the group and their
  copies to the self-regulatory organisation, the copies to the Bank of
  Russia, the dispatch, the supervisor's extension with its reason, and how
  long a case is kept.
*/

const NOW = Date.UTC(2026, 9, 6, 9);
const fresh = () => generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
const store = fresh();
const rows = (pred: (i: number) => boolean, s = store) => Array.from({ length: s.size }, (_, i) => i).filter(pred);
const by = { role: "signatory" as const, actor: selfActor("signatory"), at: NOW };

describe("the companies of the group", () => {
  it("non-bank companies get general complaints and money claims only, never a money claim to a broker; a linked case is to the same company", () => {
    const nonBank = rows((i) => store.sector[i] !== Sector.Bank);
    expect(nonBank.length).toBeGreaterThan(50);
    for (const i of nonBank) expect([Stream.General, Stream.MoneyClaim], `row ${i}`).toContain(store.stream[i]);
    expect(rows((i) => store.sector[i] === Sector.SecuritiesProfessional && store.stream[i] === Stream.MoneyClaim)).toEqual([]);
    for (const i of rows((i) => store.linked[i]! >= 0)) expect(store.sector[i], `row ${i}`).toBe(store.sector[store.linked[i]!]);
    for (let s = Sector.Microfinance; s <= Sector.CreditCooperative; s++) expect(nonBank.some((i) => store.sector[i] === s)).toBe(true);
  });

  it("a company's reply clock is the bank's: the same template of 442-FZ, and 123-FZ by law for the money claims it gets", () => {
    for (const i of rows((i) => store.sector[i] !== Sector.Bank)) {
      const own = clock(replyFacts(rowReplyFacts(store, i), false));
      const bank = clock(replyFacts({ ...rowReplyFacts(store, i), sector: Sector.Bank, breach: false }, false));
      expect(own.replyDue, `row ${i}`).toBe(bank.replyDue);
      expect(own.regime, `row ${i}`).toBe(bank.regime);
    }
  });

  it("a breach of a standard is found only in a non-bank company's case, and owes its self-regulatory organisation a copy", () => {
    const breaches = rows((i) => store.breach[i] === 1);
    expect(breaches.length).toBeGreaterThan(0);
    for (const i of breaches) {
      expect(store.sector[i]).not.toBe(Sector.Bank);
      expect(store.rules[i]! & RulesFlag.CopyToSro).not.toBe(0);
      if (isAnswered(store, i)) expect(store.copies[i]! & Copy.SroDue).not.toBe(0);
    }
    for (const i of rows((i) => store.breach[i] === 0)) expect(store.rules[i]! & RulesFlag.CopyToSro, `row ${i}`).toBe(0);
  });
});

describe("the copies", () => {
  it("every answered forwarded case owed the Bank of Russia a copy on the day of the reply; earlier ones went out", () => {
    for (const i of rows((i) => isAnswered(store, i) && store.source[i] === Source.BankOfRussia)) {
      expect(store.copies[i]! & Copy.BankOfRussiaDue, `row ${i}`).not.toBe(0);
      if (store.sentOn[i]! < AS_OF_DAY) expect(store.copies[i]! & Copy.BankOfRussiaSent, `row ${i}`).not.toBe(0);
    }
    for (const i of rows((i) => !isAnswered(store, i))) expect(store.copies[i], `row ${i}`).toBe(0);
  });

  it("the view of copies due today: replies sent today with a copy still owed", () => {
    const view = PRESET_VIEWS.find((v) => v.name === "copiesDueToday")!;
    const due = filterRows(store, null, criteriaFor(view, "supervisor")).index;
    expect(due.length).toBeGreaterThan(0);
    for (const i of due) {
      expect(copyClass(store, i)).toBe(CopyClass.DueToday);
      expect(store.sentOn[i]).toBe(AS_OF_DAY);
      expect(copiesOwed(store, i).length).toBeGreaterThan(0);
    }
    const facets = filterRows(store, null, EMPTY_CRITERIA).facets.copy;
    expect(Array.from(facets).reduce((a, b) => a + b, 0)).toBe(store.size);
    expect(facets[CopyClass.DueToday]).toBe(due.length);
  });

  it("a view saved before the copy filter reads as no copy filter", () => {
    const old = parseView(btoa(JSON.stringify({ v: 2, n: "x", f: [[1], [], [], []] })));
    expect(old?.filters).toEqual({ stage: [1], stream: [], source: [], deadline: [], copy: [] });
  });
});

describe("dispatch", () => {
  it("sends the reply today and owes the Bank of Russia a copy of a forwarded one; the copy is marked sent and journaled", () => {
    const s = fresh();
    const row = rows((i) => s.stage[i] === Stage.AwaitingSignature && s.source[i] === Source.BankOfRussia && s.outcome[i] !== Outcome.Pending, s)[0]!;
    const result = dispatchReply(s, row, by);
    expect("entry" in result && result.copies).toBe(Copy.BankOfRussiaDue);
    expect([s.stage[row], s.sentOn[row]]).toEqual([Stage.Sent, AS_OF_DAY]);
    expect(copyClass(s, row)).toBe(CopyClass.DueToday);
    expect(copiesOwed(s, row)).toEqual(["bank_of_russia"]);
    expect(markCopySent(s, row, "sro", by)).toEqual({ code: "copy-not-owed" });
    expect(markCopySent(s, row, "bank_of_russia", by)).toBeNull();
    expect([copiesOwed(s, row), copiesSent(s, row), copyClass(s, row)]).toEqual([[], ["bank_of_russia"], CopyClass.Sent]);
    expect(caseJournal(s, row).at(-1)).toMatchObject({ action: "copy_sent", copy: "bank_of_russia" });
    expect(caseJournal(s, row).at(-2)).toMatchObject({ action: "send", from: Stage.AwaitingSignature, to: Stage.Sent });
  });

  it("a non-bank company's breach, marked before the reply, owes its self-regulatory organisation a copy; a bank's is refused", () => {
    const s = fresh();
    const bank = rows((i) => s.sector[i] === Sector.Bank && s.stage[i] === Stage.AwaitingSignature, s)[0]!;
    expect(markBreach(s, bank, true, by)).toEqual({ code: "breach-bank" });
    const company = rows((i) => s.sector[i] !== Sector.Bank && s.stage[i] === Stage.AwaitingSignature && s.outcome[i] !== Outcome.Pending && s.breach[i] === 0, s)[0]!;
    expect(markBreach(s, company, true, by)).toBeNull();
    expect(s.rules[company]! & RulesFlag.CopyToSro).not.toBe(0);
    expect(caseJournal(s, company).at(-1)).toMatchObject({ action: "breach_marked" });
    const result = dispatchReply(s, company, by);
    expect("entry" in result && (result.copies & Copy.SroDue) !== 0).toBe(true);
    expect(markBreach(s, company, false, by)).toEqual({ code: "breach-after-reply" });
  });

  it("refuses a reply that is not at signature or not decided, and changes nothing", () => {
    const s = fresh();
    const review = rows((i) => s.stage[i] === Stage.LegalReview, s)[0]!;
    expect(dispatchReply(s, review, by)).toEqual({ error: { code: "transition-not-allowed" } });
    expect(s.copies[review]).toBe(0);
  });
});

describe("the supervisor's extension", () => {
  it("takes a reason, is refused for a money claim under 123-FZ, and owes the Bank of Russia a copy of the notice for a forwarded complaint", () => {
    const s = fresh();
    const sup = { role: "supervisor" as const, actor: selfActor("supervisor"), at: NOW };
    const claim = rows((i) => s.stream[i] === Stream.MoneyClaim && (s.rules[i]! & RulesFlag.Ombudsman) !== 0 && s.stage[i]! < Stage.Sent, s)[0]!;
    expect(extendDeadline(s, claim, { ...sup, reason: "Documents from the insurer are needed." })).toEqual({ code: "extension-not-allowed" });
    const forwarded = rows(
      (i) => s.source[i] === Source.BankOfRussia && s.stage[i]! < Stage.Sent && s.extension[i] === Extension.None && (s.rules[i]! & RulesFlag.ExtensionAllowed) !== 0 && s.extNotice[i]! >= AS_OF_DAY,
      s,
    )[0]!;
    expect(extendDeadline(s, forwarded, { ...sup, reason: "short" })).toEqual({ code: "extension-reason-required", min: 10 });
    expect(extendDeadline(s, forwarded, { ...sup, role: "operator", reason: "Statements from the branch are requested." })).toEqual({ code: "role-cannot-edit", column: "extension" });
    expect(extendDeadline(s, forwarded, { ...sup, reason: "Statements from the branch are requested." })).toBeNull();
    expect(s.extension[forwarded]).toBe(Extension.Extended);
    expect(copiesOwed(s, forwarded)).toEqual(["notice"]);
    expect(copyClass(s, forwarded)).toBe(CopyClass.DueToday);
    expect(caseJournal(s, forwarded).at(-1)).toMatchObject({ action: "extend", comment: "Statements from the branch are requested.", actor: { role: "supervisor" } });
    expect(extendDeadline(s, forwarded, { ...sup, reason: "Statements from the branch are requested." })).toEqual({ code: "already-extended" });
  });
});

describe("retention", () => {
  it("keeps a case three years from registration; the cooperatives' article sets no term, and the desk keeps them three years too", () => {
    expect(plusYears(dayNumber("2026-10-06"), 3)).toBe(dayNumber("2029-10-06"));
    expect(plusYears(dayNumber("2028-02-29"), 3)).toBe(dayNumber("2031-02-28"));
    const bank = rows((i) => store.sector[i] === Sector.Bank)[0]!;
    expect(retentionOf(store, bank)).toEqual({ until: plusYears(store.registered[bank]!, 3), statutory: true, basis: { act: "banking_law", article: "30.1", part: "11" } });
    const coop = rows((i) => store.sector[i] === Sector.CreditCooperative)[0]!;
    expect(retentionOf(store, coop)).toMatchObject({ statutory: false, basis: null });
  });
});
