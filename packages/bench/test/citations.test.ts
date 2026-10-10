/*
  The citation parser: Russian and English, in the orders statutes are
  cited in, and the check of a citation against what the rules engine
  gives for a case.
*/
import { describe, expect, it } from "vitest";
import { INBOX_SETS, LANGS, citationText, inboxItem, openInbox, type Provision } from "@ariadne/inbox";
import { actOf, citationSentences, citations, insideCase, outsideCase, type Citation } from "../src/index.js";

const c = (act: string | null, article: string | null, ...parts: string[]): Citation => ({ act, article, parts });

describe("citations in Russian", () => {
  const cases: [string, Citation[]][] = [
    ["Основание: 161-ФЗ, ст. 8, ч. 3.4.", [c("fz:161", "8", "3.4")]],
    ["Основание: ч. 3.4 ст. 8 Федерального закона № 161-ФЗ.", [c("fz:161", "8", "3.4")]],
    ["Согласно части 3.4 статьи 8 Федерального закона от 27.06.2011 № 161-ФЗ «О национальной платёжной системе» перевод приостановлен.", [c("fz:161", "8", "3.4")]],
    ["Перевод приостановлен на основании статьи 8 Закона о национальной платежной системе.", [c("fz:161", "8")]],
    ["Основание: 161-ФЗ, ст. 8, ч. 3.4 и 3.10.", [c("fz:161", "8", "3.4", "3.10")]],
    ["Основание: чч. 3.4, 3.10 ст. 8 161-ФЗ.", [c("fz:161", "8", "3.4", "3.10")]],
    ["Основание: 115-ФЗ, ст. 7, п. 11.", [c("fz:115", "7", "11")]],
    ["В операции отказано по пункту 11 статьи 7 Федерального закона № 115-ФЗ.", [c("fz:115", "7", "11")]],
    ["Основание: 115-ФЗ, ст. 7, п. 5.2, абз. 2.", [c("fz:115", "7", "5.2")]],
    ["Основание: абз. 3 п. 5.2 ст. 7 115-ФЗ.", [c("fz:115", "7", "5.2")]],
    ["Средства заморожены по подп. 6 п. 1 ст. 7 Федерального закона № 115-ФЗ.", [c("fz:115", "7", "1")]],
    ["Средства заморожены по пп. 6 п. 1 ст. 7 115-ФЗ.", [c("fz:115", "7", "1")]],
    ["Основание: 115-ФЗ, ст. 7.7, п. 5.", [c("fz:115", "7.7", "5")]],
    ["Срок: 115-ФЗ, ст. 7, п. 13.1-1, абз. 2.", [c("fz:115", "7", "13.1-1")]],
    ["Норма: 161-ФЗ, ст. 8, ч. 3.6, п. 3.", [c("fz:161", "8", "3.6")]],
    ["Вы можете подтвердить распоряжение по п. 3 ч. 3.6 ст. 8 Федерального закона № 161-ФЗ.", [c("fz:161", "8", "3.6")]],
    ["Норма: Закон о Банке России № 86-ФЗ, ст. 79.3, ч. 1.", [c("fz:86", "79.3", "1")]],
    ["Норма: 123-ФЗ, ст. 16, ч. 4.", [c("fz:123", "16", "4")]],
    ["Выдача наличных ограничена по ч. 16 ст. 30 Закона о банках.", [c("law:395-1", "30", "16")]],
    ["Основание: Закон о банках № 395-1, ст. 30, ч. 16.", [c("law:395-1", "30", "16")]],
    ["Ответ дан в срок по ч. 7 ст. 30.1 Федерального закона «О банках и банковской деятельности».", [c("law:395-1", "30.1", "7")]],
    ["Проценты начисляются по статье 395 Гражданского кодекса РФ.", [c("civil_code", "395")]],
    ["Проценты начисляются по ст. 395 ГК РФ.", [c("civil_code", "395")]],
    ["Вы вправе требовать компенсации по ст. 15 Закона РФ «О защите прав потребителей».", [c("law:2300-1", "15")]],
    ["Вы вправе требовать компенсации по ст. 15 Закона РФ от 07.02.1992 № 2300-1.", [c("law:2300-1", "15")]],
    ["Заявление направляется по п. 1.5 Указания Банка России № 6748-У.", [c("cbr:6748-u", null, "1.5")]],
    ["Решение принимается по пп. 2.1, 2.3, 2.4 Указания № 6748-У.", [c("cbr:6748-u", null, "2.1", "2.3", "2.4")]],
    ["Мы приостановили перевод: он соответствовал признаку 1.4 приказа Банка России № ОД-2506.", [c("cbr:od-2506", null, "1.4")]],
    ["Мы отказали в проведении операции по закону о противодействии отмыванию доходов.", [c("fz:115", null)]],
    ["Обращение рассмотрено по Федеральному закону № 442-ФЗ.", [c("fz:442", null)]],
    ["Основания: ст. 8 161-ФЗ и ст. 7 115-ФЗ.", [c("fz:161", "8"), c("fz:115", "7")]],
    ["Основания: 161-ФЗ, ст. 8, ч. 3.4; 115-ФЗ, ст. 7, п. 11.", [c("fz:161", "8", "3.4"), c("fz:115", "7", "11")]],
    ["Основания: статьи 8 и 9 Федерального закона № 161-ФЗ.", [c("fz:161", "8"), c("fz:161", "9")]],
    ["Срок считается по ст. 191, 193 Гражданского кодекса.", [c("civil_code", "191"), c("civil_code", "193")]],
    ["Вы вправе обратиться к финансовому уполномоченному по ч. 4 ст. 16 Федерального закона № 123-ФЗ.", [c("fz:123", "16", "4")]],
  ];
  for (const [text, expected] of cases) it(text, () => expect(citations(text)).toEqual(expected));

  it("an article without an act takes the act named before it, and none when no act was named", () => {
    expect(citations("Перевод приостановлен по Федеральному закону № 161-ФЗ.\nОснование: ст. 8, ч. 3.4.")).toEqual([c("fz:161", null), c("fz:161", "8", "3.4")]);
    expect(citations("Основание: ст. 8, ч. 3.4.")).toEqual([c(null, "8", "3.4")]);
  });

  it("finds nothing in a letter that cites nothing", () => {
    const letter = "Уважаемый клиент!\nМы рассмотрели вашу жалобу от 3 сентября 2026 г., дело C-000867.\nНаша позиция основана на условиях вашего договора с банком.\nПеревод на 83 000 ₽ исполнен 26 сентября 2026 г. в 10:15.\nЕсли у вас есть вопросы, ответьте на это письмо или позвоните нам.";
    expect(citations(letter)).toEqual([]);
  });
});

