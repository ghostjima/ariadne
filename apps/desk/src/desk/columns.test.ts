import { describe, expect, it } from "vitest";
import { COLUMN_IDS, MARGIN_COLUMNS, generateAll, isCommentBlank, visibleColumns, writeComment } from "@ariadne/grid";
import { strings } from "../i18n";
import { buildColumns, formatMoney, makeFormats } from "./columns";
import { readUrlConfig } from "./settings";

const store = generateAll(20260904, 5_000);

describe("grid columns", () => {
  it("cover the whole catalogue of 30 columns, ID and client pinned first", () => {
    const columns = buildColumns(COLUMN_IDS, { store, lang: "en", t: strings.en, formats: makeFormats("en"), editable: true });
    expect(columns).toHaveLength(30);
    expect(columns.filter((c) => c.pinned).map((c) => c.id)).toEqual(["id", "client"]);
    expect(columns.filter((c) => c.editor).map((c) => c.id)).toEqual(["status", "comment"]);
  });

  it("pin nothing when asked not to, for a narrow screen", () => {
    const columns = buildColumns(COLUMN_IDS, { store, lang: "en", t: strings.en, formats: makeFormats("en"), editable: true, pin: false });
    expect(columns.some((c) => c.pinned)).toBe(false);
  });

  it("hide the margin columns from operators", () => {
    const ids = visibleColumns({ columns: [...COLUMN_IDS] }, "operator");
    expect(ids.some((id) => MARGIN_COLUMNS.includes(id))).toBe(false);
  });

  it("write numbers, money and dates in the interface's locale", () => {
    const ar = buildColumns(["amount", "date", "revenue"], { store, lang: "ar", t: strings.ar, formats: makeFormats("ar"), editable: true });
    const stoa = { locale: "ar-u-nu-arab" } as never;
    for (const c of ar) {
      const text = c.format!(c.accessor(0), 0, stoa);
      expect(text, c.id).toMatch(/[٠-٩]/);
      expect(text, c.id).not.toMatch(/[0-9]/);
    }
    const [header] = buildColumns(["status"], { store, lang: "ru", t: strings.ru, formats: makeFormats("ru"), editable: true });
    expect(header!.header).toBe("Статус");
  });

  it("set dates, with their month names, in the sans face; numbers stay in the numeric face", () => {
    const columns = buildColumns(["date", "updatedAt", "amount", "sla"], { store, lang: "ar", t: strings.ar, formats: makeFormats("ar"), editable: true });
    expect(columns.map((c) => [c.id, c.mono])).toEqual([
      ["date", false],
      ["updatedAt", false],
      ["amount", undefined],
      ["sla", undefined],
    ]);
  });

  it("isolate a currency symbol with Latin letters in Arabic, and nothing else", () => {
    const usd = makeFormats("ar").money[1]!;
    expect(formatMoney(usd, 1454, true)).toBe(usd.format(1454).replace("US$", "\u2066US$\u2069"));
    const eur = makeFormats("ar").money[2]!;
    expect(formatMoney(eur, 72, true)).toBe(eur.format(72));
    expect(formatMoney(makeFormats("en").money[1]!, 1454, false)).toBe("$1,454");
  });

  it("refuse an approval without a comment and a comment over 200 characters, in the interface's words", () => {
    const row = Array.from({ length: 5_000 }, (_, i) => i).find((i) => isCommentBlank(store, i))!;
    const [status, comment] = buildColumns(["status", "comment"], { store, lang: "ru", t: strings.ru, formats: makeFormats("ru"), editable: true });
    expect(status!.editor!.validate!("4", row)).toBe(strings.ru.editErrors.approveNeedsComment);
    expect(status!.editor!.validate!("1", row)).toBeNull();
    expect(comment!.editor!.validate!("x".repeat(214), row)).toBe("Не больше 200 символов, а в комментарии 214.");
    writeComment(store, row, { kind: "text", text: "Checked" }, 0);
    expect(status!.editor!.validate!("4", row)).toBeNull();
  });

  it("have no editors for a role that may not edit", () => {
    const columns = buildColumns(["status", "comment"], { store, lang: "en", t: strings.en, formats: makeFormats("en"), editable: false });
    expect(columns.every((c) => !c.editor)).toBe(true);
  });
});

describe("address settings", () => {
  it("read the role, failing chunks, worker and colleague switches", () => {
    expect(readUrlConfig("?role=operator&failChunk=2,x,5&worker=off&colleague=off")).toMatchObject({
      role: "operator",
      failChunks: [2, 5],
      useWorker: false,
      colleagueSeconds: null,
      view: null,
    });
    expect(readUrlConfig("")).toMatchObject({ role: "manager", failChunks: [], useWorker: true, colleagueSeconds: 40 });
    expect(readUrlConfig("?colleague=3").colleagueSeconds).toBe(3);
  });
});
