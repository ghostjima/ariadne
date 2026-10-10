# @ariadne/runner

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges are in its README.

The deterministic engine of an agent run that a person can stop, in
TypeScript.

An agent proposes a plan of steps. The person edits it, picks an
autonomy level and approves it; the run then streams step by step.
Risky steps wait for a confirmation with a draft of what they will do,
a failed step offers a retry, the agent can ask to leave the plan, the
person can stop the run after the current step, and finished steps can
be undone, some at any time and some only within a time window.
`@ariadne/runner` holds the rules of all of that and nothing else: no
server and no interface. The plan is a seeded script for one complaint
to a bank, so every run is reproducible. A model can propose what three
of the steps say; the engine validates each proposal against closed
lists of codes, decides the risk and the confirmations itself, and
replays such a run from its recorded proposals. No model is part of the
package, and none is needed to run or test it.

The engine emits no human language. Every event is codes and
parameters (case numbers, ISO dates, amounts in kopecks, risk,
confidence, affected objects before and after), so an application
renders it in Russian, English or anything else. A test fails if any
string with a letter in it that is not a known code reaches an event, a
plan, the session log or the stream.

The case comes in as a brief of codes, numbers and dates only (the
stream, the OD-2506 sign or 115-FZ category, the operation, the reply's
last day, the grounds, the options and deadlines the law gives the
client, the restrictions that apply for the client's own data in the
Bank of Russia's database), which the application works out from its register and its
rules. The complaint's text never reaches the engine: the protocol
refuses a brief with any string that is not one of its codes or a date,
so nothing an applicant writes can instruct the run. A model that
proposes for a run does read the complaint, as data, outside the engine:
what comes back in is a proposal in codes, and the one piece of text a
model writes, the reply's letter, travels beside the run and never in
it.

Status: early. One scenario (181 tests). Measured in Node on an
Apple M4 Pro: a plan generates in about 1 us and a complete run replays
in about 4 to 14 us; method, stamps and spread in
[docs/MEASUREMENTS.md](docs/MEASUREMENTS.md). Not measured in a browser.

## How a run works

- **Plan.** `generatePlan(seed, brief)` gives five steps for the case:
  `classify` (low risk), `request_facts` from the team that holds them
  (antifraud, AML compliance or operations, by stream; medium risk, with
  its own deadline and a 60 s undo window, since it leaves the complaints
  team), `draft_reply` (high risk: always a person's decision),
  `check_draft` (low) and `hand_to_review` (medium; the reply is never
  sent by the engine). The seed sets each step's confidence and duration;
  an odd seed makes the fact request time out once; a case with a linked
  case makes the agent ask to take that case's facts instead
  (`reuse_facts`, low risk, nothing sent). `findConflicts` flags an order
  that drafts before the facts are asked for, or checks or hands over a
  draft not yet written.
- **Proposer.** What three of the steps say is proposed: how the
  complaint is classified, which team is asked for the facts and what,
  and what the reply states. A `Proposer` answers those tasks for a case,
  in codes; the engine builds the steps from its answers and computes
  each step's risk, confirmation and undo itself, so nothing a proposer
  answers sets them. `ScriptedProposer` is the seeded script: it reads
  the brief and nothing else. See [The proposer](#the-proposer).
- **Consent rule.** `requiresConfirmation(step, autonomy)`: high risk
  always asks, at every autonomy level. Below that, `ask_all` asks for
  everything, `high_only` asks for steps flagged `askFirst`, `ask_none`
  ignores the flags.
- **Replay.** `runPlan` is a pure generator over the plan, the autonomy
  and the ordered decision log. It stops at the first decision the log
  does not hold. The same inputs give the same events with the same
  ids, so a transport never keeps a session: it replays the run and
  skips the events the page already has. A decision is taken only at
  the exact point it answers, so no log makes a high-risk step run
  without its own confirmation.
- **Machines.** `planMachine` and `stepMachine` (XState 5) are the
  page's side: draft editing, one actor per step, decisions, stop after
  the current step (the steps the run never reached are then skipped
  with `stopped_by_user`, so none reads as still waiting), and undo
  windows that outlive the run (`undoable`, `permanent`, `irreversible`).

## The proposer

```ts
interface Proposer {
  propose(request: { task; seed; brief; attempt? }, signal: AbortSignal): Promise<ProposalOutcome>;
}
type ProposalOutcome =
  | { ok: true; proposal: Proposal; askFirst: boolean; text: string | null }
  | { ok: false; error: "proposal_invalid" | "model_unavailable" };

interface ImmediateProposer extends Proposer {
  proposeNow(request: { task; seed; brief }): Proposal;
}
```

The tasks (`PROPOSAL_TASKS`) and what each proposal carries, every value
a code of `src/codes.ts` or an ISO date:

| task | proposal |
|---|---|
| `classify` | `stream`, `grounds` |
| `request_facts` | `team`, `questions`, `reuseLinked` (take the linked case's facts instead of a new request) |
| `draft_reply` | `grounds`, `reasons`, `clientOptions`, `deadlines`, `measures`, `nextSteps` |

Beside a proposal an outcome carries `askFirst`, the proposer's own flag
that a person should look first, and `text`, the letter of a reply for a
proposer that writes one. The letter is untrusted text for the
application to show. The engine takes neither field into a step: the
flag can add a confirmation and never remove one, and the text is never
given to it.

What the engine takes from a proposal, and what it keeps:

- The fact request is sent to the proposed team with the proposed
  questions. The facts of a linked case are offered only for a case that
  has one, whatever is proposed.
- The reply draft states the proposed grounds, reasons, options,
  deadlines, measures and next steps, on the case's own numbers, dates
  and outcome, which come from the brief.
- The classification a run confirms is the register's: the stream, the
  regime and the reason of the brief. A proposed classification changes
  none of them.
- The five steps and their order, each step's risk (`RISK_BY_TYPE`), the
  consent rule, the undo and its window are the engine's. A proposal has
  no field for any of them.
- A proposal that departs from the register always waits for a person,
  at every autonomy level (`contests`): another stream or other grounds
  than the brief's, or a fact request to a team that does not hold the
  facts of the brief's stream. Confirming a contested classification
  confirms the register's; the engine moves no case to another stream.

`generateScenario`, `generatePlan` and `resolvePlan` take a proposer as
their last argument and use `ScriptedProposer` without one. The engine
plans and replays without waiting, so they take an `ImmediateProposer`:
one whose answers are known at once.

`ScriptedProposer` answers from the brief: the brief's stream and
grounds, the team of that stream (`teamOf`) with its questions
(`QUESTIONS_BY_TEAM`), the linked case's facts when the brief has a
linked case, and a reply that states what the brief carries. The seed
does not change its answers: it sets the pace of a run and the one
scheduled failure.

A test compares every plan, scenario, segment and stop of seeds 1 to 40
over the five cases of the test set, and the handler's stream of a
complete run, with the bytes the engine gave before the proposer
existed: they are identical, with and without the scripted proposer
handed in. Those bytes were taken in protocol version 5; the run is
asked in the current version, and the one number that differs, the
version `plan.started` repeats, is written as the fixtures' before the
comparison.

## A run a model proposes

A model takes time, can fail and does not answer the same way twice, so
its run is not planned ahead. It is replayed, like every run, from what
the application holds: the plan, the decision log, and a third thing,
the **proposal log**: one entry per step and attempt, each a validated
proposal with its `askFirst` flag, or a failure code.

```ts
type ProposalEntry =
  | { stepId; attempt; proposal: Proposal; askFirst: boolean }
  | { stepId; attempt; error: "proposal_invalid" | "model_unavailable" };
```

- The plan payload names its agent (`agent: "model"`) and carries the
  log (`proposals`). The handler validates every entry as it validates
  the brief, rebuilding it field by field from the code lists, and
  refuses the payload with `invalid_proposals` otherwise. An entry has no
  place for a letter; one that carries a `text` is refused.
- Where the run reaches a step the log has no proposal for, the segment
  ends as it does for a decision: with a `stream.waiting` frame that
  names the step, accepts only `stop`, and says what it waits for
  (`proposal`: the task and the attempt). The application asks its
  proposer, appends the outcome to the log, and opens the next segment.
  Nothing else changes in the transports: the Service Worker handler and
  the in-process one replay a model's run as they replay the script's.
- A failed proposal is the step's error (`step.error` with the code and
  `service: "model"`), shown like any failed step: retry asks for the
  proposal again as the next attempt, skip and stop leave the step
  undone. After three attempts (`MAX_PROPOSAL_ATTEMPTS`) retry is no
  longer offered.
- Stop never waits for a model. The application aborts the proposer's
  call and appends the stop to the decision log; the replay then skips
  the waiting step as stopped and ends the run. An aborted call returns
  no outcome, so nothing is written for the step.
- `step.started.requiresConfirmation` is what is known when the step
  starts (its risk, the autonomy level, the person's flag). For a step
  whose content is proposed the engine may still ask once the proposal
  is in: when it departs from the register, or when its proposer flagged
  it. Nothing proposed makes the engine ask less.
- A model that agrees with the register in everything gives the scripted
  run, event for event. A test checks it over three cases and every
  autonomy level.

`driveRun(options)` is that loop without a page: it replays, asks the
proposer where the run waits for a proposal, asks `decide` where it
waits for a person, and stops on its `signal`. The bench and the tests
use it; an application with a page runs the same loop around its
transport.

### Schemas and validation

`proposalSchema(task)` is the JSON schema of the answer to a task,
generated from the code lists: every enum is one of the engine's lists,
whole; every object names its fields, requires them all and takes no
other. Only one field is free text, the reply's `text`. No schema has a
field for a risk, a decision on the complaint, a confirmation, an undo,
a stage or a step.

`validateProposal(task, value, brief)` checks a parsed answer against
the schema and then against what a schema cannot say (list items differ,
a date exists, a linked case can be reused only where the case has one,
the letter is within `MAX_REPLY_CHARS`). It returns the proposal rebuilt
from the engine's own fields, with the letter beside it, or the issues
as codes with their place in the answer (`ISSUE_CODES`).
`parseAnswer(task, content, brief)` does the same from a model's raw
answer, which must be one JSON value and nothing else.

### A model as a proposer

`@ariadne/runner/model` has what asks a model, kept apart from the
engine's entry point:

```ts
interface ModelClient {
  describe(signal?): Promise<ModelStamp>;             // runtime, version, tag, manifest digest
  chat(request: { messages; schema; options }, signal: AbortSignal): Promise<ChatResponse>;
}
```

- `ModelClient` is the one thing a proposer needs from a model runtime:
  a chat call with messages, a JSON schema the answer must satisfy, a
  temperature, a seed, a token limit and a thinking switch, which stops
  when its signal aborts. `OllamaClient` implements it over a local
  ollama's `POST /api/chat` with a streamed body (`format` carries the
  schema; `think` is sent only when set), using `fetch`, so it runs in
  Node and in a page. A client over a model running in the page
  implements the same two calls.
- `ModelProposer` sends the conversation of a task with the task's
  schema, at temperature 0 and a fixed seed by default. An answer that
  does not validate gets one repair attempt: the same conversation with
  the answer and its issues appended. A second failure is
  `proposal_invalid`; a model that cannot be reached, or does not answer
  within `timeoutMs`, is `model_unavailable`. An aborted call rejects and
  proposes nothing. Every call is handed to `record` as an `Exchange`:
  the request, the raw response, the issues, the timings.
- What a model is told is the application's: the conversation of each
  task and the wording of a repair come from a `Prompts` object. That is
  where a complaint's text and a case's facts enter, and the engine sees
  neither. [`@ariadne/inbox`](../inbox/README.md) has the prompts of the
  complaints desk.

## Transcripts

A run with a model cannot be replayed from a seed. It is replayed from
its transcript (`Transcript`, format `ariadne_runner.transcript`):

| part | what it holds | who reads it |
|---|---|---|
| `run`, `entries`, `decisions` | the seed, the autonomy, the brief, the steps; the proposal log; the decision log | the engine |
| `stamp` | the commit and the build that recorded it; the model's runtime, version, tag and manifest digest; temperature, seed, thinking, context; the machine and the time | a reader |
| `input` | what the application told the model beyond the brief (a complaint, a case sheet), in the application's own shape | a reader |
| `exchanges` | every call: the request, the raw response, validation issues, timings | a reader |
| `texts` | the letters the model wrote, by step and attempt | a reader, as untrusted text |

- `readTranscript(raw)` takes one from untrusted JSON. The engine's parts
  go through the plan payload's own reader, so a brief or a proposal that
  would be refused in a request is refused in a transcript, with the same
  code. The record parts are kept as they are.
- `replayTranscript(transcript, { decisions?, timeScale?, now? })` gives
  the items `runPlan` gives for a seed, from the recorded proposals. With
  another decision log it shows the same proposals under other
  decisions: with none, where the run would wait for a person.
- `payloadOf(transcript)` is the plan payload a transport replays it
  with, so a recorded run streams from the Service Worker like any run.
- `node scripts/replay.mjs transcript.json` prints the events of a
  transcript's run.

`test/fixtures/transcripts` holds three runs recorded with a small local
model: a clean complaint; an adversarial one, where the model wrote the
refund its complaint's insertion asked for, and the letter waited for a
person and is in no event; and a run in which every answer was cut short
and no proposal validated. Each replays, in the tests, to the event
stream recorded beside it. No model runs in the tests.

## Event model

Each event has a `type` and a sequential `id` on the wire. Every string
field is a code from `src/codes.ts`, a step id or an ISO date.

| type | fields |
|---|---|
| `plan.started` | `at`, `total`, `protocol` (7) |
| `step.started` | `stepId`, `at`, `requiresConfirmation` |
| `step.deviation` | `stepId`, `deviation`: `reason`, `linkedCase`, `proposal`, `newType`, `newRisk` |
| `step.deviated` | `stepId`, `deviatedTo`, `actionType`, `risk`, `requiresConfirmation` |
| `step.awaiting` | `stepId`, `draft` |
| `step.running` | `stepId`, `attempt` |
| `step.progress` | `stepId`, `percent`, `phase` |
| `step.finished` | `stepId`, `at`, `result`: `summary`, `objects`, `undo`, `undoWindowSec` |
| `step.skipped` | `stepId`, `reason`: `skipped_by_user`, `skipped_after_error`, `stopped_by_user` |
| `step.error` | `stepId`, `error`: `code` and `service`, with `timeoutSec` for a service that timed out; `attempt` |
| `plan.finished` | `at` |
| `plan.stopped` | `at`, `afterStepId` |

A segment that needs a decision ends with a `stream.waiting` frame
(`stepId`, `accepts`: the commands the point takes) that has no id. In a
run a model proposes, a segment that needs a proposal ends with the same
frame, with `proposal` (the task and the attempt) and `accepts: ["stop"]`.

The structured parts:

- `draft`: `kind` (`change`, `request`, `reply`) and `template`, with
  the parameters of that template: `classify` (caseNo, stream, regime,
  reason), `request_facts` (caseNo, team, questions, operation, opRef,
  opOn, factsDue), `reuse_linked_facts` (caseNo, linkedCase,
  sendsRequest), `reply` (caseNo, repliedOn, stream, regime, outcome,
  the operation, receivedOn, grounds, reasons, clientOptions, deadlines,
  measures, nextSteps: what the application writes out and the rubric
  checks),
  `check_draft` (caseNo), `hand_to_review` (caseNo, stageBefore,
  replyDue, sends).
- `objects`: `classification` (`unconfirmed` to `confirmed`),
  `fact_request` (team, `not_sent` to `sent`), `linked_facts`
  (linkedCase, `not_linked` to `linked`), `reply_draft` (`none`,
  `drafted`, `checked`) and `case` (its stage, to `legal_review`).
- `summary`: `case_classified`, `facts_requested`,
  `linked_facts_reused`, `reply_drafted`, `draft_checked`,
  `handed_to_review`, each with its numbers.
- `undo`: `unconfirm_classification`, `recall_fact_request`,
  `unlink_facts`, `discard_draft`, `clear_check`,
  `return_to_drafting`.
- `phase`: two per action, for example `filling_template` and
  `citing_grounds`.

The engine never decides a complaint: a reply's `outcome` is the one
the register holds, `pending` when nobody has decided yet, and the
application leaves it for the reviewer to state.

### Versions

The protocol has a version, `PROTOCOL_VERSION` (7): the plan payload
carries it as `v` and `plan.started` repeats it as `protocol`. A payload
without `v: 7` is refused with `unsupported_version`. A brief that does
not validate is refused with `invalid_case`, a proposal log that does
not with `invalid_proposals`.

A version names the closed lists of codes a brief, an event and a log
may draw from. The engine validates a brief against them and refuses
any other string, so a code added to a list is a new version: a reader
of the old version would refuse a brief or a log that uses it, and would
call it an invalid case rather than another version.

- Version 1 was a procurement scenario of twelve supplier requests. It
  is no longer served.
- Version 2 is the run about one complaint. It took three client
  deadlines (`CLIENT_DEADLINE_KINDS`) after it was first published,
  without a new number: `antifraud_repeat_refusal_ends` and
  `antifraud_after_repeat_refusal` (a refused repeat of a card, Faster
  Payments or e-money operation, 161-FZ art. 8 parts 3.10 and 3.11) and
  `high_risk_rating_review` (115-FZ art. 7.8 item 1.1). It is no longer
  served.
- Version 3 adds two grounds a brief and a reply draft may name
  (`GROUND_CODES`), at the end so the list keeps the register's code
  order: `payment_9_11_6` and `payment_9_11_7`, the suspension of the
  client's card or online banking for the client's own data in the Bank
  of Russia's database (161-FZ art. 9 parts 11.6 and 11.7). The engine
  carries them as it carries every ground, from the brief to the draft.
  Nothing else in the payload, the events or the decisions changed. It
  is no longer served.
- Version 4 adds one client option a brief and a reply draft may carry
  (`CLIENT_OPTIONS`), at the end: `apply_for_removal`, the client's right
  to apply to the Bank of Russia, through the bank or its Internet
  reception, to remove the client's data from its database, owed after a
  suspension of the client's card or online banking for those data
  (161-FZ art. 9 part 11.8). ariadne-rules' rubric asks for it, so the
  desk's brief names it for such a case, and the engine carries it from
  the brief to the draft as every option. Nothing else in the payload,
  the events or the decisions changed. It is no longer served.
- Version 5 adds a field to the brief and the reply draft, `measures`,
  with a list of its own (`MEASURE_CODES`): the restrictions that apply
  for the client's own data in the Bank of Russia's database, which the
  reply states. They are `suspend_instrument` (the card or online
  banking suspended, 161-FZ art. 9 parts 11.6 and 11.7), `cap_transfers`
  (instead of the suspension, the individual's transfers to individuals
  capped at 100,000 roubles a month, part 11.6, sentence 2) and
  `cap_atm_cash` (ATM cash capped at 100,000 roubles a month, Banking
  Law art. 30 part 16). The field is required and empty for any other
  case. A reader of version 4 would drop a field it does not know and
  draft a reply that does not say which restriction applies, so the
  version tells them apart before the brief is read. Nothing else in the
  payload, the events or the decisions changed. It is no longer served.
- Version 6 adds one ground a brief and a reply draft may name
  (`GROUND_CODES`), at the end so the list keeps the register's code
  order: `directive_6748_u_1_3`, the item of the Bank of Russia's
  Directive No. 6748-U (revision of 19.01.2026) on which a bank refuses
  to forward to the Bank of Russia a client's application to remove the
  client's data that lacks mandatory data (item 1.3). The desk's brief
  names it, after the part of 161-FZ art. 9 the suspension or the cap
  rests on, for a case whose application was refused. The engine carries
  it as it carries every ground, from the brief to the draft. A reader of
  version 5 would refuse the code as an invalid case, so the version
  tells the two apart before the brief is read. Nothing else in the
  payload, the events or the decisions changed. It is no longer
  served.
- Version 7 lets a model propose what the classification, the fact
  request and the reply say. New codes: two step errors
  (`ERROR_CODES`: `proposal_invalid`, `model_unavailable`) with their
  service (`SERVICES`: `model`), the agent `model` (`AGENT_KINDS`) and the
  request error `invalid_proposals` (`REQUEST_ERRORS`). The plan payload
  takes two optional fields, `agent` and `proposals`; a `stream.waiting`
  frame may carry `proposal`; `step.error.error` has `timeoutSec` only
  for a service that timed out. A scripted run is unchanged but for the
  version number: its payload needs neither new field, and its events
  are the bytes of version 5 with the number `plan.started` repeats (a
  test compares them). A reader of version 6 would refuse the new error
  codes in a log and would not know a segment could wait for a proposal.

The exported session log has a version of its own, 2, for its shape,
which is unchanged; its `protocol` field names the version its entries
were received in, now 7; the brief it carries is the protocol's, and its
`agent` says whether the script or a model proposed. A page left open
across a deployment may speak version 6 to the new Service Worker and is
refused with `unsupported_version`, which the desk shows; a reload
brings the page of version 7.

## API

```ts
import {
  generatePlan, requiresConfirmation, findConflicts, applyDeviation,
  ScriptedProposer, proposeAll,
  resolvePlan, runPlan,
  encodePlanPayload, encodeDecisions,
  planMachine, stepMachine, canDecide, stepStatusOf,
  connectInProcess, exportLog,
  ALL_CODES, RUN_EVENT_TYPES, COMMANDS,
} from "@ariadne/runner";
import { handleAgentRequest, createAgentHandler } from "@ariadne/runner/sse";
```

- Scenario: `generateScenario(seed, brief)`, `generatePlan(seed, brief)`,
  `requiresConfirmation`, `findConflicts`, `applyDeviation`,
  `replyDraft`, `RISK_BY_TYPE`, `taskOf`.
- Proposer: `Proposer`, `ImmediateProposer`, `ScriptedProposer`,
  `SCRIPTED`, `proposeAll`, `PROPOSAL_TASKS`, `teamOf`,
  `QUESTIONS_BY_TEAM`, `contests`, `stepWith`.
- Proposals: `proposalSchema`, `validateProposal`, `parseAnswer`,
  `answerOf`, `validateEntries`, `proposalSteps`, `ISSUE_CODES`,
  `MAX_PROPOSAL_ATTEMPTS`, `MAX_REPLY_CHARS`.
- A model's run: `driveRun`, `readTranscript`, `replayTranscript`,
  `payloadOf`; from `@ariadne/runner/model`: `ModelClient`,
  `OllamaClient`, `ModelProposer`, `Prompts`, `Exchange`, `ModelError`.
- Run: `resolvePlan(payload)`, `runPlan(input)` (items: `event`,
  `delay`, `pause`).
- Protocol: `PROTOCOL_VERSION`, `validateBrief`, `encodePlanPayload` /
  `decodePlanPayload` (a result with the payload or its error code),
  `encodeDecisions` / `decodeDecisions` (`confirm-s3-14.stop--33`),
  `parseStreamOptions`.
- Transports: `handleAgentRequest(request): Response | null`,
  `createAgentHandler({ match, sleep, now, timeScale })`,
  `connectInProcess(query, { lastEventId, signal }, options)`.
- Machines: `planMachine` (input `{ brief, seed, autonomy }`; events `APPROVE`, `RUN_EVENT`, `DECIDE`,
  `STOP`, `UNDO`, `RESET` and the draft edits), `stepMachine`,
  `canDecide`, `stepStatusOf`, `toStepEvent`.
- Log: the plan machine's `context.log` entries (`approved`, `event`,
  `decision`, `stop_requested`, `undo`) and `exportLog(entries, header)`.
- Vocabulary: one exported list per kind of code (`ACTION_TYPES`,
  `RISKS`, `PROGRESS_PHASES`, `SKIP_REASONS`, `SUMMARY_CODES`, ...) and
  their union `ALL_CODES`, so a label table can be typed as
  `Record<SkipReason, string>` and checked for completeness.

## Wiring the Service Worker

The query shape is `GET .../api/agent?plan=<base64url JSON>` (version,
seed, autonomy, the case brief and the steps) with
optional `decisions`, `after`, `speed=fast`, `drop=1` and
`undoWindow=<seconds>`. The handler answers same-origin requests whose
path ends with `/api/agent` (or whatever `match` accepts) and returns
`null` for the rest.

```ts
// sw.ts, bundled by the application
import { handleAgentRequest } from "@ariadne/runner/sse";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const response = handleAgentRequest(event.request);
  if (response) event.respondWith(response);
});
```

On the page, after the worker controls it:

```ts
const params = new URLSearchParams({ plan: encodePlanPayload({ v: PROTOCOL_VERSION, seed, autonomy, brief, steps }) });
if (log.length > 0) params.set("decisions", encodeDecisions(log));
if (lastEventId > 0) params.set("after", String(lastEventId));
const source = new EventSource(`api/agent?${params}`);
for (const type of RUN_EVENT_TYPES) {
  source.addEventListener(type, (e) => {
    lastEventId = Number(e.lastEventId);
    plan.send({ type: "RUN_EVENT", event: JSON.parse(e.data), at: Date.now() });
  });
}
source.addEventListener("stream.waiting", () => source.close());
```

The page owns the approved plan and the decision log. When the person
decides, it sends the decision to the plan machine at once (check it
with `canDecide` first, so a stale click never enters the log), appends
`{ command, stepId, afterEventId: lastEventId }` to the log and opens
the next segment. Close the source on `stream.waiting`,
`plan.finished` and `plan.stopped`; any other end of the stream is a
dropped connection, and EventSource reconnects by itself with
Last-Event-ID, which the handler resumes from.

A page that is not yet controlled by the worker (the first load before
`clients.claim()` completes) sends the request to the network, so wait
for `navigator.serviceWorker.controller` before opening the stream.

## Development

From this folder, after `pnpm install --frozen-lockfile` at the
repository root:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm bench   # timings for docs/MEASUREMENTS.md
```

## License

MIT OR Apache-2.0, at your option.
