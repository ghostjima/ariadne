// The drafted reply against ariadne-rules' rubric, over the whole corpus:
// for every case still before legal review, the reply the assistant would
// draft, written out in Russian and in English, names its grounds without
// mixing 161-FZ and 115-FZ, offers every option and states every deadline
// the law gives the client, and keeps its sentences short. A finding here
// would be the draft's fault, not the reviewer's to catch.
import { describe, expect, it } from "vitest";
import {
  Applicant,
  Database,
  Path,
  Restriction,
  Stage,
  caseFacts,
  deskNow,
  generateAll,
  liftSuspension,
  recordApplication,
  refuseForwarding,
  selfActor,
} from "@ariadne/grid";
import { generatePlan, type ReplyDraft } from "@ariadne/runner";
import { POOLS } from "../data/query";
import { caseBrief } from "../case/brief";
import { makeFmt } from "./format";
import { LOCALES, strings, type Lang } from "./i18n";
import { groundCitation, replyLines, replyText } from "./reply";
import { checkReply } from "./rubric";
import type { Text } from "./text";

const store = generateAll(20261006, 1_200, 400);
const open = Array.from({ length: store.size }, (_, i) => i).filter((i) => store.stage[i]! < Stage.LegalReview);
const text = (lang: Lang): Text => ({ t: strings[lang], f: makeFmt(LOCALES[lang]), labels: POOLS[lang].labels, lang });

function draftOf(row: number): ReplyDraft {
  const draft = generatePlan(7, caseBrief(store, row)).find((s) => s.type === "draft_reply")!.draft;
  if (draft.kind !== "reply") throw new Error("not a reply");
  return draft;
}

describe("the drafted reply after a suspension is lifted", () => {
  it("states the transfer cap and the ATM cash cap, not the suspension, keeps the right to apply for removal, and leaves the rubric nothing to flag", () => {
    // A suspension the bank chose under 161-FZ art. 9 part 11.6, lifted
    // today with the data still in the database: the cap of the part's
    // second sentence applies from today (a conservative reading).
    const lifted = generateAll(20261006, 1_200, 400);
    const row = open.find((i) => lifted.database[i] === Database.ClientData && lifted.restriction[i] === Restriction.InstrumentSuspended && lifted.applicant[i] === Applicant.Individual)!;
    const before = caseBrief(lifted, row);
    expect(before.measures).toEqual(["suspend_instrument", "cap_atm_cash"]);
    expect(
      liftSuspension(lifted, row, { role: "reviewer", actor: selfActor("reviewer"), at: deskNow(Date.UTC(2026, 9, 6, 9)), reason: "Antifraud agreed to the cap instead." }),
    ).toBeNull();
    const brief = caseBrief(lifted, row);
    expect(brief.measures).toEqual(["cap_transfers", "cap_atm_cash"]);
    expect(brief.grounds).toEqual(["payment_9_11_6"]);
    expect(brief.clientOptions).toContain("apply_for_removal");
    const draft = generatePlan(7, brief).find((s) => s.type === "draft_reply")!.draft;
    if (draft.kind !== "reply") throw new Error("not a reply");
    for (const lang of ["ru", "en"] as const) {
      const x = text(lang);
      const lines = replyLines(x, draft);
      expect(lines).toContain(x.t.reply.measure.cap_transfers);
      expect(lines).toContain(x.t.reply.measure.cap_atm_cash);
      expect(lines).not.toContain(x.t.reply.measure.suspend_instrument);
      expect(lines).toContain(x.t.reply.option.apply_for_removal);
      expect(checkReply(draft, replyText(x, draft), caseFacts(lifted, row)), lang).toEqual([]);
    }
    // The sentence does not say the card was never suspended.
    expect(text("en").t.reply.measure.cap_transfers).toMatch(/^Your card and online banking are not suspended\./);
    expect(text("ru").t.reply.measure.cap_transfers).toMatch(/^Ваша карта и онлайн-банк не приостановлены\./);
    // The draft written before the lift, stating the suspension, is now
    // flagged.
    const stale = generatePlan(7, before).find((s) => s.type === "draft_reply")!.draft;
    if (stale.kind !== "reply") throw new Error("not a reply");
    expect(
      checkReply(stale, replyText(text("en"), stale), caseFacts(lifted, row))
        .filter((f) => f.code.startsWith("measure_"))
        .map((f) => [f.code, f.subject]),
    ).toEqual([
      ["measure_not_taken", "suspend_instrument"],
      ["measure_missing", "cap_transfers"],
    ]);
  });
});

