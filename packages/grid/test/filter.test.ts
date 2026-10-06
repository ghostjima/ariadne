import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generator.js";
import {
  CURRENCIES,
  CURRENCY_RATES,
  OPERATOR_REGIONS,
  REFERENCE_CURRENCY,
  REGION_COUNT,
  STATUS_COUNT,
} from "../src/schema.js";
import { convertedAmount } from "../src/store.js";
import { buildSearchIndex, rowText } from "../src/text.js";
import { EMPTY_CRITERIA, filterRows, percentile, sortOrder, splitMatches } from "../src/filter.js";
import { pools as en } from "../src/pools/en.js";
import { pools as ru } from "../src/pools/ru.js";

const store = generateAll(20260904, 50_000);
const search = buildSearchIndex(store, ru);

describe("filterRows", () => {
  it("returns every loaded row with empty criteria", () => {
    const r = filterRows(store, null, EMPTY_CRITERIA);
    expect(r.index).toHaveLength(50_000);
    expect(r.index[0]).toBe(0);
    expect(r.index[49_999]).toBe(49_999);
  });

  it("filters by status with OR semantics inside the group", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, status: [0, 6] });
    expect(r.index.length).toBeGreaterThan(0);
    for (const i of r.index) expect([0, 6]).toContain(store.status[i]);
    let expected = 0;
    for (let i = 0; i < store.size; i++) {
      const s = store.status[i];
      if (s === 0 || s === 6) expected++;
    }
    expect(r.index).toHaveLength(expected);
  });

  it("combines groups with AND", () => {
    const r = filterRows(store, null, {
      ...EMPTY_CRITERIA,
      status: [1],
      priority: [2],
      slaBreached: true,
    });
    for (const i of r.index) {
      expect(store.status[i]).toBe(1);
      expect(store.priority[i]).toBe(2);
      expect(store.slaBreached[i]).toBe(1);
    }
  });

  it("restricts to allowed regions (role) on top of user filters", () => {
    const r = filterRows(store, null, {
      ...EMPTY_CRITERIA,
      regions: [0, 5],
      allowedRegions: OPERATOR_REGIONS,
    });
    for (const i of r.index) expect(store.region[i]).toBe(0);
  });

  it("searches case-insensitively over the precomputed strings", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, search: "  Z-000100 " }, search);
    expect(Array.from(r.index)).toContain(99);
    const byClient = filterRows(store, null, { ...EMPTY_CRITERIA, search: "журавль" }, search);
    expect(byClient.index.length).toBeGreaterThan(0);
    for (const i of byClient.index.subarray(0, 200)) {
      expect(search[i]).toContain("журавль");
    }
  });

  it("produces facet counts that ignore the chip's own group", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, status: [0] });
    /* Status facet counts every status because the status group is excluded */
    let total = 0;
    for (const c of r.facets.status) total += c;
    expect(total).toBe(50_000);
    expect(r.facets.status[0]).toBe(r.index.length);
    /* Priority facet respects the status filter */
    let prio = 0;
    for (const c of r.facets.priority) prio += c;
    expect(prio).toBe(r.index.length);
  });

  it("skips rows that are not loaded yet", () => {
    const partial = generateAll(1, 100, 100);
    partial.loaded.fill(0, 50);
    const r = filterRows(partial, null, EMPTY_CRITERIA);
    expect(r.index).toHaveLength(50);
  });

  it("returns an empty result for an impossible query", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, search: "нет такого клиента" }, search);
    expect(r.index).toHaveLength(0);
  });

  it("answers quickly on 50k rows (loose threshold for slow CI machines)", () => {
    const samples: number[] = [];
    for (let k = 0; k < 20; k++) {
      const r = filterRows(
        store,
        null,
        {
          ...EMPTY_CRITERIA,
          status: [k % STATUS_COUNT],
          priority: [1, 2],
          search: k % 2 ? "ооо" : "",
        },
        search,
      );
      samples.push(r.computeMs);
    }
    const p95 = percentile(samples, 95);
    expect(p95).not.toBeNull();
    expect(p95 as number).toBeLessThan(300);
  });

  it("counts regions ignoring the region group but keeping the role", () => {
    const r = filterRows(store, null, {
      ...EMPTY_CRITERIA,
      status: [1],
      regions: [1],
      allowedRegions: OPERATOR_REGIONS,
    });
    expect(r.facets.region[1]).toBe(r.index.length);
    for (let code = 0; code < REGION_COUNT; code++) {
      let expected = 0;
      if (OPERATOR_REGIONS.includes(code)) {
        for (let i = 0; i < store.size; i++) {
          if (store.status[i] === 1 && store.region[i] === code) expected++;
        }
      }
      expect(r.facets.region[code]).toBe(expected);
    }
  });

  it("counts SLA breaches among rows matching the other groups", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, priority: [2] });
    let expected = 0;
    for (let i = 0; i < store.size; i++) {
      if (store.priority[i] === 2 && store.slaBreached[i] === 1) expected++;
    }
    expect(r.facets.slaBreached).toBe(expected);
  });

  it("refuses a text query without a search index", () => {
    expect(() => filterRows(store, null, { ...EMPTY_CRITERIA, search: "x" })).toThrow(TypeError);
    expect(() => filterRows(store, null, { ...EMPTY_CRITERIA, search: "   " })).not.toThrow();
  });
});

