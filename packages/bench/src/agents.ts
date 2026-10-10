/*
  The agents of the bench: who proposes for a run.

  - scripted: the engine's own script, reading the case brief (the register
    and the rules engine), with the desk's letter. It is the oracle: its
    answers are the ground truth by construction, so its row shows what
    the scoring gives a perfect reader, and what the checks cost in time
    when no model is asked.
  - naive: always the general stream on the contract, always the
    operations team, and the same letter for everybody. The floor a model
    must beat to have read anything.
  - a model on a local ollama, with thinking off, on, or left alone where
    the model has no switch.
*/

import type { InboxItem } from "@ariadne/inbox";
import {
  QUESTIONS_BY_TEAM,
  SCRIPTED,
  type ProposalFor,
  type ProposalOutcome,
  type ProposalRequest,
  type ProposalTask,
  type Proposer,
} from "@ariadne/runner";
import { NAIVE_LETTER, oracleLetter } from "./letters.js";

export type AgentSpec =
  | { id: "scripted"; kind: "scripted" }
  | { id: "naive"; kind: "naive" }
  | {
      id: string;
      kind: "model";
      /* The model's tag in ollama */
      model: string;
      /* Thinking asked for: on, off, or null for a model without the switch */
      think: boolean | null;
      /* Stop this agent, and say so, if the machine swaps while it runs */
      guardSwap?: boolean;
    };

/* The matrix of the bench */
export const MATRIX: readonly AgentSpec[] = [
  { id: "scripted", kind: "scripted" },
  { id: "naive", kind: "naive" },
  { id: "qwen3:8b think=off", kind: "model", model: "qwen3:8b", think: false },
  { id: "qwen3:8b think=on", kind: "model", model: "qwen3:8b", think: true },
  { id: "qwen2.5:14b", kind: "model", model: "qwen2.5:14b", think: null },
  { id: "qwen3:1.7b think=off", kind: "model", model: "qwen3:1.7b", think: false },
  { id: "gigachat3.1-lightning:q4_K_M", kind: "model", model: "gigachat3.1-lightning:q4_K_M", think: null },
  { id: "t-tech/T-lite-it-2.1:q4_k_m think=off", kind: "model", model: "t-tech/T-lite-it-2.1:q4_k_m", think: false },
  { id: "gemma4-26a4b:latest think=off", kind: "model", model: "gemma4-26a4b:latest", think: false, guardSwap: true },
];

/* A proposer that answers at once from a function */
function answering(answer: (request: ProposalRequest) => ProposalOutcome): Proposer {
  return {
    propose: ((request: ProposalRequest, signal: AbortSignal) => (signal.aborted ? Promise.reject(signal.reason) : Promise.resolve(answer(request)))) as Proposer["propose"],
  };
}

/* The scripted assistant for an item: the script's proposals, and the
   desk's letter as the reply's text */
export function oracleProposer(item: InboxItem): Proposer {
  return answering((request) => ({ ok: true, proposal: SCRIPTED.proposeNow(request), askFirst: false, text: request.task === "draft_reply" ? oracleLetter(item) : null }));
}

/* The naive baseline for an item */
export function naiveProposer(item: InboxItem): Proposer {
  return answering(({ task }) => {
    const proposal: ProposalFor<ProposalTask> =
      task === "classify"
        ? { task, stream: "general", grounds: ["contract"] }
        : task === "request_facts"
          ? { task, team: "operations", questions: [...QUESTIONS_BY_TEAM.operations], reuseLinked: false }
          : { task, grounds: ["contract"], reasons: [], clientOptions: [], deadlines: [], measures: [], nextSteps: ["contact_bank"] };
    return { ok: true, proposal, askFirst: false, text: task === "draft_reply" ? NAIVE_LETTER[item.lang] : null };
  });
}
