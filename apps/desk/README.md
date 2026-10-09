# Ariadne Desk: the desk app

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges, and what each one counts, are in its README.

One desk for the complaints and refusals of a bank, keyboard first: the
queue of cases, each with its legal deadline counted by the rules engine,
and the open case in one window, with its card and an assistant beside
it that proposes and stops for a person at every risky step. In Russian
(the default) and English.

## The queue

- **The register**: 1,200 invented complaints received over four months
  (about 300 a month, a few hundred open), in four streams: complaints
  under 442-FZ, money claims under 123-FZ, blocks under 161-FZ with the
  sign of Order No. OD-2506, refusals under 115-FZ with their category.
  `?rows=50000` opens the scale mode, the same generator over 50,000
  rows.
- **The time left** in working days, counted from the day the data is
  taken (6 October 2026) by ariadne-rules on its production calendar,
  drawn in the grid by Stoa's DeadlineCell: an exclamation mark within 3
  working days, a cross once overdue. The stage carries a
  tone too: a tick once answered, an exclamation mark while a reply waits
  for its signature.
- **Filters with counts** in Stoa's FilterBar: stage, deadline (overdue,
  due within 3 working days, later, answered), stream and source, and a
  search over case, applicant, subject, operation, assignee and note,
  marked in the cells; on a phone the groups fold into a sheet.
- **Views**: open cases (where the desk opens, the least time left first),
  due within 3 working days, overdue, forwarded by the Bank of Russia,
  waiting for facts, awaiting signature, copies due today (a filter of
  its own, with counts) and all cases; saved views kept
  in this browser, and a link that carries the current view (`?view=`).
- **Roles**: the operator works the cases assigned to them (facts,
  drafting, the handover to legal review, the decision, the ground,
  notes); the legal reviewer sees every case, approves a reply for
  signature or returns it for rework, and states the decision; the
  signatory signs and sends the replies assigned to them, or returns one
  for rework; the supervisor sees every case, extends deadlines, closes
  answered cases, reassigns cases and exports. `?role=` opens the desk as
  one of them.
- **Inline edits** of the stage, the decision, the ground, the extension,
  the assignee and the note (Enter, F2 or a double click), checked by the
  engine before they are saved: a refusal needs a legal ground of its own
  stream (161-FZ and 115-FZ are not mixed; the grounds are offered by act,
  article and part), a stage changes only by a
  transition of the role's (a return for rework, which needs a reason,
  only from the case's page), a reply goes to signature only decided and
  out only after signature, a money claim under
  123-FZ is never extended, an extension comes no later than the last day
  for its notice, a note has at most 200 characters.
- **Bulk reassignment** from Stoa's DataGridSelectionBar (Space, Shift
  with the arrows, Ctrl or Cmd with A to select), undone from the toast or
  with Ctrl or Cmd with Z.
- **Columns** from Stoa's DataGridColumnChooser: show, hide and reorder;
  the case and the applicant stay pinned.
- **Edit conflicts**: a simulated colleague edits cases now and then
  (`?colleague=off` stops it, `?colleague=N` sets the mean interval in
  seconds, the "Colleague's edit" button or C makes one now). When the
  colleague changes the cell you are editing, saving opens a dialog with
  both values and the one you started from.
- **CSV export** of the current view, its columns and order, at most
  5,000 rows.
- **Keys**: `?` lists them, `/` goes to the search, G to the grid, O opens
  the case of the active row, X clears the filters, S saves the view, E
  exports, M opens the supervisor's metrics.
- **The supervisor's metrics** (the toolbar's Metrics, M, or
  `?metrics=1`): time to first action (median and 90th percentile, in
  working days from registration to the first journal step), deadline
  breaches (replies sent late and open cases past their last day, with
  the working days of each), the share of drafts signed with at most 20%
  of their characters changed (from the draft and the signed text, by
  the desk's text diff), the override rate (signatures with the decision
  Override), returns for rework, and reopened and escalated cases (repeat
  complaints, and repeats through the Bank of Russia), as Stoa's Metrics
  under a StatBar of the register's counts, and a table per operator.
  A letter signed in the page counts from its own texts; an answered case
  of the register has its signed letter worked out from its draft with
  edits drawn from the case. The view opens with the case card's header
  (Back with Q, the title, which takes the focus, and the synthetic
  register with its day) and says it is computed from the synthetic
  register, and how each measure is counted; Back and Q return to the
  grid's row.

