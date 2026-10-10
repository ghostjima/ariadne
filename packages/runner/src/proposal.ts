/*
  Proposals from outside the engine: the closed schema of each, and the
  validation that turns an answer into a proposal or into a list of issues.

  A model answers a task with JSON. The schema of that JSON is generated
  here from the engine's code lists, so the lists are named once: the same
  schema constrains a model's output and is what the answer is checked
  against. An answer is never taken as it stands: validation rebuilds the
  proposal field by field, keeps only the fields the engine knows, and
  takes a string only when it is a code of its own list or an ISO date.
  The one piece of free text an answer carries, the reply's letter, is
  returned beside the proposal and never inside it: the engine does not
  read it, and no event carries it.

  The schemas use a small part of JSON Schema (object with fixed
  properties, array of a closed list, enum, boolean, string with a
  pattern): the part a grammar-constrained decoder supports. What a schema
  cannot say is checked after it: that list items differ, that a date
  exists, that a linked case can be reused only where the case has one.
*/

import {
  CLIENT_DEADLINE_KINDS,
  CLIENT_OPTIONS,
  FACT_QUESTIONS,
  GROUND_CODES,
  MEASURE_CODES,
  NEXT_STEPS,
  PROPOSAL_ERRORS,
  REASON_CODES,
  STREAMS,
  TEAMS,
  type ProposalError,
} from "./codes.js";
import { PROPOSAL_TASKS, type Proposal, type ProposalFor, type ProposalTask } from "./proposer.js";
import type { CaseBrief } from "./scenario.js";

/* The part of JSON Schema the proposals use */
export type JsonSchema =
  | { type: "object"; additionalProperties: false; required: string[]; properties: Record<string, JsonSchema> }
  | { type: "array"; items: JsonSchema; minItems: number; maxItems: number; uniqueItems: true }
  | { type: "string"; enum: readonly string[] }
  | { type: "string"; pattern: string }
  | { type: "string"; minLength: number }
  | { type: "boolean" };

/* The longest letter a reply proposal may carry, in characters. Checked
   after the schema: a length bound of this size is not something to hand
   a grammar. */
export const MAX_REPLY_CHARS = 6000;
/* The most grounds a classification or a reply names */
export const MAX_GROUNDS = 4;

const ISO_DATE = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";

const codes = (list: readonly string[]): JsonSchema => ({ type: "string", enum: list });
const listOf = (list: readonly string[], min: number, max: number = list.length): JsonSchema => ({
  type: "array",
  items: codes(list),
  minItems: min,
  maxItems: max,
  uniqueItems: true,
});
const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

/* `askFirst` is the proposer's own flag that a person should look before
   the step runs. It can add a confirmation and never remove one. */
const ASK_FIRST: JsonSchema = { type: "boolean" };

const SCHEMAS: { [T in ProposalTask]: JsonSchema } = {
  classify: object({
    stream: codes(STREAMS),
    grounds: listOf(GROUND_CODES, 1, MAX_GROUNDS),
    askFirst: ASK_FIRST,
  }),
  request_facts: object({
    team: codes(TEAMS),
    questions: listOf(FACT_QUESTIONS, 1),
    reuseLinked: { type: "boolean" },
    askFirst: ASK_FIRST,
  }),
  draft_reply: object({
    /* The letter first: a model writes it, then says in codes what it
       states */
    text: { type: "string", minLength: 1 },
    grounds: listOf(GROUND_CODES, 0, MAX_GROUNDS),
    reasons: listOf(REASON_CODES, 0, 2),
    clientOptions: listOf(CLIENT_OPTIONS, 0),
    deadlines: {
      type: "array",
      items: object({ kind: codes(CLIENT_DEADLINE_KINDS), due: { type: "string", pattern: ISO_DATE } }),
      minItems: 0,
      maxItems: CLIENT_DEADLINE_KINDS.length,
      uniqueItems: true,
    },
    measures: listOf(MEASURE_CODES, 0),
    nextSteps: listOf(NEXT_STEPS, 0),
    askFirst: ASK_FIRST,
  }),
};

/* The schema of the answer to a task */
export function proposalSchema(task: ProposalTask): JsonSchema {
  return SCHEMAS[task];
}

