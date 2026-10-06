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

Status: early. The production calendar, working days, the legal clocks,
the reason codes and the reply rubric are in.

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

### Legal clocks

`clock(case)` takes a `Case` (the stream, the sector, the applicant, how
it arrived, the day of receipt and of registration, a money claim, an
extension asked for, and the antifraud and anti-money-laundering facts
around it) and returns a `Clock`: dated deadlines, duties tied to an
event, warnings about the data, and refusals. Every deadline and duty
names its source (with revision), article and part, and whether it
follows the text or a conservative reading.

| Rule | Term | Basis |
|---|---|---|
| Registration | the working day after receipt | Banking Law art. 30.1 part 5; 151-FZ art. 9.1 part 5; 4015-1 art. 6.2 item 3; 39-FZ art. 15.11 item 1; 190-FZ art. 6.2 part 5 |
| Registration notice, electronic complaint | by the day of registration | the same parts |
| Reply | 15 working days from registration | 30.1 part 7; 9.1 part 7; 6.2 item 5 paragraph 1; 15.11 item 2; 6.2 part 6 |
| Extension | once, at most 10 working days, only to request documents; a reasoned notice | 30.1 part 8; 9.1 part 8; 6.2 item 5 paragraph 2; 15.11 item 3; 6.2 part 7 |
| Copy to the Bank of Russia, forwarded complaint | each notice and the reply, the day they go out | 30.1 part 15; 9.1 part 16; 6.2 item 12; 15.11 item 11; 6.2 part 15 |
| Copy to the self-regulatory organisation, standard breach found | the complaint and the reply, the day the reply goes out | 9.1 part 12; 6.2 item 8; 15.11 item 5; 6.2 part 10 (banks have none) |
| Money claim up to 500,000 roubles from a consumer | 15 working days from receipt on the standard electronic form within 180 days of the breach, otherwise 30 calendar days moved to a working day; no extension | 123-FZ art. 15 part 1, art. 16 part 2, art. 28 part 1 |
| Antifraud suspension of a transfer | two days from and including the day of suspension, calendar days | 161-FZ art. 8 part 3.4; Bank of Russia letter No. 010-31/7975 |
| Client's confirmation | by the day after the suspension | 161-FZ art. 8 part 3.6 item 3 |
| Second suspension after a database match | two days from and including the confirmation; then executed at once | 161-FZ art. 8 parts 3.10, 3.11; the same letter |
| Bank of Russia on a request to remove data | 15 working days from registration | 161-FZ art. 9 part 11.10; the Bank of Russia's page |
| Refund to an individual | 30 days after the claim is received | 161-FZ art. 8 part 3.13 |
| 115-FZ reasons notice | 5 working days from the decision | 115-FZ art. 7 item 13.1-1 (paragraph 1 for an account, 2 for an operation) |
| Answer to the client's documents | 7 working days from submission | 115-FZ art. 7 item 13.4, paragraph 2 |
| Interagency commission | at most 20 working days from the application | 115-FZ art. 7 item 13.5, paragraph 3 |
| High-risk measures notice | 5 working days after the measures | 115-FZ art. 7.7 item 8 |
| Client's application to the commission | 6 months from receipt of that notice | 115-FZ art. 7.8 item 1, paragraph 2 |

The engine never proposes an extension for a money claim under 123-FZ:
the clock carries the refusal `extension_not_allowed` and no extended
date. A claim on the standard form within 180 days gets exactly 15
working days, which around the New Year can end later than 30 calendar
days would (received 11 December 2025: 13 January 2026 rather than
12 January); the engine follows the text.

#### Conservative readings

Where the text leaves a point open, the engine takes the reading that
gives the earlier date or the wider duty, marks the basis
`conservative`, and says so here:

- No registration day given: the earliest possible one (the day of
  receipt when it is a working day) is assumed, with the warning
  `registration_date_assumed`.
- The extension notice is due by the original reply date: the text sets
  no date, and a term cannot be extended after it has ended.
- Under 123-FZ the sector article's registration term is kept, though
  123-FZ sets none.
