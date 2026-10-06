# ariadne-rules

Part of [Ariadne Desk](../../README.md). CI builds, tests and measures
this crate with the rest of the repository; the badges and what each one
counts are in the root README.

The deterministic legal core of the desk, in Rust compiled to
WebAssembly: the rules a complaint is measured against, as plain
functions over plain data, each tested on worked examples written by
hand. The desk calls it from a Web Worker.

**Not legal advice.** The crate encodes a reading of the sources listed
below, at the revisions listed below. Where a reading is uncertain, the
crate encodes the conservative one and says so in the code and here. A
person decides every case.

Status: early. The production calendar and working days are in; the
legal clocks, reason codes and the reply rubric follow.

## What it computes

### The production calendar, 2025 to 2027

For a five-day week, every day from 2025-01-01 to 2027-12-31 is a working
day or not, and why (`day_kind`): a holiday under the Labour Code,
art. 112 part 1; a Saturday or Sunday; a weekday a day off was moved to;
or a Saturday made a working day by a move. Moves come from art. 112
part 2 (a day off falling on a holiday moves to the next working day
after it, except in 1 to 8 January) and from the Government's decree for
each year, which moves two January days off and may move others. Each
year's moves are listed in `src/calendar.rs` with their basis, and a test
derives the part 2 moves from the article and checks them against the
list.

| Year | Decree | Days off moved | Working days |
|---|---|---|---|
| 2025 | No. 1335 of 04.10.2024 | 4 Jan to 2 May, 5 Jan to 31 Dec, 23 Feb to 8 May, 8 Mar to 13 Jun, 1 Nov to 3 Nov | 247 |
| 2026 | No. 1466 of 24.09.2025 | 3 Jan to 9 Jan, 4 Jan to 31 Dec; under part 2, 8 Mar to 9 Mar, 9 May to 11 May | 247 |
| 2027 | No. 1187 of 17.09.2026 | 2 Jan to 5 Nov, 3 Jan to 31 Dec, 20 Feb to 22 Feb; under part 2, 1 May to 3 May, 9 May to 10 May, 12 Jun to 14 Jun | 247 |

The 2027 decree is published, so no year of the calendar is provisional.
The yearly totals and January's counts (17, 15 and 15) match the
published production calendars, and the tests check them.

Counting:

- `next_working_day(d)`: the first working day strictly after `d`.
- `add_working_days(d, n)`: the `n`-th working day after `d`. A period
  starts on the day after the date that begins it (Civil Code,
  art. 191), so `d` itself never counts.
- `working_days_between(from, to)`: the working days after `from` up to
  and including `to`, negative when `to` is earlier; the inverse of
  `add_working_days`.
- `working_day_on_or_after(d)`: where a period whose last day is not a
  working day ends (Civil Code, art. 193).

A Saturday made a working day by a decree (1 November 2025, 20 February
2027) counts as a working day. That is the decree's reading, and it is
also the conservative one for a deadline: counting it brings the
deadline earlier, never later.

A date outside the calendar, given or reached while counting, is the
error `outside_calendar`, never a guess; a malformed date is
`invalid_date`.

## Interface

Errors and refusals are codes, never sentences: the desk owns the
wording in each interface language.

The WebAssembly build (feature `wasm`) exports, with dates as
`YYYY-MM-DD` strings and errors thrown as `Error` objects whose message is
the code:

- `version()`: the crate version, as built.
- `calendarRange()`: the first and the last day covered.
- `isWorkingDay(day)`, `dayKind(day)` (`working`, `working_weekend`,
  `holiday`, `weekend`, `transferred_day_off`).
- `nextWorkingDay(day)`, `addWorkingDays(day, n)`,
  `workingDaysBetween(from, to)`.

## Sources

Each rule cites its source from `src/sources.rs`; every source is listed
here with the revision its text was checked against, read on 2026-10-06.
A test fails when this list and the code disagree.

| Source | Revision | Text read at |
|---|---|---|
| Labour Code (Трудовой кодекс РФ) No. 197-FZ, art. 112 | 2026-05-25 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_34683/98ef2900507766e70ff29c0b9d8e2353ea80a1cf/) |
| Civil Code, part one (Гражданский кодекс РФ) No. 51-FZ, arts. 191 to 193 | 2026-06-10 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_5142/60f6af8755cda8e568604f21cd44e823c3407d8f/) |
| Government Decree No. 1335 of 04.10.2024, transfers of days off in 2025 | 2024-10-04 | [government.ru, PDF](http://static.government.ru/media/files/QkGT2QIDdzICtlaxOxctIZQONofaJwZO.pdf) |
| Government Decree No. 1466 of 24.09.2025, transfers of days off in 2026 | 2025-09-24 | [government.ru, PDF](http://static.government.ru/media/files/4jeB8hNKm69ggOa9yDiYOli6YoAyM21i.pdf) |
| Government Decree No. 1187 of 17.09.2026, transfers of days off in 2027 | 2026-09-17 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_544706/) |

The decrees have not been amended; their revision is their date.

## Development

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo clippy --workspace --all-targets --locked --all-features -- -D warnings
cargo test --workspace --locked
wasm-pack build crates/ariadne-rules --release --target web --out-dir pkg --out-name ariadne_rules -- --no-default-features --features wasm
```

The minimum supported Rust version is 1.85, for the native build and the
`wasm32-unknown-unknown` target.
