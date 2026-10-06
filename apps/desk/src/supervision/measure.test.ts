// The supervisor's measures over the corpus: each one checked against a
// count made here the plain way, the operators adding up to the whole, a
// letter signed in the page counted from its own texts, and the register's
// signed letters worked out the same way every time.
import { describe, expect, it } from "vitest";
import { Source, Stage, caseJournal, effectiveDue, generateAll, isAnswered, workingDaysLeft } from "@ariadne/grid";
import { strings as agentStrings } from "../agent/i18n";
import { makeFmt } from "../agent/format";
import type { Text } from "../agent/text";
import { POOLS } from "../data/query";
import { signLetter, type CaseFiles } from "../workflow/caseFile";
import { cameToSignature, currentLetter } from "../workflow/letter";
import { changeStats, diffText } from "../workflow/textDiff";
import { supervisionStrings } from "./i18n";
import { LIGHT_SHARE, measure, signedLetterOf } from "./measure";

const x: Text = { t: agentStrings.en, f: makeFmt("en-US"), labels: POOLS.en.labels, lang: "en" };
const w = supervisionStrings.en;
const fresh = () => generateAll(20261006, 1_200, 400);

describe("the supervisor's measures", () => {
  const store = fresh();
  const files: CaseFiles = new Map();
  const started = performance.now();
  const m = measure(x, w, store, files);
  const took = performance.now() - started;
  const rows = Array.from({ length: store.size }, (_, i) => i);

  it("counts deadline breaches, open cases and the operators as a plain count does", () => {
    const late = rows.filter((i) => isAnswered(store, i) && store.sentOn[i]! > effectiveDue(store, i));
    const overdue = rows.filter((i) => !isAnswered(store, i) && workingDaysLeft(store, i) < 0);
    expect([m.all.late, m.all.overdueNow, m.all.open, m.all.cases]).toEqual([late.length, overdue.length, rows.filter((i) => !isAnswered(store, i)).length, 1_200]);
    expect(m.all.late).toBeGreaterThan(0);
    expect(m.all.overdueDays).toBe(overdue.reduce((n, i) => n - workingDaysLeft(store, i), 0));
    for (const key of ["cases", "open", "overdueNow", "late", "lateDays", "signed", "light", "overrides", "reviewed", "returned", "reopened", "escalated"] as const)
      expect(m.operators.reduce((n, g) => n + g[key], 0), key).toBe(m.all[key]);
  });

  it("time to first action: the first journal step after registration, within two working days for the register", () => {
    expect(m.all.firstAction.n).toBe(rows.filter((i) => caseJournal(store, i).length > 1).length);
    expect(m.all.firstAction.median).toBeLessThanOrEqual(1);
    expect(m.all.firstAction.p90).toBeLessThanOrEqual(2);
  });

  it("returns, reopened and escalated cases from the journals and the linked cases", () => {
    const reviewed = rows.filter((i) => caseJournal(store, i).some((e) => e.action === "hand_over"));
    expect(m.all.reviewed).toBe(reviewed.length);
    expect(m.all.returned).toBe(reviewed.filter((i) => caseJournal(store, i).some((e) => e.action === "return")).length);
    expect(m.all.returned / m.all.reviewed).toBeLessThan(0.3);
    const reopened = rows.filter((i) => store.linked[i]! >= 0);
    expect(m.all.reopened).toBe(reopened.length);
    expect(m.all.reopened).toBeGreaterThan(20);
    expect(m.all.escalated).toBeGreaterThan(0);
    expect(m.all.escalated).toBe(reopened.filter((i) => store.source[i] === Source.BankOfRussia && store.source[store.linked[i]!] !== Source.BankOfRussia).length);
  });

  it("the register's signed letters: every answered case, the share of light edits from the texts, overrides from the decisions; the same every time", () => {
    expect(m.all.signed).toBe(rows.filter((i) => isAnswered(store, i)).length);
    expect(m.all.signedInPage).toBe(0);
    const letters = rows.flatMap((i) => signedLetterOf(x, w, store, i, files) ?? []);
    expect(m.all.light).toBe(letters.filter((l) => changeStats(diffText(l.draft, l.signed)).share <= LIGHT_SHARE).length);
    expect(m.all.overrides).toBe(letters.filter((l) => l.decision === "override").length);
    expect(m.all.light / m.all.signed).toBeGreaterThan(0.5);
    expect(m.all.overrides).toBeGreaterThan(0);
    for (const l of letters.slice(0, 50)) if (l.decision === "approve") expect(l.signed).toBe(l.draft);
    expect(measure(x, w, store, files)).toEqual(m);
  });

  it("is quick enough to compute when the view opens", () => {
    expect(took).toBeLessThan(5_000);
  });
});

describe("a letter signed in the page", () => {
  it("is counted from its own draft and signed text, with its own decision", () => {
    const store = fresh();
    const files: CaseFiles = new Map();
    const row = Array.from({ length: store.size }, (_, i) => i).find((i) => store.stage[i] === Stage.AwaitingSignature && store.outcome[i] === 1)!;
    const text = currentLetter(x, store, row, files).text;
    expect(
      signLetter(store, row, files, {
        record: { decision: "approve", concerns: "", wrong: "The client was answered before." },
        text,
        lang: "en",
        undecided: false,
        person: 0,
        at: Date.UTC(2026, 9, 6, 9),
        since: cameToSignature(store, row) ?? 0,
      }),
    ).toBeNull();
    const letter = signedLetterOf(x, w, store, row, files)!;
    expect(letter).toMatchObject({ signed: text, decision: "approve", inPage: true });
    const m = measure(x, w, store, files);
    expect(m.all.signedInPage).toBe(1);
  });
});