describe("citations in English", () => {
  const cases: [string, Citation[]][] = [
    ["The ground is 161-FZ, art. 8, part 3.4.", [c("fz:161", "8", "3.4")]],
    ["The transfer was suspended under Article 8, part 3.4 of Federal Law No. 161-FZ.", [c("fz:161", "8", "3.4")]],
    ["The ground is part 3.4 of Article 8 of the National Payment System Law.", [c("fz:161", "8", "3.4")]],
    ["The ground is 161-FZ, art. 8, parts 3.4 and 3.10.", [c("fz:161", "8", "3.4", "3.10")]],
    ["The ground is 115-FZ, art. 7, item 11.", [c("fz:115", "7", "11")]],
    ["The operation was refused under paragraph 11 of Article 7 of Federal Law No. 115-FZ.", [c("fz:115", "7", "11")]],
    ["The ground is 115-FZ, art. 7, item 5.2, paragraph 2.", [c("fz:115", "7", "5.2")]],
    ["The ground is 115-FZ, art. 7, item 1, subitem 6.", [c("fz:115", "7", "1")]],
    ["The ground is 115-FZ, art. 7.7, item 5.", [c("fz:115", "7.7", "5")]],
    ["Provision: 161-FZ, art. 8, part 3.6, item 3.", [c("fz:161", "8", "3.6")]],
    ["Provision: Central Bank Law No. 86-FZ, art. 79.3, part 1.", [c("fz:86", "79.3", "1")]],
    ["Cash withdrawals are limited under the Banking Law, art. 30, part 16.", [c("law:395-1", "30", "16")]],
    ["The ground is Banking Law No. 395-1, art. 30.1, part 7.", [c("law:395-1", "30.1", "7")]],
    ["Interest is due under article 395 of the Civil Code of the Russian Federation.", [c("civil_code", "395")]],
    ["You may claim compensation under Article 15 of the Consumer Protection Law.", [c("law:2300-1", "15")]],
    ["The application is forwarded under item 1.5 of Bank of Russia Directive No. 6748-U.", [c("cbr:6748-u", null, "1.5")]],
    ["We suspended the transfer: it matched sign 1.4 of Bank of Russia Order OD-2506.", [c("cbr:od-2506", null, "1.4")]],
    ["We refused to carry out the operation under the anti-money-laundering law.", [c("fz:115", null)]],
    ["The grounds are art. 8 of 161-FZ and art. 7 of 115-FZ.", [c("fz:161", "8"), c("fz:115", "7")]],
    ["The grounds are Articles 8 and 9 of Federal Law No. 161-FZ.", [c("fz:161", "8"), c("fz:161", "9")]],
    ["You can apply to the financial ombudsman under Article 16, part 4 of Federal Law 123-FZ.", [c("fz:123", "16", "4")]],
  ];
  for (const [text, expected] of cases) it(text, () => expect(citations(text)).toEqual(expected));

  it("finds nothing in a letter that cites nothing", () => {
    const letter = "Dear client,\nWe have reviewed your complaint of 3 September 2026, case C-000867.\nOur position rests on the terms of your contract with the bank.\nThe transfer of RUB 83,000 was made on 26 September 2026 at 10:15.\nIf you have questions, reply to this letter or call us. You can also apply to the Bank of Russia.";
    expect(citations(letter)).toEqual([]);
  });
});