describe("sortOrder", () => {
  it("sorts numeric columns ascending and descending, stably", () => {
    const asc = sortOrder(store, { id: "sla", desc: false });
    expect(asc).not.toBeNull();
    for (let p = 1; p < 2_000; p++) {
      const a = store.sla[asc![p - 1]!] ?? 0;
      const b = store.sla[asc![p]!] ?? 0;
      expect(a <= b).toBe(true);
      if (a === b) expect(asc![p - 1]! < asc![p]!).toBe(true);
    }
    const desc = sortOrder(store, { id: "sla", desc: true });
    expect(store.sla[desc![0]!]).toBe(store.sla[asc![49_999]!]);
  });

  it("sorts amounts by their value in the reference currency, not by the bare number", () => {
    const small = generateAll(5, 6, 6);
    const set = (row: number, amount: number, currency: string) => {
      small.amount[row] = amount;
      small.currency[row] = CURRENCIES.indexOf(currency as (typeof CURRENCIES)[number]);
    };
    set(0, 300_000, "RUB");
    set(1, 4_000, "USD");
    set(2, 3_900, "EUR");
    set(3, 1_000, "RUB");
    set(4, 10, "USD");
    set(5, 11, "EUR");
    const rate = (c: string) => CURRENCY_RATES[CURRENCIES.indexOf(c as (typeof CURRENCIES)[number])]!;
    expect(REFERENCE_CURRENCY).toBe("RUB");
    expect(rate("RUB")).toBe(1);
    expect(convertedAmount(small, 1)).toBe(4_000 * rate("USD"));
    /* By the bare numbers RUB 1,000 would rank above USD 4,000 */
    expect(Array.from(sortOrder(small, { id: "amount", desc: true })!)).toEqual([1, 2, 0, 3, 5, 4]);
    expect(Array.from(sortOrder(small, { id: "amount", desc: false })!)).toEqual([4, 5, 3, 0, 2, 1]);

    const desc = sortOrder(store, { id: "amount", desc: true })!;
    for (let p = 1; p < desc.length; p++) {
      expect(convertedAmount(store, desc[p - 1]!) >= convertedAmount(store, desc[p]!)).toBe(true);
    }
    const top = new Set(Array.from(desc.subarray(0, 50), (i) => store.currency[i]));
    expect(top.size).toBeGreaterThan(1);
  });

  it("sorts text columns and metric columns", () => {
    const collator = new Intl.Collator(ru.locale);
    const byClient = sortOrder(store, { id: "client", desc: false }, ru);
    const first = rowText(store, ru, byClient![0]!).client;
    const last = rowText(store, ru, byClient![49_999]!).client;
    expect(collator.compare(first, last) <= 0).toBe(true);
    for (let p = 1; p < 50_000; p += 37) {
      const a = rowText(store, ru, byClient![p - 1]!).client;
      const b = rowText(store, ru, byClient![p]!).client;
      expect(collator.compare(a, b) <= 0).toBe(true);
    }
    const byMargin = sortOrder(store, { id: "marginPct", desc: true });
    expect(byMargin).toHaveLength(50_000);
  });

  it("feeds a sorted order into the filter and keeps it", () => {
    const order = sortOrder(store, { id: "sla", desc: false });
    const r = filterRows(store, order, { ...EMPTY_CRITERIA, priority: [2] });
    for (let p = 1; p < r.index.length; p++) {
      expect((store.sla[r.index[p - 1]!] ?? 0) <= (store.sla[r.index[p]!] ?? 0)).toBe(true);
    }
  });

  it("orders text by the displayed language, numbers the same in every language", () => {
    const enOrder = sortOrder(store, { id: "client", desc: false }, en)!;
    const ruOrder = sortOrder(store, { id: "client", desc: false }, ru)!;
    expect(Array.from(enOrder.subarray(0, 50))).not.toEqual(Array.from(ruOrder.subarray(0, 50)));
    const collator = new Intl.Collator("en");
    expect(
      collator.compare(rowText(store, en, enOrder[0]!).client, rowText(store, en, enOrder[49_999]!).client),
    ).toBeLessThan(0);
    expect(sortOrder(store, { id: "amount", desc: false }, en)).toEqual(
      sortOrder(store, { id: "amount", desc: false }, ru),
    );
  });

  it("sorts comments including edited ones, and ids in row order", () => {
    const small = generateAll(9, 200, 200);
    small.commentEdits.set(5, { kind: "text", text: "aaa first" });
    const order = sortOrder(small, { id: "comment", desc: false }, en)!;
    /* Empty comments come first, then the edited text */
    const firstNonEmpty = Array.from(order).find((i) => rowText(small, en, i).comment !== "");
    expect(firstNonEmpty).toBe(5);
    const byId = sortOrder(small, { id: "id", desc: true })!;
    expect(byId[0]).toBe(199);
    expect(sortOrder(small, { id: "nope", desc: false })).toBeNull();
    expect(sortOrder(small, null)).toBeNull();
    expect(() => sortOrder(small, { id: "client", desc: false })).toThrow(TypeError);
  });
});

describe("helpers", () => {
  it("percentile uses nearest rank", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(
      percentile(
        Array.from({ length: 20 }, (_, i) => i + 1),
        95,
      ),
    ).toBe(19);
  });

  it("splitMatches yields alternating plain and match fragments", () => {
    expect(splitMatches("ООО Вектор", "век")).toEqual(["ООО ", "Век", "тор"]);
    expect(splitMatches("abcabc", "b")).toEqual(["a", "b", "ca", "b", "c"]);
    expect(splitMatches("text", "")).toEqual(["text"]);
    expect(splitMatches("text", "zzz")).toEqual(["text"]);
  });
});
