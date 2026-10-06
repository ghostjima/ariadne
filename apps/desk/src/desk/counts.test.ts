import { describe, expect, it } from "vitest";
import { strings } from "../i18n";
import { countText } from "./counts";
import { makeFormats } from "./columns";

const en = (n: number) => makeFormats("en").integer.format(n);
const ru = (n: number) => makeFormats("ru").integer.format(n);

describe("the case count", () => {
  it("says the cases are loading before any are in, not 0 of 0", () => {
    expect(countText(strings.en, en, { shown: null, total: 1_200, loaded: 0, loading: true, failed: 0 })).toBe("Loading cases");
    expect(countText(strings.ru, ru, { shown: null, total: 1_200, loaded: 0, loading: true, failed: 0 })).toBe("Загрузка обращений");
  });

  it("counts against every case, and says how many are still on their way", () => {
    expect(countText(strings.en, en, { shown: 400, total: 1_200, loaded: 400, loading: true, failed: 0 })).toBe("400 of 1,200 cases (800 still loading)");
  });

  it("says how many did not load after a partial failure", () => {
    expect(countText(strings.en, en, { shown: 800, total: 1_200, loaded: 800, loading: false, failed: 400 })).toBe("800 of 1,200 cases (400 did not load)");
    const text = countText(strings.ru, ru, { shown: 800, total: 1_200, loaded: 800, loading: false, failed: 400 });
    // Russian groups digits with a no-break space.
    expect(text.replace(/ /g, " ")).toBe("800 обращений из 1 200 (не загружено: 400)");
  });

  it("is the plain count once everything is in", () => {
    expect(countText(strings.en, en, { shown: 231, total: 1_200, loaded: 1_200, loading: false, failed: 0 })).toBe("231 of 1,200 cases");
    expect(countText(strings.ru, ru, { shown: 1, total: 1_200, loaded: 1_200, loading: false, failed: 0 }).replace(/ /g, " ")).toBe("1 обращение из 1 200");
  });
});
