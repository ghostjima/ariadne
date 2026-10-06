import { describe, expect, it } from "vitest";
import { changeStats, diffText, tokenize } from "./textDiff";

const join = (parts: ReturnType<typeof diffText>, keep: "before" | "after") =>
  parts
    .filter((p) => p.kind === "same" || p.kind === (keep === "before" ? "removed" : "added"))
    .map((p) => p.text)
    .join("");

describe("the text diff", () => {
  it("splits words, numbers, spaces and marks, in Russian and English", () => {
    expect(tokenize("Ответ — до 12.10.2026, ч. 3.4")).toEqual(["Ответ", " ", "—", " ", "до", " ", "12", ".", "10", ".", "2026", ",", " ", "ч", ".", " ", "3", ".", "4"]);
    expect(tokenize("")).toEqual([]);
  });

  it("gives back both texts: kept and removed parts make the first, kept and added the second", () => {
    const before = "Dear client,\nWe find your complaint justified.\nThe ground is 161-FZ, art. 8, part 3.10.";
    const after = "Dear client,\nWe find no grounds to uphold your complaint.\nThe ground is 161-FZ, art. 8, part 3.4.\nCall us.";
    const parts = diffText(before, after);
    expect(join(parts, "before")).toBe(before);
    expect(join(parts, "after")).toBe(after);
    expect(parts.filter((p) => p.kind === "removed").some((p) => p.text.startsWith("10"))).toBe(true);
    expect(parts.filter((p) => p.kind === "added").some((p) => p.text.startsWith("4"))).toBe(true);
  });

  it("counts a replaced passage once, by its longer side, against the first text's length", () => {
    expect(changeStats(diffText("abc def", "abc def"))).toEqual({ base: 7, removed: 0, added: 0, changed: 0, share: 0 });
    // One word of three letters replaced by one of three: 3 of 7.
    const replaced = changeStats(diffText("abc def", "abc xyz"));
    expect(replaced).toMatchObject({ base: 7, removed: 3, added: 3, changed: 3 });
    expect(replaced.share).toBeCloseTo(3 / 7);
    // Added only: the added characters.
    expect(changeStats(diffText("abc", "abc def"))).toMatchObject({ base: 3, added: 4, changed: 4 });
    expect(changeStats(diffText("", ""))).toMatchObject({ share: 0 });
    expect(changeStats(diffText("", "new")).share).toBe(1);
  });

  it("keeps a long letter's work small with the common start and end", () => {
    const line = "Мы рассмотрели вашу жалобу и сообщаем результат. ";
    const before = line.repeat(60);
    const after = `${line.repeat(30)}Добавлено одно предложение. ${line.repeat(30)}`;
    const stats = changeStats(diffText(before, after));
    expect(stats.removed).toBe(0);
    expect(stats.added).toBe([..."Добавлено одно предложение. "].length);
  });
});
