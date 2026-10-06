import { describe, expect, it } from "vitest";
import { strings } from "../i18n";
import { countText } from "./counts";
import { makeFormats } from "./columns";

const en = (n: number) => makeFormats("en").integer.format(n);
const ar = (n: number) => makeFormats("ar").integer.format(n);

describe("the request count", () => {
  it("says the requests are loading before any are in, not 0 of 0", () => {
    expect(countText(strings.en, en, { shown: null, total: 50_000, loaded: 0, loading: true, failed: 0 })).toBe("Loading requests");
  });

  it("counts against every request, and says how many are still on their way", () => {
    expect(countText(strings.en, en, { shown: 15_000, total: 50_000, loaded: 15_000, loading: true, failed: 0 })).toBe(
      "15,000 of 50,000 requests (35,000 still loading)",
    );
  });

  it("says how many did not load after a partial failure", () => {
    expect(countText(strings.en, en, { shown: 45_000, total: 50_000, loaded: 45_000, loading: false, failed: 5_000 })).toBe(
      "45,000 of 50,000 requests (5,000 did not load)",
    );
    const ru = countText(strings.ru, (n) => makeFormats("ru").integer.format(n), { shown: 45_000, total: 50_000, loaded: 45_000, loading: false, failed: 5_000 });
    // Russian groups digits with a no-break space.
    expect(ru.replace(/\u00a0/g, " ")).toBe("45 000 заявок из 50 000 (не загружено: 5 000)");
    expect(countText(strings.ar, ar, { shown: 45_000, total: 50_000, loaded: 45_000, loading: false, failed: 5_000 })).toBe(
      "الطلبات: ٤٥٬٠٠٠ من ٥٠٬٠٠٠ (لم يُحمَّل: ٥٬٠٠٠)",
    );
  });

  it("is the plain count once everything is in", () => {
    expect(countText(strings.en, en, { shown: 5_892, total: 50_000, loaded: 50_000, loading: false, failed: 0 })).toBe("5,892 of 50,000 requests");
  });
});
