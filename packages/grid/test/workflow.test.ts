import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generator.js";
import { applyRemoteEdit, planColleagueEdit } from "../src/colleague.js";
import { EditHistory, selfActor } from "../src/history.js";
import { CORPUS_CHUNK, CORPUS_ROWS, DEFAULT_SEED, Extension, Outcome, STAGE_COUNT, Stage } from "../src/schema.js";
import { AS_OF_DAY, isAnswered } from "../src/store.js";
import { workingDaysFrom } from "../src/legal.js";
import {
  ACTIONS,
  TRANSITIONS,
  applyTransition,
  deskNow,
  caseJournal,
  checkTransition,
  generatedJournal,
  transitionBetween,
  transitionsFor,
  wasReturned,
} from "../src/workflow.js";
import { storeDigest } from "./digest.js";

/*
  The stages as explicit states: the transition table, who may take each
  transition, and the journal of every case, worked out for the generated
  rows and kept for every change made in the page.
*/

const NOW = Date.UTC(2026, 9, 6, 9);
const fresh = () => generateAll(DEFAULT_SEED, CORPUS_ROWS, CORPUS_CHUNK);
const store = fresh();
const rows = (pred: (i: number) => boolean) => Array.from({ length: store.size }, (_, i) => i).filter(pred);
const ctx = (stage: number, outcome: number = Outcome.Pending, ground = 0) => ({ stage, outcome, ground });

