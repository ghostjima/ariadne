// What a finished drafting step wrote, and what the rubric found in it.
// The reply is written out on the page from the draft's codes (reply.ts);
// the rubric is ariadne-rules', run here on that text (rubric.ts). Its
// findings are shown, never applied: a person decides.
import { FindingsList, Letter } from "@ghostjima/stoa-react";
import type { ReplyDraft } from "@ariadne/runner";
import type { CaseFacts } from "@ariadne/rules";
import { sourceName } from "../../case/sources";
import { replyLines, replyText } from "../reply";
import { checkReply, type FindingCode } from "../rubric";
import type { Text } from "../text";

/** The reply as the agent drafted it, one sentence a line, in Stoa's
 * Letter. Not copied from here: what is sent is the letter a person
 * reviews and signs. */
export function ReplyDraftView({ x, draft }: { x: Text; draft: ReplyDraft }) {
  return (
    <div className="reply-draft">
      <Letter label={x.t.objectKind.reply_draft} hideLabel lines={replyLines(x, draft)} lang={x.lang} copyable={false} />
    </div>
  );
}

/** `text`, when given, is the letter as it stands (a person's edit); the
 * draft's grounds, options and deadlines are checked as the draft names
 * them, the sentences on the text. The findings are drawn by Stoa's
 * FindingsList; the rubric gives them no severity, so each is a warning,
 * for a person to weigh. `level` is the heading level of the list's
 * group. */
export function ReplyCheck({ x, draft, facts, text, level = 5 }: { x: Text; draft: ReplyDraft | null; facts: CaseFacts; text?: string; level?: 3 | 4 | 5 | 6 }) {
  const { t, f } = x;
  if (!draft) return <p className="muted">{t.rubric.noDraft}</p>;
  const findings = checkReply(draft, text ?? replyText(x, draft), facts);
  const subject = (code: string, s: string | null): string => {
    if (!s) return "";
    if (code === "client_option_missing") return t.rubric.option[s as keyof typeof t.rubric.option] ?? s;
    if (code === "measure_missing" || code === "measure_not_taken") return t.rubric.measure[s as keyof typeof t.rubric.measure] ?? s;
    return t.rubric.deadline[s as keyof typeof t.rubric.deadline] ?? s;
  };
  // A key per finding: its code, subject and sentence, and how many like
  // it came before, for the rare finding the rubric reports twice.
  const seen = new Map<string, number>();
  const keyOf = (code: string, subject: string | null, sentence: number | null) => {
    const base = `${code}:${subject ?? ""}:${sentence ?? ""}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}:${n}`;
  };
  return (
    <div className="rubric-findings">
      {findings.length > 0 && <p className="muted">{t.rubric.count({ n: findings.length, text: f.int(findings.length) })}</p>}
      <FindingsList
        groupLevel={level}
        emptyText={t.rubric.clean}
        findings={findings.map((finding) => ({
          id: keyOf(finding.code, finding.subject, finding.sentence),
          text: t.rubric.finding[finding.code as FindingCode](subject(finding.code, finding.subject), f.int(finding.words ?? 0)),
          source: sourceName(finding.source, x.lang),
        }))}
      />
    </div>
  );
}
