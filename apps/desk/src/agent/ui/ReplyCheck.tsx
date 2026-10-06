// What a finished drafting step wrote, and what the rubric found in it.
// The reply is written out on the page from the draft's codes (reply.ts);
// the rubric is ariadne-rules', run here on that text (rubric.ts). Its
// findings are shown, never applied: a person decides.
import { Callout } from "@ghostjima/stoa-react";
import type { ReplyDraft } from "@ariadne/runner";
import type { CaseFacts } from "@ariadne/rules";
import { sourceName } from "../../case/sources";
import { replyLines, replyText } from "../reply";
import { checkReply, type FindingCode } from "../rubric";
import type { Text } from "../text";

/** The reply as the agent drafted it, one sentence a line. */
export function ReplyDraftView({ x, draft }: { x: Text; draft: ReplyDraft }) {
  return (
    <blockquote className="reply-draft" lang={x.lang}>
      {replyLines(x, draft).map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </blockquote>
  );
}

export function ReplyCheck({ x, draft, facts }: { x: Text; draft: ReplyDraft | null; facts: CaseFacts }) {
  const { t, f } = x;
  if (!draft) return <p className="muted">{t.rubric.noDraft}</p>;
  const findings = checkReply(draft, replyText(x, draft), facts);
  if (findings.length === 0)
    return (
      <Callout tone="positive" role="none">
        {t.rubric.clean}
      </Callout>
    );
  const subject = (code: string, s: string | null): string => {
    if (!s) return "";
    if (code === "client_option_missing") return t.rubric.option[s as keyof typeof t.rubric.option] ?? s;
    return t.rubric.deadline[s as keyof typeof t.rubric.deadline] ?? s;
  };
  return (
    <Callout tone="warning" role="none" title={t.rubric.count({ n: findings.length, text: f.int(findings.length) })}>
      <ul className="rubric-findings">
        {findings.map((finding, i) => (
          <li key={i}>
            {t.rubric.finding[finding.code as FindingCode](subject(finding.code, finding.subject), f.int(finding.words ?? 0))}{" "}
            <span className="muted">{t.rubric.source(sourceName(finding.source, x.lang))}</span>
          </li>
        ))}
      </ul>
    </Callout>
  );
}
