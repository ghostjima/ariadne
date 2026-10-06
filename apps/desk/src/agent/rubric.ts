// The rubric check of a drafted reply: the reply as the page wrote it out
// (reply.ts), with the grounds, reasons, options and deadlines its draft
// carries, checked by ariadne-rules' rubric against the case's facts. The
// engine runs no rules: the check step's findings are the page's, computed
// here on the text the reader sees. The rules module must be loaded.
import { GROUNDS } from "@ariadne/grid";
import type { GroundCode, ReplyDraft } from "@ariadne/runner";
import { rubric, type CaseFacts, type Finding, type Ground } from "@ariadne/rules";

/** Every finding the rubric reports (the crate's README lists them). */
export const FINDING_CODES = [
  "ground_missing",
  "ground_without_article",
  "grounds_mixed",
  "stream_ground_missing",
  "next_steps_missing",
  "client_option_missing",
  "deadline_missing",
  "deadline_mismatch",
  "text_empty",
  "sentence_too_long",
  "sentences_long_on_average",
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

const SPECS = new Map(GROUNDS.flatMap((g) => (g ? [[g.id, g] as const] : [])));

/** A ground the draft names, as the rubric takes it: act, article, part. */
export function rulesGround(code: GroundCode): Ground {
  const spec = SPECS.get(code);
  if (!spec) throw new RangeError(code);
  return { act: spec.act, article: spec.article, part: spec.part };
}

/** The rubric's findings on a reply written out from its draft. */
export function checkReply(draft: ReplyDraft, text: string, facts: CaseFacts): Finding[] {
  return rubric(
    {
      repliedOn: draft.repliedOn,
      text,
      grounds: draft.grounds.map(rulesGround),
      reasons: draft.reasons,
      nextSteps: draft.nextSteps,
      clientOptions: draft.clientOptions,
      statedDeadlines: draft.deadlines.map((d) => ({ kind: d.kind, due: d.due })),
    },
    facts,
  );
}
