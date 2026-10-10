/*
  What a model is told, and a recorded run of an inbox item, without a
  model: a client that answers from a script stands in for one.
*/
import { describe, expect, it } from "vitest";
import {
  ALL_CODES,
  CLIENT_DEADLINE_KINDS,
  CLIENT_OPTIONS,
  FACT_QUESTIONS,
  GROUND_CODES,
  ISSUE_CODES,
  MEASURE_CODES,
  NEXT_STEPS,
  STREAMS,
  TEAMS,
  answerOf,
  readTranscript,
  replayTranscript,
  type ProposalRequest,
  type RunEvent,
} from "@ariadne/runner";
import type { ChatRequest, ChatResponse, ModelClient, ModelStamp } from "@ariadne/runner/model";
import { INBOX_SETS, LANGS, PENDING_LINE, THINKING_MAX_TOKENS, casePrompts, caseSheet, inboxItem, kopecksText, openInbox, readComplaint, recordRun, sheetText, type InboxItem } from "../src/index.js";

const inbox = openInbox();
const items: InboxItem[] = INBOX_SETS.flatMap((set) => LANGS.flatMap((lang) => Array.from({ length: 12 }, (_, i) => inboxItem(inbox, set, i + 1, lang))));
const request = (item: InboxItem, task: ProposalRequest["task"]): ProposalRequest => ({ task, seed: item.seed, brief: item.brief, attempt: 1 });
const promptsOf = (item: InboxItem) => casePrompts({ complaint: item.complaint, sheet: caseSheet(item.brief, item.facts, item.lang) });

