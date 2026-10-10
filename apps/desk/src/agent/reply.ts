// The reply, written out from its draft: the engine sends codes, numbers
// and dates; the words are the interface's (i18n.ts), the citations
// ariadne-rules' (through the register's ground list), the sign numbers
// the crate's. One sentence a line, so the rubric reads each as one.
import { GROUNDS, opRefText } from "@ariadne/grid";
import { AML_REASON_CODES, OPERATIONS, type AmlReasonCode, type ReplyDraft } from "@ariadne/runner";
import { od2506Signs, paymentGrounds, type Basis } from "@ariadne/rules";
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

export function replyLines(x: Text, draft: ReplyDraft): string[] {
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
  for (const measure of draft.measures) lines.push(r.measure[measure]);
  for (const ground of draft.grounds) {
    const citation = groundCitation(x, ground);
    // A ground that is itself what the bank did (a refusal to forward an
    // application) has a sentence of its own, with its citation.
    const own = r.groundStatement[ground];
    lines.push(citation === null ? r.contract : own ? own(citation) : r.ground(citation));
  }
  for (const option of draft.clientOptions) lines.push(r.option[option]);
  for (const d of draft.deadlines) lines.push(r.deadline[d.kind](f.date(d.due)));
  for (const step of draft.nextSteps) lines.push(r.next[step]);
  return lines;
}

/** The reply as one text, a sentence a line. */
export function replyText(x: Text, draft: ReplyDraft): string {
  return replyLines(x, draft).join("\n");
}
