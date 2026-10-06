import { describe, expect, it } from "vitest";
import {
  applyDeviation,
  findConflicts,
  generatePlan,
  generateScenario,
  replyDraft,
  requiresConfirmation,
  RISK_BY_TYPE,
  taskOf,
  type Autonomy,
} from "../src/index.js";
import { AML, BRIEF, PLAIN } from "./briefs.js";

const AUTONOMIES: readonly Autonomy[] = ["ask_all", "high_only", "ask_none"];

describe("scenario generation", () => {
  it("is deterministic for a seed and a case, and different for another seed or case", () => {
    expect(generateScenario(7, BRIEF)).toEqual(generateScenario(7, BRIEF));
    const confidence = (seed: number, brief = BRIEF) =>
      generateScenario(seed, brief).steps.map((s) => [s.confidence, s.durationMs]);
    expect(confidence(9)).not.toEqual(confidence(7));
    expect(confidence(7, { ...BRIEF, caseNo: 868 })).not.toEqual(confidence(7));
  });

  it("plans the five steps of a reply, with risk derived from the action", () => {
    const scenario = generateScenario(7, BRIEF);
    expect(scenario.steps.map((s) => [s.id, s.type])).toEqual([
      ["s1", "classify"],
      ["s2", "request_facts"],
      ["s3", "draft_reply"],
      ["s4", "check_draft"],
      ["s5", "hand_to_review"],
    ]);
    for (const step of scenario.steps) {
      expect(step.risk).toBe(RISK_BY_TYPE[step.type]);
      expect(step.caseNo).toBe(867);
      expect(step.confidence).toBeGreaterThan(0.5);
      expect(step.confidence).toBeLessThanOrEqual(1);
      for (const object of step.objects) expect(object.caseNo).toBe(867);
    }
    expect(taskOf(BRIEF)).toEqual({ code: "answer_complaint", caseNo: 867 });
  });

  it("drafting the reply is high risk, so it asks at every autonomy level", () => {
    const draft = generatePlan(7, BRIEF).find((s) => s.type === "draft_reply")!;
    expect(draft.risk).toBe("high");
    for (const autonomy of AUTONOMIES) expect(requiresConfirmation(draft, autonomy)).toBe(true);
  });

  it("odd scenario numbers time the fact request out once; even ones do not", () => {
    for (const seed of [1, 7, 13]) {
      const scenario = generateScenario(seed, PLAIN);
      expect(scenario.errorStepId).toBe("s2");
      expect(scenario.steps[1]!.error).toEqual({
        code: "service_timeout",
        service: "fact_requests",
        timeoutSec: 5,
      });
    }
    for (const seed of [2, 8, 14]) {
      expect(generateScenario(seed, PLAIN).errorStepId).toBeNull();
      expect(generateScenario(seed, PLAIN).steps.every((s) => !s.error)).toBe(true);
    }
  });

  it("a case with a linked case asks to reuse its facts; one without does not", () => {
    expect(generateScenario(8, BRIEF).deviationStepId).toBe("s2");
    expect(generateScenario(8, BRIEF).steps[1]!.deviation).toEqual({
      reason: "facts_in_linked_case",
      linkedCase: 807,
      proposal: "reuse_linked_facts",
      newType: "reuse_facts",
      newRisk: "low",
    });
    expect(generateScenario(8, PLAIN).deviationStepId).toBeNull();
  });

  it("sends the fact request to the team of the stream, with its own deadline", () => {
    const request = (brief = BRIEF) => generatePlan(8, brief)[1]!;
    expect(request().draft).toEqual({
      kind: "request",
      template: "request_facts",
      caseNo: 867,
      team: "antifraud",
      questions: ["sign_detected", "client_confirmation", "database_match", "measure_status"],
      operation: "bank_transfer",
      opRef: 48_213_007,
      opOn: "2026-09-01",
      factsDue: "2026-10-08",
    });
    expect(request(AML).draft).toMatchObject({ team: "aml", questions: ["decision_basis", "documents_received", "measure_status"] });
    expect(request(PLAIN).draft).toMatchObject({ team: "operations" });
    expect(request().undoWindowSec).toBe(60);
    expect(request().undo).toEqual({ code: "recall_fact_request", caseNo: 867, team: "antifraud" });
  });

  it("drafts the reply from the case's facts: grounds, reasons, options, deadlines, next steps", () => {
    const draft = generatePlan(8, AML)[2]!.draft;
    expect(draft).toEqual(replyDraft(AML));
    expect(draft).toMatchObject({
      kind: "reply",
      caseNo: 431,
      repliedOn: "2026-10-06",
      outcome: "refused",
      grounds: ["aml_operation_refused"],
      reasons: ["aml_operation_refused"],
      clientOptions: ["submit_documents", "apply_to_commission"],
      deadlines: [{ kind: "aml_documents_answer", due: "2026-10-09" }],
      nextSteps: ["contact_bank", "apply_to_bank_of_russia"],
    });
    /* A stream without a reason gives none */
    expect(replyDraft(PLAIN).reasons).toEqual([]);
  });

  it("hands the case to review from its stage, and never sends the reply", () => {
    const review = generatePlan(8, PLAIN)[4]!;
    expect(review.draft).toEqual({
      kind: "change",
      template: "hand_to_review",
      caseNo: 1200,
      stageBefore: "registered",
      replyDue: "2026-10-12",
      sends: false,
    });
    expect(review.objects).toEqual([
      { kind: "case", caseNo: 1200, before: { stage: "registered" }, after: { stage: "legal_review" } },
    ]);
    expect(review.undo).toEqual({ code: "return_to_drafting", caseNo: 1200, stage: "registered" });
  });

  it("gives the fact request, which leaves the team, an undo window and internal steps none", () => {
    for (const step of generatePlan(8, BRIEF)) {
      if (step.type === "request_facts") expect(step.undoWindowSec).toBeGreaterThan(0);
      else expect(step.undoWindowSec).toBeNull();
    }
  });
});

