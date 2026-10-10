/*
  The ground truth of a case: what the register and the rules engine give
  for it, which a reader of the complaint is scored against.

  The proposals are the scripted proposer's on the case's brief: the brief
  is built from the register's codes and ariadne-rules (brief.ts), so the
  stream and the grounds are the register's, the team is the one that holds
  the facts of that stream, and the reply states the options, the deadlines
  and the measures the rubric asks for in the case.

  The provisions are every act, article and part the rules engine gives for
  the case: the grounds of its brief, the sign or the 115-FZ category, the
  basis of each deadline, duty and measure of its clock, and what a reply
  cites for the options, deadlines and restrictions it states, for what a
  reply must contain, and for a complaint to the Bank of Russia. A reply that
  cites a provision outside this list cites law the engine does not give
  for the case.
*/

import { GROUNDS } from "@ariadne/grid";
import { amlReasons, clock, od2506Signs, replyProvisions, type Basis, type CaseFacts } from "@ariadne/rules";
import { proposeAll, SCRIPTED, type CaseBrief, type ProposalSet } from "@ariadne/runner";
import { groundSource } from "./read.js";

/* Where the engine gives a provision for the case */
export const PROVISION_ROLES = ["ground", "reason", "deadline", "duty", "measure", "reply_option", "reply_deadline", "reply_measure", "reply_content", "reply_next_step"] as const;
export type ProvisionRole = (typeof PROVISION_ROLES)[number];

export type Provision = {
  /* The source's id in ariadne-rules ("payment_law_8") */
  source: string;
  /* The article, "" for an act cited by item only (a directive, an order) */
  article: string;
  /* The parts or items named, without their paragraphs and sentences */
  parts: string[];
  role: ProvisionRole;
  /* The ground, reason, deadline, duty or measure it is the basis of */
  of: string;
};

export type Truth = {
  proposals: ProposalSet;
  provisions: Provision[];
};

const NUMBER = /^\d+(\.\d+)*(-\d+)?$/;

/* The parts a basis names: "3.6, item 3" is part 3.6, "2.1, 2.3, 2.4"
   three items, "13.1-1, paragraph 2" item 13.1-1 */
export function partsOf(part: string): string[] {
  return part
    .split(",")
    .map((p) => p.trim())
    .filter((p) => NUMBER.test(p));
}

/* Every provision the rules engine gives for a case */
export function provisionsOf(brief: CaseBrief, facts: CaseFacts): Provision[] {
  const out: Provision[] = [];
  for (const code of brief.grounds) {
    const spec = GROUNDS.find((g) => g?.id === code);
    if (!spec || spec.act === "contract") continue;
    const source = groundSource(code);
    if (source) out.push({ source, article: spec.article, parts: partsOf(spec.part), role: "ground", of: code });
  }
  if (brief.reason !== null) {
    const sign = od2506Signs().find((s) => s.code === brief.reason);
    const category = amlReasons().find((r) => r.code === brief.reason);
    if (sign) out.push({ source: "order_od_2506", article: "", parts: [sign.number], role: "reason", of: sign.code });
    if (category) out.push({ source: category.source, article: category.article, parts: partsOf(category.part), role: "reason", of: category.code });
  }
  const c = clock(facts);
  for (const d of c.deadlines) out.push({ source: d.basis.source, article: d.basis.article, parts: partsOf(d.basis.part), role: "deadline", of: d.kind });
  for (const d of c.duties) out.push({ source: d.basis.source, article: d.basis.article, parts: partsOf(d.basis.part), role: "duty", of: d.kind });
  for (const m of c.measures) out.push({ source: m.basis.source, article: m.basis.article, parts: partsOf(m.basis.part), role: "measure", of: m.kind });
  /* What a reply going out on the brief's day cites for what it states */
  const r = replyProvisions(facts, brief.asOf);
  const add = (role: ProvisionRole, of: string, basis: Basis) => out.push({ source: basis.source, article: basis.article, parts: partsOf(basis.part), role, of });
  for (const x of r.options) add("reply_option", x.code, x.basis);
  for (const x of r.deadlines) add("reply_deadline", x.code, x.basis);
  for (const x of r.measures) add("reply_measure", x.code, x.basis);
  add("reply_content", "reply", r.content);
  if (r.complaintToBankOfRussia) add("reply_next_step", "apply_to_bank_of_russia", r.complaintToBankOfRussia);
  return out;
}

export function truthOf(seed: number, brief: CaseBrief, facts: CaseFacts): Truth {
  return { proposals: proposeAll(SCRIPTED, seed, brief), provisions: provisionsOf(brief, facts) };
}
