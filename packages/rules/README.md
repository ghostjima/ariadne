# @ariadne/rules

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges are in its README.

The desk's TypeScript adapter over
[ariadne-rules](../../crates/ariadne-rules/README.md), the legal rules
engine in Rust compiled to WebAssembly. It computes nothing itself: every
date, count, refusal and finding comes from the WebAssembly module. The
adapter loads the module once, builds the module's inputs from plain
objects, returns plain objects (and frees the module's copies), and caches
the two fixed lists. One implementation of the rules, in Rust; the grid,
the desk and the agent all ask it through this package.

## API

| Function | Answer |
|---|---|
| `loadRules(source?)` | loads the module in a browser or a worker, from the file the bundler placed beside the glue |
| `loadRulesSync(bytes)`, `loadRulesFromFile()` (`@ariadne/rules/node`) | loads it from bytes in hand, or from the file in Node |
| `isWorkingDay`, `dayKind`, `nextWorkingDay`, `addWorkingDays`, `workingDaysBetween`, `calendarRange` | the production calendar, 2025 to 2027 |
| `clock(facts)` | the legal clocks of a case: deadlines with their basis, duties, the measures taken with their grounds, warnings, refusals, the reply's last day |
| `od2506Signs()`, `amlReasons()`, `paymentGrounds()` | the signs of Order No. OD-2506 (with the order's wording in Russian), the 115-FZ categories, and the 161-FZ grounds a reply names (art. 8 parts 3.4 and 3.10, art. 9 parts 11.6 and 11.7) |
| `rubric(reply, facts)` | coded findings on a structured reply |
| `factRequestDue(facts, sentOn)` | the last day of a request for facts to another unit: two working days, an internal policy, capped by the external terms that bind the answering unit |

Dates are `YYYY-MM-DD` strings. Errors are thrown as `RulesError`, whose
`code` is the crate's (`invalid_date`, `outside_calendar`, ...), or
`rules_not_loaded` before the module is in; never a sentence.

## Development

The module is built by `wasm-pack` from the crate (it needs Rust and
wasm-pack), at the repository root:

```bash
wasm-pack build crates/ariadne-rules --release --target web --out-dir pkg --out-name ariadne_rules -- --no-default-features --features wasm
```

This package's `build`, `typecheck` and `test` copy that build into
`wasm/` (not tracked) and stop with the command above when it is missing.
CI builds the module once, in its `wasm` job, and hands it to the
TypeScript job.

## License

MIT OR Apache-2.0, at your option.
