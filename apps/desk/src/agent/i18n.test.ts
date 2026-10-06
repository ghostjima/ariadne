import { describe, expect, it } from "vitest";
import {
  ACTION_TYPES,
  AML_REASON_CODES,
  AUTONOMIES,
  CLASSIFICATION_STATUSES,
  CLIENT_DEADLINE_KINDS,
  CLIENT_OPTIONS,
  COMMANDS,
  CONFLICT_REASONS,
  DEVIATION_PROPOSALS,
  DEVIATION_REASONS,
  DRAFT_KINDS,
  DRAFT_STATUSES,
  DRAFT_TEMPLATES,
  ERROR_CODES,
  FACT_QUESTIONS,
  LINK_STATUSES,
  NEXT_STEPS,
  OBJECT_KINDS,
  OUTCOMES,
  PROGRESS_PHASES,
  REGIMES,
  REQUEST_STATUSES,
  RISKS,
  SERVICES,
  SKIP_REASONS,
  STEP_STATUSES,
  SUMMARY_CODES,
  TASK_CODES,
  TEAMS,
  UNDO_CODES,
  applyDeviation,
  generatePlan,
  generateScenario,
  findConflicts,
  type CaseBrief,
  type LogEntry,
} from "@ariadne/runner";
import { POOLS } from "../data/query";
import { makeFmt } from "./format";
import { fullRun } from "./fullRun";
import { LANGUAGES as LANGS } from "../i18n";
import { LOCALES, strings, type Lang } from "./i18n";
import { replyLines } from "./reply";
import { SAMPLE_BRIEF } from "./sampleBrief";
import { FINDING_CODES } from "./rubric";
import { STREAM_ERRORS } from "./transport";
import { draftLines, errorText, logLine, objectLine, stepTitle, summaryText, undoText, type Text } from "./text";
import { WORKER_ERRORS } from "./worker";

/** Every key path of a table, with the kind of value at it (a function's
 * arity included, an array's length). */
function shape(v: unknown, path = ""): string[] {
  if (Array.isArray(v)) return [`${path}: array/${v.length}`];
  if (typeof v === "function") return [`${path}: function/${v.length}`];
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => shape(x, path ? `${path}.${k}` : k));
  return [`${path}: ${typeof v}`];
}

function leaves(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k));
  return [];
}

const text = (lang: Lang): Text => ({ t: strings[lang], f: makeFmt(LOCALES[lang]), labels: POOLS[lang].labels, lang });

/** The sample transfer under 161-FZ, and a refused operation under 115-FZ
 * with the answer to the documents still running. */
const BRIEF = SAMPLE_BRIEF;
const AML: CaseBrief = {
  ...BRIEF,
  caseNo: 431,
  stream: "aml_refusal",
  reason: "aml_operation_refused",
  outcome: "refused",
  claimKopecks: 1_000_000,
  linkedCase: null,
  grounds: ["aml_operation_refused", "contract"],
  clientOptions: ["submit_documents", "apply_to_commission"],
  deadlines: [{ kind: "aml_documents_answer", due: "2026-10-09" }],
};