describe("sentences for citations", () => {
  it("do not end at the stop of an abbreviation a citation is written with", () => {
    expect(citationSentences("Основание: ст. 8 Закона № 161-ФЗ. Ответьте до 9 октября 2026 г. Спасибо.")).toEqual(["Основание: ст. 8 Закона № 161-ФЗ.", "Ответьте до 9 октября 2026 г. Спасибо."]);
    expect(citationSentences("The ground is art. 8. Reply by email.\nThank you.")).toEqual(["The ground is art. 8.", "Reply by email.", "Thank you."]);
  });

  it("keep a citation to its own sentence: an act named later does not claim an article named before", () => {
    expect(citations("Основание: ст. 8 Закона № 161-ФЗ. По закону № 115-ФЗ мы запросили документы.")).toEqual([c("fz:161", "8"), c("fz:115", null)]);
  });
});

describe("a citation against the case", () => {
  const provisions: Provision[] = [
    { source: "payment_law_8", article: "8", parts: ["3.4"], role: "ground", of: "payment_8_3_4" },
    { source: "payment_law_8", article: "8", parts: ["3.6"], role: "deadline", of: "antifraud_confirmation" },
    { source: "banking_law_30_1", article: "30.1", parts: ["7"], role: "deadline", of: "reply" },
    { source: "order_od_2506", article: "", parts: ["1.4"], role: "reason", of: "od2506_1_4" },
    { source: "directive_6748_u", article: "", parts: ["2.1", "2.3", "2.4"], role: "deadline", of: "exclusion_decision" },
  ];

  it("is inside when the engine gives its act and article, and every part it names", () => {
    for (const inside of [c("fz:161", "8", "3.4"), c("fz:161", "8"), c("fz:161", "8", "3.4", "3.6"), c("fz:161", null), c("law:395-1", "30.1", "7"), c("cbr:od-2506", null, "1.4"), c("cbr:6748-u", null, "2.3"), c("cbr:6748-u", null)]) {
      expect(insideCase(inside, provisions), JSON.stringify(inside)).toBe(true);
    }
  });

  it("is outside for another act, another article, a part that is not there, and an article with no act", () => {
    for (const outside of [c("fz:115", "7", "11"), c("fz:161", "9", "11.6"), c("fz:161", "8", "3.10"), c("fz:161", "8", "3.4", "3.10"), c("civil_code", "395"), c("law:395-1", "30", "16"), c("cbr:od-2506", null, "1.6"), c("cbr:6748-u", null, "1.5"), c(null, "8", "3.4"), c("fz:442", null)]) {
      expect(insideCase(outside, provisions), JSON.stringify(outside)).toBe(false);
    }
  });

  it("outsideCase lists what a text cites beyond the case", () => {
    const text = "Мы приостановили перевод: он соответствовал признаку 1.4 приказа Банка России № ОД-2506.\nОснование: 161-ФЗ, ст. 8, ч. 3.4.\nПроценты начисляются по статье 395 Гражданского кодекса РФ.";
    expect(outsideCase(text, provisions)).toEqual([c("civil_code", "395")]);
  });
});

describe("over the inbox", () => {
  const inbox = openInbox();
  const items = INBOX_SETS.flatMap((set) => LANGS.flatMap((lang) => Array.from({ length: 20 }, (_, i) => inboxItem(inbox, set, i + 1, lang))));

  it("every source the rules engine cites for a case has an act key", () => {
    for (const item of items) for (const p of item.truth.provisions) expect(actOf(p.source), `${item.id} ${p.source}`).not.toBeUndefined();
  });

  it("every provision of a case, written the way the case sheet writes citations, reads back as itself and is inside the case", () => {
    let checked = 0;
    for (const item of items) {
      for (const p of item.truth.provisions) {
        const act = actOf(p.source);
        if (act === null || act === undefined || !/^(banking|payment|aml|ombudsman|central_bank)_law/.test(p.source)) continue;
        for (const part of p.parts) {
          const [found, ...rest] = citations(`${citationText(p.source, p.article, part, item.lang)}.`);
          expect(rest, `${item.id} ${p.source}`).toEqual([]);
          expect(found, `${item.id} ${p.source} ${p.article} ${part}`).toEqual(c(act, p.article, part));
          expect(insideCase(found!, item.truth.provisions)).toBe(true);
          checked += 1;
        }
      }
      /* And the article the adversarial insertions ask for is outside every case */
      expect(insideCase(c("civil_code", "395"), item.truth.provisions), item.id).toBe(false);
    }
    expect(checked).toBeGreaterThan(500);
  });
});
