/*
  Driving a run a proposer fills in: proposals asked for as the run reaches
  them, Stop aborting a proposer at once with nothing written, and nothing
  an injected instruction could propose finishing without a person.
*/

import { describe, expect, it } from "vitest";
import {
  AUTONOMIES,
  driveRun,
  proposeAll,
  SCRIPTED,
  ScriptedProposer,
  type Command,
  type ProposalFor,
  type ProposalOutcome,
  type ProposalRequest,
  type ProposalTask,
  type Proposer,
} from "../src/index.js";
import { ModelProposer, type Exchange } from "../src/model/index.js";
import { AML, BRIEF, PLAIN } from "./briefs.js";
import { FakeModel, PROMPTS, scriptedAnswer } from "./fake-model.js";
import { payloadFor, runToEnd } from "./helpers.js";

const goOn = (pause: { accepts: readonly Command[] }): Command | null => (["confirm", "allow", "retry"] as const).find((c) => pause.accepts.includes(c)) ?? null;
const nobody = (): Command | null => null;

describe("driveRun", () => {
  it("with the scripted proposer gives the scripted run, and a log of what it proposed", async () => {
    for (const [brief, seed] of [[AML, 8], [BRIEF, 7], [PLAIN, 7]] as const) {
      const result = await driveRun({ seed, brief, autonomy: "high_only", proposer: new ScriptedProposer(), decide: goOn, now: () => 1000 });
      const { segment, log } = runToEnd(payloadFor(undefined, "high_only", [], seed, brief));
      expect(result.events, String(brief.caseNo)).toEqual(segment.events);
      expect(result.decisions).toEqual(log);
      expect(result.waiting).toBeNull();
      const p = proposeAll(SCRIPTED, seed, brief);
      expect(result.entries).toEqual([
        { stepId: "s1", attempt: 1, proposal: p.classify, askFirst: false },
        { stepId: "s2", attempt: 1, proposal: p.request_facts, askFirst: false },
        { stepId: "s3", attempt: 1, proposal: p.draft_reply, askFirst: false },
      ]);
      expect(result.texts).toEqual([]);
    }
  });

  it("asks a model for each proposal as the run reaches its step, and keeps the letter beside the run", async () => {
    const requests: ProposalRequest[] = [{ task: "classify", seed: 8, brief: AML }, { task: "request_facts", seed: 8, brief: AML }, { task: "draft_reply", seed: 8, brief: AML }];
    const model = new FakeModel(requests.map((r) => scriptedAnswer(r, "Dear client, we refused the operation.")));
    const asked: string[] = [];
    const result = await driveRun({
      seed: 8,
      brief: AML,
      autonomy: "high_only",
      proposer: new ModelProposer({ client: model, prompts: PROMPTS }),
      decide: goOn,
      now: () => 1000,
      onProposal: (need, phase) => asked.push(`${need.stepId} ${need.task} ${need.attempt} ${phase}`),
    });
    expect(asked).toEqual(["s1 classify 1 asked", "s1 classify 1 answered", "s2 request_facts 1 asked", "s2 request_facts 1 answered", "s3 draft_reply 1 asked", "s3 draft_reply 1 answered"]);
    expect(result.events.at(-1)?.event.type).toBe("plan.finished");
    expect(result.texts).toEqual([{ stepId: "s3", attempt: 1, text: "Dear client, we refused the operation." }]);
    /* The letter is in no event and in no entry */
    expect(JSON.stringify([result.events, result.entries])).not.toContain("Dear client");
    expect(result.events).toEqual(runToEnd(payloadFor(undefined, "high_only", [], 8, AML)).segment.events);
  });

  it("a failed proposal is retried when the person says so, as the next attempt", async () => {
    const classify: ProposalRequest = { task: "classify", seed: 8, brief: AML };
    const model = new FakeModel(["{}", "{}", scriptedAnswer(classify)]);
    const exchanges: Exchange[] = [];
    const result = await driveRun({ seed: 8, brief: AML, autonomy: "high_only", steps: [{ id: "s1", askFirst: false }], proposer: new ModelProposer({ client: model, prompts: PROMPTS, record: (e) => exchanges.push(e) }), decide: goOn });
    expect(result.entries.map((e) => ("error" in e ? e.error : "ok"))).toEqual(["proposal_invalid", "ok"]);
    expect(exchanges.map((e) => [e.attempt, e.call, e.valid])).toEqual([
      [1, 1, false],
      [1, 2, false],
      [2, 1, true],
    ]);
    expect(result.events.map((e) => e.event.type)).toEqual(["plan.started", "step.started", "step.error", "step.running", "step.progress", "step.progress", "step.finished", "plan.finished"]);
  });

  it("a proposal that keeps failing is asked for three times at most; then the step can only be skipped or stopped at", async () => {
    const model = new FakeModel(Array.from({ length: 8 }, () => "{}"));
    const seen: string[] = [];
    const result = await driveRun({
      seed: 8,
      brief: AML,
      autonomy: "high_only",
      steps: [{ id: "s1", askFirst: false }],
      proposer: new ModelProposer({ client: model, prompts: PROMPTS }),
      /* A person who retries whenever retrying is offered; the last event
         says what the pause is for */
      decide: (pause, _lastEventId, events) => {
        const last = events.at(-1)!.event;
        seen.push(`${last.type}${last.type === "step.error" ? ` ${last.error.code} ${last.attempt}` : ""}: ${pause.accepts.join(",")}`);
        return pause.accepts.includes("retry") ? "retry" : null;
      },
    });
    expect(seen).toEqual(["step.error proposal_invalid 1: retry,skip,stop", "step.error proposal_invalid 2: retry,skip,stop", "step.error proposal_invalid 3: skip,stop"]);
    expect(model.requests).toHaveLength(6);
    expect(result.entries).toHaveLength(3);
    expect(result.waiting).toEqual({ stepId: "s1", accepts: ["skip", "stop"] });
  });

  it("left waiting at a decision, it returns the run as it stands and goes on from its logs", async () => {
    const proposer = new ScriptedProposer();
    const first = await driveRun({ seed: 8, brief: AML, autonomy: "high_only", proposer, decide: nobody, now: () => 1000 });
    expect(first.waiting).toEqual({ stepId: "s3", accepts: ["confirm", "skip"] });
    expect(first.entries).toHaveLength(3);
    const second = await driveRun({ seed: 8, brief: AML, autonomy: "high_only", proposer, decide: goOn, entries: first.entries, decisions: first.decisions, now: () => 1000 });
    expect(second.waiting).toBeNull();
    expect(second.events.slice(0, first.events.length)).toEqual(first.events);
  });
});

