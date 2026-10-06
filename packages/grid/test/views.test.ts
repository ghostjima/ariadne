import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generator.js";
import { DeadlineClass, SELF_ASSIGNEE, SELF_SIGNATORY, Source, Stage } from "../src/schema.js";
import { EMPTY_CRITERIA, filterRows } from "../src/filter.js";
import { workingDaysLeft } from "../src/store.js";
import {
  canBulk,
  canEditColumn,
  canExport,
  canSeeRow,
  canSetStage,
  hiddenForRole,
  roleRules,
  visibleColumns,
} from "../src/roles.js";
import {
  DEFAULT_VIEW,
  PRESET_VIEWS,
  VIEW_NAME_MAX,
  activeFilterCount,
  criteriaFor,
  hasActiveFilters,
  isPreset,
  parseView,
  parseViews,
  removeView,
  saveView,
  serializeView,
  serializeViews,
  validateViewName,
  viewToUrl,
  type View,
} from "../src/views.js";
import { labels as en } from "../src/pools/en.js";
import { labels as ru } from "../src/pools/ru.js";

const custom: View = {
  name: "Мой вид",
  filters: { stage: [1, 2], stream: [2], source: [2], deadline: [0], copy: [] },
  search: "сбп",
  columns: ["id", "client", "assignee", "stage", "signatory", "note"],
  sort: { id: "left", desc: true },
  density: "compact",
};

const store = generateAll(20261006, 1_200, 400);
const preset = (name: string) => PRESET_VIEWS.find((v) => v.name === name)!;

describe("role column visibility", () => {
  it("the supervisor sees the view as configured, pinned columns first", () => {
    expect(visibleColumns(custom, "supervisor")).toEqual(["id", "client", "assignee", "stage", "signatory", "note"]);
  });

  it("a role does not see the column that would name itself in every row", () => {
    expect(visibleColumns(custom, "operator")).toEqual(["id", "client", "stage", "signatory", "note"]);
    expect(hiddenForRole(custom, "operator")).toEqual(["assignee"]);
    expect(visibleColumns(custom, "signatory")).toEqual(["id", "client", "assignee", "stage", "note"]);
    expect(hiddenForRole(custom, "supervisor")).toEqual([]);
  });

  it("always keeps the two pinned columns and drops unknown ids", () => {
    expect(visibleColumns({ ...DEFAULT_VIEW, columns: ["stage", "due"] }, "supervisor")).toEqual(["id", "client", "stage", "due"]);
    expect(visibleColumns({ ...DEFAULT_VIEW, columns: ["id", "nope", "stage"] }, "supervisor")).toEqual(["id", "client", "stage"]);
  });
});

