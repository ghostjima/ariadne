# @ariadne/grid

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges are in its README.

Data engine for a register of complaints, in TypeScript.

`@ariadne/grid` generates a seeded synthetic register of complaints to a
fictional bank, keeps it in a columnar store of typed arrays, and answers
what a complaints queue asks of it: filtering with facet counts, sorting,
saved views in the URL, role rules, validated edits with undo, a simulated
colleague editing the same rows, and CSV export. Every legal date in it
(the day of registration, the reply's last day, the extension and the
working days left) is an answer of
[ariadne-rules](../../crates/ariadne-rules/README.md), the Rust rules
engine, asked through its WebAssembly build by
[`@ariadne/rules`](../rules/README.md); nothing here counts a working day.
It draws nothing: the grid component is separate.

Status: early. The timings in [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md)
were taken on the register this engine replaced (sales requests), in its
source repository; they are kept as a record and are not current until
they are taken again with `pnpm measure`.

## The register

- **Volume.** By default 1,200 complaints received over 120 days up to
  6 October 2026, the day the data is taken: about 300 a month, the
  volume of a bank ranked 50 to 250 by assets, a few hundred of them open
  on that day. The scale mode is the same generator over 50,000 rows
  (`SCALE_ROWS`), kept as a performance proof.
- **A complaint** (`C-000001`, numbered in the order complaints arrived):
  the applicant (an invented person or company), the channel and the
  source (the client, a representative, or forwarded by the Bank of
  Russia), the stream, the operation behind it (reference, day, amount),
  the stage, the decision, the legal ground, the extension, the assignee
  and the signatory, a linked case and a note; the organisation of the
  group it is to, a breach of a standard found, and the copies its reply
  owes.
