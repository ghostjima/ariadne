/*
  The proposer interface changes nothing a run emits. The fixtures were
  taken on the engine before a proposer existed (test/stream-bytes.ts says
  what they cover): the engine must give the same bytes by default, and the
  same again with the scripted proposer handed to it.
*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  generatePlan,
  generateScenario,
  proposeAll,
  PROPOSAL_TASKS,
  QUESTIONS_BY_TEAM,
  replyDraft,
  requiresConfirmation,
  resolvePlan,
  RISK_BY_TYPE,
  runPlan,
  SCRIPTED,
  ScriptedProposer,
  teamOf,
  type CaseBrief,
  type ImmediateProposer,
  type ProposalFor,
  type ProposalRequest,
  type ProposalTask,
} from "../src/index.js";
import { AML, BRIEF, CAPPED, PLAIN, REMOVAL } from "./briefs.js";
import { payloadFor } from "./helpers.js";
import { CASES, completeRunStream, ENGINE, SEEDS, streamDigests, streamLines, type Engine } from "./stream-bytes.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/stream-v5.json", import.meta.url), "utf8")) as {
  protocol: number;
  lines: number;
  digests: Record<string, string>;
};
const stream = readFileSync(new URL("./fixtures/stream-v5-seed7.sse", import.meta.url), "utf8");

/* The engine with a proposer handed to it at every entry */
function engineWith(proposer: ImmediateProposer): Engine {
  return {
    scenario: (seed, brief) => generateScenario(seed, brief, proposer),
    plan: (seed, brief) => generatePlan(seed, brief, proposer),
    resolve: (payload) => resolvePlan(payload, proposer),
  };
}

describe("the event stream is byte-identical to the one before the proposer", () => {
  it("covers every seed and case of the test set", () => {
    expect(Object.keys(fixture.digests)).toHaveLength(SEEDS.length * CASES.length);
    let lines = 0;
    for (const seed of SEEDS) for (const [, brief] of CASES) lines += streamLines(seed, brief).length;
    expect(lines).toBe(fixture.lines);
  });

  it("by default: plans, scenarios and every segment of every session, for seeds 1 to 40 over five cases", () => {
    expect(streamDigests(ENGINE)).toEqual(fixture.digests);
  });

  it("with the scripted proposer handed to the engine", () => {
    expect(streamDigests(engineWith(new ScriptedProposer()))).toEqual(fixture.digests);
  });

  it("as the Service Worker handler streams a complete run", async () => {
    expect(await completeRunStream(7, BRIEF)).toBe(stream);
    expect(await completeRunStream(7, BRIEF, engineWith(new ScriptedProposer()))).toBe(stream);
  });
});

describe("the scripted proposer", () => {
  const briefs: CaseBrief[] = [BRIEF, PLAIN, AML, REMOVAL, CAPPED];

  it("answers the three tasks from the brief alone", () => {
    expect([...PROPOSAL_TASKS]).toEqual(["classify", "request_facts", "draft_reply"]);
    for (const brief of briefs) {
      const p = proposeAll(SCRIPTED, 7, brief);
      expect(p.classify).toEqual({ task: "classify", stream: brief.stream, grounds: brief.grounds });
      const team = teamOf(brief.stream);
      expect(p.request_facts).toEqual({
        task: "request_facts",
        team,
        questions: QUESTIONS_BY_TEAM[team],
        reuseLinked: brief.linkedCase !== null,
      });
      expect(p.draft_reply).toEqual({
        task: "draft_reply",
        grounds: brief.grounds,
        reasons: brief.reason === null ? [] : [brief.reason],
        clientOptions: brief.clientOptions,
        deadlines: brief.deadlines,
        measures: brief.measures,
        nextSteps: ["contact_bank", "apply_to_bank_of_russia"],
      });
      /* The seed paces a run; it does not change what is proposed */
      for (const seed of [1, 8, 40]) expect(proposeAll(SCRIPTED, seed, brief)).toEqual(p);
    }
  });

  it("copies the brief's lists: a proposal edited afterwards leaves the brief as it was", () => {
    const p = proposeAll(SCRIPTED, 7, AML);
    p.draft_reply.grounds.push("contract");
    p.draft_reply.deadlines[0]!.due = "2027-01-01";
    p.classify.grounds.length = 0;
    expect(AML.grounds).toEqual(["aml_operation_refused"]);
    expect(AML.deadlines).toEqual([{ kind: "aml_documents_answer", due: "2026-10-09" }]);
  });

  it("answers the same through the asynchronous call, and proposes nothing once aborted", async () => {
    const proposer = new ScriptedProposer();
    for (const task of PROPOSAL_TASKS) {
      const request = { task, seed: 7, brief: BRIEF };
      expect(await proposer.propose(request, new AbortController().signal)).toEqual(proposer.proposeNow(request));
    }
    const stopped = new AbortController();
    stopped.abort();
    await expect(proposer.propose({ task: "draft_reply", seed: 7, brief: BRIEF }, stopped.signal)).rejects.toBe(stopped.signal.reason);
  });
});