Loading, a partial load failure (`?failChunk=1` fails one 400-row chunk
once, with a retry), no matches, and running without a worker
(`?worker=off`) each have their own state; changes are announced to
screen readers. A performance panel at the bottom shows what this tab
measured.

## The open case

O, the toolbar's Open case or a link (`?case=C-000867`) opens a case;
Q or Back to the queue returns to the row it was opened from, with the
focus on it. On a wide screen the card and the assistant sit side by
side; on a narrower one they are two tabs (`?panel=assistant` opens the
assistant's).


- **The work on the case**: the stage it is at, the transitions the
  page's role may take from there (each a button that says what it
  does), and the case's journal: every transition, oldest first, with
  who took it, when and why. A return for rework asks for a reason from
  a list, and a comment for another reason; after a transition the focus
  goes to the panel's heading. The header marks a case returned for
  rework.
- **The letter**, from legal review on: the letter as it stands (the
  assistant's draft with the decision the register holds, or a person's
  edit), with the signatory named under it; what the rubric finds in it;
  and its changes against the assistant's draft, word by word, with the
  characters changed as a share of the draft (for each changed passage,
  the longer of what was removed and what was added). A case the
  assistant did not hand over in this page has its draft worked out as
  the assistant drafts it. The reviewer edits the letter and states the
  decision and the ground; a letter that still leaves the decision open
  is not approved. A reply about the client's own data in the Bank of
  Russia's database cites 161-FZ art. 9 part 11.6, with no art. 8 action
  before it, as the rules engine gives it; a reviewer who names part
  11.7 (with the Ministry of Internal Affairs' information) in its place
  is followed, the two parts excluding each other. At signature the signatory records
  a decision (approve, modify, override or defer, as one radio group with
  what each means under it) with their concerns and what would make it
  wrong, in fields of several lines (always asked for; the concerns unless
  approved as proposed); a modification or an override is their own edit
  first. The signed letter is frozen and names the signatory, and only a
  signed reply is sent, from the case or from the queue. Every edit,
  signature and deferral is in the journal.
- **Dispatch and copies**: the signed reply is dispatched by the
  signatory once they confirm it (a high-risk step: the confirmation
  names the channel and the copies it will owe, with the focus on Do not
  dispatch), then waits out a send delay counted down on the case
  (`?sendDelay=` seconds, 30 by default), in which Cancel sending stops
  it; once it has left it is not recalled. It leaves with the copies the
  rules say it owes: to the Bank of Russia for a forwarded complaint, to
  the self-regulatory organisation when a non-bank company marked a
  breach of a standard. Each is due that day, listed in the queue's view
  of copies due today, and marked sent from the case. The supervisor
  extends the reply term with a reason; the rules' refusal of a money
  claim under 123-FZ is shown in words, and a forwarded complaint's
  extension notice owes the Bank of Russia a copy that day. How long the
  case is kept is on the case, and the case exports for an inspection as
  plain text and as CSV (its header, the derivation of the reply day, the
  journal, the letter and the copies; text that a spreadsheet would read
  as a formula is written as text).
- **The Bank of Russia's database**, on a case about the client's own
  data there: what the bank's copy of the record holds, and the bank's
  own reasoned application to the Bank of Russia to remove the data,
  without the client, when the bank has grounds to think them included
  without basis (161-FZ art. 9 part 11.9). The legal reviewer or the
  supervisor writes the bank's reasons and sends it after a
  confirmation, with the focus on Not now, since it is not recalled. It
  goes in the journal with the reasons, and the card shows the Bank of
  Russia's 15 working days from the rules engine (Directive No. 6748-U
  items 2.6 and 2.7, counted from the day it is sent; with the client's
  own application under review, one decision 15 working days from the
  first, item 2.8). A client may also apply to the Bank of Russia
  directly, through its internet reception; the bank learns of it from
  the Bank of Russia's request. The operator of the case or the
  supervisor records the request the day it arrives, the card shows the
  bank's 3 working days to answer (Directive No. 6748-U item 2.9), and
  the legal reviewer or the supervisor records the answer: the bank's
  view of whether the data were included with basis, with its reasons. The Bank of Russia sends
  its decision to the client by email, so the bank owes no relay of it;
  a case where the client applied through the bank has had the bank's
  view forwarded with the application, and takes no request here.
