import { describe, expect, it } from "vitest";
import { COLUMN_IDS, Outcome, Stage, Stream, generateAll, visibleColumns, writeField, workingDaysLeft } from "@ariadne/grid";
import { stoaFormat } from "@ghostjima/stoa-react";
import { LOCALES, strings } from "../i18n";
import { buildColumns, deadlineTone, makeFormats, stageTone } from "./columns";
import { readUrlConfig } from "./settings";

const store = generateAll(20261006, 1_200, 400);
const ctx = (lang: "en" | "ru", role: "operator" | "signatory" | "supervisor" = "supervisor") => ({
  store,
  lang,
  t: strings[lang],
  stoa: stoaFormat(LOCALES[lang]),
  formats: makeFormats(lang),
  role,
});
const rows = (pred: (i: number) => boolean) => Array.from({ length: store.size }, (_, i) => i).filter(pred);

describe("grid columns", () => {
  it("cover the whole catalogue of 24 columns, case and applicant pinned first", () => {
    const columns = buildColumns(COLUMN_IDS, ctx("en"));
    expect(columns).toHaveLength(24);
    expect(columns.filter((c) => c.pinned).map((c) => c.id)).toEqual(["id", "client"]);
    expect(columns.filter((c) => c.editor).map((c) => c.id)).toEqual(["extension", "stage", "outcome", "ground", "assignee", "note"]);
  });

  it("give each role the editors of its own work", () => {
    const editors = (role: "operator" | "signatory") => buildColumns(COLUMN_IDS, ctx("en", role)).filter((c) => c.editor).map((c) => c.id);
    expect(editors("operator")).toEqual(["stage", "outcome", "ground", "note"]);
    expect(editors("signatory")).toEqual(["stage", "note"]);
  });

  it("pin nothing when asked not to, for a narrow screen", () => {
    expect(buildColumns(COLUMN_IDS, { ...ctx("en"), pin: false }).some((c) => c.pinned)).toBe(false);
  });

  it("hide the assignee from operators: it would name them in every row", () => {
    expect(visibleColumns({ columns: [...COLUMN_IDS] }, "operator")).not.toContain("assignee");
  });

  it("write the time left as DeadlineCell does: Stoa's words in working days, a warning within 3, a cross once overdue", () => {
    const [ru] = buildColumns(["left"], ctx("ru"));
    const say = (left: number) => ru!.format!(left, 0, {} as never);
    expect(say(3)).toBe("Осталось 3 рабочих дня");
    expect(say(0)).toBe("Срок сегодня");
    expect(say(-2)).toBe("Просрочено на 2 рабочих дня");
    expect([deadlineTone(4), deadlineTone(3), deadlineTone(0), deadlineTone(-1)]).toEqual([null, "warning", "warning", "negative"]);
    const [left] = buildColumns(["left"], ctx("en"));
    const open = rows((i) => store.stage[i]! < Stage.Sent)[0]!;
    expect(left!.accessor(open)).toBe(workingDaysLeft(store, open));
    expect(left!.tone!(left!.accessor(open), open)).toBe(deadlineTone(workingDaysLeft(store, open)));
    const sent = rows((i) => store.stage[i]! >= Stage.Sent)[0]!;
    expect(left!.accessor(sent)).toBe("");
    expect(left!.tone!("", sent)).toBeNull();
  });

  it("mark the stage: answered done, awaiting signature called out, the rest plain", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(stageTone)).toEqual([null, null, null, null, "warning", "positive", "positive"]);
    const [stage] = buildColumns(["stage"], ctx("en"));
    expect(stage!.tone!("4", 0)).toBe("warning");
  });

  it("write amounts in roubles and dates in the interface's locale, in the sans face for dates", () => {
    const columns = buildColumns(["opAmount", "registered", "received", "due"], ctx("ru"));
    const row = rows((i) => store.opAmount[i]! > 10_000)[0]!;
    expect(columns[0]!.format!(columns[0]!.accessor(row), row, {} as never)).toMatch(/^[\d\u00a0]+\u00a0₽$/);
    expect(columns.map((c) => [c.id, c.mono])).toEqual([
      ["opAmount", undefined],
      ["registered", false],
      ["received", false],
      ["due", false],
    ]);
    const [header] = buildColumns(["stage"], ctx("ru"));
    expect(header!.header).toBe("Этап");
  });

  it("refuse a refusal without a ground, a ground of the other stream and an extension under 123-FZ, in the interface's words", () => {
    const [outcome, ground, extension] = buildColumns(["outcome", "ground", "extension"], ctx("ru"));
    const draft = rows((i) => store.stage[i] === Stage.Drafting && store.ground[i] === 0 && store.stream[i] === Stream.Antifraud)[0]!;
    expect(outcome!.editor!.validate!(String(Outcome.Refused), draft)).toBe(strings.ru.editErrors.refusalNeedsGround);
    expect(ground!.editor!.validate!("3", draft)).toBe(strings.ru.editErrors.groundOtherStream);
    expect(ground!.editor!.validate!("1", draft)).toBeNull();
    writeField(store, draft, "ground", 1, 0);
    expect(outcome!.editor!.validate!(String(Outcome.Refused), draft)).toBeNull();
    const claim = rows((i) => store.stream[i] === Stream.MoneyClaim && store.claim[i]! <= 500_000 && store.stage[i]! < Stage.Sent)[0]!;
    expect(extension!.editor!.validate!("1", claim)).toBe(strings.ru.editErrors.extensionNotAllowed);
  });

  it("refuse a note over 200 characters", () => {
    const [note] = buildColumns(["note"], ctx("ru"));
    expect(note!.editor!.validate!("x".repeat(214), 0)).toBe("Не больше 200 символов, а в заметке 214.");
  });
});

describe("address settings", () => {
  it("read the role, scale mode, the case to open, failing chunks, worker and colleague switches", () => {
    expect(readUrlConfig("?role=operator&failChunk=2,x,5&worker=off&colleague=off&rows=50000&case=C-000835")).toMatchObject({
      role: "operator",
      scale: true,
      caseId: "C-000835",
      failChunks: [2, 5],
      useWorker: false,
      colleagueSeconds: null,
      view: null,
    });
    expect(readUrlConfig("")).toMatchObject({ role: "supervisor", scale: false, caseId: null, failChunks: [], useWorker: true, colleagueSeconds: 40 });
    expect(readUrlConfig("?role=signatory&rows=7").scale).toBe(false);
    // The assistant's own `scale` (the stream's time scale) is not the desk's.
    expect(readUrlConfig("?scale=50000").scale).toBe(false);
    expect(readUrlConfig("?role=manager").role).toBe("supervisor");
    expect(readUrlConfig("?colleague=3").colleagueSeconds).toBe(3);
  });
});