/* A proposer that answers otherwise: another team, one question, the facts
   of a linked case whether or not there is one, and a reply that states
   only the contract */
class OtherProposer implements ImmediateProposer {
  proposeNow<T extends ProposalTask>(request: ProposalRequest<T>): ProposalFor<T>;
  proposeNow({ task }: ProposalRequest): ProposalFor<ProposalTask> {
    switch (task) {
      case "classify":
        return { task, stream: "general", grounds: ["contract"] };
      case "request_facts":
        return { task, team: "operations", questions: ["charges"], reuseLinked: true };
      case "draft_reply":
        return { task, grounds: ["contract"], reasons: [], clientOptions: [], deadlines: [], measures: [], nextSteps: ["contact_bank"] };
    }
  }
  propose<T extends ProposalTask>(request: ProposalRequest<T>): Promise<ProposalFor<T>> {
    return Promise.resolve(this.proposeNow(request));
  }
}

describe("what a proposer sets, and what it cannot", () => {
  const other = new OtherProposer();

  it("the fact request and the reply say what was proposed", () => {
    const plan = generatePlan(8, AML, other);
    expect(plan[1]!.draft).toMatchObject({ template: "request_facts", team: "operations", questions: ["charges"] });
    expect(plan[1]!.summary).toMatchObject({ code: "facts_requested", team: "operations" });
    expect(plan[1]!.undo).toMatchObject({ code: "recall_fact_request", team: "operations" });
    expect(plan[2]!.draft).toEqual({ ...replyDraft(AML), grounds: ["contract"], reasons: [], clientOptions: [], deadlines: [], nextSteps: ["contact_bank"] });
    expect(plan[2]!.draft).toEqual(replyDraft(AML, other.proposeNow({ task: "draft_reply", seed: 8, brief: AML })));
    /* And the events carry it */
    const resolved = resolvePlan(payloadFor(["s2"], "ask_all", [], 8, AML), other);
    if (!resolved.ok) throw new Error(resolved.error);
    const events = [...runPlan({ steps: resolved.steps, autonomy: "ask_all", decisions: [], undoWindowSec: null, timeScale: 0, now: () => 1000 })];
    const awaiting = events.flatMap((i) => (i.kind === "event" && i.event.type === "step.awaiting" ? [i.event.draft] : []));
    expect(awaiting).toEqual([plan[1]!.draft]);
  });

  it("the classification stays the register's: the brief's stream, regime and reason", () => {
    const plan = generatePlan(8, AML, other);
    expect(plan[0]!.draft).toEqual({ kind: "change", template: "classify", caseNo: 431, stream: "aml_refusal", regime: "complaint", reason: "aml_operation_refused" });
    expect(plan[0]!.summary).toEqual({ code: "case_classified", caseNo: 431, stream: "aml_refusal", reason: "aml_operation_refused" });
  });

  it("the plan, the risk of each step, the confirmation and the undo are the engine's whatever is proposed", () => {
    for (const brief of [BRIEF, PLAIN, AML, REMOVAL, CAPPED]) {
      for (const seed of [7, 8]) {
        const scripted = generatePlan(seed, brief);
        const plan = generatePlan(seed, brief, other);
        expect(plan.map((s) => [s.id, s.type])).toEqual(scripted.map((s) => [s.id, s.type]));
        for (const [i, step] of plan.entries()) {
          const was = scripted[i]!;
          expect(step.risk).toBe(RISK_BY_TYPE[step.type]);
          expect([step.confidence, step.durationMs, step.undoWindowSec, step.error]).toEqual([was.confidence, was.durationMs, was.undoWindowSec, was.error]);
          expect(step.undo.code).toBe(was.undo.code);
          expect(step.objects.map((o) => [o.kind, o.before, o.after])).toEqual(was.objects.map((o) => [o.kind, o.before, o.after]));
          for (const autonomy of ["ask_all", "high_only", "ask_none"] as const) {
            expect(requiresConfirmation({ ...step, askFirst: false }, autonomy)).toBe(requiresConfirmation({ ...was, askFirst: false }, autonomy));
          }
        }
        expect(requiresConfirmation(plan[2]!, "ask_none")).toBe(true);
      }
    }
  });

  it("the facts of a linked case are offered only where the case has one", () => {
    expect(generateScenario(8, BRIEF, other).deviationStepId).toBe("s2");
    expect(generateScenario(8, BRIEF, other).steps[1]!.deviation?.linkedCase).toBe(807);
    expect(generateScenario(8, PLAIN, other).deviationStepId).toBeNull();
    /* And a proposer may not ask for them */
    const never: ImmediateProposer = {
      proposeNow: ((request: ProposalRequest) =>
        request.task === "request_facts" ? { ...SCRIPTED.proposeNow(request), reuseLinked: false } : SCRIPTED.proposeNow(request)) as ImmediateProposer["proposeNow"],
      propose: (request, signal) => SCRIPTED.propose(request, signal),
    };
    expect(generateScenario(8, BRIEF, never).deviationStepId).toBeNull();
  });
});
