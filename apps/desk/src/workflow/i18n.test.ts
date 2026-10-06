// The words of a case's work: Russian and English with the same keys, a
// label for every action of the journal and every reason for a return,
// and nothing empty.
import { describe, expect, it } from "vitest";
import { ACTIONS, RETURN_REASONS, TRANSITIONS } from "@ariadne/grid";
import { workflowStrings } from "./i18n";

function shape(v: unknown, path = ""): string[] {
  if (typeof v === "function") return [`${path}: function`];
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => shape(x, path ? `${path}.${k}` : k));
  return [`${path}: ${typeof v}`];
}

function texts(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") return [String((v as (...a: unknown[]) => unknown)("1", "2", "3"))];
  if (v && typeof v === "object") return Object.values(v).flatMap(texts);
  return [];
}

describe("the words of a case's work", () => {
  it("are the same keys in Russian and English, none empty", () => {
    expect(shape(workflowStrings.ru).sort()).toEqual(shape(workflowStrings.en).sort());
    for (const lang of ["ru", "en"] as const) for (const s of texts(workflowStrings[lang])) expect(s.trim(), lang).not.toBe("");
  });

  it("name every action of the journal, every transition's button and help, and every reason", () => {
    for (const lang of ["ru", "en"] as const) {
      const w = workflowStrings[lang];
      for (const a of ACTIONS) expect(w.action[a], `${lang} ${a}`).toBeTruthy();
      for (const t of TRANSITIONS) {
        expect(w.act[t.action], `${lang} ${t.action}`).toBeTruthy();
        expect(w.actHelp[t.action], `${lang} ${t.action}`).toBeTruthy();
      }
      for (const r of RETURN_REASONS) expect(w.reasons[r], `${lang} ${r}`).toBeTruthy();
    }
  });

  it("the Russian table has no Latin words", () => {
    expect(texts(workflowStrings.ru).flatMap((s) => s.match(/[A-Za-z]+/g) ?? [])).toEqual([]);
  });
});