- **The card**: the complaint as the applicant wrote it (shown as the
  applicant's words, never followed), the applicant, the operation
  behind it, the flags around the operation (the OD-2506 sign with the
  order's own Russian wording from ariadne-rules, or the 115-FZ category
  with its article and item; the measures taken, each with its ground:
  161-FZ art. 8 part 3.4 for the first action on any operation, part
  3.10 for the second after a confirmation or a repeat, part 3.9 for an
  order not accepted, art. 9 part 11.6 for the client's card suspended;
  and every dated term the rules give beyond the reply's own, such as
  part 3.11's two days, the bank-side terms of Directive No. 6748-U on
  an application to remove the client's data, the commission's request
  under Regulation No. 842-P, the notices of no reply on the substance
  and of stopping the correspondence), the duties tied to an event (the
  notices of 161-FZ art. 9 parts 9.2 and 11.8, restoring the card under
  part 11.11, the copies), how long the case is kept, and what the
  rules note about the case's data (a commission's request without a
  term, a money claim more than three years after the breach), the
  timeline of its channels (receipt, registration and its notice, an
  extension, the reply and the copy to the Bank of Russia), the cases
  linked to it or from the same applicant, and the deadline. A Bank of
  Russia directive or regulation is cited by item, as it has no
  articles.
