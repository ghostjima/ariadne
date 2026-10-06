import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generator.js";
import { MARGIN_COLUMNS, OPERATOR_REGIONS, Status } from "../src/schema.js";
import { EMPTY_CRITERIA, filterRows } from "../src/filter.js";
import {
  canBulk,
  canEdit,
  canExport,
  canSeeRow,
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
import { labels as ar } from "../src/pools/ar.js";
import { labels as ru } from "../src/pools/ru.js";

const custom: View = {
  name: "Мой вид",
  filters: { status: [0, 1], priority: [2], slaBreached: true, regions: [3] },
  search: "вектор",
  columns: ["id", "client", "marginPct", "status", "marginAbs", "comment"],
  sort: { id: "amount", desc: true },
  density: "compact",
};

describe("role column visibility", () => {
  it("manager sees the view as configured, pinned columns first", () => {
    expect(visibleColumns(custom, "manager")).toEqual([
      "id",
      "client",
      "marginPct",
      "status",
      "marginAbs",
      "comment",
    ]);
  });

  it("operator loses margin columns and gets a note list in view order", () => {
    expect(visibleColumns(custom, "operator")).toEqual(["id", "client", "status", "comment"]);
    expect(hiddenForRole(custom, "operator")).toEqual(["marginPct", "marginAbs"]);
    expect(hiddenForRole(custom, "manager")).toEqual([]);
  });

  it("always keeps the two pinned columns even if the view omits them", () => {
    const v: View = { ...DEFAULT_VIEW, columns: ["status", "amount"] };
    expect(visibleColumns(v, "manager")).toEqual(["id", "client", "status", "amount"]);
  });

  it("drops unknown column ids", () => {
    const v: View = { ...DEFAULT_VIEW, columns: ["id", "nope", "status"] };
    expect(visibleColumns(v, "manager")).toEqual(["id", "client", "status"]);
  });

  it("margin columns are exactly the three margin metrics", () => {
    expect(MARGIN_COLUMNS).toEqual(["marginAbs", "marginPct", "marginPlan"]);
  });
});

describe("role rules", () => {
  it("operators see three regions and cannot bulk-edit or export", () => {
    expect(roleRules("operator").visibleRegions).toEqual(OPERATOR_REGIONS);
    expect(roleRules("manager").visibleRegions).toBeNull();
    expect([canEdit("operator"), canBulk("operator"), canExport("operator")]).toEqual([
      true,
      false,
      false,
    ]);
    expect([canEdit("manager"), canBulk("manager"), canExport("manager")]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("decides row visibility by region", () => {
    const store = generateAll(3, 200, 200);
    for (let i = 0; i < store.size; i++) {
      expect(canSeeRow(store, i, "manager")).toBe(true);
      expect(canSeeRow(store, i, "operator")).toBe(OPERATOR_REGIONS.includes(store.region[i]!));
    }
  });

  it("turns a view into criteria with the role's regions", () => {
    const store = generateAll(3, 2_000, 500);
    const c = criteriaFor(PRESET_VIEWS[1]!, "operator");
    expect(c).toEqual({
      status: [0, 1],
      priority: [2],
      slaBreached: true,
      regions: [],
      search: "",
      allowedRegions: OPERATOR_REGIONS,
    });
    const r = filterRows(store, null, c);
    for (const i of r.index) expect(OPERATOR_REGIONS).toContain(store.region[i]);
    expect(criteriaFor(DEFAULT_VIEW, "manager")).toEqual(EMPTY_CRITERIA);
  });
});

describe("view serialization", () => {
  it("round-trips a custom view through base64url", () => {
    const s = serializeView(custom);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseView(s)).toEqual(custom);
  });

  it("round-trips every preset", () => {
    for (const p of PRESET_VIEWS) expect(parseView(serializeView(p))).toEqual(p);
  });

  it("rejects garbage and fills defaults for partial data", () => {
    expect(parseView(null)).toBeNull();
    expect(parseView("")).toBeNull();
    expect(parseView("not base64!!")).toBeNull();
    const partial = parseView(btoa(JSON.stringify({ n: "x", c: ["status", "bogus"] })));
    expect(partial).not.toBeNull();
    expect(partial?.columns).toEqual(["status"]);
    expect(partial?.filters).toEqual({ status: [], priority: [], slaBreached: false, regions: [] });
    expect(partial?.density).toBe("default");
    expect(partial?.sort).toBeNull();
  });

  it("builds a URL with the view parameter and parses it back", () => {
    const url = viewToUrl(custom, "https://example.test/work/table?x=1");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("x")).toBe("1");
    expect(parseView(parsed.searchParams.get("view"))).toEqual(custom);
  });

  it("counts active filters", () => {
    expect(activeFilterCount(custom.filters)).toBe(5);
    expect(activeFilterCount(DEFAULT_VIEW.filters)).toBe(0);
    expect(hasActiveFilters(custom.filters)).toBe(true);
    expect(hasActiveFilters(DEFAULT_VIEW.filters)).toBe(false);
  });

  it("leaves a view without a name unnamed, for the caller to label", () => {
    expect(parseView(btoa(JSON.stringify({ n: "  " })))?.name).toBe("");
    expect(parseView(btoa(JSON.stringify({})))?.columns).toEqual(DEFAULT_VIEW.columns);
  });
});

describe("presets and saved views", () => {
  it("names presets by id, with a label for each in the language module", () => {
    expect(PRESET_VIEWS.map((v) => v.name)).toEqual(["all", "urgent", "finance", "action"]);
    for (const v of PRESET_VIEWS) {
      expect(isPreset(v.name)).toBe(true);
      expect(en.presets[v.name as keyof typeof en.presets]).toBeTruthy();
    }
    expect(isPreset("Мой вид")).toBe(false);
  });

  it("has a view of the requests that need action: open ones, SLA shown, tightest first", () => {
    const action = PRESET_VIEWS.find((v) => v.name === "action")!;
    expect(action.filters.status).toEqual([Status.New, Status.InProgress, Status.AwaitingClient, Status.InReview]);
    expect(action.filters.status.every((s) => s < Status.Approved)).toBe(true);
    expect(action.columns.slice(0, 4)).toEqual(["id", "client", "status", "sla"]);
    expect(action.sort).toEqual({ id: "sla", desc: false });
    for (const labels of [en, ru, ar]) expect(labels.presets.action).toBeTruthy();
    expect(validateViewName("action")).toEqual({ code: "name-is-preset" });
  });

  it("validates a name with codes", () => {
    expect(validateViewName("  ")).toEqual({ code: "name-empty" });
    expect(validateViewName("x".repeat(VIEW_NAME_MAX + 1))).toEqual({
      code: "name-too-long",
      max: VIEW_NAME_MAX,
      length: VIEW_NAME_MAX + 1,
    });
    expect(validateViewName("urgent")).toEqual({ code: "name-is-preset" });
    expect(validateViewName(` ${"x".repeat(VIEW_NAME_MAX)} `)).toBeNull();
  });

  it("saves, replaces by name and removes", () => {
    let saved = saveView([], custom, "  Mine ");
    expect(saved.map((v) => v.name)).toEqual(["Mine"]);
    saved = saveView(saved, PRESET_VIEWS[2]!, "Other");
    saved = saveView(saved, { ...custom, density: "comfortable" }, "Mine");
    expect(saved.map((v) => v.name)).toEqual(["Other", "Mine"]);
    expect(saved[1]?.density).toBe("comfortable");
    expect(removeView(saved, "Other").map((v) => v.name)).toEqual(["Mine"]);
  });

  it("stores a saved list as one string and drops unreadable entries", () => {
    const saved = saveView(saveView([], custom, "A"), PRESET_VIEWS[1]!, "B");
    expect(parseViews(serializeViews(saved))).toEqual(saved);
    expect(parseViews(JSON.stringify([serializeView(custom), 7, "!!"]))).toEqual([custom]);
    expect(parseViews("{")).toEqual([]);
    expect(parseViews(null)).toEqual([]);
    expect(parseViews('{"a":1}')).toEqual([]);
  });
});
