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
model, no server and no interface. The plan is a seeded script for one
complaint to a bank, so every run is reproducible.

The engine emits no human language. Every event is codes and
parameters (case numbers, ISO dates, amounts in kopecks, risk,
confidence, affected objects before and after), so an application
renders it in Russian, English or anything else. A test fails if any
string with a letter in it that is not a known code reaches an event, a
plan, the session log or the stream.

The case comes in as a brief of codes, numbers and dates only (the
stream, the OD-2506 sign or 115-FZ category, the operation, the reply's
last day, the grounds, the options and deadlines the law gives the
client), which the application works out from its register and its
rules. The complaint's text never reaches the engine: the protocol
refuses a brief with any string that is not one of its codes or a date,
so nothing an applicant writes can instruct the run.

Status: early. One scripted scenario (97 tests). Measured in Node on an
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

## Event model

Each event has a `type` and a sequential `id` on the wire. Every string
field is a code from `src/codes.ts`, a step id or an ISO date.

| type | fields |
|---|---|
| `plan.started` | `at`, `total`, `protocol` (3) |
| `step.started` | `stepId`, `at`, `requiresConfirmation` |
| `step.deviation` | `stepId`, `deviation`: `reason`, `linkedCase`, `proposal`, `newType`, `newRisk` |
| `step.deviated` | `stepId`, `deviatedTo`, `actionType`, `risk`, `requiresConfirmation` |
| `step.awaiting` | `stepId`, `draft` |
| `step.running` | `stepId`, `attempt` |
| `step.progress` | `stepId`, `percent`, `phase` |
| `step.finished` | `stepId`, `at`, `result`: `summary`, `objects`, `undo`, `undoWindowSec` |
| `step.skipped` | `stepId`, `reason`: `skipped_by_user`, `skipped_after_error`, `stopped_by_user` |
| `step.error` | `stepId`, `error`: `code`, `service`, `timeoutSec`; `attempt` |
| `plan.finished` | `at` |
| `plan.stopped` | `at`, `afterStepId` |

A segment that needs a decision ends with a `stream.waiting` frame
(`stepId`, `accepts`: the commands the point takes) that has no id.

The structured parts:

- `draft`: `kind` (`change`, `request`, `reply`) and `template`, with
  the parameters of that template: `classify` (caseNo, stream, regime,
  reason), `request_facts` (caseNo, team, questions, operation, opRef,
  opOn, factsDue), `reuse_linked_facts` (caseNo, linkedCase,
  sendsRequest), `reply` (caseNo, repliedOn, stream, regime, outcome,
  the operation, receivedOn, grounds, reasons, clientOptions, deadlines,
  nextSteps: what the application writes out and the rubric checks),
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

The protocol has a version, `PROTOCOL_VERSION` (3): the plan payload
carries it as `v` and `plan.started` repeats it as `protocol`. A payload
without `v: 3` is refused with `unsupported_version`. A brief that does
not validate is refused with `invalid_case`.

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
  Nothing else in the payload, the events or the decisions changed.

The exported session log has a version of its own, 2, for its shape,
which is unchanged; its `protocol` field names the version its entries
were received in, now 3. A page left open across a deployment may speak
version 2 to the new Service Worker and is refused with
`unsupported_version`, which the desk shows; a reload brings the page of
version 3.

## API

```ts
import {
  generatePlan, requiresConfirmation, findConflicts, applyDeviation,
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
  `replyDraft`, `teamOf`, `RISK_BY_TYPE`, `taskOf`.
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
