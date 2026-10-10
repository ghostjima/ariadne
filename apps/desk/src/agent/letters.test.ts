// The letters the desk writes for the inbox's cases, kept for the bench.
//
// The bench scores the scripted assistant beside the models, and its reply
// is this desk's: the draft the engine's script gives for a case, written
// out by reply.ts in the letter's language. The bench runs in Node without
// the desk, so the letters are kept as a file in its package
// (packages/bench/fixtures/oracle-letters.json), and this test holds the
// file to what the desk writes: the same cases, and, on a runtime with the
// ICU data the file was written with, the same bytes (dates and amounts
// are formatted by Intl, whose output follows that data). On any runtime
// every kept letter must leave the rubric nothing to find.
//
// To write the file again after the letter or the inbox changed:
//   UPDATE_LETTERS=1 pnpm --filter @ariadne/desk exec vitest run src/agent/letters.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rowId } from "@ariadne/grid";
import { INBOX_SETS, LANGS, inboxItem, openInbox, type InboxItem } from "@ariadne/inbox";
import { replyDraft } from "@ariadne/runner";
import { POOLS } from "../data/query";
import { makeFmt } from "./format";
import { LOCALES, strings, type Lang } from "./i18n";
import { replyText } from "./reply";
import { checkReply } from "./rubric";
import type { Text } from "./text";

const FILE = new URL("../../../../packages/bench/fixtures/oracle-letters.json", import.meta.url);
const SEEDS = 20;

type Kept = { icu: string; node: string; seeds: number; letters: Record<string, string> };

const text = (lang: Lang): Text => ({ t: strings[lang], f: makeFmt(LOCALES[lang]), labels: POOLS[lang].labels, lang });
const inbox = openInbox();
const items: InboxItem[] = INBOX_SETS.flatMap((set) => LANGS.flatMap((lang) => Array.from({ length: SEEDS }, (_, i) => inboxItem(inbox, set, i + 1, lang))));
/* A letter depends on the case and the language, not on the complaint's wording */
const keyOf = (item: InboxItem) => `${rowId(item.row)}/${item.lang}`;
const written = (): Record<string, string> => Object.fromEntries(items.map((item) => [keyOf(item), replyText(text(item.lang), replyDraft(item.brief))]).sort(([a], [b]) => (a! < b! ? -1 : 1)));

if (process.env.UPDATE_LETTERS) {
  const kept: Kept = { icu: process.versions.icu ?? "", node: process.version, seeds: SEEDS, letters: written() };
  writeFileSync(FILE, `${JSON.stringify(kept, null, 1)}\n`);
}

const kept = JSON.parse(readFileSync(FILE, "utf8")) as Kept;

describe("the letters kept for the bench", () => {
  it("are the desk's letters for every inbox case of seeds 1 to 20, in both languages", () => {
    expect(kept.seeds).toBe(SEEDS);
    expect(Object.keys(kept.letters)).toEqual(Object.keys(written()));
    /* Byte for byte where Intl formats as it did when the file was written */
    if ((process.versions.icu ?? "") === kept.icu) expect(kept.letters).toEqual(written());
  });

  it("leave the rubric nothing to find, each on its own case", () => {
    for (const item of items) {
      const letter = kept.letters[keyOf(item)]!;
      expect(letter.split("\n").length, item.id).toBeGreaterThan(3);
      expect(checkReply(replyDraft(item.brief), letter, item.facts), item.id).toEqual([]);
    }
  });
});