describe("findConflicts", () => {
  const plan = generatePlan(8, BRIEF);
  const order = (...ids: string[]) => ids.map((id) => plan.find((s) => s.id === id)!);

  it("finds nothing in the proposed order", () => {
    expect(findConflicts(plan)).toEqual([]);
    expect(findConflicts([])).toEqual([]);
  });

  it("flags a draft before the facts, and a check or a review before the draft", () => {
    expect(findConflicts(order("s1", "s3", "s2", "s4", "s5"))).toEqual([
      { a: "s3", b: "s2", object: { kind: "fact_request", caseNo: 867 }, reason: "draft_before_facts" },
    ]);
    expect(findConflicts(order("s1", "s2", "s4", "s5", "s3"))).toEqual([
      { a: "s4", b: "s3", object: { kind: "reply_draft", caseNo: 867 }, reason: "check_before_draft" },
      { a: "s5", b: "s3", object: { kind: "reply_draft", caseNo: 867 }, reason: "review_before_draft" },
    ]);
  });

  it("goes quiet once one of the two steps is removed", () => {
    expect(findConflicts(order("s1", "s4", "s5"))).toEqual([]);
  });
});

describe("requiresConfirmation", () => {
  it("keeps the high-risk floor at every autonomy level", () => {
    for (const autonomy of AUTONOMIES) {
      expect(requiresConfirmation({ risk: "high", askFirst: false }, autonomy)).toBe(true);
    }
  });

  it("follows the level for lower risk", () => {
    expect(requiresConfirmation({ risk: "low", askFirst: false }, "ask_all")).toBe(true);
    expect(requiresConfirmation({ risk: "low", askFirst: false }, "high_only")).toBe(false);
    expect(requiresConfirmation({ risk: "medium", askFirst: true }, "high_only")).toBe(true);
    expect(requiresConfirmation({ risk: "medium", askFirst: true }, "ask_none")).toBe(false);
  });
});

describe("applyDeviation", () => {
  it("takes the linked case's facts instead of a request: lower risk, no window, no timeout", () => {
    const original = generatePlan(7, BRIEF).find((s) => s.deviation)!;
    expect(original.risk).toBe("medium");
    expect(original.error).toBeDefined();
    const deviated = applyDeviation(original);
    expect(deviated.risk).toBe("low");
    expect(deviated.type).toBe("reuse_facts");
    expect(deviated.undoWindowSec).toBeNull();
    expect(deviated.deviation).toBeUndefined();
    expect(deviated.error).toBeUndefined();
    expect(deviated.deviatedTo).toBe("reuse_linked_facts");
    expect(deviated.summary).toEqual({ code: "linked_facts_reused", caseNo: 867, linkedCase: 807 });
    expect(deviated.draft).toEqual({
      kind: "change",
      template: "reuse_linked_facts",
      caseNo: 867,
      linkedCase: 807,
      sendsRequest: false,
    });
  });

  it("leaves a step without a proposal untouched", () => {
    const plain = generatePlan(7, BRIEF).find((s) => !s.deviation)!;
    expect(applyDeviation(plain)).toBe(plain);
  });
});