/* What is wrong with an answer, as codes */
export const ISSUE_CODES = [
  "not_json",
  "not_an_object",
  "missing_field",
  "unknown_field",
  "wrong_type",
  "not_in_list",
  "duplicate",
  "too_few",
  "too_many",
  "too_long",
  "empty_text",
  "invalid_date",
  "no_linked_case",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/* One issue: where in the answer ("grounds[1]", "deadlines[0].due"; "" for
   the answer itself) and what */
export type ProposalIssue = { path: string; code: IssueCode };

function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/* Checks a value against a schema of the part above. Issues are appended;
   the walk goes on, so one answer reports everything wrong with it. */
function check(schema: JsonSchema, value: unknown, path: string, issues: ProposalIssue[]): void {
  const at = (code: IssueCode, where = path) => issues.push({ path: where, code });
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") at("wrong_type");
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return void at("wrong_type");
    if ("enum" in schema) {
      if (!schema.enum.includes(value)) at("not_in_list");
      return;
    }
    if ("pattern" in schema) {
      if (!new RegExp(schema.pattern).test(value) || !isRealDate(value)) at("invalid_date");
      return;
    }
    if (value.trim().length < schema.minLength) at("empty_text");
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return void at("wrong_type");
    if (value.length < schema.minItems) at("too_few");
    if (value.length > schema.maxItems) at("too_many");
    const seen = new Set<string>();
    value.forEach((item: unknown, i) => {
      const where = `${path}[${i}]`;
      check(schema.items, item, where, issues);
      /* Deadlines differ by kind; codes by themselves */
      const key = item !== null && typeof item === "object" ? JSON.stringify((item as { kind?: unknown }).kind) : JSON.stringify(item);
      if (seen.has(key)) at("duplicate", where);
      seen.add(key);
    });
    return;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void at(path === "" ? "not_an_object" : "wrong_type");
  const record = value as Record<string, unknown>;
  const child = (key: string) => (path === "" ? key : `${path}.${key}`);
  for (const key of schema.required) {
    if (!(key in record)) at("missing_field", child(key));
    else check(schema.properties[key]!, record[key], child(key), issues);
  }
  for (const key of Object.keys(record)) if (!(key in schema.properties)) at("unknown_field", child(key));
}

/* A validated answer: the proposal in codes, the proposer's own flag, and
   the letter of a reply, which is untrusted text and stays outside the
   proposal */
export type ValidProposal<T extends ProposalTask = ProposalTask> = {
  ok: true;
  proposal: ProposalFor<T>;
  askFirst: boolean;
  text: string | null;
};
export type ProposalCheck<T extends ProposalTask = ProposalTask> = ValidProposal<T> | { ok: false; issues: ProposalIssue[] };

/*
  Validates the answer to a task for a case. `value` is parsed JSON of any
  shape. The proposal returned is rebuilt from the engine's own fields, so
  nothing else of the answer travels with it.
*/
export function validateProposal<T extends ProposalTask>(task: T, value: unknown, brief: CaseBrief): ProposalCheck<T>;
export function validateProposal(task: ProposalTask, value: unknown, brief: CaseBrief): ProposalCheck {
  const issues: ProposalIssue[] = [];
  check(SCHEMAS[task], value, "", issues);
  const r = (issues.length === 0 ? value : {}) as Record<string, unknown>;
  /* The facts of a linked case can be asked for only where there is one */
  if (task === "request_facts" && r.reuseLinked === true && brief.linkedCase === null) issues.push({ path: "reuseLinked", code: "no_linked_case" });
  if (task === "draft_reply" && typeof r.text === "string" && r.text.length > MAX_REPLY_CHARS) issues.push({ path: "text", code: "too_long" });
  if (issues.length > 0) return { ok: false, issues };
  const askFirst = r.askFirst as boolean;
  switch (task) {
    case "classify":
      return {
        ok: true,
        askFirst,
        text: null,
        proposal: { task, stream: r.stream, grounds: [...(r.grounds as string[])] } as ProposalFor<"classify">,
      };
    case "request_facts":
      return {
        ok: true,
        askFirst,
        text: null,
        proposal: { task, team: r.team, questions: [...(r.questions as string[])], reuseLinked: r.reuseLinked } as ProposalFor<"request_facts">,
      };
    case "draft_reply":
      return {
        ok: true,
        askFirst,
        text: r.text as string,
        proposal: {
          task,
          grounds: [...(r.grounds as string[])],
          reasons: [...(r.reasons as string[])],
          clientOptions: [...(r.clientOptions as string[])],
          deadlines: (r.deadlines as { kind: string; due: string }[]).map((d) => ({ kind: d.kind, due: d.due })),
          measures: [...(r.measures as string[])],
          nextSteps: [...(r.nextSteps as string[])],
        } as ProposalFor<"draft_reply">,
      };
  }
}

/* Reads a model's answer: the text must be one JSON value and nothing
   else. A fenced block, a sentence before it or a cut-off object is
   not_json. */
export function parseAnswer<T extends ProposalTask>(task: T, content: string, brief: CaseBrief): ProposalCheck<T> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { ok: false, issues: [{ path: "", code: "not_json" }] };
  }
  return validateProposal(task, value, brief);
}

