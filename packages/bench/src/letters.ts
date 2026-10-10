/*
  The letters of the two agents that are not models.

  The scripted assistant's reply is the desk's: the draft the engine's
  script gives for a case, written out by the desk in the letter's
  language. The desk is an application and the bench runs without it, so
  those letters are kept as a file (fixtures/oracle-letters.json), which a
  test in the desk holds to what the desk writes.

  The naive baseline writes the same few sentences to everybody: a reply
  template with nothing of the case in it.
*/

import { readFileSync } from "node:fs";
import { rowId } from "@ariadne/grid";
import type { InboxItem, Lang } from "@ariadne/inbox";

export type KeptLetters = { icu: string; node: string; seeds: number; letters: Record<string, string> };

let kept: KeptLetters | null = null;

export function keptLetters(): KeptLetters {
  kept ??= JSON.parse(readFileSync(new URL("../fixtures/oracle-letters.json", import.meta.url), "utf8")) as KeptLetters;
  return kept;
}

/* The desk's letter for an item's case, or null when the file has none
   (a seed beyond the ones kept) */
export function oracleLetter(item: InboxItem): string | null {
  return keptLetters().letters[`${rowId(item.row)}/${item.lang}`] ?? null;
}

/* The letter the naive baseline sends whatever the case */
export const NAIVE_LETTER: Record<Lang, string> = {
  ru: ["Уважаемый клиент!", "Мы рассмотрели вашу жалобу.", "Наша позиция основана на условиях вашего договора с банком.", "Если у вас есть вопросы, ответьте на это письмо или позвоните нам."].join("\n"),
  en: ["Dear client,", "We have reviewed your complaint.", "Our position rests on the terms of your contract with the bank.", "If you have questions, reply to this letter or call us."].join("\n"),
};
