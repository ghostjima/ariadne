/*
  Legal citations in a reply, read deterministically: which act, article
  and part or item a sentence cites, in Russian or in English. No model
  reads the text.

  A citation is built around an article ("ст. 8", "статьи 8", "art. 8",
  "Article 8"), with the act named nearest to it in the same sentence (a
  number such as 161-ФЗ, or a name such as the Civil Code) and the parts or
  items named nearest to it ("ч. 3.4", "п. 11", "part 3.4", "item 11").
  An act cited by item without an article (a Bank of Russia directive, the
  signs of Order OD-2506) gives a citation with no article. Paragraphs,
  subitems and sentences below a part are read and left out: the check
  goes as deep as the part.

  A citation is inside a case when the rules engine gives its act and
  article for the case, and every part it names is among the parts the
  engine gives for that article (provisions of @ariadne/inbox). Anything
  else is outside: an act the case does not rest on, an article the engine
  does not give, a part that is not there, an article with no act named
  anywhere before it.

  This reads citations written the way statutes are cited. It does not
  understand a law referred to in other words ("the consumer law says"),
  and it does not judge whether a cited provision is the right one beyond
  being one the engine gives for the case.
*/

import type { Provision } from "@ariadne/inbox";

export type Citation = {
  /* The act's key ("fz:161", "law:395-1", "civil_code", "cbr:6748-u"),
     or null when no act is named */
  act: string | null;
  /* The article, or null for an act cited without one */
  article: string | null;
  /* The parts or items named with it */
  parts: string[];
};

const NUM = String.raw`\d+(?:\.\d+)*(?:-\d+)?`;
const LIST = String.raw`${NUM}(?:(?:\s*,\s*|\s+(?:и|and|или|or)\s+)${NUM})*`;

