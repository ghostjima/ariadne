// The supervisor's measures over the register, computed in the page from
// the register, its journals and the letters: time to first action,
// deadline breaches in working days, drafts signed with at most 20% of
// their characters changed, the override rate, returns for rework, and
// reopened and escalated cases, overall and per operator. A letter signed
// in this page is the signature's own; an answered case of the register
// has its signed letter worked out from its draft with the signatory's
// edits drawn from the case (seeded by the row), and its decision follows
// from them. Needs the rules module.
import {
  ASSIGNEE_COUNT,
  Source,
  Stage,
  caseJournal,
  effectiveDue,
  isAnswered,
  makeRng,
  mixSeed,
  workingDaysFrom,
  workingDaysLeft,
  type ColumnStore,
} from "@ariadne/grid";
import { strings as agentStrings } from "../agent/i18n";
import type { Text } from "../agent/text";
import type { CaseFiles, SignDecision } from "../workflow/caseFile";
import { draftText } from "../workflow/letter";
import { changeStats, diffText } from "../workflow/textDiff";
import type { SupervisionStrings } from "./i18n";

export const LIGHT_SHARE = 0.2;

export type SignedLetter = { draft: string; signed: string; decision: Exclude<SignDecision, "defer">; inPage: boolean };

/** The Moscow day of an epoch millisecond. */
const moscowDay = (ms: number) => Math.floor((ms + 3 * 3_600_000) / 86_400_000);

/** The signatory's edits of a register's draft, drawn from the case:
 * about half signed as drafted, most of the rest with a sentence or two
 * changed, a few replaced. The shares are this desk's own. */
function registerEdits(x: Text, w: SupervisionStrings, draft: string, store: ColumnStore, row: number): { text: string; decision: SignedLetter["decision"] } {
  const rng = makeRng(mixSeed(((store.opRef[row] ?? 0) ^ (store.variant[row] ?? 0)) >>> 0, row + 0x516e));
  const r = rng();
  const lines = draft.split("\n");
  if (r < 0.5) return { text: draft, decision: "approve" };
  if (r < 0.94) {
    const edits = r < 0.8 ? 1 : 2;
    const pool = ["greeting", "courtesy", "clarify"] as const;
    const start = Math.floor(rng() * pool.length);
    for (let k = 0; k < edits; k++) {
      const edit = pool[(start + k) % pool.length]!;
      if (edit === "greeting") lines[0] = w.edits.greeting;
      else if (edit === "courtesy") lines.push(w.edits.courtesy);
      else lines.splice(Math.max(1, lines.length - 1), 0, w.edits.clarify);
    }
    return { text: lines.join("\n"), decision: "modify" };
  }
  // Replaced: the decision line and the reasons after it rewritten.
  const outcomes = Object.values(agentStrings[x.lang].reply.outcome);
  const at = Math.max(1, lines.findIndex((l) => outcomes.includes(l)));
  lines.splice(at, Math.min(3, lines.length - at), ...w.edits.override);
  return { text: lines.join("\n"), decision: "override" };
}

/** The signed letter of a case: signed in this page, or, for a case of the
 * register answered before it, worked out from its draft; null when none. */
export function signedLetterOf(x: Text, w: SupervisionStrings, store: ColumnStore, row: number, files: CaseFiles): SignedLetter | null {
  const signature = files.get(row)?.signature;
  if (signature) return { draft: draftText(x, store, row, files), signed: signature.text, decision: signature.decision, inPage: true };
  // Answered as generated: a reply the page sent has its own signature.
  if ((store.origin.get(row)?.stage ?? store.stage[row] ?? 0) < Stage.Sent) return null;
  const draft = draftText(x, store, row, files);
  const { text, decision } = registerEdits(x, w, draft, store, row);
  return { draft, signed: text, decision, inPage: false };
}

/** Nearest-rank percentile of sorted numbers, or null. */
function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? null;
}

export type Group = {
  cases: number;
  open: number;
  overdueNow: number;
  overdueDays: number;
  late: number;
  lateDays: number;
  firstAction: { median: number | null; p90: number | null; n: number };
  signed: number;
  light: number;
  signedInPage: number;
  overrides: number;
  reviewed: number;
  returned: number;
  reopened: number;
  escalated: number;
};

export type Measures = { all: Group; operators: Group[] };

const empty = (): Group & { firstDays: number[] } => ({
  cases: 0,
  open: 0,
  overdueNow: 0,
  overdueDays: 0,
  late: 0,
  lateDays: 0,
  firstAction: { median: null, p90: null, n: 0 },
  firstDays: [],
  signed: 0,
  light: 0,
  signedInPage: 0,
  overrides: 0,
  reviewed: 0,
  returned: 0,
  reopened: 0,
  escalated: 0,
});

export function measure(x: Text, w: SupervisionStrings, store: ColumnStore, files: CaseFiles): Measures {
  const all = empty();
  const operators = Array.from({ length: ASSIGNEE_COUNT }, empty);
  for (let row = 0; row < store.size; row++) {
    if (store.loaded[row] === 0) continue;
    const groups = [all, operators[store.assignee[row] ?? 0]!];
    const journal = caseJournal(store, row);
    const answered = isAnswered(store, row);
    const first = journal.find((e, k) => k > 0 && e.actor.kind !== "system");
    const firstDays = first ? workingDaysFrom(store.registered[row] ?? 0, moscowDay(first.at)) : null;
    const sentOn = store.sentOn[row] ?? -1;
    const due = effectiveDue(store, row);
    const lateDays = answered && sentOn > due ? workingDaysFrom(due, sentOn) : 0;
    const left = answered ? 0 : workingDaysLeft(store, row);
    const reviewed = journal.some((e) => e.action === "hand_over");
    const returned = journal.some((e) => e.action === "return");
    // A repeat complaint about the same operation from the same applicant
    // reopens the matter; one that comes through the Bank of Russia after
    // a complaint to the bank escalates it.
    const linked = store.linked[row] ?? -1;
    const reopened = linked >= 0;
    const escalated = reopened && store.source[row] === Source.BankOfRussia && store.source[linked] !== Source.BankOfRussia;
    const letter = signedLetterOf(x, w, store, row, files);
    const share = letter ? changeStats(diffText(letter.draft, letter.signed)).share : null;
    for (const g of groups) {
      g.cases++;
      if (!answered) g.open++;
      if (left < 0) {
        g.overdueNow++;
        g.overdueDays += -left;
      }
      if (lateDays > 0) {
        g.late++;
        g.lateDays += lateDays;
      }
      if (firstDays !== null) g.firstDays.push(firstDays);
      if (letter) {
        g.signed++;
        if (letter.inPage) g.signedInPage++;
        if (share !== null && share <= LIGHT_SHARE) g.light++;
        if (letter.decision === "override") g.overrides++;
      }
      if (reviewed) g.reviewed++;
      if (reviewed && returned) g.returned++;
      if (reopened) g.reopened++;
      if (escalated) g.escalated++;
    }
  }
  const close = (g: Group & { firstDays: number[] }): Group => {
    const sorted = [...g.firstDays].sort((a, b) => a - b);
    const { firstDays: _, ...rest } = g;
    return { ...rest, firstAction: { median: percentile(sorted, 0.5), p90: percentile(sorted, 0.9), n: sorted.length } };
  };
  return { all: close(all), operators: operators.map(close) };
}