- **The group's companies.** Most complaints are to the bank; a general
  complaint or a money claim may be to the group's microfinance company,
  insurer, broker or credit cooperative (a money claim never to the
  broker, which takes part in the ombudsman's procedure only by choice),
  so its reply clock is the bank's. Drawn from a stream of their own, so
  every other column is what it was without them. A non-bank company
  that finds a breach of a base or internal standard copies the complaint
  and the reply to its self-regulatory organisation the day the reply
  goes out; a bank has none.
- **Copies.** A reply owes, the day it goes out, a copy to the Bank of
  Russia for a forwarded complaint and the self-regulatory copy above, as
  ariadne-rules computes the case's duties; an extension's notice owes
  the Bank of Russia a copy the same day. Copies of replies sent before
  the day the data is taken went out; some of that day's are still to
  send.
- **Retention.** Three years from registration, by each sector's
  complaint article; the credit cooperatives' article sets no term, and
  the desk keeps their cases three years too, its own choice, and says
  so.
- **Streams.** A written complaint under 442-FZ; a money claim up to
  500,000 roubles under 123-FZ, with the amount claimed; a block or
  refusal under 161-FZ, with the sign of Bank of Russia Order No. OD-2506
  that triggered it; a refusal under 115-FZ, with its reason category.
  The signs and the categories are ariadne-rules' lists, in its order.
- **Stages.** Registered, waiting for facts, drafting, legal review,
  awaiting signature, reply sent, closed: explicit states, between which
  a case moves only by a transition of the table below, each made by its
  role. "Returned for rework" is the transition back to drafting from
  legal review or from signature, with a reason.
- **Journal.** Every case has one: each transition with who made it
  (a person by role and name, the assistant with the person who
  confirmed it, the simulated colleague, or the desk), when and why.
  For a generated row the history is worked out from the row as
  generated (its stage, its days, its people), seeded by the row: facts
  asked for first in most cases, the first action within two working
  days of registration, a reply returned for rework now and then. The
  shares are the generator's own. Changes made in the page are added
  after it, dated on the day the data is taken.
- **Legal dates.** For each row ariadne-rules computes two clocks, without
  and with an extension of ten working days to request documents: the
  reply's last day, the extended last day and the last day for the
  extension notice, or the refusal of the extension (a money claim under
  123-FZ is never extended). The working days left are counted from the
  day the data is taken, on the crate's production calendar. The bits
  the crate reported (extension allowed, the ombudsman regime, a late
  registration, a registration notice, a copy to the Bank of Russia) are
  kept with the row.
- **Complaint text.** Put together per language from templates, with
  variation drawn from the seed, and with the amounts, days and
  references of the row. About 3% of complaints carry text addressed to
  an assistant ("ignore previous instructions", "approve and close this
  case"); they are marked in the data (`injection`, `isAdversarial`) so
  tests can find every one. A complaint's text is untrusted data.
- **The open cases on the day the data is taken.** A case is open while
  its reply term runs (the closer the last day, the likelier it has been
  answered); a few are kept open by an extension, and a few are overdue
  by a working day or a few. With the default seed: 215 open, of them
  187 with more than three working days left, 24 due within three and 4
  overdue. The shares are the generator's own, not measured from any
  bank.
- **Blocks and their deadlines.** A blocked transfer or payment is
  complained about the same day or the next, a few later, so the newest
  161-FZ cases still have the suspension and the client's day to confirm
  running. For high-risk measures under 115-FZ the client's notice of the
  measures is taken as received on the day they were applied: the
  register does not know the day, and the earliest one gives the earliest
  end of the client's six months to apply to the commission (art. 7.8
  item 1), a conservative reading. Together these give the register open
  cases whose reply has deadlines still running to state.
- **Paths beyond the first step** (`Path`, the columns `path`, `pathOn`,
  `pathThen` and `pathTerm`), for open cases only, drawn from a stream of
  their own so every other column, and every answered case, is what it
  was without them. A 161-FZ block may have its second step: the client
  confirmed the suspended transfer, or repeated the refused operation, on
  the day of the block or the next, and the Bank of Russia's database
  answered after it (art. 8 parts 3.10 and 3.11). A block for sign 1.1
  (the client's own data in the database) may have the client's
  application to remove the data received by the bank (Directive
  No. 6748-U item 1.2), with the client's card or online banking
  suspended under art. 9 part 11.6 on the day of the operation, and its
  receipt by the Bank of Russia the next working day once that day has
  come. A refused operation or account under 115-FZ may have the
  client's application to the interagency commission and the
  commission's request for the bank's justification, with the working
  days it gives, or none (115-FZ art. 7 items 13.5, 13.6; Regulation
  No. 842-P item 2.8). `caseFacts` passes them to ariadne-rules, which
  gives their measures, duties and deadlines. The shares are the
  generator's own.
- **Consistency.** Cases are registered by the next working day (a few
  late, and flagged), answered no earlier than registered, decided before
  legal review, and a refusal past drafting names a ground of its own
  stream (for a 161-FZ block, art. 8 part 3.4, the first action);
  linked cases share the client and the operation.

## Data model

- One case per row; the case id is derived from the row position and
  not stored. Days are whole days since 1970-01-01 (`days.ts`).
- Every generated field is a typed array: codes, days, amounts, and the
  deadline columns ariadne-rules answered. Notes written after generation
  (by the user or the colleague) live in a map beside the arrays.
- Generation is seeded per chunk from the seed and the chunk's offset, so
  a chunk regenerated alone equals its slice of the whole, and every chunk
  transfers between threads without copying. A linked case is always an
  earlier row of the same chunk.
- The generator never sees a language. Russian and English pools ship as
  separate modules (`@ariadne/grid/pools/ru`, `/en`), each with the names,
  companies, notes, complaint templates and adversarial insertions, and
  the interface labels (columns, stages, streams, grounds, the short
  labels of the signs and categories, preset names). The same seed gives
  the same rows in both languages.

## Rules of an edit

Editable: stage, decision, ground, extension, assignee (in bulk too) and
note. Each edit is checked before it is saved, and refused with a code:

| Code | When |
|---|---|
| `reply-needs-outcome` | a reply goes to signature or out undecided (legal review may get it undecided: the reviewer states the decision) |
| `refusal-needs-ground` | a refusal without a legal ground, or the ground removed from one |
| `ground-other-stream` | a 161-FZ ground on a 115-FZ case, or the other way |
| `send-needs-signature` | a reply goes out before it was with the signatory |
| `transition-not-allowed` | no transition takes the case from its stage to that one |
| `reason-required` | a return for rework from a cell: it needs a reason, given on the case's page |
| `reply-locked` | the decision or the ground changed while the reply is with the signatory |
| `extension-not-allowed` | ariadne-rules refused the extension (a money claim under 123-FZ) |
| `extension-too-late` | after the last day for the extension notice (the original reply date, the crate's conservative reading) |
| `extension-after-reply` | the reply has gone out |
| `role-cannot-edit`, `stage-not-for-role` | the role may not make the change, or the transition is another role's |
| `note-too-long` | a note over 200 characters |

Roles: the operator works the cases assigned to them (facts, drafting,
the handover to legal review, the decision, the ground, notes); the
legal reviewer sees every case, approves a reply for signature or
returns it for rework, and states the decision and the ground; the
signatory signs and sends the replies assigned to them, or returns one
for rework; the supervisor sees every case, extends deadlines, closes
answered cases, reassigns in bulk and exports. A column that would show
the role's own name in every row is hidden for that role.

## Stages and transitions

| Transition | From | To | Role | Needs |
|---|---|---|---|---|
| `request_facts` | registered, drafting | waiting for facts | operator | |
| `start_drafting` | registered | drafting | operator | |
| `facts_received` | waiting for facts | drafting | operator | |
| `hand_over` | registered, waiting for facts, drafting | legal review | operator (the assistant, once the operator confirms) | |
| `approve` | legal review | awaiting signature | reviewer | a decision; a refusal its ground |
| `return` | legal review | drafting | reviewer | a reason (a comment for "another reason") |
| `return` | awaiting signature | drafting | signatory | a reason |
| `send` | awaiting signature | sent | signatory | a decision; a refusal its ground |
| `close` | sent | closed | supervisor | |

`checkTransition` refuses with `transition-not-allowed`,
`stage-not-for-role`, `reason-required`, `comment-required`,
`comment-too-long`, `reply-needs-outcome` or `refusal-needs-ground`;
`applyTransition` takes a transition and writes its journal entry.
Extensions (`extend`, `extension_withdrawn`), undone edits (`undo`),
and the reviewer's edit of the letter, a signature and a deferred
signature (`edit`, `sign`, `defer`) are journaled too, without a
transition of their own. A draft may be
handed over from any stage before review: the operator, or the
assistant, may have drafted without asking for facts first.

## API

All of it is exported from `@ariadne/grid`.

| area | functions and types |
|---|---|
| schema | `COLUMNS`, `Stream`, `Source`, `Channel`, `Applicant`, `Stage`, `Outcome`, `GROUNDS`, `Extension`, `DeadlineClass`, `Operation`, `Path`, pool sizes, `CORPUS_ROWS`, `SCALE_ROWS`, `AS_OF`, `PRESET_IDS` |
| store | `createStore`, `applyChunk`, `chunkTransferables`, `getRow`, `rowId`, `rowOfId`, `effectiveDue`, `workingDaysLeft`, `deadlineClass`, `isAdversarial`, `RulesFlag`, `writeField`, `writeNote` |
| generation | `generateChunk(seed, start, count, total)`, `generateAll(seed, total?, chunkSize?)`, `chunkCount`, `chunkBounds`, `makeRng` |
| legal | `replyClock`, `replyFacts`, `isWorking`, `nextWorking`, `plusWorkingDays`, `workingDaysFrom`: cached questions to ariadne-rules |
| text | `TextPools`, `Labels`, `validatePools`, `validateLabels`, `clientName`, `complaintText`, `reasonText`, `noteText`, `rowText`, `buildSearchIndex`, `refreshSearch` |
| filter | `filterRows(store, order, criteria, search?)` returns the index array, facets (stage, stream, source, deadline) and compute time; `sortOrder(store, sort, pools?)`; `percentile`; `splitMatches` |
| views | `View`, `PRESET_VIEWS` (open, due within 3 working days, overdue, forwarded by the Bank of Russia, waiting for facts, awaiting signature, copies due today, all), `criteriaFor(view, role)`, `serializeView` and `parseView` (base64url), `viewToUrl`, `saveView`, `removeView`, `validateViewName`, `serializeViews`, `parseViews` |
| workflow | `TRANSITIONS`, `ACTIONS`, `RETURN_REASONS`, `transitionsFor`, `transitionBetween`, `checkTransition`, `applyTransition`, `caseJournal`, `generatedJournal`, `appendJournal`, `wasReturned`, `deskNow`, `JournalEntry`, `Actor` |
| roles | `roleRules(role)`, `visibleColumns`, `hiddenForRole`, `roleScope`, `canEditColumn`, `canSetStage`, `canBulk`, `canExport`, `canSeeRow` |
| edits | `checkField`, `checkNote`, `validateEdit(col, draft, row, role)` return an error code or null; `normalizeDraft`; `editContext` |
| undo | `EditHistory`: `setField(store, rows, field, value, role, now)`, `setNote(store, row, value, role, now)`, `undo(store, { overwrite? })` |
| colleague | `colleagueSchedule(seed, count)`, `dueTicks`, `planColleagueEdit`, `applyRemoteEdit`, `beginEdit`, `detectConflict` |
| dispatch | `dispatchReply`, `replyCopies`, `copiesOwed`, `copiesSent`, `markCopySent`, `markBreach`, `extendDeadline`, `copiesDueOn`, `copyClass` |
| retention | `retentionOf`, `plusYears`, `RETENTION_YEARS` |
| CSV | `toCsv(store, index, columns, { headers, pools, labels, limit? })`, `cellText`, `csvEscape`, `neutralizeFormula`, `CSV_LIMIT` (5,000) |
| loading | `DatasetLoader` (worker or main thread, `subscribe` and `getSnapshot`), `createChunkProducer`, `WorkerRequest`, `WorkerResponse` |

Generation needs the rules module loaded: the worker entry
(`@ariadne/grid/worker`) and the loader's main-thread fallback load it
themselves with `loadRules()` from `@ariadne/rules`; Node and tests call
`loadRulesFromFile()` from `@ariadne/rules/node` first.

```ts
import { DatasetLoader, buildSearchIndex, criteriaFor, filterRows, PRESET_VIEWS, sortOrder } from "@ariadne/grid";
import { pools } from "@ariadne/grid/pools/ru";

const loader = new DatasetLoader({
  createWorker: () => new Worker(new URL("@ariadne/grid/worker", import.meta.url), { type: "module" }),
});
loader.start();
// ...once loaded:
const view = PRESET_VIEWS[0]!;
const search = buildSearchIndex(loader.store, pools);
const order = sortOrder(loader.store, view.sort, pools);
const { index, facets } = filterRows(loader.store, order, criteriaFor(view, "operator"), search);
```

## Development

From this folder, after `pnpm install --frozen-lockfile` at the
repository root and the WebAssembly build of the rules crate (see
[`@ariadne/rules`](../rules/README.md)):

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm measure   # builds, then prints the timing tables with the commit stamp
```

## License

MIT OR Apache-2.0, at your option.