describe("the drafted reply after a refusal to forward the client's application", () => {
  it("names the directive's item beside the part of 161-FZ, in a sentence of its own, and leaves the rubric nothing to flag", () => {
    // The client applied through the bank to remove the data; the
    // application lacks mandatory data, and the bank refused to forward it
    // (the Bank of Russia's Directive No. 6748-U item 1.3).
    const refused = generateAll(20261006, 1_200, 400);
    const by = { role: "supervisor" as const, actor: selfActor("supervisor"), at: deskNow(Date.UTC(2026, 9, 6, 9)) };
    for (const police of [false, true]) {
      const row = open.find(
        (i) => refused.database[i] === (police ? Database.ClientDataWithPoliceInformation : Database.ClientData) && refused.path[i] !== Path.DatabaseRemoval,
      )!;
      const part = police ? "11.7" : "11.6";
      expect(caseBrief(refused, row).grounds).toEqual([`payment_9_${part.replace(".", "_")}`]);
      expect(recordApplication(refused, row, by)).toBeNull();
      // Received and not refused: nothing new to name.
      expect(caseBrief(refused, row).grounds).toEqual([`payment_9_${part.replace(".", "_")}`]);
      expect(refuseForwarding(refused, row, { ...by, missing: ["accounts"] })).toBeNull();
      const brief = caseBrief(refused, row);
      expect(brief.grounds).toEqual([`payment_9_${part.replace(".", "_")}`, "directive_6748_u_1_3"]);
      expect(brief.clientOptions).toContain("apply_for_removal");
      const draft = generatePlan(7, brief).find((s) => s.type === "draft_reply")!.draft;
      if (draft.kind !== "reply") throw new Error("not a reply");
      const en = replyLines(text("en"), draft);
      const ru = replyLines(text("ru"), draft);
      expect(en).toContain(`The ground is 161-FZ, art. 9, part ${part}.`);
      expect(en).toContain("We did not forward your removal application to the Bank of Russia: mandatory data are missing (Bank of Russia Directive No. 6748-U, item 1.3).");
      expect(ru).toContain("Мы не передали ваше заявление об исключении сведений в Банк России: в нём нет обязательных сведений (Указание Банка России № 6748-У, п. 1.3).");
      // Not a bare citation as well.
      expect(en.filter((line) => line.includes("6748-U"))).toHaveLength(1);
      for (const lang of ["ru", "en"] as const) expect(checkReply(draft, replyText(text(lang), draft), caseFacts(refused, row)), `${lang} ${part}`).toEqual([]);
    }
    expect(groundCitation(text("en"), "directive_6748_u_1_3")).toBe("Bank of Russia Directive No. 6748-U, item 1.3");
    expect(groundCitation(text("ru"), "directive_6748_u_1_3")).toBe("Указание Банка России № 6748-У, п. 1.3");
  });
});