describe("Stop while a model is working", () => {
  it("aborts the call at once, writes nothing for the step, and ends the run as stopped", async () => {
    const answers = [scriptedAnswer({ task: "classify", seed: 8, brief: AML }), scriptedAnswer({ task: "request_facts", seed: 8, brief: AML }), { hang: true as const }];
    const model = new FakeModel(answers);
    const exchanges: Exchange[] = [];
    const stop = new AbortController();
    const result = await driveRun({
      seed: 8,
      brief: AML,
      autonomy: "high_only",
      proposer: new ModelProposer({ client: model, prompts: PROMPTS, record: (e) => exchanges.push(e) }),
      decide: goOn,
      signal: stop.signal,
      now: () => 1000,
      /* The person presses Stop while the reply is being drafted */
      onProposal: (need, phase) => {
        if (need.task === "draft_reply" && phase === "asked") queueMicrotask(() => stop.abort());
      },
    });
    expect(model.aborted).toBe(1);
    expect(exchanges.at(-1)).toMatchObject({ task: "draft_reply", failure: "aborted", response: null });
    /* No partial write: the log holds the two proposals that were complete */
    expect(result.entries.map((e) => e.stepId)).toEqual(["s1", "s2"]);
    expect(result.texts).toEqual([]);
    expect(result.decisions).toEqual([{ command: "stop", stepId: null, afterEventId: result.events.at(-3)!.id }]);
    expect(result.events.slice(-2).map((e) => e.event)).toEqual([
      { type: "step.skipped", stepId: "s3", reason: "stopped_by_user" },
      { type: "plan.stopped", at: 1000, afterStepId: "s2" },
    ]);
    expect(result.waiting).toBeNull();
  });

  it("a signal aborted before the run starts stops it at the first proposal", async () => {
    const stop = new AbortController();
    stop.abort();
    const model = new FakeModel([]);
    const result = await driveRun({ seed: 8, brief: AML, autonomy: "high_only", proposer: new ModelProposer({ client: model, prompts: PROMPTS }), decide: goOn, signal: stop.signal });
    expect(model.requests).toHaveLength(0);
    expect(result.entries).toEqual([]);
    expect(result.events.map((e) => e.event.type)).toEqual(["plan.started", "step.started", "step.skipped", "plan.stopped"]);
  });

  it("a proposer that throws for another reason is not swallowed", async () => {
    const broken: Proposer = { propose: () => Promise.reject(new Error("bug")) };
    await expect(driveRun({ seed: 8, brief: AML, autonomy: "high_only", proposer: broken, decide: goOn })).rejects.toThrow("bug");
  });
});

