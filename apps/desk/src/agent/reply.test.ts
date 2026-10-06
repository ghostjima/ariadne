// The drafted reply against ariadne-rules' rubric, over the whole corpus:
// for every case still before legal review, the reply the assistant would
// draft, written out in Russian and in English, names its grounds without
// mixing 161-FZ and 115-FZ, offers every option and states every deadline
// the law gives the client, and keeps its sentences short. A finding here
// would be the draft's fault, not the reviewer's to catch.
import { describe, expect, it } from "vitest";
import { Stage, caseFacts, generateAll } from "@ariadne/grid";
import { generatePlan, type ReplyDraft } from "@ariadne/runner";
import { POOLS } from "../data/query";
import { caseBrief } from "../case/brief";
import { makeFmt } from "./format";
import { LOCALES, strings, type Lang } from "./i18n";
import { replyLines, replyText } from "./reply";
import { checkReply } from "./rubric";
import type { Text } from "./text";

const store = generateAll(20261006, 1_200, 400);
const open = Array.from({ length: store.size }, (_, i) => i).filter((i) => store.stage[i]! < Stage.LegalReview);
const text = (lang: Lang): Text => ({ t: strings[lang], f: makeFmt(LOCALES[lang]), labels: POOLS[lang].labels, lang });

function draftOf(row: number): ReplyDraft {
  const draft = generatePlan(7, caseBrief(store, row)).find((s) => s.type === "draft_reply")!.draft;
  if (draft.kind !== "reply") throw new Error("not a reply");
  return draft;
}

describe("the drafted reply", () => {
  it("has nothing for the rubric to flag, in either language, for every open case", () => {
    expect(open.length).toBeGreaterThan(100);
    for (const lang of ["ru", "en"] as const)
      for (const row of open) {
        const draft = draftOf(row);
        const findings = checkReply(draft, replyText(text(lang), draft), caseFacts(store, row));
        expect(findings, `${lang} row ${row}: ${replyText(text(lang), draft)}`).toEqual([]);
      }
  });

  it("the rubric does flag a reply that drops what the draft carries", () => {
    const row = open.find((i) => draftOf(i).clientOptions.length > 0)!;
    const draft = { ...draftOf(row), clientOptions: [], grounds: [] };
    const codes = checkReply(draft, replyText(text("en"), draft), caseFacts(store, row)).map((f) => f.code);
    expect(codes).toContain("ground_missing");
    expect(codes).toContain("client_option_missing");
  });

  it("states the decision only as the register holds it: a pending one is left to the reviewer", () => {
    const pending = open.find((i) => draftOf(i).outcome === "pending")!;
    expect(replyLines(text("en"), draftOf(pending))).toContain("[The decision on the complaint: for the reviewer to state.]");
    expect(replyLines(text("ru"), draftOf(pending))).toContain("[Решение по жалобе: указывает проверяющий.]");
  });
});