/* The answer a proposal would have been: what a recorded or a scripted
   proposal looks like as the JSON of its task. `text` is the letter of a
   reply. */
export function answerOf(proposal: Proposal, askFirst: boolean, text: string | null = null): Record<string, unknown> {
  const { task, ...fields } = proposal;
  return task === "draft_reply" ? { text: text ?? "", ...fields, askFirst } : { ...fields, askFirst };
}

/*
  One entry of a run's proposal log: what a step was proposed on an
  attempt, or that the attempt failed. The engine replays a run from the
  plan, the decision log and this log; like the decision log, it is given
  whole with every request. Codes, numbers and dates only: a letter is not
  part of an entry.
*/
export type ProposalEntry =
  | { stepId: string; attempt: number; proposal: Proposal; askFirst: boolean }
  | { stepId: string; attempt: number; error: ProposalError };

/* Attempts a step's proposal may take: the first and two retries. After
   the last one a failed proposal can be skipped or stopped at, not asked
   for again: a model that fails the same way every time is not waited on
   for ever. */
export const MAX_PROPOSAL_ATTEMPTS = 3;

/*
  Reads a proposal log from untrusted JSON for a plan whose proposal steps
  are `tasks` (step id to task). Null when anything is off: an entry for a
  step that takes no proposal, an attempt out of order, an entry after the
  proposal that was accepted, a proposal that does not validate for the
  case.
*/
export function validateEntries(raw: unknown, tasks: ReadonlyMap<string, ProposalTask>, brief: CaseBrief): ProposalEntry[] | null {
  if (!Array.isArray(raw) || raw.length > tasks.size * MAX_PROPOSAL_ATTEMPTS) return null;
  const out: ProposalEntry[] = [];
  /* The next attempt each step may log; 0 once its proposal is in */
  const next = new Map<string, number>();
  for (const item of raw as unknown[]) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const e = item as Record<string, unknown>;
    if (typeof e.stepId !== "string") return null;
    const task = tasks.get(e.stepId);
    if (task === undefined) return null;
    const expected = next.get(e.stepId) ?? 1;
    if (expected === 0 || e.attempt !== expected || expected > MAX_PROPOSAL_ATTEMPTS) return null;
    if ("error" in e) {
      if (!(PROPOSAL_ERRORS as readonly unknown[]).includes(e.error) || "proposal" in e) return null;
      out.push({ stepId: e.stepId, attempt: expected, error: e.error as ProposalError });
      next.set(e.stepId, expected + 1);
      continue;
    }
    if (typeof e.askFirst !== "boolean" || e.proposal === null || typeof e.proposal !== "object") return null;
    const { task: named, ...fields } = e.proposal as Record<string, unknown>;
    if (named !== task) return null;
    /* A reply's entry has no letter, and one that carries a letter is
       refused; the schema asks for one, so the entry is checked with a
       placeholder that is dropped again */
    if ("text" in fields) return null;
    const answer = task === "draft_reply" ? { text: ".", ...fields, askFirst: e.askFirst } : { ...fields, askFirst: e.askFirst };
    const checked = validateProposal(task, answer, brief);
    if (!checked.ok) return null;
    out.push({ stepId: e.stepId, attempt: expected, proposal: checked.proposal, askFirst: checked.askFirst });
    next.set(e.stepId, 0);
  }
  return out;
}

export function isProposalTask(type: string): type is ProposalTask {
  return (PROPOSAL_TASKS as readonly string[]).includes(type);
}