describe("the drafted reply", () => {
  it("has nothing for the rubric to flag, in either language, for every open case", () => {
    expect(open.length).toBeGreaterThan(100);
    for (const lang of ["ru", "en"] as const)
      for (const row of open) {
        const draft = draftOf(row);
        const findings = checkReply(draft, replyText(text(lang), draft), caseFacts(store, row));
        expect(findings, `${lang} row ${row}: ${replyText(text(lang), draft)}`).toEqual([]);
      }
  });

  it("the rubric does flag a reply that drops what the draft carries", () => {
    const row = open.find((i) => draftOf(i).clientOptions.length > 0)!;
    const draft = { ...draftOf(row), clientOptions: [], grounds: [] };
    const codes = checkReply(draft, replyText(text("en"), draft), caseFacts(store, row)).map((f) => f.code);
    expect(codes).toContain("ground_missing");
    expect(codes).toContain("client_option_missing");
  });

  it("about removing the client's data from the database, cites 161-FZ art. 9 part 11.6, or 11.7 with the Ministry of Internal Affairs' information", () => {
    const removal = open.filter((i) => store.path[i] === Path.DatabaseRemoval);
    expect(removal.length).toBeGreaterThan(0);
    for (const row of removal) {
      const part = store.database[row] === Database.ClientDataWithPoliceInformation ? "11.7" : "11.6";
      expect(replyLines(text("en"), draftOf(row)), `row ${row}`).toContain(`The ground is 161-FZ, art. 9, part ${part}.`);
      expect(replyLines(text("ru"), draftOf(row)), `row ${row}`).toContain(`Основание: 161-ФЗ, ст. 9, ч. ${part}.`);
    }
    for (const part of ["11.6", "11.7"])
      expect(removal.some((row) => replyLines(text("en"), draftOf(row)).includes(`The ground is 161-FZ, art. 9, part ${part}.`)), part).toBe(true);
    expect(groundCitation(text("en"), "payment_9_11_7")).toBe("161-FZ, art. 9, part 11.7");
    expect(groundCitation(text("ru"), "payment_9_11_7")).toBe("161-ФЗ, ст. 9, ч. 11.7");
  });

  it("about the client's own data in the database, tells the client how to apply for their removal, and the rubric asks for it on the statute's ground", () => {
    const clientData = open.filter((i) => store.database[i] !== Database.None);
    expect(clientData.length).toBeGreaterThan(0);
    for (const row of clientData) {
      expect(replyLines(text("en"), draftOf(row)), `row ${row}`).toContain(
        "You can apply to remove your data from the Bank of Russia's database through us or its internet reception at cbr.ru/contactBR/161-FZ.",
      );
      expect(replyLines(text("ru"), draftOf(row)), `row ${row}`).toContain(
        "Вы можете подать заявление об исключении сведений о вас из базы данных Банка России через наш банк или интернет-приёмную cbr.ru/contactBR/161-FZ.",
      );
    }
    // Without it, the finding names the option and rests on 161-FZ art. 9
    // part 11.8 (with the channels of Directive No. 6748-U), not only on
    // the letter every option cites.
    const row = clientData[0]!;
    const draft = { ...draftOf(row), clientOptions: draftOf(row).clientOptions.filter((o) => o !== "apply_for_removal") };
    const missing = checkReply(draft, replyText(text("en"), draft), caseFacts(store, row)).filter((f) => f.code === "client_option_missing");
    expect(missing.map((f) => [f.subject, f.source])).toEqual([["apply_for_removal", "payment_law_9"]]);
    expect(missing[0]!.reference).toMatch(/^art\. 9 part 11\.8/);
  });

  it("about the client's own data in the database, says which restriction applies: the suspension, or the transfer cap instead, and the ATM cash cap", () => {
    const clientData = open.filter((i) => store.database[i] !== Database.None);
    const capped = clientData.filter((i) => store.restriction[i] === Restriction.TransfersCapped);
    expect(capped.length).toBeGreaterThan(0);
    expect(capped.length).toBeLessThan(clientData.length);
    const en = text("en").t.reply.measure;
    const ru = text("ru").t.reply.measure;
    for (const row of clientData) {
      const lines = { en: replyLines(text("en"), draftOf(row)), ru: replyLines(text("ru"), draftOf(row)) };
      const cap = store.restriction[row] === Restriction.TransfersCapped;
      expect(lines.en.includes(en.cap_transfers), `row ${row}`).toBe(cap);
      expect(lines.en.includes(en.suspend_instrument), `row ${row}`).toBe(!cap);
      expect(lines.ru.includes(ru.cap_transfers), `row ${row}`).toBe(cap);
      expect(lines.ru.includes(ru.suspend_instrument), `row ${row}`).toBe(!cap);
      expect(lines.en, `row ${row}`).toContain(en.cap_atm_cash);
      expect(lines.ru, `row ${row}`).toContain(ru.cap_atm_cash);
      if (cap) expect(lines.en, `row ${row}`).toContain("The ground is 161-FZ, art. 9, part 11.6.");
    }
    expect(en.cap_transfers).toBe(
      "Your card and online banking are not suspended. Your transfers to individuals are limited to RUB 100,000 a month while your data are in the Bank of Russia's database.",
    );
    expect(ru.cap_atm_cash).toBe("На то же время выдача наличных в банкоматах ограничена суммой 100 000 ₽ в месяц по ч. 16 ст. 30 Закона о банках.");
    // A letter that says the card is suspended where the transfers are
    // capped is flagged, on the Bank of Russia's letter No. IN-03-59/11.
    const row = capped[0]!;
    const draft = { ...draftOf(row), measures: ["suspend_instrument" as const, "cap_atm_cash" as const] };
    const found = checkReply(draft, replyText(text("en"), draft), caseFacts(store, row)).filter((f) => f.code.startsWith("measure_"));
    expect(found.map((f) => [f.code, f.subject, f.source])).toEqual([
      ["measure_not_taken", "suspend_instrument", "letter_in_03_59_11"],
      ["measure_missing", "cap_transfers", "letter_in_03_59_11"],
    ]);
  });

  it("states the decision only as the register holds it: a pending one is left to the reviewer", () => {
    const pending = open.find((i) => draftOf(i).outcome === "pending")!;
    expect(replyLines(text("en"), draftOf(pending))).toContain("[The decision on the complaint: for the reviewer to state.]");
    expect(replyLines(text("ru"), draftOf(pending))).toContain("[Решение по жалобе: указывает проверяющий.]");
  });

  it("states the deadlines still running on the day it is dated, for the open cases of the corpus that have them", () => {
    // Not only a sample case: blocks complained about within days, and
    // high-risk measures with the client's six months to the commission.
    const running = open.filter((i) => draftOf(i).deadlines.length > 0);
    expect(running.length).toBeGreaterThanOrEqual(5);
    const kinds = new Set(running.flatMap((i) => draftOf(i).deadlines.map((d) => d.kind)));
    expect([...kinds]).toEqual(expect.arrayContaining(["high_risk_commission_application", "antifraud_confirmation"]));
    for (const row of running) {
      const draft = draftOf(row);
      const x = text("en");
      for (const d of draft.deadlines) {
        expect(d.due >= draft.repliedOn, `row ${row}`).toBe(true);
        expect(replyLines(x, draft), `row ${row}`).toContain(x.t.reply.deadline[d.kind](x.f.date(d.due)));
      }
    }
  });
});
