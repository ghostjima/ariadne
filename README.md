# Ariadne Desk

[![CI](https://github.com/ghostjima/ariadne/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ghostjima/ariadne/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20OR%20Apache--2.0-blue.svg)](#license)

## In one minute

Ariadne Desk is an internal operations desk for the people in a bank who
answer complaints, starting with the fastest-growing kind: complaints
about refused operations and blocked cards and accounts. An assistant
drafts; a person decides. The key decision is that the assistant never
takes a regulated or irreversible step on its own: it proposes a plan,
and every risky step waits for a person, can be stopped, and can be
undone within a stated window.

What runs today is one working prototype on synthetic data, entirely in
the browser, in Russian (the default) and English:

- **The queue** of a register of invented complaints, each with its
  legal deadline counted by the rules engine: the open cases by time left
  in working days, views (due within 3 working days, overdue, forwarded
  by the Bank of Russia, waiting for facts, awaiting signature), filters
  with counts, operator, legal reviewer, signatory and supervisor roles,
  edits the rules check, bulk reassignment with undo, edit conflicts with a simulated
  colleague, and CSV export.
- **The open case** in one window: its stage, the transitions the role
  may take from it (the operator hands over, the reviewer approves or
  returns for rework with a reason, the signatory sends or returns, the
  supervisor closes) and its journal of who did what, when and why; the
  complaint, the applicant, the
  operation, the flags around it (the OD-2506 sign in the order's own
  words, or the 115-FZ category, the measures taken with their grounds
  and the terms they bring), the duties tied to them and how long the
  case is kept, the timeline of its channels, linked
  cases, and how the reply's last day was worked out, each step with its
  source.
- **The assistant** beside the case: a run a person can stop. For the
  open case it proposes a plan: classify the complaint, request the facts
  from antifraud, AML compliance or operations with a deadline of their
  own, draft the reply citing the law from the rules engine, check the
  draft with the rubric, hand it to legal review (the case moves there,
  with the draft, once a person confirms the handover). The person edits and
  approves the plan, confirms the risky steps (drafting a reply always
  asks), stops the run at any moment, and undoes what was done. The
  assistant is given the case's codes, dates and amounts, never the
  complaint's text, so nothing an applicant writes can instruct it; it
  sends nothing to the client.

Intake and registration are not built yet;
[What comes next](#what-comes-next) says what is. There is no screenshot
or public deployment yet; the desk runs locally as described under
[Development](#development).

## Problem

Complaints about banks are growing, and refusals are why. The Bank of
Russia received 235.2 thousand complaints about credit institutions in
2025, 14.7% more than in 2024, and names refused operations and blocked
cards and online banking as the main source of the growth, following
tighter anti-fraud measures
([Bank of Russia, report on complaints for 2025](https://www.cbr.ru/Collection/Collection/File/59635/2025_4.pdf)).

Each written complaint runs against the clock. Under Federal Law
442-FZ a financial organisation answers within fifteen working days,
which can be extended by ten; for a complaint the Bank of Russia
forwarded, copies of the reply and of any notices go back to the Bank of
Russia on the day they are sent to the client
([Bank of Russia, questions and answers on 442-FZ](https://www.cbr.ru/explan/442-fz/)).
An operator answering a refusal has to gather facts from other teams
(anti-fraud, anti-money-laundering), cite the right legal ground and
keep the deadline, usually across several systems.

## Users and workflows

Users: the complaints operator, the teams who supply facts (anti-fraud,
anti-money-laundering, lending), the signatory, the supervisor and
compliance.

The workflows the desk is built around, and what exists of each today:

| Workflow | Today |
|---|---|
| Intake and registration, with the stream of each complaint recognised | not built |
| Queue with the time left, views and roles | built: the register's deadlines from the rules engine, time left in working days, the working views, operator, legal reviewer, signatory and supervisor roles |
| Case card: client, operation, flags, linked cases, fact requests | built: the complaint, the applicant, the operation, the OD-2506 sign or 115-FZ category, the measures with their grounds and every term they bring, the duties and the storage term, the channel timeline, linked cases, and the derivation of the reply's last day; the structured fact request is the assistant's step, with its own deadline from the rules engine |
| Draft: the assistant proposes a plan and a reply | built as the agent run for the open case: classify, request facts, draft the reply from templates over the case's facts with the act and article from the rules engine, check it with the rubric, hand it to legal review; the consent rule, confirmations with the draft, stop and undo windows |
| Extension of the deadline, with a reason and an approver | built: an extension of ten working days to request documents by the supervisor, with its reason, refused by the rules engine for a money claim under 123-FZ (in words) and after the last day for its notice; a forwarded complaint's notice owes the Bank of Russia a copy that day |
| Review and signature, dispatch and copies | in part: the stages as explicit states with the transitions of each role; the review of the letter (what the rubric finds, the changes against the assistant's draft, the reviewer's edit), approval or a return for rework with a reason; the signature with its decision record, the signed letter frozen; the dispatch a person confirms, with a cancellable send delay, and the same-day copies to the Bank of Russia and to a self-regulatory organisation, with their own view |
| Journal and metrics | built: every transition of a case in its journal, with who, when and why, exported with the letter, the copies and the derivation of the reply day for an inspection; retention marked; the supervisor's metrics over the register (time to first action, deadline breaches in working days, drafts signed with at most 20% changed, override rate, returns for rework, reopened and escalated cases), overall and per operator, labelled as computed from the synthetic register; the agent run keeps a session log of every event and decision, which can be copied as text |

## Constraints

- **Regulation.** Deadlines and duties come from law: 442-FZ for written
  complaints, 123-FZ for claims that can go to the financial ombudsman,
  161-FZ for blocked operations, 115-FZ for refusals on anti-money-
  laundering grounds. Rules encoded in an engine cite the act, the
  article and the revision date.
- **Risk.** A reply to a regulated complaint is high risk: a person signs
  it. Complaint text and model output are untrusted data and never
  instructions.
- **Data.** Synthetic and seeded only; no real client data is stored,
  shown or used in tests.
- **Licensing.** Code under MIT OR Apache-2.0; fonts under the SIL Open
  Font License 1.1.

## Decisions

- **Deterministic engines rather than a live model by default.** The
  agent today is a seeded script with a consent rule, and the page says
  so; every run replays the same way from the same plan and decisions,
  which is what makes it testable. Rejected: calling a hosted model from
  the page, which needs a server and keys and cannot be replayed.
- **The person stays in charge of every risky step.** High-risk steps
  always ask; Stop ends the run after the current step and never cuts an
  action in half; outgoing letters can be undone within a counted-down
  window. Rejected: running everything and reviewing afterwards.
- **No server.** The run streams as server-sent events from a Service
  Worker in the browser, and the grid's data work runs in a Web Worker
  over a columnar store. Rejected: a backend, which a static deployment
  cannot have.
- **Legal logic in Rust, compiled to WebAssembly.** Working-day
  calendars and legal clocks are deterministic rules that are tested
  against primary texts; the same pattern serves the bond engine of the
  sibling product. Rejected: the same rules in TypeScript inside the
  apps. Not built yet.
- **One repository, engines as packages.** The apps and their engines
  change together, so they are built and tested together.

## What is built

- [`apps/desk`](apps/desk/README.md): Ariadne Desk: the queue, the open
  case with its card, and the assistant beside it, its run streamed from
  a Service Worker.
- [`packages/grid`](packages/grid/README.md) (`@ariadne/grid`): the
  desk's data engine: a seeded synthetic register of complaints in
  Russian and English (1,200 cases by default, 50,000 in the scale
  mode, a few with text addressed to an assistant, marked for tests),
  columnar store, filters with facets, views, roles, edit validation,
  undo, the simulated colleague and CSV.
- [`packages/rules`](packages/rules/README.md) (`@ariadne/rules`): the
  TypeScript adapter over the rules engine's WebAssembly build, through
  which the grid, the desk and the agent ask it; it computes nothing
  itself.
- [`packages/runner`](packages/runner/README.md) (`@ariadne/runner`):
  the agent's run engine for a complaint: seeded plan over a case brief
  of codes, consent rule, confirmations, undo windows, replay and the
  versioned event stream.
- [`crates/ariadne-rules`](crates/ariadne-rules/README.md): the legal
  rules engine in Rust compiled to WebAssembly; so far the Russian
  production calendar for 2025 to 2027, counting in working days, and
  the legal clocks of 442-FZ, 123-FZ, 161-FZ and 115-FZ, each deadline
  with its act, article, part and revision; the signs of Bank of Russia
  Order No. OD-2506 and the 115-FZ refusal grounds as reason codes; the
  161-FZ grounds a reply names, among them art. 9 parts 11.6 and 11.7 for
  a reply about removing the client's data from the Bank of Russia's
  database, with the bank's choice under part 11.6 between suspending the
  client's card and capping the client's transfers, and the ATM cash cap
  of the Banking Law art. 30 part 16; and a rubric that returns coded
  findings on a structured reply.

The desk is built on the [Stoa](https://github.com/ghostjima/stoa)
design system and is tested with axe in Russian and English, light and
dark. It is not deployed yet; its build is set up for
ghostjima.github.io/ariadne/.

## What comes next

- Intake and registration, with the stream of each complaint recognised.
- The assistant's handover changes the register once a person confirms
  it; the rest of its run stays in its own run and log.

## Validation plan and target metrics

None of this has been measured with people; each item is a hypothesis
to be tested with people who do this work, and target values are set
only after a baseline exists. The supervisor's view of the desk computes
each one over the synthetic register in the page, to show how it is
counted; those figures describe the generator, not a bank.

- Time from a complaint's arrival to the first action on it.
- Deadline breaches, counted in working days.
- Share of assistant drafts signed with at most 20% of their characters
  changed.
- Override rate: decisions where the person rejected or replaced what
  the assistant proposed.
- Reopened and escalated cases.

## Measured quality

[![Unit tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/unit-tests.json)](#what-each-badge-counts)
[![e2e](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/e2e.json)](#what-each-badge-counts)
[![axe](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/axe.json)](#what-each-badge-counts)
[![Lighthouse accessibility](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/lighthouse-accessibility.json)](#what-each-badge-counts)
[![Lighthouse best practices](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/lighthouse-best-practices.json)](#what-each-badge-counts)
[![Lighthouse SEO](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/lighthouse-seo.json)](#what-each-badge-counts)
[![Bundle gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/bundle-size.json)](#what-each-badge-counts)
[![ariadne-rules tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/rules-tests.json)](#what-each-badge-counts)
[![ariadne-rules wasm gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ghostjima/ariadne/badges/rules-wasm-size.json)](#what-each-badge-counts)

CI measures these badges on each commit to `main`, and the badge branch
records the commit they were measured on. Timings and
sizes of the desk and each engine, each stamped with its commit, machine
and browser, are in the `docs/` of the desk and of each package; those
records were taken in the source repositories before their import here.

### What each badge counts

CI checks out this repository and Stoa side by side, builds Stoa, then
builds and tests the packages and the desk; in parallel it lints and
tests the rules crate on Linux, macOS and Windows, builds its
WebAssembly package and checks it on Rust 1.85. Each green run on `main`
publishes the dynamic badges to the `badges` branch, as JSON that
img.shields.io reads; `scripts/badges.mjs` builds them from that run's
own output and stops, publishing nothing, when a value cannot be read.

- Unit tests: tests passed, summed over Vitest in every package and app
  and node:test in the root scripts (`pnpm test`).
- e2e: Playwright tests passed in Chromium against `vite preview` of
  the desk's build, its Service Worker included. The assistant's focus
  tests count twice: they run again with the page's CPU slowed down.
- axe: axe-core 4.13.0 in the e2e, a serious or critical violation fails
  the run. Counted as states times language and theme pairs (Russian and
  English, light and dark), the states listed under the desk's
  [accessibility section](apps/desk/README.md#accessibility-as-far-as-the-tests-go).
  Scans outside this matrix fail the run too but are not counted.
- Lighthouse: Lighthouse 13 accessibility, best practices and SEO scores
  for the desk's home page served by `vite preview`, the lower of
  desktop and mobile. Performance is not shown: on a shared CI runner it
  measures the runner.
- Bundle gzip: every JavaScript and CSS file in the desk's `dist/`, gzip
  level 9, workers included. The fonts, `index.html` and the WebAssembly
  module (its own badge) are not included.
- ariadne-rules tests: tests passed in `cargo test --release -p
  ariadne-rules` on Linux, unit, integration and doc tests summed; a
  failed, filtered or incomplete run publishes nothing.
- ariadne-rules wasm gzip: the crate's WebAssembly module as `wasm-pack`
  builds it for the browser (release, feature `wasm`), gzip level 9. The
  JavaScript glue is not included.

## Role

Timur Khubaev ([ghostjima](https://github.com/ghostjima)): research,
product and interaction design, the Stoa design system, the engines and
the front end.

## Development

The desk links Stoa from a sibling checkout: clone
[ghostjima/stoa](https://github.com/ghostjima/stoa) next to this
repository (as `../stoa`) and build it there with
`pnpm install --frozen-lockfile && pnpm build`. The register's deadlines
come from the rules crate's WebAssembly build, which needs Rust (the
toolchain is pinned in `rust-toolchain.toml`) and `wasm-pack`. Then, here:

```bash
wasm-pack build crates/ariadne-rules --release --target web --out-dir pkg --out-name ariadne_rules -- --no-default-features --features wasm
pnpm install --frozen-lockfile
pnpm build          # the packages, then the desk
pnpm -r typecheck
pnpm test           # every package's unit tests and the root scripts'
pnpm --filter @ariadne/desk e2e
```

The rules crate's own commands are in
[its README](crates/ariadne-rules/README.md#development).

The end-to-end tests build the desk and serve it with `vite preview` on
4178; `E2E_PORT` moves it. The dev server: `pnpm --filter @ariadne/desk
dev` on 5182. How to contribute, and what every change has to pass:
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT OR Apache-2.0, at your option. Fonts: SIL Open Font License 1.1.
