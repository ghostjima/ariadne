/*
  The proposer: where the content of a step comes from.

  The plan of a run is the engine's: five steps in a fixed order, each with
  the risk of its action. What three of them say is proposed: how the
  complaint is classified, which team is asked for the facts and what it is
  asked, and what the reply states. A proposer answers those three tasks for
  one case. The engine takes its answers as proposals in codes, builds the
  steps from them, and computes the risk, the confirmation and the undo
  itself: nothing a proposer answers sets them.

  ScriptedProposer (scripted.ts) is the seeded script the engine has always
  run. Another proposer may take time and may fail (ModelProposer,
  model/proposer.ts, asks a model), so the interface is asynchronous, every
  call carries an AbortSignal, and an answer is a proposal or a coded
  failure. A proposer whose answers are known at once also answers
  synchronously, which is what lets the engine plan and replay a scripted
  run without waiting; a run whose proposals come later is replayed from
  the log of them (proposal.ts, runner.ts).
*/

import type {
  ActionType,
  ClientOption,
  ProposalError,
  FactQuestion,
  GroundCode,
  MeasureCode,
  NextStep,
  ReasonCode,
  StreamCode,
  Team,
} from "./codes.js";
import type { CaseBrief, ClientDeadline } from "./scenario.js";

/* The steps whose content is proposed, by their action */
export const PROPOSAL_TASKS = [
  "classify",
  "request_facts",
  "draft_reply",
] as const satisfies readonly ActionType[];
export type ProposalTask = (typeof PROPOSAL_TASKS)[number];

/* How the complaint reads: its stream and the grounds a reply to it names */
export type ClassifyProposal = {
  task: "classify";
  stream: StreamCode;
  grounds: GroundCode[];
};

/* Which team holds the facts and what to ask it; or, for a case with a
   linked case, a request to take that case's facts instead */
export type FactRequestProposal = {
  task: "request_facts";
  team: Team;
  questions: FactQuestion[];
  reuseLinked: boolean;
};

/* What the reply states, in codes: the application writes the words out,
   and the rubric checks these */
export type ReplyProposal = {
  task: "draft_reply";
  grounds: GroundCode[];
  reasons: ReasonCode[];
  clientOptions: ClientOption[];
  deadlines: ClientDeadline[];
  measures: MeasureCode[];
  nextSteps: NextStep[];
};

export type Proposal = ClassifyProposal | FactRequestProposal | ReplyProposal;
export type ProposalFor<T extends ProposalTask> = Extract<Proposal, { task: T }>;

/* One proposal per task: everything the engine needs to build a plan */
export type ProposalSet = { [T in ProposalTask]: ProposalFor<T> };

/* What a proposer is asked: the task, for which case, under which seed,
   and which attempt this is (1, then one more for each retry a person
   asks for after a failure). Codes, numbers and dates only, as the brief
   is. */
export type ProposalRequest<T extends ProposalTask = ProposalTask> = {
  task: T;
  seed: number;
  brief: CaseBrief;
  attempt?: number;
};

/*
  What a proposer answers: a proposal in codes with the proposer's own flag
  that a person should look first, or a failure as a code. `text` is the
  letter of a reply, for a proposer that writes one: untrusted text for the
  application to show, which the engine never takes.
*/
export type ProposalOutcome<T extends ProposalTask = ProposalTask> =
  | { ok: true; proposal: ProposalFor<T>; askFirst: boolean; text: string | null }
  | { ok: false; error: ProposalError };

export interface Proposer {
  /* Rejects when the signal aborts: an aborted call proposes nothing */
  propose<T extends ProposalTask>(request: ProposalRequest<T>, signal: AbortSignal): Promise<ProposalOutcome<T>>;
}

/* A proposer whose answers are known at once, and never fail */
export interface ImmediateProposer extends Proposer {
  proposeNow<T extends ProposalTask>(request: ProposalRequest<T>): ProposalFor<T>;
}

/* The three proposals of a case, from a proposer that answers at once */
export function proposeAll(proposer: ImmediateProposer, seed: number, brief: CaseBrief): ProposalSet {
  return {
    classify: proposer.proposeNow({ task: "classify", seed, brief }),
    request_facts: proposer.proposeNow({ task: "request_facts", seed, brief }),
    draft_reply: proposer.proposeNow({ task: "draft_reply", seed, brief }),
  };
}