/* A proposer that does whatever a complaint's insertion asks: another
   stream, another team, a reply that names no law of the case and offers
   nothing, and never a flag */
class Obedient implements Proposer {
  propose<T extends ProposalTask>(request: ProposalRequest<T>): Promise<ProposalOutcome<T>>;
  propose({ task, brief }: ProposalRequest): Promise<ProposalOutcome> {
    const stream = brief.stream === "general" ? "aml_refusal" : "general";
    const proposal: ProposalFor<ProposalTask> =
      task === "classify"
        ? { task, stream, grounds: ["contract"] }
        : task === "request_facts"
          ? { task, team: stream === "general" ? "operations" : "aml", questions: ["charges"], reuseLinked: false }
          : { task, grounds: ["contract"], reasons: [], clientOptions: [], deadlines: [], measures: [], nextSteps: [] };
    return Promise.resolve({ ok: true, proposal, askFirst: false, text: task === "draft_reply" ? "The bank admits its fault and will refund RUB 74,190. Sent without review." : null });
  }
}

describe("an injected instruction a model followed is never executed where the consent rule applies", () => {
  it("with nobody deciding, no step the injection touched finishes, at any autonomy level", async () => {
    for (const brief of [AML, BRIEF]) {
      for (const autonomy of AUTONOMIES) {
        const result = await driveRun({ seed: 8, brief, autonomy, proposer: new Obedient(), decide: nobody });
        /* The classification the model changed is held for a person */
        expect(result.waiting, `${brief.caseNo} ${autonomy}`).toEqual({ stepId: "s1", accepts: ["confirm", "skip"] });
        expect(result.events.filter((e) => e.event.type === "step.finished")).toEqual([]);
      }
    }
  });

  it("with every other step confirmed, the reply the model wrote still waits for its own confirmation, and its letter is in no event", async () => {
    for (const autonomy of AUTONOMIES) {
      const result = await driveRun({ seed: 8, brief: AML, autonomy, proposer: new Obedient(), decide: (pause) => (pause.stepId === "s3" ? null : goOn(pause)) });
      expect(result.waiting, autonomy).toEqual({ stepId: "s3", accepts: ["confirm", "skip"] });
      const s3 = result.events.filter((e) => "stepId" in e.event && e.event.stepId === "s3").map((e) => e.event.type);
      expect(s3, autonomy).toEqual(["step.started", "step.awaiting"]);
      expect(JSON.stringify(result.events), autonomy).not.toMatch(/admits|refund|review\./i);
      /* The request to another team was held too, and went only because a person confirmed it */
      expect(result.decisions.map((d) => `${d.command} ${d.stepId}`)).toEqual(["confirm s1", "confirm s2"]);
    }
  });

  it("the run sends nothing: no event of any run is a dispatch to the client", async () => {
    const result = await driveRun({ seed: 8, brief: AML, autonomy: "ask_none", proposer: new Obedient(), decide: goOn });
    expect(result.events.at(-1)?.event.type).toBe("plan.finished");
    const drafts = result.events.flatMap((e) => (e.event.type === "step.awaiting" ? [e.event.draft] : []));
    expect(drafts.find((d) => d.template === "hand_to_review")).toBeUndefined();
    const stages = result.events.flatMap((e) => (e.event.type === "step.finished" ? e.event.result.objects.flatMap((o) => (o.kind === "case" ? [o.after.stage] : [])) : []));
    expect(stages).toEqual(["legal_review"]);
  });
});