describe("language tables", () => {
  it("Russian and English have the same keys, with the same kinds of value", () => {
    const en = shape(strings.en).sort();
    expect(shape(strings.ru).sort()).toEqual(en);
  });

  it("no string is empty", () => {
    for (const lang of LANGS) for (const [path, value] of leaves(strings[lang])) expect(value.trim(), `${lang}.${path}`).not.toBe("");
  });

  it("every code of the engine has words in every language", () => {
    const tables: [string, readonly string[], (lang: Lang) => object][] = [
      ["actionType", ACTION_TYPES, (l) => strings[l].actionType],
      ["risk", RISKS, (l) => strings[l].risk],
      ["autonomy", AUTONOMIES, (l) => strings[l].autonomy],
      ["autonomyHelp", AUTONOMIES, (l) => strings[l].autonomyHelp],
      ["command", COMMANDS, (l) => strings[l].command],
      ["phase", PROGRESS_PHASES, (l) => strings[l].phase],
      ["skipReason", SKIP_REASONS, (l) => strings[l].skipReason],
      ["stepStatus", STEP_STATUSES, (l) => strings[l].stepStatus],
      ["objectKind", OBJECT_KINDS, (l) => strings[l].objectKind],
      ["classificationStatus", CLASSIFICATION_STATUSES, (l) => strings[l].classificationStatus],
      ["requestStatus", REQUEST_STATUSES, (l) => strings[l].requestStatus],
      ["linkStatus", LINK_STATUSES, (l) => strings[l].linkStatus],
      ["draftStatus", DRAFT_STATUSES, (l) => strings[l].draftStatus],
      ["regime", REGIMES, (l) => strings[l].regime],
      ["team", TEAMS, (l) => strings[l].team],
      ["question", FACT_QUESTIONS, (l) => strings[l].question],
      ["draftKind", DRAFT_KINDS, (l) => strings[l].draftKind],
      ["confirm", DRAFT_KINDS, (l) => strings[l].confirm.confirm],
      ["draft", DRAFT_TEMPLATES, (l) => strings[l].draft],
      ["serviceName", SERVICES, (l) => strings[l].serviceName],
      ["errorText", ERROR_CODES, (l) => strings[l].errorText],
      ["streamError", STREAM_ERRORS, (l) => strings[l].streamError],
      ["workerError", WORKER_ERRORS, (l) => strings[l].service.errors],
      ["taskName", TASK_CODES, (l) => strings[l].taskName],
      ["summaryText", SUMMARY_CODES, (l) => strings[l].summaryText],
      ["undoText", UNDO_CODES, (l) => strings[l].undoText],
      ["deviationReason", DEVIATION_REASONS, (l) => strings[l].deviationReason],
      ["deviationProposal", DEVIATION_PROPOSALS, (l) => strings[l].deviationProposal],
      ["conflict", CONFLICT_REASONS, (l) => strings[l].conflict],
      ["stepTitle", ACTION_TYPES, (l) => strings[l].stepTitle],
      ["object", OBJECT_KINDS, (l) => strings[l].object],
      ["rubric.finding", FINDING_CODES, (l) => strings[l].rubric.finding],
      ["rubric.option", CLIENT_OPTIONS, (l) => strings[l].rubric.option],
      ["rubric.deadline", CLIENT_DEADLINE_KINDS, (l) => strings[l].rubric.deadline],
      ["reply.outcome", OUTCOMES, (l) => strings[l].reply.outcome],
      ["reply.aml", AML_REASON_CODES, (l) => strings[l].reply.aml],
      ["reply.option", CLIENT_OPTIONS, (l) => strings[l].reply.option],
      ["reply.deadline", CLIENT_DEADLINE_KINDS, (l) => strings[l].reply.deadline],
      ["reply.next", NEXT_STEPS, (l) => strings[l].reply.next],
    ];
    for (const [name, codes, table] of tables)
      for (const lang of LANGS) expect(Object.keys(table(lang)).sort(), `${lang}.${name}`).toEqual([...codes].sort());
  });
});

/** Every sentence the interface writes from the engine's data over a whole
 * run: titles, drafts, the reply, changes, results, undos, errors and log
 * lines. */
function runSentences(lang: Lang, seed: number, brief: CaseBrief): string[] {
  const x = text(lang);
  const steps = generatePlan(seed, brief);
  const scenario = generateScenario(seed, brief);
  const deviated = scenario.steps.filter((s) => s.deviation).map(applyDeviation);
  const out: string[] = [];
  for (const step of [...steps, ...deviated]) {
    out.push(stepTitle(x, step), ...draftLines(x, step.draft), ...step.objects.map((o) => objectLine(x, o)));
    if (step.draft.kind === "reply") out.push(...replyLines(x, step.draft));
    out.push(summaryText(x, step.summary), undoText(x, step.undo));
    if (step.error) out.push(errorText(x, step.error));
  }
  for (const c of findConflicts([...steps].reverse())) out.push(x.t.conflict[c.reason](x.f.int(2), x.f.int(4)));
  for (const autonomy of AUTONOMIES) {
    const run = fullRun(steps, autonomy);
    const entries: LogEntry[] = [
      { at: 0, kind: "approved", total: steps.length, autonomy, confirmations: 3 },
      ...run.events.map((e): LogEntry => ({ at: 0, kind: "event", event: e.event })),
      ...run.decisions.flatMap((d): LogEntry[] => (d.command === "stop" || !d.stepId ? [] : [{ at: 0, kind: "decision", stepId: d.stepId, command: d.command }])),
      { at: 0, kind: "stop_requested" },
      { at: 0, kind: "undo", stepId: "s1", undo: steps[0]!.undo },
      { at: 0, kind: "event", event: { type: "plan.stopped", at: 0, afterStepId: null } },
      { at: 0, kind: "event", event: { type: "step.skipped", stepId: "s2", reason: "stopped_by_user" } },
    ];
    for (const entry of entries) {
      const line = logLine(x, entry, () => x.f.int(3), (id) => stepTitle(x, steps.find((s) => s.id === id)!));
      out.push(line.level, line.text);
    }
  }
  return out;
}

