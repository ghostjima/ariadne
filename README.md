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

What runs today is the foundation, as two working prototypes on
synthetic data, entirely in the browser:

- **Ariadne Desk** (`apps/desk`): a keyboard-first desk for 50,000
  requests in one grid, with SLA hours, filters with counts, saved
  views, roles, bulk changes with undo, edit conflicts with a simulated
  colleague, and CSV export.
- **Ariadne Agent** (`apps/agent`): an agent run a person can stop. The
  assistant proposes a plan; the person edits and approves it, confirms
  the risky steps, stops the run at any moment, and undoes what was
  done.

The complaints domain itself (legal deadlines, case cards, drafts,
signature) is not built yet; [What comes next](#what-comes-next) says
what is. There is no screenshot or public deployment yet; the apps run
locally as described under [Development](#development).

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
| Queue with the time left, views and roles | built as a general request grid: SLA hours, preset and saved views, operator and manager roles |
| Case card: client, operation, flags, linked cases, fact requests | not built |
| Draft: the assistant proposes a plan and a reply | built as the agent run: plan, consent rule, confirmations with a draft, stop, undo windows |
| Extension of the deadline, with a reason and an approver | not built |
| Review and signature, dispatch and copies | not built |
| Journal and metrics | the agent run keeps a session log of every event and decision, which can be copied as text |

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

- [`apps/desk`](apps/desk/README.md): Ariadne Desk, the 50,000-row desk.
- [`apps/agent`](apps/agent/README.md): Ariadne Agent, the stoppable agent
  run, streamed from a Service Worker.
- [`packages/grid`](packages/grid/README.md) (`@ariadne/grid`): the
  desk's data engine: deterministic generation, columnar store, filters
  with facets, views, roles, edit validation, undo, the simulated
  colleague and CSV.
- [`packages/runner`](packages/runner/README.md) (`@ariadne/runner`):
  the agent's run engine: seeded plan, consent rule, confirmations, undo
  windows, replay and the event stream.
- [`crates/ariadne-rules`](crates/ariadne-rules/README.md): the legal
  rules engine in Rust compiled to WebAssembly; so far the Russian
  production calendar for 2025 to 2027, counting in working days, and
  the legal clocks of 442-FZ, 123-FZ, 161-FZ and 115-FZ, each deadline
  with its act, article, part and revision; the signs of Bank of Russia
  Order No. OD-2506 and the 115-FZ refusal grounds as reason codes; and a
  rubric that returns coded findings on a structured reply.

Both apps are built on the [Stoa](https://github.com/ghostjima/stoa)
design system and are tested with axe in English, Russian and Arabic,
light and dark. They are not deployed yet; their builds are set up for
ghostjima.github.io/ariadne/ (the desk) and /ariadne/agent/ (the agent).

## What comes next

- The complaints domain in both engines: a complaints schema for the
  grid (streams, legal dates, stage, signatory) and a complaints
  scenario for the runner, with the two apps merged into one desk.
- `crates/ariadne-rules`: the Russian production calendar and working
  days, the legal clocks, reason codes, extension rules and a rubric for
  replies, in Rust compiled to WebAssembly.
- Russian as the first interface language and English as the second.

## Validation plan and target metrics

None of this has been measured; each item is a hypothesis to be tested
on the synthetic corpus with people who do this work, and target values
are set only after a baseline exists.

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
sizes of each app and engine, each stamped with its commit, machine and
browser, are in the `docs/MEASUREMENTS.md` of that app or package; those
records were taken in the source repositories before their import here.

### What each badge counts

CI checks out this repository and Stoa side by side, builds Stoa, then
builds and tests the packages and both apps; in parallel it lints and
tests the rules crate on Linux, macOS and Windows, builds its
WebAssembly package and checks it on Rust 1.85. Each green run on `main`
publishes the dynamic badges to the `badges` branch, as JSON that
img.shields.io reads; `scripts/badges.mjs` builds them from that run's
own output and stops, publishing nothing, when a value cannot be read.

- Unit tests: tests passed, summed over Vitest in every package and app
  and node:test in the root scripts (`pnpm test`).
- e2e: Playwright tests passed in Chromium against `vite preview` of
  each app's build, the agent's Service Worker included; the total, then
  each app's count.
- axe: axe-core 4.13.0 in the e2e, a serious or critical violation fails
  the run. Counted for each app as states times language and theme
  pairs (English, Russian and Arabic, light and dark): for the desk, the
  states listed under its
  [accessibility section](apps/desk/README.md#accessibility-as-far-as-the-tests-go);
  for the agent, those under
  [its own](apps/agent/README.md#accessibility). Scans outside these
  matrices fail the run too but are not counted.
- Lighthouse: Lighthouse 12 accessibility, best practices and SEO scores
  for each app's home page served by `vite preview`, the lowest of both
  apps, desktop and mobile. Performance is not shown: on a shared CI
  runner it measures the runner.
- Bundle gzip: every JavaScript and CSS file in each app's `dist/`, gzip
  level 9, summed per app, workers included. The fonts and `index.html`
  are not included.
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

The apps link Stoa from a sibling checkout: clone
[ghostjima/stoa](https://github.com/ghostjima/stoa) next to this
repository (as `../stoa`) and build it there with
`pnpm install --frozen-lockfile && pnpm build`. Then, here:

```bash
pnpm install --frozen-lockfile
pnpm build          # the packages, then the apps
pnpm -r typecheck
pnpm test           # every package's unit tests and the root scripts'
pnpm --filter @ariadne/desk e2e
pnpm --filter @ariadne/agent e2e
```

The rules crate needs Rust (the toolchain is pinned in
`rust-toolchain.toml`) and, for the browser build, `wasm-pack`; its
commands are in [its README](crates/ariadne-rules/README.md#development).

The end-to-end tests build their app and serve it with `vite preview`,
the desk on 4178 and the agent on 4177; `E2E_PORT` moves it. The dev
servers: `pnpm --filter @ariadne/desk dev` on 5182 and
`pnpm --filter @ariadne/agent dev` on 5183. How to contribute, and what
every change has to pass: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT OR Apache-2.0, at your option. Fonts: SIL Open Font License 1.1.
