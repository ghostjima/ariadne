import { describe, expect, it } from "vitest";
import { Operation, Stage, Stream, effectiveDue, generateAll, isoDay } from "@ariadne/grid";
import { od2506Signs, workingDaysBetween } from "@ariadne/rules";
import { caseDetails, termDays } from "./details";
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
    for (let i = 0; i < store.size; i += 3) {
      const d = caseDetails(store, i);
      for (const deadline of d.clock.deadlines) cited.add(deadline.basis.source);
      for (const duty of d.clock.duties) cited.add(duty.basis.source);
    }
    expect([...cited].filter((s) => !NAMED_SOURCES.includes(s))).toEqual([]);
    const basis = { source: "banking_law_30_1", act: "", article: "30.1", part: "7", revision: "2026-08-04", url: "", reading: "text" as const };
    expect(basisName(basis, "ru")).toBe("Закон о банках № 395-1, ст. 30.1, ч. 7");
    expect(basisName(basis, "en")).toBe("Banking Law No. 395-1, art. 30.1, part 7");
    const aml = { ...basis, source: "aml_law_7", article: "7", part: "5.2, paragraph 2" };
    expect(basisName(aml, "ru")).toBe("115-ФЗ, ст. 7, п. 5.2, абз. 2");
    expect(basisName(aml, "en")).toBe("115-FZ, art. 7, item 5.2, paragraph 2");
  });
});