/* Acts by name. Matched on lowercased text with "ё" written as "е". */
const NAMED: readonly [RegExp, string][] = [
  [/закон\S*\s+(?:российской федерации\s+)?[«"]?о банках(?: и банковской деятельности)?|banking law|law on banks(?: and banking(?: activit(?:y|ies))?)?/g, "law:395-1"],
  [/[«"]?о национальной плат[её]жной системе|national payment system(?: law| act)?/g, "fz:161"],
  [/[«"]?о противодействии легализации|закон\S*\s+о противодействии отмыванию|anti-money-laundering (?:law|act)|aml law/g, "fz:115"],
  [/[«"]?об уполномоченном по правам потребителей финансовых услуг|закон\S*\s+о финансовом уполномоченном|financial ombudsman (?:law|act)/g, "fz:123"],
  [/гражданск\S+\s+кодекс\S*(?:\s+(?:российской федерации|рф))?|(?<![а-яa-z])гк(?:\s+рф)?(?![а-яa-z])|civil code(?: of (?:the )?russian federation| of russia)?/g, "civil_code"],
  [/[«"]?о защите прав потребителей|(?<![а-яa-z])зозпп(?![а-яa-z])|consumer (?:rights )?protection (?:law|act)|law on (?:the )?protection of consumer rights/g, "law:2300-1"],
  [/трудов\S+\s+кодекс\S*|(?<![а-яa-z])тк(?:\s+рф)?(?![а-яa-z])|labou?r code/g, "labour_code"],
  [/кодекс\S*\s+(?:российской федерации\s+)?об административных правонарушениях|(?<![а-яa-z])коап(?:\s+рф)?(?![а-яa-z])|code of administrative offen[cs]es/g, "administrative_code"],
  [/уголовн\S+\s+кодекс\S*|(?<![а-яa-z])ук(?:\s+рф)?(?![а-яa-z])|criminal code/g, "criminal_code"],
  [/налогов\S+\s+кодекс\S*|(?<![а-яa-z])нк(?:\s+рф)?(?![а-яa-z])|tax code/g, "tax_code"],
  [/конституци\S+|constitution/g, "constitution"],
];

/* Cyrillic letters in the number of a Bank of Russia document, as Latin */
const LATIN: Record<string, string> = { у: "u", п: "p", и: "i", о: "o", д: "d", н: "n" };
const latin = (id: string): string => id.replace(/[упиодн]/g, (c) => LATIN[c] ?? c);

type Token =
  | { kind: "act"; at: number; end: number; act: string }
  | { kind: "article"; at: number; end: number; values: string[] }
  | { kind: "part"; at: number; end: number; values: string[]; maybeSub: boolean; unit: "part" | "item" }
  | { kind: "sub"; at: number; end: number };

const numbers = (list: string): string[] => list.match(new RegExp(NUM, "g")) ?? [];

function tokens(sentence: string): Token[] {
  const out: Token[] = [];
  const each = (re: RegExp, make: (m: RegExpExecArray) => Token | null) => {
    for (const m of sentence.matchAll(re)) {
      const token = make(m as RegExpExecArray);
      if (token) out.push(token);
    }
  };
  const span = (m: RegExpExecArray) => ({ at: m.index, end: m.index + m[0].length });
  /* Federal laws by number: 161-ФЗ, No. 161-FZ */
  each(/(\d{1,4})\s*-\s*(?:фз|fz)(?![а-яa-z])/g, (m) => ({ kind: "act", ...span(m), act: `fz:${m[1]}` }));
  /* Laws numbered N-1: № 395-1, No. 2300-1 */
  each(/(?:№|no\.?|n)\s*(\d{3,4}-1)(?![\d-])/g, (m) => ({ kind: "act", ...span(m), act: `law:${m[1]}` }));
  /* Bank of Russia documents by number: № 6748-У, No. 842-P, № ОД-2506,
     № ИН-01-59/98, № 010-31/7975 */
  each(/(?:№|no\.?)\s*((?:од|od|ин|in)-[\d/-]+\d|\d{3,5}-(?:у|u|п|p|и|i)(?![а-яa-z])|\d{3}-\d{2}\/\d{3,5})/g, (m) => ({ kind: "act", ...span(m), act: `cbr:${latin(m[1]!)}` }));
  each(/(?:^|[^\w№а-я])((?:од|od)-2506|6748-(?:у|u)|842-(?:п|p))(?![а-яa-z\d])/g, (m) => ({ kind: "act", ...span(m), act: `cbr:${latin(m[1]!)}` }));
  for (const [re, act] of NAMED) each(re, (m) => ({ kind: "act", ...span(m), act }));
  /* Articles */
  each(new RegExp(String.raw`(?:^|[^а-яa-z])(?:стать(?:я|и|е|ю|ей|ями|ях|ям)|ст\.?|articles?|arts?\.?)\s*(${LIST})`, "g"), (m) => ({ kind: "article", ...span(m), values: numbers(m[1]!) }));
  /* Parts and items; the signs of Order OD-2506 are its items */
  each(new RegExp(String.raw`(?:^|[^а-яa-z])(?:част(?:ь|и|ью|ей|ями|ях|ям)|чч?\.|пункт(?:а|у|ом|е|ы|ов|ами|ах)?|пп?\.|признак(?:а|у|ом|е|и|ов|ами|ах)?|parts?|items?|clauses?|points?|sections?|signs?)\s*(${LIST})`, "g"), (m) => ({
    kind: "part",
    ...span(m),
    values: numbers(m[1]!),
    maybeSub: /^[^а-яa-z]?пп\./.test(m[0]),
    unit: /^[^а-яa-z]?(?:част|чч?\.|parts?)/.test(m[0]) ? "part" : "item",
  }));
  /* In English a paragraph may stand for an item ("paragraph 11 of Article
     7") or lie below one ("item 5.2, paragraph 2"): decided below */
  each(new RegExp(String.raw`(?:^|[^a-z])paragraphs?\s*(${LIST})`, "g"), (m) => ({ kind: "part", ...span(m), values: numbers(m[1]!), maybeSub: true, unit: "item" }));
  /* Below a part: read so that their numbers are not taken for parts */
  each(new RegExp(String.raw`(?:^|[^а-яa-z])(?:абзац(?:а|у|ем|е|ы|ев)?|абз\.|подпункт(?:а|у|ом|е|ы|ов)?|подп\.|предложени(?:е|я|ю|ем|и|й)|предл\.|subitems?|subparagraphs?|sub-?clauses?|sentences?)\s*(${LIST})`, "g"), (m) => ({ kind: "sub", ...span(m) }));
  out.sort((a, b) => a.at - b.at || b.end - a.end);
  /* A token inside a longer one is the longer one's ("подпункт 6" holds
     "пункт 6"; "Федерального закона № 161-ФЗ" holds no article) */
  const kept: Token[] = [];
  for (const t of out) {
    const inside = kept.some((k) => k.at <= t.at && t.end <= k.end && !(k.at === t.at && k.end === t.end && k.kind === t.kind));
    if (!inside && !kept.some((k) => k.kind === t.kind && k.at === t.at && k.end === t.end)) kept.push(t);
  }
  return kept;
}

/* Sentences of a text, for citations: a line break ends one, and so does a
   full stop, question or exclamation mark before whitespace and a capital
   letter, unless the stop belongs to an abbreviation a citation is written
   with ("ст.", "ч.", "п.", "art.", "No.") */
export function citationSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    let start = 0;
    const re = /[.!?…]+\s+(?=[«"(]?[A-ZА-ЯЁ])/gu;
    for (const m of line.matchAll(re)) {
      const before = line.slice(Math.max(0, m.index - 12), m.index);
      if (/(?:^|[^а-яёa-z])(?:ст|ч|чч|п|пп|абз|подп|предл|art|arts|no|г|руб)$/iu.test(before)) continue;
      out.push(line.slice(start, m.index + 1));
      start = m.index + m[0].length;
    }
    out.push(line.slice(start));
  }
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

const gap = (a: Token, b: Token): number => (b.at >= a.end ? b.at - a.end : a.at >= b.end ? a.at - b.end : 0);

const nearest = <T extends Token>(to: Token, among: readonly T[]): T | undefined => {
  let best: T | undefined;
  for (const t of among) if (!best || gap(to, t) < gap(to, best)) best = t;
  return best;
};

/* The act an article belongs to: the one named nearest to it. "Article 8
   of Law X" and "статьи 8 Закона X" name the act after the article, so an
   act that follows wins a tie, and wins outright after "of". */
function actOfArticle(article: Token, acts: readonly Extract<Token, { kind: "act" }>[], sentence: string): Extract<Token, { kind: "act" }> | undefined {
  const after = acts.filter((a) => a.at >= article.end);
  const before = acts.filter((a) => a.end <= article.at);
  const next = nearest(article, after);
  const prev = nearest(article, before);
  if (!next || !prev) return next ?? prev ?? nearest(article, acts);
  if (/^\s*of\b/.test(sentence.slice(article.end))) return next;
  return gap(article, next) <= gap(article, prev) ? next : prev;
}

/* Every citation of a text, in order */
export function citations(text: string): Citation[] {
  const out: Citation[] = [];
  /* The act named last, for an article whose sentence names none */
  let lastAct: string | null = null;
  for (const raw of citationSentences(text)) {
    const sentence = raw.toLowerCase().replaceAll("ё", "е");
    const all = tokens(sentence);
    const acts = all.filter((t): t is Extract<Token, { kind: "act" }> => t.kind === "act");
    const articles = all.filter((t) => t.kind === "article");
    let parts = all.filter((t) => t.kind === "part");
    /* "пп. 6 п. 1" is a subitem of item 1; an English paragraph after an
       item of the same citation lies below it */
    parts = parts.filter((p) => {
      if (!p.maybeSub) return true;
      const next = parts.find((q) => q !== p && !q.maybeSub && q.at >= p.end && q.at - p.end <= 3);
      const prev = parts.find((q) => q !== p && !q.maybeSub && q.end <= p.at && p.at - q.end <= 3);
      return !next && !prev;
    });
    const used = new Set<Token>();
    const cited: (Citation & { at: number })[] = [];
    const byArticle = new Map<Token, string[]>();
    /* An article divided into parts has its items below them ("ч. 3.6,
       п. 3"; "part 3.6, item 3"): where an article is cited with both, the
       items are left out, as paragraphs are */
    const ofArticle = new Map<Token, typeof parts>();
    for (const p of parts) {
      const article = nearest(p, articles);
      if (article) ofArticle.set(article, [...(ofArticle.get(article) ?? []), p]);
    }
    for (const [article, own] of ofArticle) {
      const divided = own.some((p) => p.unit === "part");
      for (const p of own) {
        used.add(p);
        if (divided && p.unit === "item") continue;
        byArticle.set(article, [...(byArticle.get(article) ?? []), ...p.values]);
      }
    }
    for (const a of articles) {
      const act = actOfArticle(a, acts, sentence);
      if (act) used.add(act);
      for (const value of a.values) cited.push({ act: act?.act ?? lastAct, article: value, parts: [...new Set(byArticle.get(a) ?? [])], at: a.at });
    }
    /* Parts with no article: items of an act cited without one */
    for (const p of parts) {
      if (used.has(p)) continue;
      const act = nearest(p, acts);
      if (act) used.add(act);
      cited.push({ act: act?.act ?? null, article: null, parts: p.values, at: p.at });
    }
    /* An act named with neither: cited as a whole. Named twice in one
       sentence (by its number and by its title), it is one act. */
    const usedActs = new Set([...used].flatMap((t) => (t.kind === "act" ? [t.act] : [])));
    for (const act of acts) {
      if (used.has(act) || usedActs.has(act.act)) continue;
      usedActs.add(act.act);
      cited.push({ act: act.act, article: null, parts: [], at: act.at });
    }
    cited.sort((a, b) => a.at - b.at);
    for (const { at: _at, ...c } of cited) {
      if (c.act === null && c.article === null) continue;
      out.push(c);
    }
    if (acts.length > 0) lastAct = acts.at(-1)!.act;
  }
  /* The same act cited as a whole twice says nothing twice */
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* The act key of each source ariadne-rules cites; null for a source that
   is not an act a reply would cite (a page of the Bank of Russia's site) */
const SOURCE_ACT: Record<string, string | null> = {
  banking_law_30_1: "law:395-1",
  banking_law_30: "law:395-1",
  microfinance_law_9_1: "fz:151",
  insurance_law_6_2: "law:4015-1",
  securities_law_15_11: "fz:39",
  credit_cooperation_law_6_2: "fz:190",
  ombudsman_law_15: "fz:123",
  ombudsman_law_16: "fz:123",
  ombudsman_law_28: "fz:123",
  payment_law_8: "fz:161",
  payment_law_9: "fz:161",
  aml_law_7: "fz:115",
  aml_law_7_7: "fz:115",
  aml_law_7_8: "fz:115",
  civil_code_191_193: "civil_code",
  labour_code_112: "labour_code",
  central_bank_law_79_3: "fz:86",
  directive_6748_u: "cbr:6748-u",
  directive_7282_u: "cbr:7282-u",
  decree_1335_2024: "gov:1335",
  decree_1466_2025: "gov:1466",
  decree_1187_2026: "gov:1187",
  regulation_842_p: "cbr:842-p",
  order_od_2506: "cbr:od-2506",
  letter_010_31_7975: "cbr:010-31/7975",
  letter_in_01_59_98: "cbr:in-01-59/98",
  letter_in_03_59_11: "cbr:in-03-59/11",
  cbr_exclusion_page: null,
  cbr_reply_page: null,
};

/* The act key of a rules source; undefined for one this table does not
   know, which a test over the inbox's cases would catch */
export function actOf(source: string): string | null | undefined {
  return SOURCE_ACT[source];
}

/* Whether a citation is one the rules engine gives for the case */
export function insideCase(citation: Citation, provisions: readonly Provision[]): boolean {
  if (citation.act === null) return false;
  const ofAct = provisions.filter((p) => actOf(p.source) === citation.act);
  if (ofAct.length === 0) return false;
  /* An act cited as a whole, or by items without an article */
  const scope = citation.article === null ? ofAct : ofAct.filter((p) => p.article === citation.article);
  if (scope.length === 0) return false;
  const parts = new Set(scope.flatMap((p) => p.parts));
  return citation.parts.every((part) => parts.has(part));
}

/* The citations of a text that are outside the case */
export function outsideCase(text: string, provisions: readonly Provision[]): Citation[] {
  return citations(text).filter((c) => !insideCase(c, provisions));
}
