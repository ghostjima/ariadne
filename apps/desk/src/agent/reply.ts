// The reply, written out from its draft: the engine sends codes, numbers
// and dates; the words are the interface's (i18n.ts), the citations
// ariadne-rules' (through the register's ground list, and for each
// option, deadline and restriction the provision the rules give for the
// case), the sign numbers the crate's. One sentence a line, so the rubric
// reads each as one; a statement's provision is a line of its own after
// it.
import { GROUNDS, opRefText } from "@ariadne/grid";
import {
  AML_REASON_CODES,
  CLIENT_DEADLINE_KINDS,
  CLIENT_OPTIONS,
  MEASURE_CODES,
  OPERATIONS,
  type AmlReasonCode,
  type ClientDeadlineKind,
  type ClientOption,
  type MeasureCode,
  type NextStep,
  type ReplyDraft,
} from "@ariadne/runner";
import { od2506Signs, paymentGrounds, replyProvisions, type Basis, type CaseFacts, type Provision } from "@ariadne/rules";
import { basisName } from "../case/sources";
import { caseId, type Text } from "./text";

const isAml = (code: string): code is AmlReasonCode => (AML_REASON_CODES as readonly string[]).includes(code);

/** The act, article and part of a ground, briefly, in the reader's
 * language ("161-FZ, art. 8, part 3.4"); null for the contract. */
export function groundCitation(x: Text, code: string): string | null {
  const spec = GROUNDS.find((g) => g?.id === code);
  if (!spec || spec.act === "contract") return null;
  // The source of a 161-FZ ground is the crate's: art. 8 or art. 9, or the
  // Bank of Russia's directive under art. 9.
  const source =
    spec.act === "payment_system" || spec.act === "bank_of_russia_act"
      ? (paymentGrounds().find((g) => g.code === code)?.source ?? "payment_law_8")
      : spec.article === "7.7"
        ? "aml_law_7_7"
        : "aml_law_7";
  const basis: Basis = { source, act: "", article: spec.article, part: spec.part, revision: "", url: "", reading: "text" };
  return basisName(basis, x.lang);
}

/** The sign's number in Order OD-2506 ("1.4"), from the crate's list. */
function signNumber(code: string): string | null {
  return od2506Signs().find((s) => s.code === code)?.number ?? null;
}

/** The provision each statement of a reply cites, written out in the
 * reader's language ("161-FZ, art. 8, part 3.6, item 3"): by option,
 * deadline, restriction and next step. */
export type ReplyCites = {
  option: Partial<Record<ClientOption, string>>;
  deadline: Partial<Record<ClientDeadlineKind, string>>;
  measure: Partial<Record<MeasureCode, string>>;
  next: Partial<Record<NextStep, string>>;
};

/** A reply written out without a case behind it (a sample brief in a
 * test): its statements carry no provisions. */
export const NO_CITES: ReplyCites = { option: {}, deadline: {}, measure: {}, next: {} };

/** The provisions ariadne-rules gives for a reply to the case, going out
 * on `repliedOn`: each option's, each running deadline's, each
 * restriction's, and the one behind a complaint to the Bank of Russia
 * (none for a legal entity). The rules module must be loaded. */
export function replyCites(x: Text, facts: CaseFacts, repliedOn: string): ReplyCites {
  const p = replyProvisions(facts, repliedOn);
  const by = <T extends string>(codes: readonly T[], list: Provision[]): Partial<Record<T, string>> => {
    const out: Partial<Record<T, string>> = {};
    for (const item of list) if ((codes as readonly string[]).includes(item.code)) out[item.code as T] = basisName(item.basis, x.lang);
    return out;
  };
  return {
    option: by(CLIENT_OPTIONS, p.options),
    deadline: by(CLIENT_DEADLINE_KINDS, p.deadlines),
    measure: by(MEASURE_CODES, p.measures),
    next: p.complaintToBankOfRussia ? { apply_to_bank_of_russia: basisName(p.complaintToBankOfRussia, x.lang) } : {},
  };
}

export function replyLines(x: Text, draft: ReplyDraft, cites: ReplyCites): string[] {
  const { t, f, labels } = x;
  const r = t.reply;
  const lines: string[] = [r.greeting, r.reviewed(f.date(draft.receivedOn), caseId(draft.caseNo))];
  if (draft.operation !== "none" && draft.opOn) {
    const operation = labels.operation[OPERATIONS.indexOf(draft.operation)] ?? draft.operation;
    lines.push(r.operation(operation, opRefText(draft.opRef), f.date(draft.opOn), f.money(draft.amountKopecks)));
  }
  if (draft.claimKopecks > 0) lines.push(r.claim(f.money(draft.claimKopecks)));
  lines.push(r.outcome[draft.outcome]);
  for (const reason of draft.reasons) {
    if (isAml(reason)) lines.push(r.aml[reason]);
    else {
      const sign = signNumber(reason);
      if (sign) lines.push(draft.operation === "bank_transfer" ? r.suspended(sign) : r.refused(sign));
    }
  }
  // A restriction, then the provision it rests on. A suspended card rests
  // on 161-FZ art. 9 part 11.6 or 11.7, which exclude each other: the part
  // the draft names (the rules', unless a person named the other in the
  // register) is the one said.
  const grounded: string[] = [];
  const named = draft.grounds.find((g) => g === "payment_9_11_6" || g === "payment_9_11_7");
  for (const measure of draft.measures) {
    lines.push(r.measure[measure]);
    const cite = (measure === "suspend_instrument" && named ? groundCitation(x, named) : null) ?? cites.measure[measure];
    if (cite) {
      lines.push(r.ground(cite));
      grounded.push(cite);
    }
  }
  for (const ground of draft.grounds) {
    const citation = groundCitation(x, ground);
    // A ground that is itself what the bank did (a refusal to forward an
    // application) has a sentence of its own, with its citation.
    const own = r.groundStatement[ground];
    // Said already under its restriction, as the same part or a sentence
    // of it: not said twice.
    if (citation !== null && !own && grounded.some((cite) => cite === citation || cite.startsWith(`${citation},`))) continue;
    lines.push(citation === null ? r.contract : own ? own(citation) : r.ground(citation));
  }
  // An option, a deadline and a next step, each with its own provision.
  const cited = (line: string, cite: string | undefined) => {
    lines.push(line);
    if (cite) lines.push(r.provision(cite));
  };
  // The commission is reached after the bank's answer on the documents
  // when an operation or a contract was refused; against the measures for
  // a high-risk client there are no documents first.
  const onMeasures = draft.reasons.includes("aml_high_risk_measures");
  for (const option of draft.clientOptions) cited(option === "apply_to_commission" && onMeasures ? r.commissionOnMeasures : r.option[option], cites.option[option]);
  for (const d of draft.deadlines) cited(r.deadline[d.kind](f.date(d.due)), cites.deadline[d.kind]);
  for (const step of draft.nextSteps) cited(r.next[step], cites.next[step]);
  return lines;
}

/** The reply as one text, a sentence a line. */
export function replyText(x: Text, draft: ReplyDraft, cites: ReplyCites): string {
  return replyLines(x, draft, cites).join("\n");
}
