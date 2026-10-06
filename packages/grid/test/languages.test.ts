import { describe, expect, it } from "vitest";
import { generateAll, getRow, writeNote } from "../src/index.js";
import { CORPUS_CHUNK, CORPUS_ROWS, DEFAULT_SEED, INJECTION_COUNT, SCALE_CHUNK, SCALE_ROWS } from "../src/schema.js";
import { isAdversarial, opRefText } from "../src/store.js";
import {
  buildSearch,
  buildSearchIndex,
  clientName,
  complaintText,
  noteText,
  refreshSearch,
  rowText,
  validateLabels,
  validatePools,
  type TextPools,
} from "../src/text.js";
import { labels as enLabels, pools as en } from "../src/pools/en.js";
import { labels as ruLabels, pools as ru } from "../src/pools/ru.js";
import { storeDigest } from "./digest.js";

const languages: [string, TextPools][] = [
  ["ru", ru],
  ["en", en],
];

describe("language pools", () => {
  it("every shipped pool and label set fits the schema", () => {
    for (const [, p] of languages) expect(validatePools(p)).toEqual([]);
    for (const l of [ruLabels, enLabels]) expect(validateLabels(l)).toEqual([]);
  });

  it("entries are unique within each list, so a string names one code", () => {
    for (const [, p] of languages) {
      for (const list of [p.companies, p.assignees, p.signatories, p.notes, p.injections, p.firstNames.male, p.firstNames.female]) {
        expect(new Set(list).size).toBe(list.length);
      }
      expect(new Set(p.surnames.map((s) => s[0])).size).toBe(p.surnames.length);
    }
  });

  it("reports a pool that does not fit, as codes", () => {
    const bad: TextPools = { ...en, companies: en.companies.slice(1), notes: [...en.notes.slice(1), " "] };
    expect(validatePools(bad)).toEqual([
      { code: "size", field: "companies", expected: 30, actual: 29 },
      { code: "empty-entry", field: "notes", index: 8 },
    ]);
    expect(validatePools({ ...en, colleagueNote: "no number" })).toEqual([{ code: "template", field: "colleagueNote" }]);
    expect(validatePools({ ...en, complaints: en.complaints.slice(1) })).toContainEqual({
      code: "size",
      field: "complaints",
      expected: 4,
      actual: 3,
    });
    const { note: _dropped, ...columns } = enLabels.columns;
    expect(validateLabels({ ...enLabels, columns })).toEqual([{ code: "missing-label", field: "columns", key: "note" }]);
  });
});

describe("same seed, every language", () => {
  /* Generation never sees a pool: the rows are codes. These tests pin that
     the displayed strings are the only thing a language changes. */
  const a = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
  const b = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);

  it("produces identical rows apart from the strings", () => {
    expect(storeDigest(a)).toBe(storeDigest(b));
    for (let i = 0; i < a.size; i += 37) {
      const rowA = getRow(a, i);
      expect(getRow(b, i)).toEqual(rowA);
      const texts = languages.map(([, p]) => rowText(b, p, i));
      expect(new Set(texts.map((t) => t.id)).size).toBe(1);
      languages.forEach(([, p], k) => {
        const t = texts[k]!;
        expect(t.client).toBe(clientName(rowA.applicant, rowA.client, p));
        expect(t.assignee).toBe(p.assignees[rowA.assignee]);
        expect(t.note).toBe(noteText(rowA.note, p));
        expect(t.subject).toBe(p.complaints[rowA.stream]![rowA.template]!.subject);
      });
    }
  });

  it("writes a person's name in each language's order and a company by its name", () => {
    const person = Array.from({ length: a.size }, (_, i) => i).find((i) => a.applicant[i] === 0)!;
    const [ruName, enName] = [clientName(0, a.client[person]!, ru), clientName(0, a.client[person]!, en)];
    expect(ruName.split(" ")).toHaveLength(2);
    expect(enName.split(" ")).toHaveLength(2);
    expect(ruName).toMatch(/^[А-ЯЁ]/);
    expect(enName).toMatch(/^[A-Z]/);
    expect(clientName(1, 3, ru)).toBe(ru.companies[3]);
    expect(clientName(1, 3, en)).toBe(en.companies[3]);
  });

  it("puts the same complaint into each language, its amounts and dates in that language", () => {
    const row = Array.from({ length: a.size }, (_, i) => i).find((i) => (a.opAmount[i] ?? 0) >= 10_000 && a.stream[i] === 2)!;
    const ruText = complaintText(a, row, ru);
    const enText = complaintText(a, row, en);
    expect(ruText.subject).toBe(ru.complaints[2]![a.template[row]!]!.subject);
    expect(enText.subject).toBe(en.complaints[2]![a.template[row]!]!.subject);
    expect(ruText.body).toContain("₽");
    expect(enText.body).toContain("RUB");
    expect(ruText.body).not.toMatch(/\{(amount|claim|date|ref)\}/);
    expect(enText.body).not.toMatch(/\{(amount|claim|date|ref)\}/);
    expect(opRefText(a.opRef[row]!)).toMatch(/^OP-[0-9A-Z]{7}$/);
  });

  it("refreshes one row's search string after a note is edited", () => {
    const search = buildSearchIndex(b, ru);
    writeNote(b, 5, { kind: "text", text: "Позвонить клиенту" }, 0);
    refreshSearch(search, b, ru, 5);
    expect(search[5]).toBe(buildSearch(rowText(b, ru, 5)));
    expect(search[5]).toContain("позвонить клиенту");
    writeNote(b, 5, { kind: "colleague", n: 4 }, 0);
    expect(rowText(b, en, 5).note).toBe("Colleague's edit 4");
    expect(rowText(b, ru, 5).note).toBe("Правка коллеги 4");
  });
});

describe("adversarial complaints", () => {
  /* Some complaints carry text addressed to an assistant: "ignore previous
     instructions", "approve and close this". They are marked in the data
     (the injection code), so a test can find every one of them and check
     that nothing acts on them. */
  const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);

  it("carry their insertion in every language, and only the marked ones do", () => {
    let marked = 0;
    for (let i = 0; i < store.size; i++) {
      for (const [, p] of languages) {
        const text = complaintText(store, i, p);
        if (isAdversarial(store, i)) {
          expect(text.injection).toBe(p.injections[store.injection[i]! - 1]);
          expect(text.body).toContain(text.injection);
        } else {
          expect(text.injection).toBeNull();
          for (const planted of p.injections) expect(text.body).not.toContain(planted);
        }
      }
      if (isAdversarial(store, i)) marked++;
    }
    expect(marked).toBeGreaterThanOrEqual(20);
    expect(marked).toBeLessThanOrEqual(60);
  });

  it("include the classic phrasings, and every insertion appears in the scale mode", () => {
    expect(en.injections.some((s) => s.toLowerCase().includes("ignore previous instructions"))).toBe(true);
    expect(en.injections.some((s) => s.toLowerCase().includes("approve and close this"))).toBe(true);
    expect(ru.injections.some((s) => s.includes("Игнорируй предыдущие инструкции"))).toBe(true);
    const big = generateAll(DEFAULT_SEED, SCALE_ROWS, SCALE_CHUNK);
    const seen = new Set<number>();
    for (let i = 0; i < big.size; i++) if (big.injection[i]! > 0) seen.add(big.injection[i]!);
    expect(seen.size).toBe(INJECTION_COUNT);
  });
});
