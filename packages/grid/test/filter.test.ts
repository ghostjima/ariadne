import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generator.js";
import { DEADLINE_COUNT, DeadlineClass, SCALE_CHUNK, SCALE_ROWS, STAGE_COUNT, Stage } from "../src/schema.js";
import { deadlineClass, effectiveDue, workingDaysLeft } from "../src/store.js";
import { buildSearchIndex, rowText } from "../src/text.js";
import { ALL_ROWS, EMPTY_CRITERIA, filterRows, percentile, sortOrder, splitMatches } from "../src/filter.js";
import { pools as en } from "../src/pools/en.js";
import { pools as ru } from "../src/pools/ru.js";

const store = generateAll(20261006, SCALE_ROWS, SCALE_CHUNK);
const search = buildSearchIndex(store, ru);
const N = store.size;

describe("filterRows", () => {
  it("returns every loaded row with empty criteria", () => {
    const r = filterRows(store, null, EMPTY_CRITERIA);
    expect(r.index).toHaveLength(N);
    expect(r.index[0]).toBe(0);
    expect(r.index[N - 1]).toBe(N - 1);
  });

  it("filters by stage with OR semantics inside the group", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, stage: [Stage.Registered, Stage.Closed] });
    expect(r.index.length).toBeGreaterThan(0);
    let expected = 0;
    for (let i = 0; i < N; i++) if (store.stage[i] === 0 || store.stage[i] === 6) expected++;
    expect(r.index).toHaveLength(expected);
    for (const i of r.index) expect([0, 6]).toContain(store.stage[i]);
  });

  it("combines groups with AND", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, stage: [1], stream: [2], source: [2] });
    expect(r.index.length).toBeGreaterThan(0);
    for (const i of r.index) expect([store.stage[i], store.stream[i], store.source[i]]).toEqual([1, 2, 2]);
  });

  it("classes every row by its deadline: overdue, due within 3 working days, later, answered", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, deadline: [DeadlineClass.DueSoon] });
    expect(r.index.length).toBeGreaterThan(0);
    for (const i of r.index) {
      expect(store.stage[i]).toBeLessThan(Stage.Sent);
      const left = workingDaysLeft(store, i);
      expect(left >= 0 && left <= 3).toBe(true);
    }
    const overdue = filterRows(store, null, { ...EMPTY_CRITERIA, deadline: [DeadlineClass.Overdue] });
    for (const i of overdue.index) expect(workingDaysLeft(store, i)).toBeLessThan(0);
    let total = 0;
    for (const c of r.facets.deadline) total += c;
    expect(total).toBe(N);
    expect(r.facets.deadline).toHaveLength(DEADLINE_COUNT);
  });

  it("restricts to the role's scope on top of user filters", () => {
    const mine = filterRows(store, null, { ...EMPTY_CRITERIA, stage: [2], scope: { assignees: [0], signatories: null } });
    for (const i of mine.index) expect([store.assignee[i], store.stage[i]]).toEqual([0, 2]);
    const signing = filterRows(store, null, { ...EMPTY_CRITERIA, scope: { assignees: null, signatories: [1] } });
    for (const i of signing.index) expect(store.signatory[i]).toBe(1);
    expect(filterRows(store, null, { ...EMPTY_CRITERIA, scope: { assignees: [], signatories: null } }).index).toHaveLength(0);
  });

  it("searches case-insensitively over ids, names, subjects, operations and notes", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, search: "  C-000100 " }, search);
    expect(Array.from(r.index)).toContain(99);
    const bySubject = filterRows(store, null, { ...EMPTY_CRITERIA, search: "сбп" }, search);
    expect(bySubject.index.length).toBeGreaterThan(0);
    for (const i of bySubject.index.subarray(0, 200)) expect(search[i]).toContain("сбп");
    const ref = rowText(store, ru, 1234).operation;
    if (ref) expect(Array.from(filterRows(store, null, { ...EMPTY_CRITERIA, search: ref }, search).index)).toContain(1234);
  });

  it("produces facet counts that ignore the chip's own group", () => {
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, stage: [0] });
    let total = 0;
    for (const c of r.facets.stage) total += c;
    expect(total).toBe(N);
    expect(r.facets.stage[0]).toBe(r.index.length);
    let streams = 0;
    for (const c of r.facets.stream) streams += c;
    expect(streams).toBe(r.index.length);
  });

  it("counts sources ignoring the source group but keeping the role's scope", () => {
    const scope = { assignees: [3], signatories: null };
    const r = filterRows(store, null, { ...EMPTY_CRITERIA, stage: [1], source: [1], scope });
    expect(r.facets.source[1]).toBe(r.index.length);
    for (let code = 0; code < 3; code++) {
      let expected = 0;
      for (let i = 0; i < N; i++) if (store.stage[i] === 1 && store.source[i] === code && store.assignee[i] === 3) expected++;
      expect(r.facets.source[code]).toBe(expected);
    }
  });

  it("skips rows that are not loaded yet", () => {
    const partial = generateAll(1, 100, 100);
    partial.loaded.fill(0, 50);
    expect(filterRows(partial, null, EMPTY_CRITERIA).index).toHaveLength(50);
  });

  it("returns an empty result for an impossible query", () => {
    expect(filterRows(store, null, { ...EMPTY_CRITERIA, search: "нет такого заявителя" }, search).index).toHaveLength(0);
  });

  it("answers quickly on the 50,000 rows of the scale mode (loose threshold for slow CI machines)", () => {
    const samples: number[] = [];
    for (let k = 0; k < 20; k++) {
      const r = filterRows(
        store,
        null,
        { ...EMPTY_CRITERIA, stage: [k % STAGE_COUNT], stream: [1, 2], search: k % 2 ? "ооо" : "", scope: ALL_ROWS },
        search,
      );
      samples.push(r.computeMs);
    }
    expect(percentile(samples, 95) as number).toBeLessThan(300);
  });

  it("refuses a text query without a search index", () => {
    expect(() => filterRows(store, null, { ...EMPTY_CRITERIA, search: "x" })).toThrow(TypeError);
    expect(() => filterRows(store, null, { ...EMPTY_CRITERIA, search: "   " })).not.toThrow();
  });
});

