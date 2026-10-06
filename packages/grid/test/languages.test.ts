import { describe, expect, it } from "vitest";
import { generateAll, generateChunk, getRow, writeComment } from "../src/index.js";
import { TAG_COUNT } from "../src/schema.js";
import {
  buildSearch,
  buildSearchIndex,
  commentText,
  refreshSearch,
  rowText,
  tagsText,
  validateLabels,
  validatePools,
  type TextPools,
} from "../src/text.js";
import { labels as arLabels, pools as ar } from "../src/pools/ar.js";
import { labels as enLabels, pools as en } from "../src/pools/en.js";
import { labels as ruLabels, pools as ru } from "../src/pools/ru.js";
import { storeDigest } from "./digest.js";

const languages: [string, TextPools][] = [
  ["en", en],
  ["ru", ru],
  ["ar", ar],
];

describe("language pools", () => {
  it("every shipped pool and label set fits the schema", () => {
    for (const [, p] of languages) expect(validatePools(p)).toEqual([]);
    for (const l of [enLabels, ruLabels, arLabels]) expect(validateLabels(l)).toEqual([]);
  });

  it("entries are unique within each list, so a string names one code", () => {
    for (const [, p] of languages) {
      for (const list of [p.clients, p.regions, p.owners, p.authors, p.comments, p.tags]) {
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });

  it("reports a pool that does not fit, as codes", () => {
    const bad: TextPools = { ...en, clients: en.clients.slice(1), tags: [...en.tags.slice(1), " "] };
    expect(validatePools(bad)).toEqual([
      { code: "size", field: "clients", expected: 24, actual: 23 },
      { code: "empty-entry", field: "tags", index: TAG_COUNT - 1 },
    ]);
    expect(validatePools({ ...en, colleagueComment: "no number" })).toEqual([
      { code: "template", field: "colleagueComment" },
    ]);
    const { comment: _dropped, ...columns } = enLabels.columns;
    expect(validateLabels({ ...enLabels, columns })).toEqual([
      { code: "missing-label", field: "columns", key: "comment" },
    ]);
  });
});

describe("same seed, every language", () => {
  /* Generation never sees a pool: the rows are codes. These tests pin that
     the displayed strings are the only thing a language changes. */
  const a = generateAll(20260904, 20_000);
  const b = generateAll(20260904, 20_000);

  it("produces identical rows apart from the strings", () => {
    expect(storeDigest(a)).toBe(storeDigest(b));
    for (let i = 0; i < a.size; i += 97) {
      const rowA = getRow(a, i);
      const rowB = getRow(b, i);
      expect(rowB).toEqual(rowA);
      const texts = languages.map(([, p]) => rowText(b, p, i));
      /* Same request id in every language */
      expect(new Set(texts.map((t) => t.id)).size).toBe(1);
      /* Each string is the pool entry for the shared code */
      languages.forEach(([, p], k) => {
        const t = texts[k]!;
        expect(t.client).toBe(p.clients[rowA.client]);
        expect(t.owner).toBe(p.owners[rowA.owner]);
        expect(t.region).toBe(p.regions[rowA.region]);
        expect(t.createdBy).toBe(p.authors[rowA.createdBy]);
        expect(t.tags).toBe(tagsText(rowA.tags, p));
        expect(t.comment).toBe(commentText(rowA.comment, p));
      });
    }
  });

  it("pairs strings consistently: one English client is always the same Arabic client", () => {
    const pairs = new Map<string, string>();
    for (let i = 0; i < a.size; i++) {
      const e = rowText(a, en, i).client;
      const r = rowText(a, ar, i).client;
      const seen = pairs.get(e);
      if (seen === undefined) pairs.set(e, r);
      else expect(seen).toBe(r);
    }
    expect(pairs.size).toBe(en.clients.length);
  });

  it("matches the rows a worker would produce chunk by chunk", () => {
    const chunk = generateChunk(20260904, 5_000, 5_000);
    expect(Array.from(chunk.region)).toEqual(Array.from(a.region.subarray(5_000, 10_000)));
    expect(Array.from(chunk.comment)).toEqual(Array.from(a.comment.subarray(5_000, 10_000)));
  });

  it("builds a search index per language that equals the row strings", () => {
    for (const [, p] of languages) {
      const search = buildSearchIndex(a, p);
      for (let i = 0; i < a.size; i += 211) {
        expect(search[i]).toBe(buildSearch(rowText(a, p, i)));
      }
    }
  });

  it("writes numbers in generated Arabic text in Arabic-Indic digits", () => {
    const s = generateAll(5, 1, 1);
    writeComment(s, 0, { kind: "colleague", n: 1234 }, 0);
    expect(rowText(s, ar, 0).comment).toBe("تعديل الزميل ١٢٣٤");
    expect(rowText(s, en, 0).comment).toBe("Colleague's edit 1234");
    for (const list of [ar.clients, ar.regions, ar.owners, ar.authors, ar.comments, ar.tags]) {
      for (const text of list) expect(text).not.toMatch(/[0-9]/);
    }
  });

  it("keeps edited comments language-neutral until displayed", () => {
    const s = generateAll(5, 100, 100);
    writeComment(s, 3, { kind: "colleague", n: 2 }, 0);
    writeComment(s, 4, { kind: "text", text: "Typed by hand" }, 0);
    expect(rowText(s, en, 3).comment).toBe("Colleague's edit 2");
    expect(rowText(s, ru, 3).comment).toBe("Правка коллеги 2");
    expect(rowText(s, ar, 3).comment).toBe("تعديل الزميل ٢");
    for (const [, p] of languages) expect(rowText(s, p, 4).comment).toBe("Typed by hand");
    const search = buildSearchIndex(s, ru);
    expect(search[3]).toContain("правка коллеги 2");
    writeComment(s, 3, { kind: "text", text: "Другое" }, 0);
    refreshSearch(search, s, ru, 3);
    expect(search[3]).toBe(buildSearch(rowText(s, ru, 3)));
    expect(search[3]).toContain("другое");
  });
});
