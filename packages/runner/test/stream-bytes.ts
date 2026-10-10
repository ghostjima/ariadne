/*
  The run of a seed and a case as bytes: the plan, the scenario and every
  item a transport would be given (events with their ids, the delays between
  them at normal speed, the pauses), over every autonomy, two sets of
  "ask first" flags, four ways of answering the pauses and every segment of
  each session, then a stop at every point of the run. One JSON value a
  line. The digest of those bytes is what test/fixtures/stream-v5.json
  holds for each seed and case, taken on the engine before a proposer
  existed; proposer.test.ts compares the engine with them.

  The fixtures were taken in protocol version 5. A version that leaves a
  scripted run as it was (version 6 added a ground a brief may name, the
  refusal to forward an application; version 7 a model that may propose
  for a run, which the script's run has no part in) changes one thing in
  these bytes: the number plan.started repeats. The run is asked in the current version,
  and that number is written as the fixtures' before the bytes are
  compared, so the comparison still says the rest is what it was.
*/

import { createHash } from "node:crypto";
import {
  AUTONOMIES,
  PROTOCOL_VERSION,
  createAgentHandler,
  encodeDecisions,
  encodePlanPayload,
  generatePlan,
  generateScenario,
  resolvePlan,
  runPlan,
  type CaseBrief,
  type Command,
  type Decision,
  type PlanPayload,
  type PlanStep,
  type RunItem,
  type Scenario,
} from "../src/index.js";
import { AML, BRIEF, CAPPED, PLAIN, REMOVAL } from "./briefs.js";

/* The protocol version the fixtures were taken in */
export const FIXTURE_PROTOCOL = 5;

/* An item of a run with the version plan.started repeats written as the
   fixtures' */
function asInFixtures(item: RunItem): RunItem {
  return item.kind === "event" && item.event.type === "plan.started" ? { ...item, event: { ...item.event, protocol: FIXTURE_PROTOCOL } } : item;
}

/* The seeds and the cases of the engine's test set (vocabulary.test.ts
   runs seeds 1 to 40 over these five cases) */
export const SEEDS: readonly number[] = Array.from({ length: 40 }, (_, i) => i + 1);
export const CASES: readonly (readonly [string, CaseBrief])[] = [
  ["BRIEF", BRIEF],
  ["PLAIN", PLAIN],
  ["AML", AML],
  ["REMOVAL", REMOVAL],
  ["CAPPED", CAPPED],
];

const PREFERENCES: readonly (readonly Command[])[] = [
  ["confirm", "allow", "retry"],
  ["confirm", "deny", "skip"],
  ["skip", "deny"],
  ["stop"],
];
const ASK_FIRST: readonly (readonly string[])[] = [[], ["s1", "s2", "s5"]];

/* How the engine is asked for a scenario, a plan and the steps of a
   payload: the engine's own functions, or the same with a proposer given */
export type Engine = {
  scenario(seed: number, brief: CaseBrief): Scenario;
  plan(seed: number, brief: CaseBrief): PlanStep[];
  resolve(payload: PlanPayload): ReturnType<typeof resolvePlan>;
};

export const ENGINE: Engine = {
  scenario: (seed, brief) => generateScenario(seed, brief),
  plan: (seed, brief) => generatePlan(seed, brief),
  resolve: (payload) => resolvePlan(payload),
};

function items(engine: Engine, payload: PlanPayload, decisions: readonly Decision[]): RunItem[] {
  const plan = engine.resolve(payload);
  if (!plan.ok) throw new Error(plan.error);
  return [
    ...runPlan({
      steps: plan.steps,
      autonomy: plan.autonomy,
      decisions,
      undoWindowSec: null,
      timeScale: 1,
      now: () => 1000,
    }),
  ].map(asInFixtures);
}

