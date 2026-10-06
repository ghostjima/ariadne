# Measurements

## Engine timings in Node, protocol version 2 (2026-10-06, ariadne `4973f99`)

Taken in this repository on commit `4973f99` with a clean tree, on the
built `dist/` (`tsc -p tsconfig.build.json`). Host: Apple M4 Pro,
macOS (Darwin 25.6.0), Node v22.18.0. Method: `pnpm bench`
(`scripts/bench.mjs`), as described below for version 1. Plan: the case
of `test/briefs.ts` (a suspended transfer with a linked case), seed 7,
autonomy `high_only`, all five steps, every pause answered with confirm,
allow or retry: 2 decisions (allow the linked case's facts, confirm the
draft) and 30 events. Three runs of the script; the machine was shared
with other work at the time, which shows in the spread of the medians.

| measure | best (3 runs) | median (3 runs) |
|---|---|---|
| `generateScenario(7, case)`, a plan of 5 steps | 0.4-1.0 us | 0.5-1.6 us |
| replay of the complete run (`runPlan` with the full log, 30 events) | 3.9-4.3 us | 5.0-14.2 us |
| every segment of one session (3 replays) | 8.3-9.2 us | 8.7-25.8 us |
| `handleAgentRequest` in Node: a `Request` for the complete run to the SSE text of its `Response` (4,895 bytes) | 50.0-51.6 us | 64.4-127.2 us |

What this does not show is listed under version 1 below, and holds here.

## Version 1, kept as a record

Taken in the Valkyra-Labs/ariadne-runner repository before its import here, on
the procurement scenario of protocol version 1; the commits named below are
that repository's.

Every number in the README comes from here, with its stamp. Host: Apple
M4 Pro (12 CPU cores: 8 performance, 4 efficiency), 24 GB, macOS 26.6.2
(Darwin 25.6.0). Runtime: Node v22.18.0. Build: `tsc -p
tsconfig.build.json` (ES2022 output, no bundler, no minifier), timed on
the built `dist/`.

## Engine timings in Node (2026-10-04, ariadne-runner `02ed805`)

Method: `pnpm bench` (`scripts/bench.mjs`). Each sample times a batch of
calls and divides by the batch size (1,000 calls for generation, 200
for a replay, 50 for a session and for the handler); a row reports the
best and the median of 30 samples, after a warm-up. Results feed a sink
that is printed, so no call is optimised away. Delays between events
are not waited for (time scale 0, or a sleep that resolves at once):
these are the engine's computing costs, not the pacing of a demo run.
Plan: seed 7, autonomy `high_only`, all twelve steps, every pause
answered with confirm, allow or retry, which takes 7 decisions and
produces 73 events. Three runs of the script:

| measure | best (3 runs) | median (3 runs) |
|---|---|---|
| `generateScenario(7)`, a plan of 12 steps | 0.8-0.9 us | 0.9-1.0 us |
| replay of the complete run (`runPlan` with the full log, 73 events) | 8.0-8.5 us | 9.1-9.2 us |
| every segment of one session (8 replays, one per decision plus the first) | 41.2-43.4 us | 47.6-50.7 us |
| `handleAgentRequest` in Node: a `Request` for the complete run to the SSE text of its `Response` (12,976 bytes) | 81.0-86.6 us | 97.0-117.2 us |

The session row is what statelessness costs: every segment replays the
run from the first event, so a session of n decisions replays it n + 1
times, and the cost grows with the square of the run's length. At twelve
steps that is under 0.06 ms in total.

What this does not show: timings inside a browser or a Service Worker,
the first (cold) call before the JIT warms up, the cost of the XState
machines, memory use, and any other seed or plan shape.
