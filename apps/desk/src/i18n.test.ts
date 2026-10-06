import { describe, expect, it } from "vitest";
import { LANGUAGES, strings } from "./i18n";

/** Every key path of a table, with the kind of value at it (the types
 * check the arguments). */
function shape(v: unknown, path = ""): string[] {
  if (typeof v === "function") return [`${path}: function`];
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => shape(x, path ? `${path}.${k}` : k));
  return [`${path}: ${typeof v}`];
}

/** Every string a table can produce, functions called with sample values. */
function texts(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") return [String((v as (...a: unknown[]) => unknown)("1", "2", 1))];
  if (v && typeof v === "object") return Object.values(v).flatMap(texts);
  return [];
}

describe("language tables", () => {
  it("English, Russian and Arabic have the same keys, with the same kinds of value", () => {
    const en = shape(strings.en).sort();
    expect(shape(strings.ru).sort()).toEqual(en);
    expect(shape(strings.ar).sort()).toEqual(en);
  });

  it("no string is empty", () => {
    for (const lang of LANGUAGES) for (const s of texts(strings[lang])) expect(s.trim(), lang).not.toBe("");
  });

  it("the header follows the copy rule: capitalised, no trailing full stop", () => {
    for (const lang of LANGUAGES) {
      for (const s of [strings[lang].title, strings[lang].subtitle]) {
        expect(s.endsWith("."), `${lang}: ${s}`).toBe(false);
        expect(s[0], `${lang}: ${s}`).toBe(s[0]!.toLocaleUpperCase(lang));
      }
    }
  });

  it("Russian words agree with the number", () => {
    const ru = strings.ru;
    expect(ru.shownOf("1", "50 000", 1)).toBe("1 заявка из 50 000");
    expect(ru.shownOf("3", "50 000", 3)).toBe("3 заявки из 50 000");
    expect(ru.shownOf("11", "50 000", 11)).toBe("11 заявок из 50 000");
    expect(ru.shownOf("21", "50 000", 21)).toBe("21 заявка из 50 000");
    expect(strings.en.shownOf("1", "50,000", 1)).toBe("1 of 50,000 request");
    expect(strings.en.shownOf("2", "50,000", 2)).toBe("2 of 50,000 requests");
  });

  it("the Arabic and Russian tables use Latin letters only for the product name, CSV, SLA, the file name and key names", () => {
    const allowed = new Set(["Ariadne", "CSV", "SLA", "requests", "csv", "zayavki", "p"]);
    for (const lang of ["ar", "ru"] as const) {
      const latin = texts(strings[lang]).flatMap((s) => s.match(/[A-Za-z]+/g) ?? []);
      expect(latin.filter((w) => !allowed.has(w)), lang).toEqual([]);
    }
  });
});