- A standard-form claim without a breach day, and a money claim to a
  securities market professional (a voluntary participant of the
  ombudsman's procedure at most), take the earlier of the possible reply
  dates and no extension.
- The 30-day refund of 161-FZ art. 8 part 3.13 counts calendar days and
  is not moved off a day off: the Bank of Russia's letter that says so
  covers parts 3.4 and 3.10 only.
- The six months of 115-FZ art. 7.8 end on the same day number six
  months after the notice was received (Civil Code arts. 191, 192), not
  moved off a day off; counting from the day after receipt would end a
  day later.
- 115-FZ art. 7 item 13.4 gives the client's documents and the 7-day
  answer against a refused operation or a refused contract; for a
  terminated contract the engine still gives the 7 days, with the
  warning `documents_answer_beyond_text`.

#### Not covered

- The no-reply notice (5 working days) and stopping correspondence on
  repeated complaints; the insurance carve-out of 4015-1 art. 6.2 item 1
  (claims for an insurance payment are outside the complaint article);
  pawnshops, pension funds and credit bureaus; the three-year limit of
  123-FZ art. 15 part 1.
- The commission's review term under the Bank of Russia's Regulation
  No. 842-P, which the Bank of Russia's guidance gives as 15 working
  days: the regulation's text was not read, so the engine uses the
  statutory ceiling of 20.

#### Codes

- Deadlines: `registration`, `registration_notice`, `reply`,
  `extension_notice`, `reply_extended`, `antifraud_suspension_ends`,
  `antifraud_confirmation`, `antifraud_repeat_suspension_ends`,
  `antifraud_after_repeat_suspension`, `exclusion_decision`,
  `antifraud_refund`, `aml_reasons_notice`, `aml_documents_answer`,
  `aml_commission_decision`, `high_risk_notice`,
  `high_risk_commission_application`.
- Counts: `same_day`, `next_working_day`, `working_days`,
  `calendar_days`, `calendar_days_to_working_day`, `months`.
- Duties: `copy_to_bank_of_russia`, `copy_to_sro`,
  `notify_client_of_block`, `notify_client_of_repeat_block`; when:
  `same_day_as_each_dispatch`, `same_day_as_reply`, `immediately`.
- Warnings: `registration_date_assumed`, `registered_late`,
  `money_claim_outside_ombudsman`, `money_claim_from_legal_entity`,
  `ombudsman_participation_unknown`, `breach_date_unknown`,
  `confirmation_late`, `confirmation_date_missing`,
  `refund_for_individuals_only`, `high_risk_for_legal_entities_only`,
  `documents_answer_beyond_text`, `sro_copy_not_applicable`.
- Refusals: `extension_not_allowed`, `extension_ground_not_allowed`,
  `extension_too_long`.
- Errors: `invalid_date`, `outside_calendar`, `dates_out_of_order`,
  `invalid_extension`, `invalid_amount`, `unknown_code`, `missing_date`.
- Rubric: the findings above; client options `confirm_order`,
  `repeat_operation`, `submit_documents`, `apply_to_commission`,
  `apply_to_ombudsman`; acts `payment_system`, `anti_money_laundering`,
  `ombudsman`, `complaint_law`, `other_law`, `contract`.

### Reason codes

The 14 signs of a transfer without the client's voluntary consent, set by
the Bank of Russia's Order No. OD-2506 of 05.11.2025 from 1 January 2026,
transcribed from the order's text as the Bank of Russia publishes it
(`reasons::SIGNS`): the number, a reason code (`od2506_1_1` to
`od2506_1_12`, `od2506_2_1`, `od2506_2_2`), the group (12 for transfers of
money, 2 for digital rubles), the day it applies from (sign 1.2, the state
anti-fraud system, from 1 March 2026), the thresholds it states, a short
English summary for the desk and the wording in Russian, which is the
law. The thresholds:

| Sign | Threshold |
|---|---|
| 1.9 | calls or messages found in a period of at least 6 hours before the order |
| 1.10 | a phone number changed within 48 hours before the order |
| 1.11 | a cash deposit by token card within 24 hours after a cross-border transfer of more than 100,000 roubles to individuals |
| 1.12 | more than 200,000 roubles in through Faster Payments from the client's own account at another operator, less than 24 hours before an order to someone not paid in the previous 6 months |

A test checks that every threshold appears in its sign's own words, and
a fingerprint of the transcription fails the tests on any change to it.

The grounds of a refusal or restriction under 115-FZ, as reason
categories (`reasons::AmlReason`), each with its article and item:
`aml_operation_refused` (art. 7 item 11), `aml_account_refused` (item 5.2,
paragraph 2), `aml_account_terminated` (item 5.2, paragraph 3),
`aml_operation_suspended` (item 10), `aml_operation_suspended_by_decision`
(item 10.1), `aml_funds_frozen` (item 1, subitem 6),
`aml_high_risk_measures` (art. 7.7 item 5). A sign is a 161-FZ reason, a
category a 115-FZ one.

### Reply rubric

`rubric(reply, case, clock)` checks a structured reply (the legal grounds
it names, its reasons, next steps, the client's options, the deadlines it
states and its text) and returns coded findings. It checks only what
needs no legal judgment:

| Finding | When | Basis |
|---|---|---|
| `ground_missing` | no legal ground named | the Bank of Russia's letter No. IN-01-59/98, paragraph 3 ("со ссылкой на конкретную норму"); Banking Law art. 30.1 part 9 and equivalents |
| `ground_without_article` | a law named without an article (a contract needs none) | the same |
| `grounds_mixed` | 161-FZ and 115-FZ both among the grounds or the reasons | the same letter ("однозначно дифференцировать") |
| `stream_ground_missing` | an antifraud or anti-money-laundering complaint answered without naming that law | the same |
| `next_steps_missing` | no next step | the same ("порядке дальнейших действий") |
| `client_option_missing` | an option the law gives the client is not offered: confirming a suspended order, repeating a refused operation (161-FZ art. 8 parts 3.6, 3.10); documents and then the commission against a 115-FZ refusal (art. 7 items 13.4, 13.5); the commission against high-risk measures (art. 7.7 item 8); the financial ombudsman for a 123-FZ claim (art. 16 part 4) | the letter and each provision |
| `deadline_missing`, `deadline_mismatch` | a deadline that concerns the client and runs on the reply's day is not stated, or stated with another date than the clock's | the Bank of Russia's recommendations on replies (concrete terms) |
| `text_empty`, `sentence_too_long`, `sentences_long_on_average` | no text; a sentence of more than 25 words; more than 15 words a sentence on average | the same recommendations (no long sentences) |

The word limits, 25 and 15, are this engine's own: the Bank of Russia
advises against long sentences but sets no number. They are hypotheses to
calibrate on real replies. Sentences end at a full stop, question or
exclamation mark or ellipsis followed by a capital, so "п. 11 ст. 7" does
not split, and at a line break, for lists.

The rubric reads the 161-FZ and 115-FZ letter conservatively: any reply
that names both laws, or gives reasons from both, is flagged, though a
case can involve both; a person decides whether it does. It also asks
for both the documents and the commission against a refused operation or
contract, as the route the law gives, although the commission comes only
after the bank's answer to the documents.

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
- `clock(input)`: `input` is a `CaseInput`, made with
  `new CaseInput(stream, receivedOn)` and filled with what is known
  (string-enum codes for the choices, `YYYY-MM-DD` for days, whole
  kopecks for a money claim); returns a `ClockOutput` with `regime`,
  `deadlines` (each with `kind`, `due`, `from`, `count`, `countValue`,
  `forOthers` and a `basis` of `source`, `act`, `article`, `part`,
  `revision`, `url`, `reading`), `duties`, `warnings`, `refusals` and
  `replyDue`.
- `od2506Signs()`: the signs, each with `number`, `code`, `group`,
  `summary`, `appliesFrom`, `thresholds` (`value`, `unit`, `bound`, `of`)
  and `wording`.
- `amlReasons()`: the 115-FZ categories, each with `code`, `source`,
  `article`, `part` and `revision`.
- `rubric(reply, input)`: `reply` is a `ReplyInput`, made with
  `new ReplyInput(repliedOn, text)` and filled with `grounds`
  (`GroundInput`s of an act code, article and part), `reasons`,
  `nextSteps`, `clientOptions` and `statedDeadlines`
  (`StatedDeadlineInput`s); `input` is the case's `CaseInput`, from which
  the clock is computed. Returns `FindingOutput`s with `code`, `subject`,
  `sentence`, `words`, `source` and `reference`.

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
| Banking Law (О банках и банковской деятельности) No. 395-1, art. 30.1 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_5842/c96fe25edab2fcc32ab9225c1b392a2b2d599467/) |
| Microfinance Law No. 151-FZ, art. 9.1 | 2026-04-09 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_102112/69201da7780e16951d28521d25d0899992b44981/) |
| Insurance Law No. 4015-1, art. 6.2 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_1307/0f3a0c69a3c8e13748037a8a4667ab9552b69ca4/) |
| Securities Market Law No. 39-FZ, art. 15.11 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_10148/0d69714fc90963f4be8075f53386f5173417d690/) |
| Credit Cooperation Law No. 190-FZ, art. 6.2 | 2026-04-09 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_89568/bee9c2156e1473d4fb79c0c2076863aee37312ca/) |
| Financial Ombudsman Law No. 123-FZ, art. 15 | 2025-12-28 | [garant.ru](https://base.garant.ru/71958414/36bfb7176e3e8bfebe718035887e4efc/) |
| Financial Ombudsman Law No. 123-FZ, art. 16 | 2025-12-28 | [garant.ru](https://base.garant.ru/71958414/7a58987b486424ad79b62aa427dab1df/) |
| Financial Ombudsman Law No. 123-FZ, art. 28 | 2025-12-28 | [garant.ru](https://base.garant.ru/71958414/53070549816cbd8f006da724de818c2e/) |
| National Payment System Law No. 161-FZ, art. 8 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_115625/cbc4acba397e1a1aebba6be746102a90208db5b4/) |
| National Payment System Law No. 161-FZ, art. 9 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_115625/b0062cfb1c3cae710d57f0557303e78760a31d16/) |
| Bank of Russia letter No. 010-31/7975 of 02.09.2024, counting the terms of 161-FZ art. 8 | 2024-09-02 | [garant.ru](https://www.garant.ru/products/ipo/prime/doc/409525913/) |
| Bank of Russia page on requests to remove data from its database | 2026-10-06 (page as read) | [cbr.ru](https://www.cbr.ru/contactBR/161-FZ/) |
| Anti-Money-Laundering Law No. 115-FZ, art. 7 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_32834/3e3e0d20d2919071b55ef95f26f849df6a4f11e8/) |
| Anti-Money-Laundering Law No. 115-FZ, art. 7.7 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_32834/0a562008be657e44b6145557f337cc626af9ffab/) |
| Anti-Money-Laundering Law No. 115-FZ, art. 7.8 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_32834/b9e70868f2269695609ac83c8cabbc15dbc7b4e0/) |
| Bank of Russia Order No. OD-2506 of 05.11.2025, the signs of a transfer without voluntary consent, in force from 01.01.2026 | 2025-11-05 | [cbr.ru, PDF](https://cbr.ru/Crosscut/LawActs/File/10123) |
| Bank of Russia information letter No. IN-01-59/98 of 26.08.2025, informing clients of restrictions | 2025-08-26 | [garant.ru](https://www.garant.ru/products/ipo/prime/doc/412494092/) |
| Bank of Russia page on replies to complaints, with its recommendations | 2026-10-06 (page as read) | [cbr.ru](https://www.cbr.ru/protection_rights/rassmotrenie-obrascheniy-potrebiteley-finansovykh-uslug/) |

The decrees, the letters and Order No. OD-2506 have not been amended as
far as could be found; their revision is their date. The order's PDF on
cbr.ru carries a registration stamp placeholder instead of its number and
date, which come from the Bank of Russia's listing; no amending order was
found on 2026-10-06. The 123-FZ revision is that of its latest amendment
(No. 505-FZ of 28.12.2025) as garant.ru listed it. The Bank of Russia's
forwarding of complaints to organisations (86-FZ arts. 79.3 and 79.4) is
what makes a complaint "forwarded"; the organisation's duties for it are
in the sector articles above.

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