/* Every line of the run of one seed and one case */
export function streamLines(seed: number, brief: CaseBrief, engine: Engine = ENGINE): string[] {
  const lines: string[] = [];
  const push = (value: unknown) => lines.push(JSON.stringify(value));
  push(engine.scenario(seed, brief));
  const plan = engine.plan(seed, brief);
  push(plan);
  for (const autonomy of AUTONOMIES) {
    for (const askFirst of ASK_FIRST) {
      const payload: PlanPayload = {
        v: PROTOCOL_VERSION,
        seed,
        autonomy,
        brief,
        steps: plan.map((s) => ({ id: s.id, askFirst: askFirst.includes(s.id) })),
      };
      for (const prefer of PREFERENCES) {
        /* A session: a segment, the decision its pause takes, the next */
        const log: Decision[] = [];
        for (let guard = 0; guard < 60; guard++) {
          const segment = items(engine, payload, log);
          push([autonomy, askFirst, prefer, log, segment]);
          const pause = segment.find((i) => i.kind === "pause");
          if (!pause || pause.kind !== "pause") break;
          const command = prefer.find((c) => pause.accepts.includes(c)) ?? pause.accepts[0]!;
          const last = segment.reduce((id, i) => (i.kind === "event" ? i.id : id), 0);
          log.push({ command, stepId: command === "stop" ? null : pause.stepId, afterEventId: last });
        }
      }
    }
  }
  /* A stop placed after every event of the run that asks for the least */
  const payload: PlanPayload = {
    v: PROTOCOL_VERSION,
    seed,
    autonomy: "ask_none",
    brief,
    steps: plan.map((s) => ({ id: s.id, askFirst: false })),
  };
  for (let after = 0; after <= 40; after++) {
    push([after, items(engine, payload, [{ command: "stop", stepId: null, afterEventId: after }])]);
  }
  return lines;
}

export function digestOf(lines: readonly string[]): string {
  const hash = createHash("sha256");
  for (const line of lines) hash.update(line).update("\n");
  return hash.digest("hex");
}

/* The digest of every seed and case, keyed "<seed>/<case>" */
export function streamDigests(engine: Engine = ENGINE): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seed of SEEDS) {
    for (const [name, brief] of CASES) out[`${seed}/${name}`] = digestOf(streamLines(seed, brief, engine));
  }
  return out;
}

/* The complete run of a seed and a case as the Service Worker handler
   streams it: every pause answered with confirm, allow or retry, then one
   request with the whole decision log */
export async function completeRunStream(seed: number, brief: CaseBrief, engine: Engine = ENGINE): Promise<string> {
  const payload: PlanPayload = {
    v: PROTOCOL_VERSION,
    seed,
    autonomy: "high_only",
    brief,
    steps: engine.plan(seed, brief).map((s) => ({ id: s.id, askFirst: false })),
  };
  const log: Decision[] = [];
  for (let guard = 0; guard < 60; guard++) {
    const segment = items(engine, payload, log);
    const pause = segment.find((i) => i.kind === "pause");
    if (!pause || pause.kind !== "pause") break;
    const command = (["confirm", "allow", "retry"] as const).find((c) => pause.accepts.includes(c))!;
    const last = segment.reduce((id, i) => (i.kind === "event" ? i.id : id), 0);
    log.push({ command, stepId: pause.stepId, afterEventId: last });
  }
  const handler = createAgentHandler({ sleep: async () => {}, now: () => 1000 });
  const url = `https://app.test/api/agent?plan=${encodePlanPayload(payload)}&decisions=${encodeDecisions(log)}`;
  const text = await handler(new Request(url))!.text();
  /* plan.started, once, with the current version: written as the
     fixtures' */
  return text.replace(`"type":"plan.started","at":1000,"total":${payload.steps.length},"protocol":${PROTOCOL_VERSION}}`, (line) =>
    line.replace(`"protocol":${PROTOCOL_VERSION}}`, `"protocol":${FIXTURE_PROTOCOL}}`),
  );
}
