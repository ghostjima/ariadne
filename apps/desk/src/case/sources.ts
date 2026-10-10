// Short names of the sources ariadne-rules cites, in the interface's
// language: the crate gives each rule's source an id and the act's full
// Russian title; a step of a derivation names the act briefly, with its
// article and part, and links to the text the crate was checked against.
import type { Basis } from "@ariadne/rules";
import type { Lang } from "../i18n";

const NAMES: Record<string, Record<Lang, string>> = {
  labour_code_112: { ru: "Трудовой кодекс", en: "Labour Code" },
  civil_code_191_193: { ru: "Гражданский кодекс", en: "Civil Code" },
  decree_1335_2024: { ru: "Постановление Правительства № 1335", en: "Government Decree No. 1335" },
  decree_1466_2025: { ru: "Постановление Правительства № 1466", en: "Government Decree No. 1466" },
  decree_1187_2026: { ru: "Постановление Правительства № 1187", en: "Government Decree No. 1187" },
  banking_law_30_1: { ru: "Закон о банках № 395-1", en: "Banking Law No. 395-1" },
  banking_law_30: { ru: "Закон о банках № 395-1", en: "Banking Law No. 395-1" },
  central_bank_law_79_3: { ru: "Закон о Банке России № 86-ФЗ", en: "Central Bank Law No. 86-FZ" },
  microfinance_law_9_1: { ru: "151-ФЗ", en: "151-FZ" },
  insurance_law_6_2: { ru: "Закон № 4015-1", en: "Law No. 4015-1" },
  securities_law_15_11: { ru: "39-ФЗ", en: "39-FZ" },
  credit_cooperation_law_6_2: { ru: "190-ФЗ", en: "190-FZ" },
  ombudsman_law_15: { ru: "123-ФЗ", en: "123-FZ" },
  ombudsman_law_16: { ru: "123-ФЗ", en: "123-FZ" },
  ombudsman_law_28: { ru: "123-ФЗ", en: "123-FZ" },
  payment_law_8: { ru: "161-ФЗ", en: "161-FZ" },
  payment_law_9: { ru: "161-ФЗ", en: "161-FZ" },
  letter_010_31_7975: { ru: "Письмо Банка России № 010-31/7975", en: "Bank of Russia letter No. 010-31/7975" },
  directive_6748_u: { ru: "Указание Банка России № 6748-У", en: "Bank of Russia Directive No. 6748-U" },
  directive_7282_u: { ru: "Указание Банка России № 7282-У", en: "Bank of Russia Directive No. 7282-U" },
  cbr_exclusion_page: { ru: "Банк России, исключение из базы данных", en: "Bank of Russia, exclusion from its database" },
  aml_law_7: { ru: "115-ФЗ", en: "115-FZ" },
  aml_law_7_7: { ru: "115-ФЗ", en: "115-FZ" },
  aml_law_7_8: { ru: "115-ФЗ", en: "115-FZ" },
  regulation_842_p: { ru: "Положение Банка России № 842-П", en: "Bank of Russia Regulation No. 842-P" },
  order_od_2506: { ru: "Приказ Банка России № ОД-2506", en: "Bank of Russia Order No. OD-2506" },
  letter_in_01_59_98: { ru: "Письмо Банка России № ИН-01-59/98", en: "Bank of Russia letter No. IN-01-59/98" },
  letter_in_03_59_11: { ru: "Письмо Банка России № ИН-03-59/11", en: "Bank of Russia letter No. IN-03-59/11" },
  cbr_reply_page: { ru: "Банк России, рассмотрение обращений", en: "Bank of Russia, replies to complaints" },
};

/** Every source id the desk names; a test checks the clocks cite no other. */
export const NAMED_SOURCES: readonly string[] = Object.keys(NAMES);

/** A source's short name, or its id when the desk has none. */
export function sourceName(source: string, lang: Lang): string {
  return NAMES[source]?.[lang] ?? source;
}

/** Acts whose articles are divided into items rather than parts, and the
 * Bank of Russia's directives and regulations, which have no articles and
 * are cited by item. */
const ITEMS = new Set(["insurance_law_6_2", "securities_law_15_11", "aml_law_7", "aml_law_7_7", "aml_law_7_8", "directive_6748_u", "directive_7282_u", "regulation_842_p"]);

const RU_WORDS: [RegExp, string][] = [
  [/\bsubitem\b/g, "подп."],
  [/\bitems\b/g, "пп."],
  [/\bitem\b/g, "п."],
  [/\bparagraph\b/g, "абз."],
  [/\bsentence\b/g, "предл."],
  [/\bparts\b/g, "ч."],
  [/\bpart\b/g, "ч."],
  [/ to /g, "\u2013"],
];

/** A part that lists several numbers ("2.1, 2.3, 2.4"), which takes the
 * plural ("items 2.1, 2.3, 2.4"; "пп. 2.1, 2.3, 2.4"). */
const LIST = /^\d+(\.\d+)*(, \d+(\.\d+)*)+$/;

/** The act, article and part of a basis, briefly: "Закон о банках № 395-1,
 * ст. 30.1, ч. 7"; "Banking Law No. 395-1, art. 30.1, part 7"; a
 * directive by item: "Указание Банка России № 6748-У, п. 1.5". */
export function basisName(basis: Basis, lang: Lang): string {
  const act = NAMES[basis.source]?.[lang] ?? basis.act;
  const items = ITEMS.has(basis.source);
  const many = LIST.test(basis.part);
  if (lang === "ru") {
    const part = RU_WORDS.reduce((text, [word, ru]) => text.replace(word, ru), basis.part);
    const unit = items ? (many ? "пп." : "п.") : "ч.";
    return [act, basis.article && `ст. ${basis.article}`, part && `${unit} ${part}`].filter(Boolean).join(", ");
  }
  const unitEn = `${items ? "item" : "part"}${many ? "s" : ""}`;
  return [act, basis.article && `art. ${basis.article}`, basis.part && `${unitEn} ${basis.part}`].filter(Boolean).join(", ");
}
