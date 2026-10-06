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
  it("are English and Russian, with the same keys and the same kinds of value", () => {
    expect(LANGUAGES).toEqual(["en", "ru"]);
    expect(shape(strings.ru).sort()).toEqual(shape(strings.en).sort());
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
    expect(strings.en.title).toBe("Ariadne Desk");
    expect(strings.ru.title).toBe("Ariadne Стол заявок");
  });

  it("Russian words agree with the number", () => {
    const ru = strings.ru;
    expect(ru.shownOf("1", "1 200", 1)).toBe("1 обращение из 1 200");
    expect(ru.shownOf("3", "1 200", 3)).toBe("3 обращения из 1 200");
    expect(ru.shownOf("11", "1 200", 11)).toBe("11 обращений из 1 200");
    expect(ru.shownOf("21", "1 200", 21)).toBe("21 обращение из 1 200");
    expect(ru.workingDaysLeft("2", 2)).toBe("2 рабочих дня");
    expect(ru.overdueBy("5", 5)).toBe("просрочено на 5 рабочих дней");
    expect(strings.en.shownOf("1", "1,200", 1)).toBe("1 of 1,200 case");
    expect(strings.en.workingDaysLeft("1", 1)).toBe("1 working day");
  });

  it("the Russian table uses Latin letters only for the product name, CSV and the file name", () => {
    const allowed = new Set(["Ariadne", "CSV", "csv", "obrashcheniya", "p"]);
    const latin = texts(strings.ru).flatMap((s) => s.match(/[A-Za-z]+/g) ?? []);
    expect(latin.filter((w) => !allowed.has(w))).toEqual([]);
  });
});