describe("role rules", () => {
  it("the operator drafts and hands over; the reviewer approves or returns; the signatory sends or returns; the supervisor extends, closes, reassigns and exports", () => {
    expect(roleRules("operator").editable).toEqual(["stage", "outcome", "ground", "note"]);
    expect([canBulk("operator"), canExport("operator"), canEditColumn("operator", "extension")]).toEqual([false, false, false]);
    expect([canSetStage("operator", Stage.LegalReview), canSetStage("operator", Stage.AwaitingSignature), canSetStage("operator", Stage.Sent)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([canSetStage("reviewer", Stage.AwaitingSignature), canSetStage("reviewer", Stage.Drafting), canSetStage("reviewer", Stage.Sent)]).toEqual([
      true,
      true,
      false,
    ]);
    expect([canBulk("reviewer"), canExport("reviewer"), canEditColumn("reviewer", "outcome"), canEditColumn("reviewer", "extension")]).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect([canSetStage("signatory", Stage.Sent), canSetStage("signatory", Stage.Drafting), canSetStage("signatory", Stage.LegalReview)]).toEqual([
      true,
      true,
      false,
    ]);
    expect([canSetStage("supervisor", Stage.Closed), canSetStage("supervisor", Stage.LegalReview)]).toEqual([true, false]);
    expect([canEditColumn("signatory", "outcome"), canEditColumn("signatory", "note")]).toEqual([false, true]);
    expect([canBulk("supervisor"), canExport("supervisor"), canEditColumn("supervisor", "extension"), canEditColumn("supervisor", "assignee")]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("the operator sees their own cases, the signatory the ones they sign, the supervisor all", () => {
    for (let i = 0; i < store.size; i++) {
      expect(canSeeRow(store, i, "supervisor")).toBe(true);
      expect(canSeeRow(store, i, "operator")).toBe(store.assignee[i] === SELF_ASSIGNEE);
      expect(canSeeRow(store, i, "signatory")).toBe(store.signatory[i] === SELF_SIGNATORY);
    }
  });

  it("turns a view into criteria with the role's scope", () => {
    const c = criteriaFor(preset("dueSoon"), "operator");
    expect(c).toEqual({
      stage: [],
      stream: [],
      source: [],
      deadline: [DeadlineClass.DueSoon],
      copy: [],
      search: "",
      scope: { assignees: [SELF_ASSIGNEE], signatories: null },
    });
    for (const i of filterRows(store, null, c).index) expect(store.assignee[i]).toBe(SELF_ASSIGNEE);
    expect(criteriaFor(DEFAULT_VIEW, "supervisor")).toEqual(EMPTY_CRITERIA);
  });
});

describe("the working views", () => {
  const run = (name: string) => filterRows(store, null, criteriaFor(preset(name), "supervisor")).index;

  it("names every preset, with a label in each language", () => {
    expect(PRESET_VIEWS.map((v) => v.name)).toEqual(["open", "dueSoon", "overdue", "forwarded", "waitingForFacts", "awaitingSignature", "copiesDueToday", "all"]);
    for (const v of PRESET_VIEWS) {
      expect(isPreset(v.name)).toBe(true);
      for (const labels of [ru, en]) expect(labels.presets[v.name as keyof typeof labels.presets]).toBeTruthy();
    }
    expect(isPreset("Мой вид")).toBe(false);
  });

  it("every working view sorts by the time left, least first", () => {
    // The copies due today are of replies already sent: no time is left
    // to count, and they go in the order the cases came.
    for (const v of PRESET_VIEWS) if (v.name !== "all" && v.name !== "copiesDueToday") expect(v.sort).toEqual({ id: "left", desc: false });
    expect(PRESET_VIEWS.find((v) => v.name === "copiesDueToday")?.sort).toEqual({ id: "id", desc: false });
  });

  it("open cases: everything not yet answered", () => {
    const rows = run("open");
    expect(rows.length).toBeGreaterThan(100);
    for (const i of rows) expect(store.stage[i]).toBeLessThan(Stage.Sent);
  });

  it("due within 3 working days, and overdue", () => {
    const soon = run("dueSoon");
    // Counts a desk can work with: a minority of the open cases due soon,
    // a few overdue.
    expect(soon.length).toBeGreaterThanOrEqual(15);
    expect(soon.length).toBeLessThan(run("open").length / 5);
    for (const i of soon) expect(workingDaysLeft(store, i)).toBeLessThanOrEqual(3);
    const overdue = run("overdue");
    expect(overdue.length).toBeGreaterThanOrEqual(2);
    expect(overdue.length).toBeLessThanOrEqual(10);
    for (const i of overdue) expect([workingDaysLeft(store, i) < 0, store.stage[i]! < Stage.Sent]).toEqual([true, true]);
  });

  it("forwarded by the Bank of Russia, waiting for facts, awaiting signature", () => {
    for (const i of run("forwarded")) expect([store.source[i], store.stage[i]! < Stage.Sent]).toEqual([Source.BankOfRussia, true]);
    for (const i of run("waitingForFacts")) expect(store.stage[i]).toBe(Stage.WaitingForFacts);
    for (const i of run("awaitingSignature")) expect(store.stage[i]).toBe(Stage.AwaitingSignature);
    expect(run("forwarded").length).toBeGreaterThan(0);
  });
});

describe("view serialization", () => {
  it("round-trips a custom view and every preset through base64url", () => {
    const s = serializeView(custom);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseView(s)).toEqual(custom);
    for (const p of PRESET_VIEWS) expect(parseView(serializeView(p))).toEqual(p);
  });

  it("rejects garbage and views of the earlier register, and fills defaults for partial data", () => {
    expect(parseView(null)).toBeNull();
    expect(parseView("")).toBeNull();
    expect(parseView("not base64!!")).toBeNull();
    /* A view saved before the complaints register: no wire version */
    expect(parseView(btoa(JSON.stringify({ n: "x", f: [[0], [2], 1, []], c: ["status"] })))).toBeNull();
    const partial = parseView(btoa(JSON.stringify({ v: 2, n: "x", c: ["stage", "bogus"] })));
    expect(partial?.columns).toEqual(["stage"]);
    expect(partial?.filters).toEqual({ stage: [], stream: [], source: [], deadline: [], copy: [] });
    expect(partial?.density).toBe("default");
    expect(partial?.sort).toBeNull();
    expect(parseView(btoa(JSON.stringify({ v: 2, n: "  " })))?.name).toBe("");
    expect(parseView(btoa(JSON.stringify({ v: 2 })))?.columns).toEqual(DEFAULT_VIEW.columns);
  });

  it("builds a URL with the view parameter and parses it back", () => {
    const parsed = new URL(viewToUrl(custom, "https://example.test/desk?x=1"));
    expect(parsed.searchParams.get("x")).toBe("1");
    expect(parseView(parsed.searchParams.get("view"))).toEqual(custom);
  });

  it("counts active filters", () => {
    expect(activeFilterCount(custom.filters)).toBe(5);
    expect(activeFilterCount(DEFAULT_VIEW.filters)).toBe(0);
    expect(hasActiveFilters(custom.filters)).toBe(true);
    expect(hasActiveFilters(DEFAULT_VIEW.filters)).toBe(false);
  });
});

describe("saved views", () => {
  it("validates a name with codes", () => {
    expect(validateViewName("  ")).toEqual({ code: "name-empty" });
    expect(validateViewName("x".repeat(VIEW_NAME_MAX + 1))).toEqual({ code: "name-too-long", max: VIEW_NAME_MAX, length: VIEW_NAME_MAX + 1 });
    expect(validateViewName("overdue")).toEqual({ code: "name-is-preset" });
    expect(validateViewName(` ${"x".repeat(VIEW_NAME_MAX)} `)).toBeNull();
  });

  it("saves, replaces by name and removes", () => {
    let saved = saveView([], custom, "  Mine ");
    expect(saved.map((v) => v.name)).toEqual(["Mine"]);
    saved = saveView(saved, preset("overdue"), "Other");
    saved = saveView(saved, { ...custom, density: "comfortable" }, "Mine");
    expect(saved.map((v) => v.name)).toEqual(["Other", "Mine"]);
    expect(saved[1]?.density).toBe("comfortable");
    expect(removeView(saved, "Other").map((v) => v.name)).toEqual(["Mine"]);
  });

  it("stores a saved list as one string and drops unreadable entries", () => {
    const saved = saveView(saveView([], custom, "A"), preset("forwarded"), "B");
    expect(parseViews(serializeViews(saved))).toEqual(saved);
    expect(parseViews(JSON.stringify([serializeView(custom), 7, "!!"]))).toEqual([custom]);
    expect(parseViews("{")).toEqual([]);
    expect(parseViews(null)).toEqual([]);
    expect(parseViews('{"a":1}')).toEqual([]);
  });
});