/** What may stay in Latin letters in Russian: the register's case and
 * operation numbers, and the rules engine's name. */
const LATIN_IDS = /\bC-\d{6}\b|\bOP-[0-9A-Z]{7}\b|ariadne-rules/g;

describe("sentences from the engine's data", () => {
  it("have no Latin letters in Russian, but for case and operation numbers", () => {
    for (const seed of [1, 7, 42, 999])
      for (const brief of [BRIEF, AML])
        for (const sentence of runSentences("ru", seed, brief))
          expect(sentence.replace(LATIN_IDS, "").match(/[A-Za-z]+/g), `ru: ${sentence}`).toBeNull();
  });

  it("never end a sentence twice (a date that ends in a full stop)", () => {
    for (const lang of LANGS)
      for (const brief of [BRIEF, AML])
        for (const sentence of runSentences(lang, 7, brief)) expect(sentence, `${lang}: ${sentence}`).not.toMatch(/\.\./);
  });

  it("read as expected in each language", () => {
    const steps = generatePlan(8, BRIEF);
    const request = steps[1]!;
    expect(stepTitle(text("en"), request)).toBe("Request the facts from the antifraud team");
    expect(stepTitle(text("ru"), request)).toBe("Запросить факты: Антифрод");
    expect(draftLines(text("en"), request.draft)).toEqual([
      "To the antifraud team, on case C-000867.",
      "Operation: Transfer by bank details, Sep 1, 2026.",
      "Which sign was detected, and on what data?",
      "Did the client confirm the order, and when?",
      "Is the recipient in the Bank of Russia's database?",
      "Is the measure still in force?",
      "Answer by Oct 8, 2026.",
    ]);
    expect(draftLines(text("ru"), request.draft).at(-1)).toBe("Ответить до 8 окт. 2026 г.");
    expect(errorText(text("en"), generateScenario(7, BRIEF).steps[1]!.error!)).toBe("The fact request service did not answer within 5 s.");
    expect(summaryText(text("ru"), applyDeviation(request).summary)).toBe("Использованы факты дела C-000807; запрос не отправлялся.");
  });

  it("write the reply out from its codes, citing the law and the sign", () => {
    const draft = generatePlan(8, BRIEF)[2]!.draft;
    if (draft.kind !== "reply") throw new Error("not a reply");
    // Spaces as written: the locale's no-break spaces read as spaces.
    expect(replyLines(text("en"), draft).map((l) => l.replace(/[\u00a0\u202f]/g, " "))).toEqual([
      "Dear client,",
      "We have reviewed your complaint of Sep 3, 2026, case C-000867.",
      "It concerns this operation: Transfer by bank details, reference OP-00SPDE7, of Sep 1, 2026, for RUB 48,500.00.",
      "[The decision on the complaint: for the reviewer to state.]",
      "We suspended the transfer: it matched sign 1.4 of Bank of Russia Order OD-2506.",
      "The ground is 161-FZ, art. 8, part 3.4.",
      "You can confirm the transfer order, and we will carry it out.",
      "Please confirm the order by Oct 7, 2026.",
      "If you have questions, reply to this letter or call us.",
      "You can also apply to the Bank of Russia.",
    ]);
    const aml = generatePlan(8, AML)[2]!.draft;
    if (aml.kind !== "reply") throw new Error("not a reply");
    const ru = replyLines(text("ru"), aml);
    expect(ru).toContain("Основание: 115-ФЗ, ст. 7, п. 11.");
    expect(ru).toContain("Наша позиция основана на условиях вашего договора с банком.");
    expect(ru).toContain("Мы ответим по вашим документам не позднее 9 окт. 2026 г.");
    expect(ru.some((l) => l.replace(/[\u00a0\u202f]/g, " ").startsWith("Вы требуете 10 000,00"))).toBe(true);
  });
});