describe("sortOrder", () => {
  it("sorts by the working days left, as the deadline stands, stably", () => {
    const asc = sortOrder(store, { id: "left", desc: false })!;
    for (let p = 1; p < 3_000; p++) {
      const a = workingDaysLeft(store, asc[p - 1]!);
      const b = workingDaysLeft(store, asc[p]!);
      expect(a <= b).toBe(true);
      if (a === b) expect(asc[p - 1]! < asc[p]!).toBe(true);
    }
    const desc = sortOrder(store, { id: "left", desc: true })!;
    expect(workingDaysLeft(store, desc[0]!)).toBe(workingDaysLeft(store, asc[N - 1]!));
  });

  it("moves a row when its extension changes its deadline", () => {
    const small = generateAll(5, 400, 400);
    const row = Array.from({ length: 400 }, (_, i) => i).find((i) => small.extension[i] === 0 && small.dueExt[i]! > 0)!;
    const before = effectiveDue(small, row);
    small.extension[row] = 1;
    expect(effectiveDue(small, row)).toBeGreaterThan(before);
    const order = Array.from(sortOrder(small, { id: "due", desc: false })!);
    for (let p = 1; p < order.length; p++) expect(effectiveDue(small, order[p - 1]!) <= effectiveDue(small, order[p]!)).toBe(true);
  });

  it("sorts received by day and minute, and amounts by value", () => {
    const byReceived = sortOrder(store, { id: "received", desc: true })!;
    const key = (i: number) => store.received[i]! * 1440 + store.receivedMinute[i]!;
    for (let p = 1; p < 2_000; p++) expect(key(byReceived[p - 1]!) >= key(byReceived[p]!)).toBe(true);
    const byAmount = sortOrder(store, { id: "opAmount", desc: true })!;
    for (let p = 1; p < 2_000; p++) expect(store.opAmount[byAmount[p - 1]!]! >= store.opAmount[byAmount[p]!]!).toBe(true);
  });

  it("sorts text columns by the displayed language", () => {
    const collator = new Intl.Collator(ru.locale);
    const byClient = sortOrder(store, { id: "client", desc: false }, ru)!;
    for (let p = 1; p < N; p += 37) {
      const a = rowText(store, ru, byClient[p - 1]!).client;
      const b = rowText(store, ru, byClient[p]!).client;
      expect(collator.compare(a, b) <= 0).toBe(true);
    }
    const enOrder = sortOrder(store, { id: "client", desc: false }, en)!;
    expect(Array.from(enOrder.subarray(0, 50))).not.toEqual(Array.from(byClient.subarray(0, 50)));
    expect(sortOrder(store, { id: "left", desc: false }, en)).toEqual(sortOrder(store, { id: "left", desc: false }, ru));
  });

  it("feeds a sorted order into the filter and keeps it", () => {
    const order = sortOrder(store, { id: "left", desc: false });
    const r = filterRows(store, order, { ...EMPTY_CRITERIA, stream: [2] });
    for (let p = 1; p < r.index.length; p++) {
      expect(workingDaysLeft(store, r.index[p - 1]!) <= workingDaysLeft(store, r.index[p]!)).toBe(true);
    }
  });

  it("sorts notes including edited ones, and ids in row order", () => {
    const small = generateAll(9, 200, 200);
    small.noteEdits.set(5, { kind: "text", text: "0 comes first" });
    const order = sortOrder(small, { id: "note", desc: false }, en)!;
    const firstNonEmpty = Array.from(order).find((i) => rowText(small, en, i).note !== "");
    expect(firstNonEmpty).toBe(5);
    expect(sortOrder(small, { id: "id", desc: true })![0]).toBe(199);
    expect(sortOrder(small, { id: "nope", desc: false })).toBeNull();
    expect(sortOrder(small, null)).toBeNull();
    expect(() => sortOrder(small, { id: "client", desc: false })).toThrow(TypeError);
  });

  it("the deadline class of an answered case is answered, whatever its days", () => {
    for (let i = 0; i < 2_000; i++) if (store.stage[i]! >= Stage.Sent) expect(deadlineClass(store, i)).toBe(DeadlineClass.Answered);
  });
});

describe("helpers", () => {
  it("percentile uses nearest rank", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
  });

  it("splitMatches yields alternating plain and match fragments", () => {
    expect(splitMatches("ООО Вектор", "век")).toEqual(["ООО ", "Век", "тор"]);
    expect(splitMatches("abcabc", "b")).toEqual(["a", "b", "ca", "b", "c"]);
    expect(splitMatches("text", "")).toEqual(["text"]);
    expect(splitMatches("text", "zzz")).toEqual(["text"]);
  });
});
