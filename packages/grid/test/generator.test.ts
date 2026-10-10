import { describe, expect, it } from "vitest";
import {
  applyChunk,
  chunkBounds,
  chunkCount,
  createStore,
  generateAll,
  generateChunk,
  getRow,
  padId,
  rowId,
  rowOfId,
} from "../src/index.js";
import {
  AS_OF,
  COLUMNS,
  CORPUS_CHUNK,
  CORPUS_ROWS,
  DeadlineClass,
  DEFAULT_SEED,
  SCALE_CHUNK,
  SCALE_ROWS,
  STAGE_COUNT,
  STREAM_COUNT,
  Stage,
  Stream,
  WINDOW_DAYS,
} from "../src/schema.js";
import { dayNumber } from "../src/days.js";
import { COLUMN_KEYS, deadlineClass, isAnswered, workingDaysLeft } from "../src/store.js";
import { buildSearchIndex, rowText } from "../src/text.js";
import { pools as ru } from "../src/pools/ru.js";
import { storeDigest } from "./digest.js";

describe("generator", () => {
  it("has a 27-column catalogue with unique ids", () => {
    expect(COLUMNS).toHaveLength(27);
    expect(new Set(COLUMNS.map((c) => c.id)).size).toBe(27);
  });

  it("is deterministic for the same seed", () => {
    const a = generateAll(7, 1_200, 400);
    const b = generateAll(7, 1_200, 400);
    expect(Array.from(a.client)).toEqual(Array.from(b.client));
    expect(Array.from(a.due)).toEqual(Array.from(b.due));
    expect(buildSearchIndex(a, ru)).toEqual(buildSearchIndex(b, ru));
    expect(storeDigest(a)).toBe(storeDigest(b));
  });

  it("differs for a different seed", () => {
    const a = generateAll(1, 600, 300);
    const b = generateAll(2, 600, 300);
    expect(Array.from(a.client)).not.toEqual(Array.from(b.client));
    expect(storeDigest(a)).not.toBe(storeDigest(b));
  });

  it("chunks are independent: a single chunk equals its slice of the whole", () => {
    const whole = generateAll(42, 1_200, 400);
    const chunk = generateChunk(42, 400, 400, 1_200);
    for (const key of COLUMN_KEYS) {
      expect(Array.from(chunk[key]), key).toEqual(Array.from(whole[key].subarray(400, 800)));
    }
  });

  it("numbers the cases in the order they arrived, over the window up to the day the data is taken", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    const asOf = dayNumber(AS_OF);
    expect(store.received[0]).toBeGreaterThanOrEqual(asOf - WINDOW_DAYS + 1);
    expect(store.received[store.size - 1]).toBeLessThanOrEqual(asOf);
    for (let i = 1; i < store.size; i++) expect(store.received[i]! >= store.received[i - 1]!).toBe(true);
  });

  it("by default holds the volume of a bank ranked 50 to 250: about 300 a month, a few hundred open", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    expect(store.size).toBe(1_200);
    let open = 0;
    for (let i = 0; i < store.size; i++) if (!isAnswered(store, i)) open++;
    expect(open).toBeGreaterThanOrEqual(150);
    expect(open).toBeLessThanOrEqual(400);
    const monthly = (store.size / WINDOW_DAYS) * 30;
    expect(monthly).toBeGreaterThan(250);
    expect(monthly).toBeLessThan(350);
  });

  it("closes old cases and keeps young ones open", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    let oldOpen = 0;
    for (let i = 0; i < 300; i++) if ((store.stage[i] ?? 0) < Stage.Sent) oldOpen++;
    expect(oldOpen / 300).toBeLessThan(0.1);
    let young = 0;
    for (let i = store.size - 30; i < store.size; i++) if ((store.stage[i] ?? 0) < Stage.Sent) young++;
    expect(young).toBe(30);
  });

  it("spreads the open cases against the day the data is taken: most within the term, a minority due soon, a few overdue", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    const count = [0, 0, 0, 0];
    let deepest = 0;
    for (let i = 0; i < store.size; i++) {
      const k = deadlineClass(store, i);
      count[k] = (count[k] ?? 0) + 1;
      if (k === DeadlineClass.Overdue) deepest = Math.min(deepest, workingDaysLeft(store, i));
    }
    const [overdue, soon, later] = [count[DeadlineClass.Overdue]!, count[DeadlineClass.DueSoon]!, count[DeadlineClass.Later]!];
    const open = overdue + soon + later;
    expect(later / open).toBeGreaterThan(0.75);
    expect(soon / open).toBeGreaterThan(0.07);
    expect(soon / open).toBeLessThan(0.2);
    expect(overdue).toBeGreaterThanOrEqual(2);
    expect(overdue / open).toBeLessThan(0.04);
    /* Overdue by a working day or a few, never by weeks */
    expect(deepest).toBeGreaterThanOrEqual(-5);
  });

  it("the same holds for other seeds, and for the scale mode", () => {
    for (const [seed, total, chunk] of [[1, CORPUS_ROWS, CORPUS_CHUNK], [99, CORPUS_ROWS, CORPUS_CHUNK], [DEFAULT_SEED, SCALE_ROWS, SCALE_CHUNK]] as const) {
      const store = generateAll(seed, total, chunk);
      const count = [0, 0, 0, 0];
      for (let i = 0; i < store.size; i++) count[deadlineClass(store, i)]! += 1;
      const open = count[0]! + count[1]! + count[2]!;
      expect(count[DeadlineClass.Later]! / open, `seed ${seed}, ${total} rows`).toBeGreaterThan(0.7);
      expect(count[DeadlineClass.Overdue]! / open, `seed ${seed}, ${total} rows`).toBeLessThan(0.05);
    }
  });

  it("a blocked operation is complained about within days of the block", () => {
    const store = generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
    const gaps: number[] = [];
    for (let i = 0; i < store.size; i++) if (store.stream[i] === Stream.Antifraud && store.linked[i] === -1) gaps.push(store.received[i]! - store.opOn[i]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(6);
    expect(gaps.filter((g) => g <= 1).length / gaps.length).toBeGreaterThan(0.8);
  });

  it("generates the 50,000 rows of the scale mode with every field populated", () => {
    const store = generateAll(DEFAULT_SEED, SCALE_ROWS, SCALE_CHUNK);
    expect(store.size).toBe(50_000);
    expect(rowId(0)).toBe(padId(1));
    expect(rowId(49_999)).toBe("C-050000");
    expect(store.loaded.every((v) => v === 1)).toBe(true);
    const stages = new Set<number>();
    const streams = new Set<number>();
    for (let i = 0; i < store.size; i += 7) {
      stages.add(store.stage[i] ?? -1);
      streams.add(store.stream[i] ?? -1);
    }
    expect(stages.size).toBe(STAGE_COUNT);
    expect(streams.size).toBe(STREAM_COUNT);
    const row = getRow(store, 999);
    expect(row.id).toBe(padId(1_000));
    expect(row.due).toBeGreaterThan(row.registered);
    const text = rowText(store, ru, 999);
    expect(text.client.length).toBeGreaterThan(0);
    expect(buildSearchIndex(store, ru)[999]).toContain(text.client.toLowerCase());
  });

  it("applyChunk marks rows as loaded and leaves others missing", () => {
    const store = createStore(100);
    applyChunk(store, generateChunk(3, 50, 50, 100));
    expect(store.loaded[49]).toBe(0);
    expect(store.loaded[50]).toBe(1);
    const search = buildSearchIndex(store, ru);
    expect(search[50]?.startsWith(padId(51).toLowerCase())).toBe(true);
    expect(search[0]).toBe("");
  });

  it("keeps the same rows for the default seed across versions", () => {
    /* A change here means existing seeds no longer reproduce earlier data.
       Re-pinned when the register became the complaints corpus: every
       column changed, and the deadlines now come from ariadne-rules.
       Re-pinned when a refused card, e-money or Faster Payments operation
       stopped naming 161-FZ art. 8 part 3.10 (the second action) instead
       of part 3.4 (the first): the ground of those rows changed.
       Re-pinned again when the open cases were spread against the day the
       data is taken (most within the term, a minority due within three
       working days, a few overdue) and blocked operations were complained
       about within days: the stage, extension, operation day and reply
       day of many rows changed.
       Re-pinned when the group's non-bank companies, a base-standard
       breach and the copies a reply owes were added: three new columns,
       drawn from a stream of their own, and the self-regulatory copy bit
       of the rows with a breach; every other column is as it was.
       Re-pinned when the paths beyond the first action or decision were
       added for open cases (a second antifraud step after a confirmation
       or a repeat, an application to remove the client's data from the
       database through the bank, the interagency commission's request):
       four new columns, drawn from a stream of their own; every other
       column is as it was.
       Re-pinned when the complaints about the client's own data in the
       Bank of Russia's database were told apart from the blocks on
       OD-2506 sign 1.1, which is about the recipient of the client's
       transfer: half of the rows that drew sign 1.1's share, by a draw of
       their own, carry no sign and no operation, a new `database` column,
       161-FZ art. 9 part 11.6 as a refusal's ground, and alone the
       application to remove the data; the other half keep sign 1.1 with
       the complaint texts of a blocked operation and may have a second
       step. Every other column is as it was, which a test below checks
       against the previous pin.
       Re-pinned when the Ministry of Internal Affairs' information was
       drawn for some of the cases about the client's data (the next draw
       of their own stream): their `database` code and the ground of their
       refusals, 161-FZ art. 9 part 11.7, changed; every other column is
       as it was, which a test below checks.
       Re-pinned when the bank's choice under 161-FZ art. 9 part 11.6
       between the suspension and the transfer cap was drawn for the cases
       about an individual's own data without the Ministry's information
       (a stream of its own): one new column, `restriction`, at the end;
       every other column is byte for byte as it was, which a test below
       checks against the previous pin.
       Re-pinned when the day the bank received the database information
       with the client's data was stored for the cases about them (the
       ATM cash cap of the Banking Law art. 30 part 16 runs from it, not
       from the day the bank acted; a stream of its own): one new column,
       `recordOn`, at the end; every other column is byte for byte as it
       was, which the next test checks against the previous pin. */
    expect(storeDigest(generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK))).toBe(GOLDEN_DIGEST);
  });

  it("leaves every column but the new recordOn as it was before the day the bank received the database information was stored", () => {
    const before = COLUMN_KEYS.filter((key) => key !== "recordOn");
    expect(COLUMN_KEYS.at(-1)).toBe("recordOn");
    expect(storeDigest(generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK), before)).toBe(DIGEST_BEFORE_RECORD_DAY);
  });

  it("leaves every column but the new restriction as it was before the bank's choice under part 11.6 was drawn", () => {
    const before = COLUMN_KEYS.filter((key) => key !== "restriction" && key !== "recordOn");
    expect(COLUMN_KEYS.slice(-2)).toEqual(["restriction", "recordOn"]);
    expect(storeDigest(generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK), before)).toBe(DIGEST_BEFORE_RESTRICTION);
  });

  it("leaves every column but the database code and the ground as it was before the Ministry's information was drawn", () => {
    const before = COLUMN_KEYS.filter((key) => key !== "database" && key !== "ground" && key !== "restriction" && key !== "recordOn");
    expect(storeDigest(generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK), before)).toBe(DIGEST_BEFORE_POLICE_INFORMATION);
  });

  it("leaves every column but those that tell the client's own data from sign 1.1 as it was before", () => {
    const told = new Set<string>(["reason", "operation", "opAmount", "template", "ground", "path", "pathOn", "pathThen", "pathTerm", "database", "restriction", "recordOn"]);
    const before = COLUMN_KEYS.filter((key) => !told.has(key));
    expect(storeDigest(generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK), before)).toBe(DIGEST_BEFORE_CLIENT_DATA);
  });

  it("splits a total into chunk bounds", () => {
    expect(chunkCount(1_200, 400)).toBe(3);
    expect(chunkCount(50_000, 5_000)).toBe(10);
    expect(chunkCount(50_001, 5_000)).toBe(11);
    expect(chunkBounds(9, 50_000, 5_000)).toEqual({ start: 45_000, count: 5_000 });
    expect(chunkBounds(10, 50_001, 5_000)).toEqual({ start: 50_000, count: 1 });
    expect(chunkBounds(11, 50_001, 5_000)).toEqual({ start: 55_000, count: 0 });
  });

  it("maps case ids back to rows", () => {
    expect(rowOfId("C-000001", 10)).toBe(0);
    expect(rowOfId(rowId(9), 10)).toBe(9);
    expect(rowOfId("C-000011", 10)).toBe(-1);
    expect(rowOfId("C-000000", 10)).toBe(-1);
    expect(rowOfId("Z-000001", 10)).toBe(-1);
    expect(rowOfId("nope", 10)).toBe(-1);
  });
});

const GOLDEN_DIGEST = "bf3ba74b";
/* The pin before the day the bank received the database information was
   stored ("097738b3"), over every column but the new `recordOn` */
const DIGEST_BEFORE_RECORD_DAY = "097738b3";
/* The pin before the bank's choice under part 11.6 was drawn ("6d000bb1"),
   over every column but the new `restriction` */
const DIGEST_BEFORE_RESTRICTION = "6d000bb1";
/* The pin before the Ministry's information was drawn ("722e7330"), over
   every column but `database` and `ground` */
const DIGEST_BEFORE_POLICE_INFORMATION = "bf6ecaa8";
/* The pin before the client's own data were told apart from sign 1.1
   ("7f0ba479"), over the columns that did not change */
const DIGEST_BEFORE_CLIENT_DATA = "7acd7001";