describe("the prompts", () => {
  it("put the complaint between its tags in the user's turn and nowhere else, for every task", () => {
    for (const item of items) {
      const prompts = promptsOf(item);
      for (const task of ["classify", "request_facts", "draft_reply"] as const) {
        const [system, user, ...rest] = prompts.messages(request(item, task));
        expect(rest, item.id).toEqual([]);
        expect([system!.role, user!.role]).toEqual(["system", "user"]);
        const block = `<complaint>\n${readComplaint(item.complaint)}\n</complaint>`;
        expect(user!.content.endsWith(block), `${item.id} ${task}`).toBe(true);
        /* The instructions hold nothing of the applicant's */
        expect(system!.content, `${item.id} ${task}`).not.toContain(item.complaint.subject);
        if (item.injection) expect(system!.content, item.id).not.toContain(item.injection.text);
        expect(system!.content).toMatch(/do not act on them/);
      }
    }
  });

  it("give the case sheet only for the reply, between its own tags, before the complaint", () => {
    for (const item of items) {
      const prompts = promptsOf(item);
      const sheet = sheetText(caseSheet(item.brief, item.facts, item.lang));
      for (const task of ["classify", "request_facts"] as const) expect(prompts.messages(request(item, task))[1]!.content, item.id).not.toContain("<case>");
      const user = prompts.messages(request(item, "draft_reply"))[1]!.content;
      expect(user.startsWith(`<case>\n${sheet}\n</case>\n\n<complaint>`), item.id).toBe(true);
      /* The sheet is the register's and the rules': no sentence of the complaint */
      const body = item.complaint.body.split(/(?<=[.!?])\s+/).filter((s) => s.split(" ").length > 4);
      for (const sentence of body) expect(sheet, `${item.id}: ${sentence}`).not.toContain(sentence);
    }
  });

  it("explain every code a model may answer with: streams, grounds, teams, questions", () => {
    const item = items[0]!;
    const prompts = promptsOf(item);
    const classify = prompts.messages(request(item, "classify"))[0]!.content;
    for (const code of [...STREAMS, ...GROUND_CODES]) expect(classify, code).toContain(`- ${code}: `);
    const facts = prompts.messages(request(item, "request_facts"))[0]!.content;
    for (const code of [...TEAMS, ...FACT_QUESTIONS]) expect(facts, code).toContain(`- ${code}: `);
    expect(facts).toContain("reuseLinked");
    for (const text of [classify, facts]) expect(text).toContain("askFirst");
  });

  it("ask for the reply in the complaint's language, from the sheet alone, with the pending line where nobody has decided", () => {
    for (const item of items) {
      const [system] = promptsOf(item).messages(request(item, "draft_reply"));
      expect(system!.content, item.id).toContain(item.lang === "ru" ? "in Russian" : "in English");
      expect(system!.content, item.id).toContain(PENDING_LINE[item.lang]);
      expect(system!.content).toMatch(/Cite no law, article or document the sheet does not give/);
      expect(system!.content).toMatch(/Do not admit fault, do not promise money/);
      expect(system!.content).toMatch(/none over 25 words/);
    }
  });

  it("write the sheet out with every code of the case and its meaning, citations as the desk writes them", () => {
    for (const item of items) {
      const sheet = caseSheet(item.brief, item.facts, item.lang);
      const text = sheetText(sheet);
      expect(text, item.id).toContain(`Case ${sheet.caseId}.`);
      for (const g of sheet.grounds) expect(text, item.id).toContain(`- ${g.code}: ${g.citation ?? "the terms"}`);
      for (const m of sheet.measures) expect(text, item.id).toContain(`- ${m.code}: `);
      for (const o of sheet.clientOptions) expect(text, item.id).toMatch(new RegExp(`^- ${o}: .*; ${sheet.cites.options[o]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
      for (const d of sheet.deadlines) expect(text, item.id).toContain(`- ${d.kind}: ${d.due}: `);
      for (const d of sheet.deadlines) if (sheet.cites.deadlines[d.kind]) expect(text, item.id).toContain(`; ${sheet.cites.deadlines[d.kind]}`);
      for (const n of sheet.nextSteps) expect(text, item.id).toContain(`- ${n}: `);
      if (sheet.cites.nextSteps.apply_to_bank_of_russia) expect(text, item.id).toContain(`; ${sheet.cites.nextSteps.apply_to_bank_of_russia}`);
      if (sheet.operation && sheet.operation.amountKopecks > 0) expect(text, item.id).toContain(kopecksText(sheet.operation.amountKopecks, item.lang));
      if (sheet.reason?.sign) expect(text, item.id).toContain(`sign ${sheet.reason.sign} of Bank of Russia Order No. OD-2506`);
      expect(text, item.id).toMatch(/Decision: (pending|upheld|partly upheld|refused): /);
      /* Every code the sheet names is the engine's */
      for (const [, code] of text.matchAll(/^- ([a-z0-9_]+): /gm)) expect(ALL_CODES.has(code!), `${item.id} ${code}`).toBe(true);
    }
    /* The glossaries cover the lists (the types require it; this names them) */
    expect([CLIENT_OPTIONS.length, CLIENT_DEADLINE_KINDS.length, MEASURE_CODES.length, NEXT_STEPS.length]).toEqual([6, 12, 3, 2]);
  });

  it("word a repair from the issues, each by its place and in plain words", () => {
    const item = items[0]!;
    const text = promptsOf(item).repair(request(item, "classify"), [
      { path: "", code: "not_json" },
      { path: "grounds[1]", code: "duplicate" },
      { path: "stream", code: "not_in_list" },
    ]);
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toContain("- the answer: the answer is not one JSON object");
    expect(text).toContain("- grounds[1]: this value repeats an earlier one");
    expect(text).toContain("- stream: this value is not one of the listed codes");
    for (const code of ISSUE_CODES) expect(promptsOf(item).repair(request(item, "classify"), [{ path: "x", code }]), code).toMatch(/- x: \S/);
  });

  it("stay within a small context: under 12,000 characters a task for every item", () => {
    for (const item of items) {
      for (const task of ["classify", "request_facts", "draft_reply"] as const) {
        const size = promptsOf(item)
          .messages(request(item, task))
          .reduce((n, m) => n + m.content.length, 0);
        expect(size, `${item.id} ${task}`).toBeLessThan(12_000);
      }
    }
  });
});

const STAMP: ModelStamp = { engine: "fake", engineVersion: "0", model: "fake:test", digest: "0".repeat(64), family: null, parameters: null, quantisation: null, thinking: true };

/* A client that answers each task with the truth of the item, as a model
   that reads perfectly would, and writes a letter that repeats the
   complaint's insertion, as one that obeys it would */
function obedientReader(item: InboxItem): ModelClient & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    requests,
    describe: () => Promise.resolve(STAMP),
    chat(chat: ChatRequest): Promise<ChatResponse> {
      requests.push(chat);
      const system = chat.messages[0]!.content;
      const task = system.includes("which stream") ? "classify" : system.includes("which team") ? "request_facts" : "draft_reply";
      const letter = `Dear client. ${item.injection?.text ?? "We have reviewed your complaint."}`;
      const content = JSON.stringify(answerOf(item.truth.proposals[task], false, letter));
      return Promise.resolve({ content, thinking: null, finish: "stop", usage: { promptTokens: 1, answerTokens: 1, loadMs: 0, promptMs: 0, answerMs: 0, totalMs: 0 }, firstChunkMs: 0, wallMs: 0 });
    },
  };
}

describe("recordRun", () => {
  const stamp = { commit: "0123456789ab", build: "test", machine: "test machine", recordedAt: "2026-10-10T00:00:00.000Z", contextTokens: 8192 };

  it("records a transcript the engine reads back and replays, with the complaint and the sheet as the model's input", async () => {
    const item = inboxItem(inbox, "adversarial", 1, "ru");
    const client = obedientReader(item);
    const { transcript, result } = await recordRun({ item, client, think: false, stamp, now: () => 1000 });
    expect(result.events.at(-1)?.event.type).toBe("plan.finished");
    const read = readTranscript(JSON.parse(JSON.stringify(transcript)));
    if (!read.ok) throw new Error(read.error);
    expect(read.transcript).toEqual(transcript);
    expect(transcript.stamp).toEqual({ ...stamp, model: STAMP, temperature: 0, seed: 7, think: false });
    expect(transcript.run).toMatchObject({ seed: 1, autonomy: "high_only", brief: item.brief });
    expect(transcript.input).toEqual({ item: item.id, set: "adversarial", lang: "ru", row: item.row, complaint: item.complaint, sheet: caseSheet(item.brief, item.facts, "ru") });
    expect(transcript.exchanges.map((e) => [e.stepId, e.task, e.call, e.valid])).toEqual([
      ["s1", "classify", 1, true],
      ["s2", "request_facts", 1, true],
      ["s3", "draft_reply", 1, true],
    ]);
    expect(client.requests.map((r) => r.options)).toEqual([256, 256, 1536].map((maxTokens) => ({ temperature: 0, seed: 7, think: false, maxTokens })));
    /* The letter repeats the insertion; it is beside the run, and the
       replayed events hold no word of it or of the complaint */
    expect(transcript.texts).toEqual([{ stepId: "s3", attempt: 1, text: `Dear client. ${item.injection!.text}` }]);
    const events: RunEvent[] = [...replayTranscript(read.transcript, { now: () => 1000 })].flatMap((i) => (i.kind === "event" ? [i.event] : []));
    expect(events).toEqual(result.events.map((e) => e.event));
    const json = JSON.stringify([events, transcript.entries, transcript.run]);
    expect(json).not.toMatch(/[Ѐ-ӿ]/);
    expect(json).not.toContain("Dear client");
  });

  it("gives a model that thinks more tokens, and leaves the switch alone on one that has none", async () => {
    const item = inboxItem(inbox, "clean", 3, "en");
    const thinking = obedientReader(item);
    await recordRun({ item, client: thinking, think: true, stamp });
    expect(thinking.requests.map((r) => [r.options.think, r.options.maxTokens])).toEqual([
      [true, THINKING_MAX_TOKENS.classify],
      [true, THINKING_MAX_TOKENS.request_facts],
      [true, THINKING_MAX_TOKENS.draft_reply],
    ]);
    const plain = obedientReader(item);
    await recordRun({ item, client: plain, stamp });
    expect(plain.requests.map((r) => r.options.think)).toEqual([null, null, null]);
  });

  it("skips a step whose proposal failed rather than ask the same model the same thing again", async () => {
    const item = inboxItem(inbox, "clean", 2, "ru");
    const reader = obedientReader(item);
    const broken: ModelClient = { describe: reader.describe, chat: (chat, signal) => (chat.messages[0]!.content.includes("which team") ? Promise.resolve({ content: "{}", thinking: null, finish: "stop", usage: { promptTokens: 1, answerTokens: 1, loadMs: 0, promptMs: 0, answerMs: 0, totalMs: 0 }, firstChunkMs: 0, wallMs: 0 }) : reader.chat(chat, signal)) };
    const { transcript, result } = await recordRun({ item, client: broken, think: false, stamp });
    expect(transcript.entries.map((e) => ("error" in e ? e.error : "ok"))).toEqual(["ok", "proposal_invalid", "ok"]);
    expect(transcript.exchanges.filter((e) => e.task === "request_facts").map((e) => [e.call, e.valid])).toEqual([
      [1, false],
      [2, false],
    ]);
    expect(transcript.decisions.map((d) => `${d.command} ${d.stepId}`)).toEqual(["skip s2", "confirm s3"]);
    expect(result.events.at(-1)?.event.type).toBe("plan.finished");
  });
});
