import { describe, expect, it } from "vitest";
import { AS_OF, Extension, GROUND_COUNT, Ground, NOTE_MAX, Outcome, Stage, Stream } from "../src/schema.js";
import { checkField, editContext, normalizeDraft, validateEdit, type RowContext } from "../src/edit.js";
import { generateAll } from "../src/generator.js";
import { dayNumber } from "../src/days.js";
import { RulesFlag } from "../src/store.js";

const asOf = dayNumber(AS_OF);
/* A 161-FZ case in drafting, extension still possible */
const draft: RowContext = {
  stage: Stage.Drafting,
  outcome: Outcome.Pending,
  ground: Ground.None,
  extension: Extension.None,
  stream: Stream.Antifraud,
  rules: RulesFlag.ExtensionAllowed,
  extNotice: asOf + 5,
};

describe("stage", () => {
  it("rejects values outside the enum", () => {
    const unknown = { code: "value-unknown" };
    for (const v of ["-1", "7", "не число", "1.5"]) expect(validateEdit("stage", v, draft, "supervisor")).toEqual(unknown);
  });

  it("a reply goes to legal review only once its outcome is decided", () => {
    expect(validateEdit("stage", String(Stage.LegalReview), draft, "operator")).toEqual({ code: "reply-needs-outcome" });
    expect(validateEdit("stage", String(Stage.LegalReview), { ...draft, outcome: Outcome.Upheld }, "operator")).toBeNull();
  });

  it("a refusal needs a legal ground before it goes on", () => {
    const refused = { ...draft, outcome: Outcome.Refused };
    expect(validateEdit("stage", String(Stage.LegalReview), refused, "operator")).toEqual({ code: "refusal-needs-ground" });
    expect(validateEdit("stage", String(Stage.LegalReview), { ...refused, ground: 1 }, "operator")).toBeNull();
    /* Back to an earlier stage is always allowed */
    expect(validateEdit("stage", String(Stage.WaitingForFacts), refused, "operator")).toBeNull();
  });

  it("only a signatory or a supervisor sends, and only a signed reply", () => {
    const ready = { ...draft, stage: Stage.AwaitingSignature, outcome: Outcome.Upheld };
    expect(validateEdit("stage", String(Stage.Sent), ready, "operator")).toEqual({ code: "stage-not-for-role" });
    expect(validateEdit("stage", String(Stage.Sent), ready, "signatory")).toBeNull();
    expect(validateEdit("stage", String(Stage.Sent), { ...ready, stage: Stage.LegalReview }, "supervisor")).toEqual({ code: "send-needs-signature" });
    expect(validateEdit("stage", String(Stage.Drafting), ready, "signatory")).toBeNull();
    expect(validateEdit("stage", String(Stage.LegalReview), ready, "signatory")).toEqual({ code: "stage-not-for-role" });
    expect(validateEdit("stage", String(ready.stage), ready, "signatory")).toBeNull();
  });
});

describe("outcome and ground", () => {
  it("a refusal needs a ground, and the ground cannot be cleared under a refusal", () => {
    expect(validateEdit("outcome", String(Outcome.Refused), draft, "operator")).toEqual({ code: "refusal-needs-ground" });
    expect(validateEdit("outcome", String(Outcome.Refused), { ...draft, ground: 1 }, "operator")).toBeNull();
    expect(validateEdit("ground", String(Ground.None), { ...draft, outcome: Outcome.Refused, ground: 1 }, "operator")).toEqual({
      code: "refusal-needs-ground",
    });
    expect(validateEdit("outcome", String(Outcome.Upheld), draft, "operator")).toBeNull();
  });

  it("the ground belongs to the case's stream: 161-FZ and 115-FZ are not mixed", () => {
    expect(validateEdit("ground", "1", draft, "operator")).toBeNull();
    expect(validateEdit("ground", "3", draft, "operator")).toEqual({ code: "ground-other-stream" });
    expect(validateEdit("ground", "3", { ...draft, stream: Stream.Aml }, "operator")).toBeNull();
    expect(validateEdit("ground", String(Ground.Contract), { ...draft, stream: Stream.General }, "operator")).toBeNull();
    expect(validateEdit("ground", String(GROUND_COUNT), draft, "operator")).toEqual({ code: "value-unknown" });
  });

  it("the reply is locked once it is with the signatory", () => {
    const signing = { ...draft, stage: Stage.AwaitingSignature, outcome: Outcome.Upheld };
    expect(validateEdit("outcome", String(Outcome.PartlyUpheld), signing, "supervisor")).toEqual({ code: "reply-locked" });
    expect(validateEdit("ground", String(Ground.Contract), signing, "supervisor")).toEqual({ code: "reply-locked" });
  });

  it("the signatory does not draft", () => {
    expect(validateEdit("outcome", String(Outcome.Upheld), draft, "signatory")).toEqual({ code: "role-cannot-edit", column: "outcome" });
  });
});

describe("extension", () => {
  it("is approved by the supervisor", () => {
    expect(validateEdit("extension", "1", draft, "supervisor")).toBeNull();
    expect(validateEdit("extension", "1", draft, "operator")).toEqual({ code: "role-cannot-edit", column: "extension" });
  });

  it("is refused where ariadne-rules refused it: a money claim under 123-FZ", () => {
    expect(validateEdit("extension", "1", { ...draft, stream: Stream.MoneyClaim, rules: RulesFlag.Ombudsman, extNotice: -1 }, "supervisor")).toEqual({
      code: "extension-not-allowed",
    });
  });

  it("is refused after the last day for its notice, and after the reply went out", () => {
    expect(validateEdit("extension", "1", { ...draft, extNotice: asOf - 1 }, "supervisor")).toEqual({
      code: "extension-too-late",
      lastDay: asOf - 1,
    });
    expect(validateEdit("extension", "1", { ...draft, extNotice: asOf }, "supervisor")).toBeNull();
    expect(validateEdit("extension", "1", { ...draft, stage: Stage.Sent }, "supervisor")).toEqual({ code: "extension-after-reply" });
    expect(validateEdit("extension", "0", { ...draft, rules: 0 }, "supervisor")).toBeNull();
  });
});

describe("note", () => {
  it("accepts text up to the limit and trims before measuring", () => {
    expect(validateEdit("note", "x".repeat(NOTE_MAX), draft, "operator")).toBeNull();
    expect(validateEdit("note", ` ${"x".repeat(NOTE_MAX)} `, draft, "operator")).toBeNull();
    expect(validateEdit("note", "x".repeat(NOTE_MAX + 1), draft, "signatory")).toEqual({
      code: "note-too-long",
      max: NOTE_MAX,
      length: NOTE_MAX + 1,
    });
  });

  it("normalizes only notes", () => {
    expect(normalizeDraft("note", "  текст  ")).toBe("текст");
    expect(normalizeDraft("stage", "3")).toBe("3");
  });
});

describe("edit context", () => {
  it("reads what the rules need from the store, ariadne-rules' answers included", () => {
    const store = generateAll(11, 400, 400);
    const claim = Array.from({ length: 400 }, (_, i) => i).find((i) => (store.rules[i]! & RulesFlag.Ombudsman) !== 0)!;
    const ctx = editContext(store, claim);
    expect(ctx).toMatchObject({ stage: store.stage[claim], stream: Stream.MoneyClaim, extNotice: -1 });
    expect(checkField("extension", Extension.Extended, ctx, "supervisor")?.code).toMatch(/^extension-/);
  });
});
