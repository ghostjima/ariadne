/*
  What a reader of a complaint is handed: the complaint as one text, and
  the case sheet.

  readComplaint writes the complaint out with its parts labelled: the
  subject, the body, a forwarded message, what the attachments say. All of
  it is the applicant's and is untrusted: a reader takes it as data about
  the case, never as instructions.

  caseSheet is what the register and the rules engine say of the case, for
  drafting its reply: the brief's codes, numbers and dates, with the
  citation of each ground and measure written as the desk writes them. It
  holds nothing of the complaint's text.
*/

import { GROUNDS, opRefText, rowId } from "@ariadne/grid";
import { amlReasons, clock, od2506Signs, paymentGrounds, type CaseFacts } from "@ariadne/rules";
import type {
  CaseBrief,
  ClientDeadline,
  ClientOption,
  GroundCode,
  MeasureCode,
  NextStep,
  OperationCode,
  OutcomeCode,
  ReasonCode,
  Regime,
  StreamCode,
} from "@ariadne/runner";
import { NEXT_STEPS } from "@ariadne/runner";
import type { Lang } from "./format.js";
import { TEXTS, type Complaint } from "./inbox.js";

/* The complaint as one text, its parts labelled in its own language */
export function readComplaint(complaint: Complaint): string {
  const l = TEXTS[complaint.lang].labels;
  const lines = [`${l.subject}: ${complaint.subject}`, `${l.body}: ${complaint.body}`];
  if (complaint.quoted) lines.push(`${l.quoted}. ${l.from}: ${complaint.quoted.from}. ${complaint.quoted.body}`);
  for (const a of complaint.attachments) lines.push(`${l.attachment}: ${a.name}. ${l.summary}: ${a.summary}`);
  return lines.join("\n");
}

/* The short name of each act a ground or a measure rests on, as the desk
   names it; a test in the desk checks the two agree */
const ACTS: Record<string, Record<Lang, string>> = {
  banking_law_30_1: { ru: "Закон о банках № 395-1", en: "Banking Law No. 395-1" },
  banking_law_30: { ru: "Закон о банках № 395-1", en: "Banking Law No. 395-1" },
  payment_law_8: { ru: "161-ФЗ", en: "161-FZ" },
  payment_law_9: { ru: "161-ФЗ", en: "161-FZ" },
  aml_law_7: { ru: "115-ФЗ", en: "115-FZ" },
  aml_law_7_7: { ru: "115-ФЗ", en: "115-FZ" },
  aml_law_7_8: { ru: "115-ФЗ", en: "115-FZ" },
  directive_6748_u: { ru: "Указание Банка России № 6748-У", en: "Bank of Russia Directive No. 6748-U" },
};
/* Acts whose articles are divided into items rather than parts */
const ITEMS = new Set(["aml_law_7", "aml_law_7_7", "aml_law_7_8", "directive_6748_u"]);

const RU_WORDS: [RegExp, string][] = [
  [/\bsubitem\b/g, "подп."],
  [/\bitems\b/g, "пп."],
  [/\bitem\b/g, "п."],
  [/\bparagraph\b/g, "абз."],
  [/\bsentence\b/g, "предл."],
];

/* A provision briefly: "161-ФЗ, ст. 8, ч. 3.4"; "115-FZ, art. 7, item 11" */
export function citationText(source: string, article: string, part: string, lang: Lang): string {
  const act = ACTS[source]?.[lang] ?? source;
  const items = ITEMS.has(source);
  if (lang === "ru") {
    const words = RU_WORDS.reduce((text, [word, to]) => text.replace(word, to), part);
    return [act, article && `ст. ${article}`, part && `${items ? "п." : "ч."} ${words}`].filter(Boolean).join(", ");
  }
  return [act, article && `art. ${article}`, part && `${items ? "item" : "part"} ${part}`].filter(Boolean).join(", ");
}

export type CaseSheet = {
  lang: Lang;
  /* The case number as the register shows it: "C-000867" */
  caseId: string;
  stream: StreamCode;
  regime: Regime;
  receivedOn: string;
  /* The day the reply is dated */
  repliedOn: string;
  operation: { code: OperationCode; ref: string; on: string; amountKopecks: number } | null;
  claimKopecks: number;
  /* The decision the register holds; pending is left for the reviewer */
  outcome: OutcomeCode;
  /* The OD-2506 sign with its number in the order, or the 115-FZ category */
  reason: { code: ReasonCode; sign: string | null } | null;
  /* The grounds the reply names; the contract has no citation */
  grounds: { code: GroundCode; citation: string | null }[];
  /* The restrictions that apply for the client's own data in the Bank of
     Russia's database, each with the provision it rests on */
  measures: { code: MeasureCode; citation: string | null }[];
  clientOptions: ClientOption[];
  deadlines: ClientDeadline[];
  nextSteps: NextStep[];
};

function groundCitation(code: GroundCode, lang: Lang): string | null {
  const spec = GROUNDS.find((g) => g?.id === code);
  if (!spec || spec.act === "contract") return null;
  const source = (spec.act === "payment_system" ? paymentGrounds() : amlReasons()).find((g) => g.code === code)?.source;
  return source ? citationText(source, spec.article, spec.part, lang) : null;
}

/* The case sheet of a brief; `facts` are the same facts the brief was
   built from (caseFacts of its row) */
export function caseSheet(brief: CaseBrief, facts: CaseFacts, lang: Lang): CaseSheet {
  const measures = clock(facts).measures;
  return {
    lang,
    caseId: rowId(brief.caseNo - 1),
    stream: brief.stream,
    regime: brief.regime,
    receivedOn: brief.receivedOn,
    repliedOn: brief.asOf,
    operation:
      brief.operation === "none" || brief.opOn === null
        ? null
        : { code: brief.operation, ref: opRefText(brief.opRef), on: brief.opOn, amountKopecks: brief.amountKopecks },
    claimKopecks: brief.claimKopecks,
    outcome: brief.outcome,
    reason: brief.reason === null ? null : { code: brief.reason, sign: od2506Signs().find((s) => s.code === brief.reason)?.number ?? null },
    grounds: brief.grounds.map((code) => ({ code, citation: groundCitation(code, lang) })),
    measures: brief.measures.map((code) => {
      const basis = measures.find((m) => m.kind === code)?.basis;
      return { code, citation: basis ? citationText(basis.source, basis.article, basis.part, lang) : null };
    }),
    clientOptions: [...brief.clientOptions],
    deadlines: brief.deadlines.map((d) => ({ ...d })),
    nextSteps: [...NEXT_STEPS],
  };
}
