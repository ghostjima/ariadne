// The letter of a case: the assistant's draft as it drafted it, and the
// letter as it stands now (the last edit, or the draft with the decision
// the register holds). A case the assistant did not hand over in this
// page (one of the register's own) has its draft worked out the same way
// the assistant would have drafted it, from the case's brief.
import { caseFacts, caseJournal, Stage, type ColumnStore } from "@ariadne/grid";
import { OUTCOMES, replyDraft, type ReplyDraft } from "@ariadne/runner";
import { strings as agentStrings } from "../agent/i18n";
import { replyCites, replyText } from "../agent/reply";
import type { Text } from "../agent/text";
import { caseBrief } from "../case/brief";
import type { Lang } from "../i18n";
import type { CaseFiles, LetterEdit } from "./caseFile";

/** The assistant's draft of the case: handed over in this page, or worked
 * out from the brief. Needs the rules module. */
export function assistantDraft(store: ColumnStore, row: number, files: CaseFiles): { draft: ReplyDraft; handedOver: boolean } {
  const recorded = files.get(row)?.draft;
  if (recorded) return { draft: recorded.reply, handedOver: true };
  return { draft: replyDraft(caseBrief(store, row)), handedOver: false };
}

export type Letter = {
  text: string;
  /** The language the text is in: an edit keeps its own. */
  lang: Lang;
  /** The last edit, when the text is one. */
  edit: LetterEdit | null;
  /** The text is the signed one, frozen. */
  signed: boolean;
};

/** The letter as it stands: signed, or the last edit, or the assistant's
 * draft with the decision the register holds now, in the reader's
 * language. */
export function currentLetter(x: Text, store: ColumnStore, row: number, files: CaseFiles): Letter {
  const file = files.get(row);
  if (file?.signature) return { text: file.signature.text, lang: file.signature.lang, edit: null, signed: true };
  const edit = file?.edits?.at(-1) ?? null;
  if (edit) return { text: edit.text, lang: edit.lang, edit, signed: false };
  const { draft } = assistantDraft(store, row, files);
  const outcome = OUTCOMES[store.outcome[row] ?? 0] ?? draft.outcome;
  return { text: replyText(x, { ...draft, outcome }, replyCites(x, caseFacts(store, row), draft.repliedOn)), lang: x.lang, edit: null, signed: false };
}

/** The assistant's draft as it drafted it, in the reader's language. */
export function draftText(x: Text, store: ColumnStore, row: number, files: CaseFiles): string {
  const { draft } = assistantDraft(store, row, files);
  return replyText(x, draft, replyCites(x, caseFacts(store, row), draft.repliedOn));
}

/** The letter still leaves the decision to the reviewer: its placeholder
 * line, in either language, is in the text. */
export function isUndecided(text: string): boolean {
  return (["ru", "en"] as const).some((lang) => text.includes(agentStrings[lang].reply.outcome.pending));
}

/** When the case last came to signature (epoch milliseconds), or null. */
export function cameToSignature(store: ColumnStore, row: number): number | null {
  if ((store.stage[row] ?? 0) !== Stage.AwaitingSignature) return null;
  const journal = caseJournal(store, row);
  for (let k = journal.length - 1; k >= 0; k--) {
    const e = journal[k]!;
    if (e.to === Stage.AwaitingSignature && e.from !== e.to) return e.at;
  }
  return null;
}