- **The deadline, worked out**: Stoa's DerivationTable, step by step,
  each with its formula and source: receipt, registration (the next
  working day), the reply term (15 working days, or 123-FZ's), the days
  off the term skips on the production calendar, the extension (taken,
  possible until the last day for its notice, or refused by the rules),
  and the time left. Every source names its act, article and part, the
  revision the crate checked it against, and links to the text.

## The assistant

The assistant is [`@ariadne/runner`](../../packages/runner), a
deterministic engine, not a model: a seeded scenario, a consent rule, and
a run that replays the same way from the same plan and the same
decisions. The panel says so. For the open case it proposes five steps:

1. **Classify** the complaint: its stream and reason (the OD-2506 sign or
   the 115-FZ category), as the register and the rules hold them.
2. **Request the facts** from the team that holds them (antifraud, AML
   compliance or operations), with the questions for that team and a
   deadline of its own from the rules engine (`factRequestDue`): two
   working days, the desk's policy and not a term of any law, capped by
   the earliest term that binds the answering team (the reply, the answer
   to the client's documents, to the commission's request or to a Bank of
   Russia request). The request leaves the complaints team, so it
   can be recalled within a window. When a linked case already holds the
   facts, the agent asks to take them from there instead.
3. **Draft the reply** from templates over the case's facts: the
   operation, the measure and the sign or category behind it, the legal
   ground with its act, article and part (from the rules engine; for a
   case about the client's own data in the database, 161-FZ art. 9 part
   11.6, or 11.7 with the Ministry of Internal Affairs' information), the
   options and the deadlines the law gives the client (for such a case,
   the right to apply to the Bank of Russia to remove the data, through
   the bank or its internet reception, under part 11.8), and the next
   steps. The decision on the complaint is the register's; when nobody
   has decided, the draft leaves it for the reviewer. Drafting is high
   risk: it always waits for a person, who reads the letter before it is
   written.
4. **Check the draft** with the rules engine's rubric: grounds named and
   not mixed between 161-FZ and 115-FZ, every option and running deadline
   stated (a missing right to apply for removal cites 161-FZ art. 9 part
   11.8 itself), sentences short. The findings are shown, never applied.
5. **Hand it to legal review.** The assistant never sends a reply; a
   signatory does, after the review.

What the assistant is given is the case's brief: its codes, dates and
amounts from the register and the rules, never the complaint's text. A
complaint that tells an assistant what to do (the corpus has a few) is
shown in the card as the applicant's words, with a notice, and cannot
reach the run: the run service refuses a brief with any string that is
not one of the engine's codes.

Give it how much it may do without asking; read its plan, reorder it,
remove steps, mark the ones that must ask first; run it and watch every
step. Risky steps wait for confirmation with a draft of what they will
do (high risk always asks: no setting lowers that floor), a failed step
waits for Retry, Skip or Stop, the assistant asks before it leaves the
plan, Stop is one key away at every moment, and what was done can be
undone: internal changes at any time, the fact request within a window
that is counted down on screen (while a confirmation is open, its toast
waits behind it, out of reach, and its time stands still). A summary
closes the run, and steps the run never reached show as not run. Each case keeps its own
run while the page is open. What the run does stays in the run and its
log, with one exception: the handover. Once a person confirms it (in the
run, when the step asked, or with Confirm the handover under the
finished step), the case moves to legal review, the draft is kept with
the case for the reviewer, and the journal says the assistant handed it
over and who confirmed. The run's log stays as it was, the step is no
longer undone from the run (a return for rework is the reviewer's), and
a case past drafting shows no Run. The handover is the operator's, on
their own cases.

Keys in the open case: R runs the plan, S stops, P pauses or resumes, Q
goes back to the queue, ? lists them. In a confirmation the focus is on
the safe action, so an Enter pressed by habit does not confirm.

### How the run streams

The deployment is static: there is no server. The run streams as
server-sent events from a Service Worker in the browser
(`src/agent/sw.ts`, built to `sw.js` at the base path), which answers the
engine's request shape with `@ariadne/runner/sse`. The page owns the
approved plan and the decision log; each segment of the run is a request
with both and the id of the last event the page has, and ends at the
next decision or at the end of the run.

- The desk starts the worker when it loads. First visit: the worker
  installs, takes over the page at once (`skipWaiting`, `clients.claim`)
  and the page waits for it before the first stream. A forced reload
  loads the page without the worker; the page asks it to claim the page
  again.
- A new deployment of the worker takes over the open page as soon as the
  browser sees it; a stream that is open moves to the new worker and goes
  on after the last event.
- A dropped connection is resumed by the page with the engine's `after`
  parameter. In Chromium the request with which EventSource reconnects
  through a Service Worker carries no `Last-Event-ID`, so the browser's
  own reconnection would replay the segment from its start.
- Where service workers cannot run (a private window, a privacy setting),
  the panel says so and offers to run the engine inside the tab.

Stop sends a stop decision placed after the last event seen. The engine
ends the run there: a step that is running finishes (it never cuts an
action in half) and no new step starts; a step waiting for a decision is
skipped at once. Pause closes the stream between two events, and Resume
opens the next segment after the last one.

Link parameters for the stream: `?seed=` (the scenario number: it sets
the agent's confidence and each step's duration, and an odd number makes
the fact request time out once),
`?speed=fast`, `?undoWindow=<seconds>`, `?drop=1` (cut the first segment
once, to see a reconnection) and `?scale=<factor>` (multiplies every
delay between events; 0 sends a segment at once).

## Preferences

The header switches the theme (System, Light, Dark; System by default)
and the language (Russian by default, and English). Both are kept in the
link (`?theme=`, `?lang=`) and for the next visit (`ariadne.theme`,
`ariadne.lang`), and set before the first paint by Stoa's
`firstPaintScript`, which the build inlines into the page from the same
description `useAppPreferences` reads (`src/preferences.ts`). Saved views
are kept under `ariadne.views`. The data follows the language: the same
cases, with names, complaint texts and notes from the engine's pool for
that language.

## Engines

[`@ariadne/grid`](../../packages/grid) generates the register and does
the data work: columnar store, filters with facet counts, sorting, search,
views, role rules, edit validation, undo history, the simulated colleague
and CSV. Its legal dates come from [ariadne-rules](../../crates/ariadne-rules)
through [`@ariadne/rules`](../../packages/rules), the WebAssembly build of
the Rust engine: the desk worker loads it before it generates a row, and
the page loads it for the case card. Generation, filtering, sorting,
search and CSV run in a Web Worker; edits are made on the page's store
through the engine's `EditHistory` and copied to the worker. Without a
worker the same code runs on the main thread.

The interface is React and TypeScript on the
[Stoa](https://github.com/ghostjima/stoa) design system: DataGrid with
its tones and drawn cells (DeadlineCell for the time left),
DataGridColumnChooser, DataGridSelectionBar, FilterBar, Countdown,
DerivationTable, Table, Tabs, Timeline (the card's flags and channel
timeline, and the case's journal), DetailHeader (the open case's and
the metrics' header, with `focusWhenReady` for Back and Q), Letter (the assistant's draft, the
letter under review and the signed letter), FindingsList (the rubric's
findings), TextDiff (the review's changes), RadioGroup and TextArea (the
signatory's decision record, and the letter's editor with the letter's
language on its text), StepList, and the preferences, formatter and
breakpoint helpers. The desk keeps its own count of changed characters
for the measure of light edits (`workflow/textDiff.ts`: per changed
passage, the longer side, over the draft), which is not TextDiff's
share.

## Accessibility, as far as the tests go

The end-to-end tests (Playwright, Chromium) run axe-core 4.13.0 and find
no serious or critical violation in Russian and English, each in the
light and the dark theme, on: the loaded queue, a selection with its
bar, an editor showing an error, the shortcuts, save-view and columns
dialogs, no matches, loading, a partial load failure with the operator
role, the open case with its card and assistant, the work on a case
with its journal, the return for rework with its refusal, the review
of a letter with its findings and changes, the signature with a refused
decision record, the review of a reply about removing the client's data
with the grounds offered and with 161-FZ art. 9 part 11.7 named, the
dispatch's confirmation and its send delay, the
supervisor's refused extension, the bank's own application to remove the
client's data refused without reasons, its confirmation and sent, the
Bank of Russia's request on the client's own application recorded, its
answer refused without a view and answered, the
supervisor's metrics, and, in the
assistant,
the plan, the agent's request to change a step, a failed step, the
reply's confirmation with its letter, a finished run with the draft, the
rubric's check, its summary and toasts, New plan asking before it ends
an open undo window, an empty plan, the run service starting, and the
run service failed; and on the conflict dialog with a toast in Russian,
dark, and the adversarial case in both languages.

They also check: the main tasks by keyboard (grid moves, sorting from a
header, editing and the rules' refusals, selecting rows, undo, opening a
case and going back, the app shortcuts, the signatory's decision and
its record; in the assistant, editing the
plan, running, confirming and skipping, retrying a failed step, stopping
from a confirmation, pausing and resuming) and editing with the mouse;
where the focus goes after a bulk change, a Retry, the conflict dialog,
deleting a view, opening and closing a case, a transition taken from
the case and the return dialog, the confirmed handover, the letter's
editor, a signature and a deferral, the dispatch's confirmation and its
cancel, a copy marked sent, the bank's own application to remove the
client's data once sent, the Bank of Russia's request recorded and
answered, and after every
decision in
a run (never to the page's body; the assistant's focus tests run a
second time with the page's CPU slowed six times, as on a slow CI
runner); `lang` and the theme set before the application's script runs;
no sideways page scroll at 1280 and 375 px in both languages, every grid
column reachable and editable at 375 px, and Run on the first screen of
the assistant at 1280x800 and 375x812 (for a case past drafting, the
reason there is no Run, at 375x812 in Russian, for the open case whose
Run or reason ends lowest, found by opening every open case); at 375 px
the plan's bar inside its panel and every control in it inside its
container, in both languages; the header staying put while the
page scrolls under it, and the scrollbars drawn in Stoa's tokens. Status
changes are announced politely and only at the run's turns. Under
reduced motion the undo countdown still counts, without animating.
Screen readers were not tested by hand.

## Measurements

Taken in the source repositories, before the complaints register, the
merge and the assistant's complaint scenario, and kept as a record: they
are not current until taken again. The queue's, on commit `7da277e` of Valkyra-Labs/argus-desk with
50,000 sales requests: [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md). The
assistant's run, from the agent app before it became this panel:
[docs/AGENT-MEASUREMENTS.md](docs/AGENT-MEASUREMENTS.md). The scripts
that take them again are `pnpm measure` (the queue, in the scale mode)
and `pnpm measure:agent`.

## Development

Stoa is linked from a sibling checkout: clone
[ghostjima/stoa](https://github.com/ghostjima/stoa) next to this
repository and build it (`pnpm install --frozen-lockfile && pnpm build`).
At this repository's root, build the rules crate's WebAssembly module and
then the packages and the app (see the root README); then, from this
folder:

```bash
pnpm dev                          # http://localhost:5182
pnpm test && pnpm e2e             # e2e builds and serves on port 4178
```

`pnpm e2e` builds the app every time and tests the build through
`vite preview` on 4178, Service Worker included; `E2E_PORT` moves it to
another port, as CI does, and `E2E_CPU_THROTTLE` sets the slowed CPU's
rate for the focus tests' second run:

```bash
E2E_PORT=4181 pnpm e2e
```

## License

MIT OR Apache-2.0, at your option.
