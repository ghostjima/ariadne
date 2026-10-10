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
  Stream,
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
import { NO_CITES, groundCitation, replyCites, replyLines } from "./reply";
import { checkReply, findingText } from "./rubric";
import type { Text } from "./text";

const store = generateAll(20261006, 1_200, 400);
const open = Array.from({ length: store.size }, (_, i) => i).filter((i) => store.stage[i]! < Stage.LegalReview);
const text = (lang: Lang): Text => ({ t: strings[lang], f: makeFmt(LOCALES[lang]), labels: POOLS[lang].labels, lang });

/** The reply of a row as the page writes it out: the draft's lines with
 * the provisions ariadne-rules gives for the row's facts. */
function linesOf(lang: Lang, row: number, draft: ReplyDraft = draftOf(row), from = store): string[] {
  return replyLines(text(lang), draft, replyCites(text(lang), caseFacts(from, row), draft.repliedOn));
}
const textOf = (lang: Lang, row: number, draft: ReplyDraft = draftOf(row), from = store): string => linesOf(lang, row, draft, from).join("\n");

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
      const lines = linesOf(lang, row, draft, lifted);
      expect(lines).toContain(x.t.reply.measure.cap_transfers);
      expect(lines).toContain(x.t.reply.measure.cap_atm_cash);
      expect(lines).not.toContain(x.t.reply.measure.suspend_instrument);
      expect(lines).toContain(x.t.reply.option.apply_for_removal);
      expect(checkReply(draft, textOf(lang, row, draft, lifted), caseFacts(lifted, row)), lang).toEqual([]);
    }
    // The sentence does not say the card was never suspended.
    expect(text("en").t.reply.measure.cap_transfers).toMatch(/^Your card and online banking are not suspended\./);
    expect(text("ru").t.reply.measure.cap_transfers).toMatch(/^Ваша карта и онлайн-банк не приостановлены\./);
    // The draft written before the lift, stating the suspension, is now
    // flagged.
    const stale = generatePlan(7, before).find((s) => s.type === "draft_reply")!.draft;
    if (stale.kind !== "reply") throw new Error("not a reply");
    expect(
      checkReply(stale, textOf("en", row, stale, lifted), caseFacts(lifted, row))
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
      const en = linesOf("en", row, draft, refused);
      const ru = linesOf("ru", row, draft, refused);
      expect(en).toContain(`The ground is 161-FZ, art. 9, part ${part}.`);
      expect(en).toContain("We did not forward your removal application to the Bank of Russia: mandatory data are missing (Bank of Russia Directive No. 6748-U, item 1.3).");
      expect(ru).toContain("Мы не передали ваше заявление об исключении сведений в Банк России: в нём нет обязательных сведений (Указание Банка России № 6748-У, п. 1.3).");
      // Not a bare citation as well.
      expect(en.filter((line) => line.includes("6748-U"))).toHaveLength(1);
      for (const lang of ["ru", "en"] as const) expect(checkReply(draft, textOf(lang, row, draft, refused), caseFacts(refused, row)), `${lang} ${part}`).toEqual([]);
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
        const findings = checkReply(draft, textOf(lang, row, draft), caseFacts(store, row));
        expect(findings, `${lang} row ${row}: ${textOf(lang, row, draft)}`).toEqual([]);
      }
  });

  it("the rubric does flag a reply that drops what the draft carries", () => {
    const row = open.find((i) => draftOf(i).clientOptions.length > 0)!;
    const draft = { ...draftOf(row), clientOptions: [], grounds: [] };
    const codes = checkReply(draft, textOf("en", row, draft), caseFacts(store, row)).map((f) => f.code);
    expect(codes).toContain("ground_missing");
    expect(codes).toContain("client_option_missing");
  });

  it("about removing the client's data from the database, cites 161-FZ art. 9 part 11.6, or 11.7 with the Ministry of Internal Affairs' information", () => {
    const removal = open.filter((i) => store.path[i] === Path.DatabaseRemoval);
    expect(removal.length).toBeGreaterThan(0);
    for (const row of removal) {
      const part = store.database[row] === Database.ClientDataWithPoliceInformation ? "11.7" : "11.6";
      // Said once, under the restriction it grounds: the suspension's
      // part, or for the cap the part's second sentence.
      const capped = store.restriction[row] === Restriction.TransfersCapped;
      const en = `The ground is 161-FZ, art. 9, part ${part}${capped ? ", sentence 2" : ""}.`;
      const ru = `Основание: 161-ФЗ, ст. 9, ч. ${part}${capped ? ", предл. 2" : ""}.`;
      expect(linesOf("en", row).filter((line) => line.startsWith("The ground is 161-FZ, art. 9")), `row ${row}`).toEqual([en]);
      expect(linesOf("ru", row).filter((line) => line.startsWith("Основание: 161-ФЗ, ст. 9")), `row ${row}`).toEqual([ru]);
      // The option and the Bank of Russia's term cite their own parts.
      expect(linesOf("en", row), `row ${row}`).toContain("Provision: 161-FZ, art. 9, part 11.8.");
      if (store.pathThen[row]! >= 0) expect(linesOf("ru", row), `row ${row}`).toContain("Норма: 161-ФЗ, ст. 9, ч. 11.10.");
      expect(linesOf("en", row).indexOf(en), `row ${row}`).toBe(linesOf("en", row).indexOf(text("en").t.reply.measure[capped ? "cap_transfers" : "suspend_instrument"]) + 1);
    }
    for (const part of ["11.6", "11.7"])
      expect(removal.some((row) => linesOf("en", row).some((line) => line.startsWith(`The ground is 161-FZ, art. 9, part ${part}`))), part).toBe(true);
    // Without the case's provisions the ground is still named, on its own.
    expect(replyLines(text("en"), draftOf(removal[0]!), NO_CITES).filter((line) => line.startsWith("The ground is"))).toHaveLength(1);
    expect(groundCitation(text("en"), "payment_9_11_7")).toBe("161-FZ, art. 9, part 11.7");
    expect(groundCitation(text("ru"), "payment_9_11_7")).toBe("161-ФЗ, ст. 9, ч. 11.7");
  });

  it("about the client's own data in the database, tells the client how to apply for their removal, and the rubric asks for it on the statute's ground", () => {
    const clientData = open.filter((i) => store.database[i] !== Database.None);
    expect(clientData.length).toBeGreaterThan(0);
    for (const row of clientData) {
      expect(linesOf("en", row), `row ${row}`).toContain(
        "You can apply to remove your data from the Bank of Russia's database through us or its internet reception at cbr.ru/contactBR/161-FZ.",
      );
      expect(linesOf("ru", row), `row ${row}`).toContain(
        "Вы можете подать заявление об исключении сведений о вас из базы данных Банка России через наш банк или интернет-приёмную cbr.ru/contactBR/161-FZ.",
      );
    }
    // Without it, the finding names the option and rests on 161-FZ art. 9
    // part 11.8 (with the channels of Directive No. 6748-U), not only on
    // the letter every option cites.
    const row = clientData[0]!;
    const draft = { ...draftOf(row), clientOptions: draftOf(row).clientOptions.filter((o) => o !== "apply_for_removal") };
    const missing = checkReply(draft, textOf("en", row, draft), caseFacts(store, row)).filter((f) => f.code === "client_option_missing");
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
      const lines = { en: linesOf("en", row), ru: linesOf("ru", row) };
      const cap = store.restriction[row] === Restriction.TransfersCapped;
      expect(lines.en.includes(en.cap_transfers), `row ${row}`).toBe(cap);
      expect(lines.en.includes(en.suspend_instrument), `row ${row}`).toBe(!cap);
      expect(lines.ru.includes(ru.cap_transfers), `row ${row}`).toBe(cap);
      expect(lines.ru.includes(ru.suspend_instrument), `row ${row}`).toBe(!cap);
      expect(lines.en, `row ${row}`).toContain(en.cap_atm_cash);
      expect(lines.ru, `row ${row}`).toContain(ru.cap_atm_cash);
      if (cap) expect(lines.en, `row ${row}`).toContain("The ground is 161-FZ, art. 9, part 11.6, sentence 2.");
    }
    expect(en.cap_transfers).toBe(
      "Your card and online banking are not suspended. Your transfers to individuals are limited to RUB 100,000 a month while your data are in the Bank of Russia's database.",
    );
    // The ATM cash cap cites its own provision in the line after it, as
    // the rules give it for the case.
    expect(ru.cap_atm_cash).toBe("На то же время выдача наличных в банкоматах ограничена суммой 100 000 ₽ в месяц.");
    const atm = linesOf("ru", clientData[0]!);
    expect(atm[atm.indexOf(ru.cap_atm_cash) + 1]).toBe("Основание: Закон о банках № 395-1, ст. 30, ч. 16.");
    // A letter that says the card is suspended where the transfers are
    // capped is flagged, on the Bank of Russia's letter No. IN-03-59/11.
    const row = capped[0]!;
    const draft = { ...draftOf(row), measures: ["suspend_instrument" as const, "cap_atm_cash" as const] };
    const found = checkReply(draft, textOf("en", row, draft), caseFacts(store, row)).filter((f) => f.code.startsWith("measure_"));
    expect(found.map((f) => [f.code, f.subject, f.source])).toEqual([
      ["measure_not_taken", "suspend_instrument", "letter_in_03_59_11"],
      ["measure_missing", "cap_transfers", "letter_in_03_59_11"],
    ]);
  });

  it("cites after each option, deadline and restriction the provision the rules give for the case, and none it does not have", () => {
    const no = (lines: string[]) => lines.map((l) => l.replace(/[\u00a0\u202f]/g, " "));
    // The bank chose the transfer cap; the client applied through the
    // bank, and the Bank of Russia decides by 20 October.
    const capped = open.find((i) => store.restriction[i] === Restriction.TransfersCapped && store.path[i] === Path.DatabaseRemoval)!;
    expect(no(linesOf("en", capped)).slice(3)).toEqual([
      "Your card and online banking are not suspended. Your transfers to individuals are limited to RUB 100,000 a month while your data are in the Bank of Russia's database.",
      "The ground is 161-FZ, art. 9, part 11.6, sentence 2.",
      "Cash withdrawals at ATMs are limited to RUB 100,000 a month while your data are there.",
      "The ground is Banking Law No. 395-1, art. 30, part 16.",
      "You can apply to remove your data from the Bank of Russia's database through us or its internet reception at cbr.ru/contactBR/161-FZ.",
      "Provision: 161-FZ, art. 9, part 11.8.",
      "The decision on your exclusion request is due by Oct 20, 2026.",
      "Provision: 161-FZ, art. 9, part 11.10.",
      "If you have questions, reply to this letter or call us.",
      "You can also apply to the Bank of Russia.",
      "Provision: Central Bank Law No. 86-FZ, art. 79.3, part 1.",
    ]);
    // A refused operation under 115-FZ: the documents, then the
    // commission, each on its own paragraph; the complaint is a company's,
    // and 86-FZ art. 79.3 speaks of an individual's complaint only, so the
    // last line cites nothing.
    const refused = open.find((i) => store.stream[i] === Stream.Aml && store.reason[i] === 1 && store.applicant[i] === Applicant.LegalEntity)!;
    const ru = linesOf("ru", refused);
    expect(ru[ru.indexOf(text("ru").t.reply.option.submit_documents) + 1]).toBe("Норма: 115-ФЗ, ст. 7, п. 13.4, абз. 1.");
    expect(ru[ru.indexOf(text("ru").t.reply.option.apply_to_commission) + 1]).toBe("Норма: 115-ФЗ, ст. 7, п. 13.5, абз. 1.");
    expect(ru.at(-1)).toBe(text("ru").t.reply.next.apply_to_bank_of_russia);
    // The measures for a high-risk client: the commission is art. 7.8's,
    // with no documents before it, and the sentence says so.
    const highRisk = open.find((i) => store.stream[i] === Stream.Aml && store.reason[i] === 7)!;
    const en = linesOf("en", highRisk);
    const at = en.indexOf(text("en").t.reply.commissionOnMeasures);
    expect(at).toBeGreaterThan(0);
    expect(en[at + 1]).toBe("Provision: 115-FZ, art. 7.8, item 1.");
    expect(en).not.toContain(text("en").t.reply.option.apply_to_commission);
    expect(no(en)).toContain("Provision: 115-FZ, art. 7.8, item 1, paragraph 2.");
    // A money claim: the ombudsman, 123-FZ art. 16 part 4.
    const claim = open.find((i) => draftOf(i).clientOptions.includes("apply_to_ombudsman"))!;
    const lines = linesOf("ru", claim);
    expect(lines[lines.indexOf(text("ru").t.reply.option.apply_to_ombudsman) + 1]).toBe("Норма: 123-ФЗ, ст. 16, ч. 4.");
    // A suspended transfer: the confirmation, art. 8 part 3.6 item 3.
    const transfer = open.find((i) => draftOf(i).clientOptions.includes("confirm_order"))!;
    const confirm = linesOf("en", transfer);
    expect(confirm[confirm.indexOf(text("en").t.reply.option.confirm_order) + 1]).toBe("Provision: 161-FZ, art. 8, part 3.6, item 3.");
    // Every option, deadline and restriction of every open case's draft
    // has its provision from the rules, in both languages.
    for (const row of open) {
      const draft = draftOf(row);
      for (const lang of ["ru", "en"] as const) {
        const cites = replyCites(text(lang), caseFacts(store, row), draft.repliedOn);
        for (const option of draft.clientOptions) expect(cites.option[option], `${lang} row ${row} ${option}`).toBeTruthy();
        for (const d of draft.deadlines) expect(cites.deadline[d.kind], `${lang} row ${row} ${d.kind}`).toBeTruthy();
        for (const measure of draft.measures) expect(cites.measure[measure], `${lang} row ${row} ${measure}`).toBeTruthy();
        expect(Boolean(cites.next.apply_to_bank_of_russia), `${lang} row ${row}`).toBe(store.applicant[row] === Applicant.Individual);
      }
    }
  });

  it("a finding names the provision of what is missing, beside the source of the duty to state it", () => {
    // The capped case's draft without its option, its deadline and the
    // ATM cash cap.
    const row = open.find((i) => store.restriction[i] === Restriction.TransfersCapped && store.path[i] === Path.DatabaseRemoval)!;
    const draft = { ...draftOf(row), clientOptions: [], deadlines: [], measures: ["cap_transfers" as const] };
    const found = checkReply(draft, textOf("en", row, draft), caseFacts(store, row));
    const said = (lang: Lang) => found.map((f) => findingText(text(lang), f));
    expect(said("en")).toEqual([
      "An option the law gives the client is not offered: applying to the Bank of Russia to remove the client's data from its database. Its provision: 161-FZ, art. 9, part 11.8.",
      "A running deadline is not stated: the decision on the exclusion request. Its provision: 161-FZ, art. 9, part 11.10.",
      "A restriction that applies is not stated: the cap on cash at ATMs. Its provision: Banking Law No. 395-1, art. 30, part 16.",
    ]);
    expect(said("ru").every((line) => / Норма: /.test(line))).toBe(true);
    expect(said("ru")[0]).toMatch(/Норма: 161-ФЗ, ст\. 9, ч\. 11\.8\.$/);
    expect(found.map((f) => f.source)).toEqual(["payment_law_9", "cbr_reply_page", "letter_in_03_59_11"]);
    // A finding about the text has no provision of its own.
    const long = checkReply(draftOf(row), `${"word ".repeat(30)}.`, caseFacts(store, row)).find((f) => f.code === "sentence_too_long")!;
    expect(findingText(text("en"), long)).not.toContain("Its provision");
  });

  it("states the decision only as the register holds it: a pending one is left to the reviewer", () => {
    const pending = open.find((i) => draftOf(i).outcome === "pending")!;
    expect(linesOf("en", pending)).toContain("[The decision on the complaint: for the reviewer to state.]");
    expect(linesOf("ru", pending)).toContain("[Решение по жалобе: указывает проверяющий.]");
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
        expect(linesOf("en", row, draft), `row ${row}`).toContain(x.t.reply.deadline[d.kind](x.f.date(d.due)));
      }
    }
  });
});