describe("the transition table", () => {
  it("names the owner's stages, each reachable, and only by a transition", () => {
    const reached = new Set(TRANSITIONS.map((t) => t.to));
    for (let s = Stage.WaitingForFacts; s < STAGE_COUNT; s++) expect(reached.has(s), `stage ${s}`).toBe(true);
    for (const t of TRANSITIONS) {
      expect(ACTIONS).toContain(t.action);
      expect(t.from).not.toContain(t.to);
      expect(t.roles.length).toBeGreaterThan(0);
    }
    /* No pair of stages has two transitions */
    const pairs = TRANSITIONS.flatMap((t) => t.from.map((f) => `${f}>${t.to}`));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("each role takes its own: the operator drafts and hands over, the reviewer approves or returns, the signatory sends or returns, the supervisor closes", () => {
    const actions = (stage: number, role: Parameters<typeof transitionsFor>[1]) => transitionsFor(stage, role).map((t) => t.action);
    expect(actions(Stage.Registered, "operator")).toEqual(["request_facts", "start_drafting", "hand_over"]);
    expect(actions(Stage.Drafting, "operator")).toEqual(["request_facts", "hand_over"]);
    expect(actions(Stage.LegalReview, "operator")).toEqual([]);
    expect(actions(Stage.LegalReview, "reviewer")).toEqual(["approve", "return"]);
    expect(actions(Stage.AwaitingSignature, "signatory")).toEqual(["return", "send"]);
    expect(actions(Stage.AwaitingSignature, "reviewer")).toEqual([]);
    expect(actions(Stage.Sent, "supervisor")).toEqual(["close"]);
    expect(actions(Stage.Drafting, "supervisor")).toEqual([]);
    expect(actions(Stage.Closed, "supervisor")).toEqual([]);
  });

  it("refuses with codes: no such transition, another role's, a return without a reason, a reply undecided or a refusal without its ground", () => {
    expect(checkTransition(ctx(Stage.Closed), "close", "supervisor")).toEqual({ code: "transition-not-allowed" });
    expect(checkTransition(ctx(Stage.Drafting), "hand_over", "reviewer")).toEqual({ code: "stage-not-for-role" });
    expect(checkTransition(ctx(Stage.Drafting), "hand_over", "operator")).toBeNull();
    expect(checkTransition(ctx(Stage.LegalReview), "return", "reviewer")).toEqual({ code: "reason-required" });
    expect(checkTransition(ctx(Stage.LegalReview), "return", "reviewer", { reason: "ground_wrong" })).toBeNull();
    expect(checkTransition(ctx(Stage.LegalReview), "return", "reviewer", { reason: "other", comment: "short" })).toEqual({ code: "comment-required", min: 10 });
    expect(checkTransition(ctx(Stage.LegalReview), "return", "reviewer", { reason: "other", comment: "The ground is the wrong part." })).toBeNull();
    expect(checkTransition(ctx(Stage.LegalReview), "return", "reviewer", { reason: "wording", comment: "x".repeat(501) })).toEqual({
      code: "comment-too-long",
      max: 500,
      length: 501,
    });
    expect(checkTransition(ctx(Stage.LegalReview), "approve", "reviewer")).toEqual({ code: "reply-needs-outcome" });
    expect(checkTransition(ctx(Stage.LegalReview, Outcome.Refused), "approve", "reviewer")).toEqual({ code: "refusal-needs-ground" });
    expect(checkTransition(ctx(Stage.LegalReview, Outcome.Refused, 1), "approve", "reviewer")).toBeNull();
    expect(checkTransition(ctx(Stage.AwaitingSignature, Outcome.Upheld), "return", "signatory", { reason: "deadline_wrong" })).toBeNull();
    expect(transitionBetween(Stage.LegalReview, Stage.Drafting)?.action).toBe("return");
  });
});

describe("the journal of a generated case", () => {
  const all = rows(() => true);

  it("ends at the case's stage, by transitions of the table, in time order, never after the day the data is taken", () => {
    for (const i of all) {
      const journal = caseJournal(store, i);
      expect(journal[0]?.action, `row ${i}`).toBe("register");
      let stage: number = Stage.Registered;
      let at = 0;
      for (const e of journal) {
        expect(e.at, `row ${i}`).toBeGreaterThan(at);
        at = e.at;
        expect(e.from, `row ${i} ${e.action}`).toBe(stage);
        if (e.action !== "register" && e.from !== e.to) {
          const t = transitionBetween(e.from, e.to);
          expect(t?.action, `row ${i}`).toBe(e.action);
          if (e.actor.kind === "person") expect(t?.roles, `row ${i}`).toContain(e.actor.role);
        }
        if (e.action === "return") expect(e.reason, `row ${i}`).toBeTruthy();
        stage = e.to;
      }
      expect(stage, `row ${i}`).toBe(store.stage[i]);
      expect(Math.floor((at + 3 * 3_600_000) / 86_400_000), `row ${i}`).toBeLessThanOrEqual(AS_OF_DAY);
    }
  });

  it("names the people of the case: its operator, its signatory; the reply goes out on the day the register says", () => {
    for (const i of all.filter((r) => isAnswered(store, r)).slice(0, 200)) {
      const journal = caseJournal(store, i);
      const send = journal.find((e) => e.action === "send")!;
      expect(Math.floor((send.at + 3 * 3_600_000) / 86_400_000)).toBe(store.sentOn[i]);
      expect(send.actor).toEqual({ kind: "person", role: "signatory", person: store.signatory[i] });
      for (const e of journal.filter((x) => x.action === "hand_over")) expect(e.actor).toEqual({ kind: "person", role: "operator", person: store.assignee[i] });
    }
  });

  it("the first action comes within two working days of registration; returns for rework are a minority; extensions are journaled", () => {
    const acted = all.filter((i) => store.stage[i]! > Stage.Registered);
    for (const i of acted) {
      const journal = caseJournal(store, i);
      const first = journal[1]!;
      const day = Math.floor((first.at + 3 * 3_600_000) / 86_400_000);
      expect(workingDaysFrom(store.registered[i]!, day), `row ${i}`).toBeLessThanOrEqual(2);
    }
    const returned = acted.filter((i) => caseJournal(store, i).some((e) => e.action === "return"));
    expect(returned.length).toBeGreaterThan(20);
    expect(returned.length / acted.length).toBeLessThan(0.25);
    expect(all.filter((i) => store.stage[i] === Stage.Drafting && wasReturned(store, i)).length).toBeGreaterThan(0);
    for (const i of all.filter((r) => store.extension[r] === Extension.Extended)) {
      expect(caseJournal(store, i).some((e) => e.action === "extend" && e.actor.kind === "person" && e.actor.role === "supervisor"), `row ${i}`).toBe(true);
    }
  });

  it("is the same every time it is worked out, and does not touch the store", () => {
    const before = storeDigest(store);
    for (const i of [0, 500, 1199]) expect(generatedJournal(store, i)).toEqual(generatedJournal(store, i));
    expect(storeDigest(store)).toBe(before);
    expect([store.journal.size, store.origin.size]).toEqual([0, 0]);
  });
});

describe("changes in the page", () => {
  it("an edit of the stage is a transition in the journal, after the frozen history; its undo is journaled too", () => {
    const s = fresh();
    const row = Array.from({ length: s.size }, (_, i) => i).find((i) => s.stage[i] === Stage.Drafting && !wasReturned(s, i))!;
    const history = generatedJournal(s, row);
    const edits = new EditHistory();
    const r = edits.setField(s, [row], "stage", Stage.LegalReview, "operator", NOW);
    expect(r.applied.length).toBe(1);
    const journal = caseJournal(s, row);
    expect(journal.slice(0, history.length)).toEqual(history);
    expect(journal.at(-1)).toEqual({ at: NOW, action: "hand_over", from: Stage.Drafting, to: Stage.LegalReview, actor: { kind: "person", role: "operator", person: 0 } });
    edits.undo(s, { now: NOW + 1000 });
    expect(s.stage[row]).toBe(Stage.Drafting);
    expect(caseJournal(s, row).at(-1)).toMatchObject({ action: "undo", from: Stage.LegalReview, to: Stage.Drafting, at: NOW + 1000 });
  });

  it("a transition taken from the case moves the stage and journals who, when and why; a refused one changes nothing", () => {
    const s = fresh();
    const row = Array.from({ length: s.size }, (_, i) => i).find((i) => s.stage[i] === Stage.LegalReview)!;
    const before = storeDigest(s);
    expect(applyTransition(s, row, "return", { role: "reviewer", actor: selfActor("reviewer"), at: NOW })).toEqual({ error: { code: "reason-required" } });
    expect(applyTransition(s, row, "approve", { role: "operator", actor: selfActor("operator"), at: NOW })).toEqual({ error: { code: "stage-not-for-role" } });
    expect(storeDigest(s)).toBe(before);
    expect([s.journal.has(row), s.origin.has(row)]).toEqual([false, false]);
    const r = applyTransition(s, row, "return", { role: "reviewer", actor: selfActor("reviewer"), at: NOW, reason: "ground_wrong", comment: "  Part 3.4, not 3.10.  " });
    expect(r).toEqual({
      entry: { at: NOW, action: "return", from: Stage.LegalReview, to: Stage.Drafting, actor: { kind: "person", role: "reviewer", person: 0 }, reason: "ground_wrong", comment: "Part 3.4, not 3.10." },
    });
    expect(s.stage[row]).toBe(Stage.Drafting);
    expect(wasReturned(s, row)).toBe(true);
    const assisted = applyTransition(s, row, "hand_over", { role: "operator", actor: { kind: "assistant", confirmedBy: { role: "operator", person: 0 } }, at: NOW + 1 });
    expect("entry" in assisted && assisted.entry.actor.kind).toBe("assistant");
    expect(s.stage[row]).toBe(Stage.LegalReview);
    expect(wasReturned(s, row)).toBe(false);
  });

  it("a supervisor's extension is journaled, without a stage change", () => {
    const s = fresh();
    const row = Array.from({ length: s.size }, (_, i) => i).find(
      (i) => s.stage[i]! < Stage.Sent && s.extension[i] === Extension.None && (s.rules[i]! & 1) !== 0 && s.extNotice[i]! >= AS_OF_DAY,
    )!;
    new EditHistory().setField(s, [row], "extension", Extension.Extended, "supervisor", NOW);
    expect(caseJournal(s, row).at(-1)).toMatchObject({ action: "extend", from: s.stage[row], to: s.stage[row], actor: { role: "supervisor" } });
  });

  it("the colleague moves a case on by a transition and says so in the journal; an undecided reply under review gets a note instead", () => {
    const s = fresh();
    const all = Array.from({ length: s.size }, (_, i) => i);
    const drafting = all.filter((i) => s.stage[i] === Stage.Drafting);
    const edit = planColleagueEdit(s, Uint32Array.from(drafting), 0, null)!;
    expect(edit.cell).toEqual({ col: "stage", value: Stage.LegalReview });
    applyRemoteEdit(s, edit, NOW);
    expect(caseJournal(s, edit.row).at(-1)).toEqual({ at: NOW, action: "hand_over", from: Stage.Drafting, to: Stage.LegalReview, actor: { kind: "colleague" } });
    const review = all.find((i) => s.stage[i] === Stage.LegalReview && i !== edit.row)!;
    s.outcome[review] = Outcome.Pending;
    expect(planColleagueEdit(s, Uint32Array.of(review), 0, null)?.cell.col).toBe("note");
  });

  it("what a person does in the page happens on the day the data is taken, at the time of day in Moscow, after the case's last entry", () => {
    expect(deskNow(Date.UTC(2026, 9, 7, 9, 30))).toBe(Date.UTC(2026, 9, 6, 9, 30));
    expect(deskNow(Date.UTC(2026, 11, 31, 22, 15))).toBe(Date.UTC(2026, 9, 5, 22, 15));
    const s = fresh();
    const row = Array.from({ length: s.size }, (_, i) => i).find((i) => s.stage[i] === Stage.Registered)!;
    const last = caseJournal(s, row).at(-1)!.at;
    const r = applyTransition(s, row, "start_drafting", { role: "operator", actor: selfActor("operator"), at: last - 3_600_000 });
    expect("entry" in r).toBe(true);
    expect(caseJournal(s, row).at(-1)!.at).toBe(last + 60_000);
  });

  it("a row loaded again drops its page journal", async () => {
    const { applyChunk, generateChunk } = await import("../src/index.js");
    const s = fresh();
    new EditHistory().setField(s, [5], "assignee", 3, "supervisor", NOW);
    expect(s.origin.has(5)).toBe(true);
    applyChunk(s, generateChunk(DEFAULT_SEED, 0, CORPUS_CHUNK, CORPUS_ROWS));
    expect(s.origin.has(5)).toBe(false);
  });
});
