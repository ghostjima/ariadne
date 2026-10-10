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
extension asked for, and the antifraud, database and
anti-money-laundering facts around it) and returns a `Clock`: dated
deadlines, duties tied to an event, the measures taken with their
grounds, warnings about the data, and refusals. Every deadline, duty and
measure names its source (with revision), article and part, and whether
it follows the text or a conservative reading. A Bank of Russia
directive is numbered in items only: its basis has no article, and the
item is the part.

| Rule | Term | Basis |
|---|---|---|
| Registration | the working day after receipt | Banking Law art. 30.1 part 5; 151-FZ art. 9.1 part 5; 4015-1 art. 6.2 item 3; 39-FZ art. 15.11 item 1; 190-FZ art. 6.2 part 5 |
| Registration notice, electronic complaint | by the day of registration | the same parts |
| Reply | 15 working days from registration | 30.1 part 7; 9.1 part 7; 6.2 item 5 paragraph 1; 15.11 item 2; 6.2 part 6 |
| Extension | once, at most 10 working days, only to request documents; a reasoned notice | 30.1 part 8; 9.1 part 8; 6.2 item 5 paragraph 2; 15.11 item 3; 6.2 part 7 |
| Copy to the Bank of Russia, forwarded complaint | each notice and the reply, the day they go out | 30.1 part 15; 9.1 part 16; 6.2 item 12; 15.11 item 11; 6.2 part 15 |
| Copy to the self-regulatory organisation, standard breach found | the complaint and the reply, the day the reply goes out | 9.1 part 12; 6.2 item 8; 15.11 item 5; 6.2 part 10 (banks have none) |
| Notice of no reply on substance, grounds 2 to 5 (no name, offensive language, illegible, substance unclear); none for ground 1, no address | 5 working days from registration, with the reasons | 30.1 parts 12, 13; 9.1 parts 13, 14; 6.2 items 9, 10; 15.11 items 6, 7; 6.2 parts 11, 12 |
| Notice of stopping the correspondence on a repeated complaint | as the notice above: 5 working days from registration | 30.1 part 14; 9.1 part 15; 6.2 item 11; 15.11 item 8; 6.2 part 13 |
| Keeping the complaint, the reply and every notice | 3 years from registration (credit cooperatives: no statutory term) | 30.1 part 11; 9.1 part 11; 6.2 item 14; 15.11 item 9 (190-FZ art. 6.2 has none) |
| Money claim up to 500,000 roubles from a consumer | 15 working days from receipt on the standard electronic form within 180 days of the breach, otherwise 30 calendar days moved to a working day; no extension | 123-FZ art. 15 part 1, art. 16 part 2, art. 28 part 1 |
| The ombudsman's three years | a warning when more than three years passed since the breach, never a refusal: the consumer may have learned of it later, and the ombudsman may restore the term | 123-FZ art. 15 parts 1, 4 |
| Antifraud suspension of a transfer | two days from and including the day of suspension, calendar days | 161-FZ art. 8 part 3.4; Bank of Russia letter No. 010-31/7975 |
| Client's notice of the block | at once: the block, advice, how to confirm or repeat | 161-FZ art. 8 part 3.6 items 1 to 3 |
| Client's confirmation, transfers only | by the day after the suspension; a later one leaves the order not accepted | 161-FZ art. 8 part 3.6 item 3, part 3.9 |
| Second suspension of a confirmed transfer after a database match | two days from and including the confirmation; then executed at once | 161-FZ art. 8 parts 3.10, 3.11; the same letter |
| Refused repeat of a card, e-money or Faster Payments operation after a database match | two days from and including the repeat; then the next repeat is carried out | 161-FZ art. 8 parts 3.10, 3.11 |
| Client's notice of the second step | at once: the reason, the term, a later repeat | 161-FZ art. 8 part 3.10, sentence 2 |
| Card or online banking suspended for the client's own data in the database | notice with the reason the same day; notice of the right to apply for removal at once; restored at once after removal | 161-FZ art. 9 parts 9.2, 11.8, 11.11 (the suspension under parts 11.6, 11.7) |
| Instead of the suspension under part 11.6, an individual's transfers to individuals capped | at most 100,000 roubles a month while the data are in the database, from the day the bank chose the cap until a later suspension or the removal of the data; where the bank suspended some days after it received the database information, the cap in between; refused with the Ministry of Internal Affairs' information, where the suspension is a duty; none for a legal entity | 161-FZ art. 9 part 11.6, sentence 2; part 11.7 |
| A suspension chosen under part 11.6, lifted while the data are in the database | the suspension ends on the day of the lift and, for an individual, the transfer cap starts; refused with the Ministry of Internal Affairs' information, where the suspension is a duty for the whole period; no cap follows for a legal entity | 161-FZ art. 9 part 11.6 (a conservative reading of its second sentence); part 11.7 |
| ATM cash for a client whose data are in the database | at most 100,000 roubles a month, a credit institution's duty with or without the suspension, for an individual and a legal entity alike, from the day the bank received the database information to the day the data leave the database; without the day of receipt, from the day the bank acted on the data, with a warning | Banking Law art. 30 part 16; the information is received as Directive No. 7282-U items 6.1 to 6.3 set |
| Application to remove data, filed through the operator | forwarded with the operator's view by the next working day; with mandatory data missing, a refusal notice within 5 working days of receipt | Directive No. 6748-U items 1.4, 1.5 |
| Bank of Russia on an application to remove data | 15 working days from its receipt by the Bank of Russia | 161-FZ art. 9 part 11.10; Directive No. 6748-U items 2.1, 2.3, 2.4 |
| The Bank of Russia's decision, passed on by the operator | by the next working day after the operator receives it, for an application filed through the operator; on one filed through the Bank of Russia's Internet reception the decision goes to the client by email and the operator passes nothing on | Directive No. 6748-U items 2.1, 2.3, 2.4 |
| Operator's answer to a Bank of Russia request on an application, including one the client filed with the Bank of Russia directly | 3 working days from the request | Directive No. 6748-U items 2.2, 2.9 |
| Bank of Russia on the operator's own reasoned application to remove the client's data | 15 working days from its receipt, taken as the day it is sent; with the client's application under review, one decision 15 working days from the first | 161-FZ art. 9 parts 11.9, 11.10; Directive No. 6748-U items 2.6 to 2.8 |
| Refund to an individual | 30 days after the claim is received | 161-FZ art. 8 part 3.13 |
| 115-FZ reasons notice | 5 working days from the decision | 115-FZ art. 7 item 13.1-1 (paragraph 1 for an account, 2 for an operation) |
| Answer to the client's documents | 7 working days from submission | 115-FZ art. 7 item 13.4, paragraph 2 |
| Interagency commission | at most 20 working days from the application | 115-FZ art. 7 item 13.5, paragraph 3 |
| Organisation's answer to the commission's request | the term the request sets, at least 3 working days; 3 when unknown | 115-FZ art. 7 item 13.6, paragraph 1; Regulation No. 842-P items 2.6, 2.8 |
| Notice of the commission's decision | 3 working days from the decision, to the applicant and the organisation | Regulation No. 842-P item 4.1; 115-FZ art. 7 item 13.6 |
| High-risk measures notice | 5 working days after the measures | 115-FZ art. 7.7 item 8 |
| Client's application to the commission | 6 months from receipt of that notice | 115-FZ art. 7.8 item 1, paragraph 2 |
| Bank of Russia on a request to revise a high-risk rating, no measures applied | 15 working days from its receipt | 115-FZ art. 7.8 item 1.1 |

The engine never proposes an extension for a money claim under 123-FZ:
the clock carries the refusal `extension_not_allowed` and no extended
date. A claim on the standard form within 180 days gets exactly 15
working days, which around the New Year can end later than 30 calendar
days would (received 11 December 2025: 13 January 2026 rather than
12 January); the engine follows the text.

The first action on every kind of operation rests on 161-FZ art. 8
part 3.4: its first sentence suspends a transfer order, its second
refuses a card operation, an e-money transfer or a Faster Payments
transfer (`measures`: `suspend_order`, `refuse_operation`). Part 3.10 is
only the second step, after the client confirmed the order or repeated
the operation and the operator then received data from the Bank of
Russia's database (`suspend_confirmed_order`, `refuse_repeat`). A
transfer confirmed after the day following the suspension is not
accepted (part 3.9, `order_not_accepted`), and a database match after it
suspends nothing.

For the client's own data in the database, part 11.6 lets the bank
choose: it "вправе приостановить" the client's card or online banking
(`suspend_instrument`), or, if it does not, carries out an individual's
transfers to individuals "на сумму не более 100 тысяч рублей в месяц"
(`cap_transfers`, sentence 2). With the Ministry of Internal Affairs'
information there is no choice: part 11.7 makes the suspension a duty,
and a cap given instead is refused (`transfer_cap_not_allowed`). A
legal entity whose card is not suspended has no cap under part 11.6
(`transfer_cap_for_individuals_only`). Whichever the bank chose, a
credit institution caps ATM cash at 100,000 roubles a month while the
data are in the database (Banking Law art. 30 part 16, `cap_atm_cash`).
The notices of parts 9.2 and 11.8 follow a suspension only.

The ATM cash cap does not start with the bank's choice. The duty arises
"если от Банка России получена информация", so the cap runs from the day
the bank received the database information that holds the client's data
(`informationReceivedOn`; operators take the information from the Bank
of Russia's infrastructure within hours of its provision, Directive No.
7282-U items 6.1 to 6.3). When that day is not given, the clock dates the
cap by the day the bank acted on the data, the latest it can have
started, and adds the warning `database_information_date_assumed`. Part
11.6 opens with the same receipt: where the bank suspended an
individual's card some days after it, the transfer cap of the second
sentence applied in between, and the clock gives it with its end. Each
of the three measures lasts "на период нахождения сведений ... в базе
данных": a measure carries `until`, the first day it no longer applies,
which is the day the data left the database, or for a cap the suspension
replaced, the day of the suspension. The text caps each amount "в месяц"
and does not say how the month is counted (a calendar month, or a month
from the receipt); the clock gives the limit and its first day and
counts no window. The 48-hour limit of 50,000 roubles a day on an ATM
withdrawal that matches a sign (Banking Law art. 24.3-1; Bank of Russia
Order No. OD-1765) is another measure, not tied to the database, and is
not encoded.

A suspension the bank chose under part 11.6 may be given as lifted
(`suspensionLiftedOn`) while the data stay in the database. The text
gives the bank a right to suspend, within its risk management and its
contract with the client; it neither describes lifting a suspension nor
obliges the bank to keep one it was free not to impose. The clock takes
the lift as the bank's decision: the suspension ends that day
(`until`), and for an individual the transfer cap starts
(`cap_transfers`, marked conservative); a legal entity gets the warning
`transfer_cap_for_individuals_only` and no cap. The ATM cash cap runs
on. With the Ministry of Internal Affairs' information the suspension is
a duty "на период нахождения указанных сведений в базе данных" (part
11.7): the clock carries the refusal `suspension_lift_not_allowed` and
the suspension stands. Once the data leave the database the card is
restored under part 11.11, which is a duty and not a lift.

#### Conservative readings

Where the text leaves a point open, the engine takes the reading that
gives the earlier date or the wider duty, marks the basis
`conservative`, and says so here:

- No registration day given: the earliest possible one (the day of
  receipt when it is a working day) is assumed, with the warning
  `registration_date_assumed`.
- The extension notice is due by the original reply date: the text sets
  no date, and a term cannot be extended after it has ended.
- Under 123-FZ the sector article's registration term, its notices and
  its storage term are kept, though 123-FZ sets none.
- Stopping the correspondence is notified "in the manner" of the no-reply
  notice; the engine applies that notice's 5 working days from the
  registration of the repeated complaint.
- The commission's request given without its term: the least the law
  allows, 3 working days, with the warning `commission_term_assumed`.
- After a suspension chosen under 161-FZ art. 9 part 11.6 is lifted, the
  transfer cap of the part's second sentence applies from the day of the
  lift: the sentence speaks of a means of payment that "не было
  приостановлено", and whether that covers a suspension since lifted the
  text does not say; the cap is the wider restriction.
- The operator's own application to remove the client's data is taken
  as received by the Bank of Russia on the day the operator sends it:
  the directive counts from receipt, which the operator does not learn,
  and the earliest day gives the earliest decision. A
  request that gives less keeps its own, earlier day, with the warning
  `commission_term_below_minimum`.
- A standard-form claim without a breach day, and a money claim to a
  securities market professional (a voluntary participant of the
  ombudsman's procedure at most), take the earlier of the possible reply
  dates and no extension.
- The two days of 161-FZ art. 8 part 3.11 after a refused repeat count
  the day of the repeat: the Bank of Russia's letter says so of the
  confirmation's day, and the repeat's term uses the same words.
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

The commission's review keeps the statutory ceiling of 20 working days:
Regulation No. 842-P sets no shorter term of its own (item 2.2 refers
back to 115-FZ art. 7 item 13.5). The 15 working days on the Bank of
Russia's guidance page belong to the Bank of Russia's own review of a
high-risk rating under 115-FZ art. 7.8 item 1.1, which the engine encodes
separately (`high_risk_rating_review`).

#### Fact requests

`fact_request_due(clock, sent_on)` gives the last day of a request for
facts from the complaints unit to the unit that holds them (antifraud,
anti-money-laundering compliance, operations): 2 working days
(`FACT_REQUEST_WORKING_DAYS`). That number is an internal policy of the
desk, not a term of any law: no act read sets a term for one unit of an
organisation to answer another. It is capped by the earliest term that
binds the answering unit and has not ended before the request: the reply
(extended, when the extension was allowed); the answer to the client's
documents against a 115-FZ refusal, 7 working days (115-FZ art. 7
item 13.4); the answer to the interagency commission's request (art. 7
item 13.6); the answer to a Bank of Russia request on an application to
remove data, 3 working days (Directive No. 6748-U item 2.9). The result
names the policy's day and the deadline that capped it, if any.

#### Not covered

- The insurance carve-out of 4015-1 art. 6.2 item 1 (claims for an
  insurance payment are outside the complaint article); pawnshops,
  pension funds and credit bureaus.

#### Not verified

These points were looked for and remain open; the engine does not rely
on them:

- The status of bill No. 1166230-8 on the financial ombudsman's funding
  after its first reading on 27.05.2026.
- The ten sample reply scripts attached to the Bank of Russia's letter
  No. 59-4-12/38508 of 29.08.2025; only its covering letter was read.
- The current editions of the base standards of brokers and of credit
  consumer cooperatives on complaints.
- The text of 161-FZ art. 8 parts 3.4-1, 3.7-1 and 3.13-1 to 3.13-7 and
  the amended part 3.8, in force from 01.03.2027 under Federal Law
  No. 210-FZ of 26.06.2026.
- The official publication of Bank of Russia Directive No. 7382-U of
  25.06.2026, which amends Regulation No. 842-P: the revision is
  confirmed on consultant.ru, the registration and the day it took
  effect only in secondary sources.

#### Codes

- Deadlines: `registration`, `registration_notice`, `reply`,
  `extension_notice`, `reply_extended`, `no_substance_notice`,
  `stop_correspondence_notice`, `storage_until`,
  `antifraud_suspension_ends`, `antifraud_confirmation`,
  `antifraud_repeat_suspension_ends`,
  `antifraud_after_repeat_suspension`, `antifraud_repeat_refusal_ends`,
  `antifraud_after_repeat_refusal`, `instrument_suspension_notice`,
  `exclusion_forwarding`, `exclusion_refusal_notice`,
  `exclusion_decision`, `exclusion_decision_relay`,
  `bank_of_russia_query_answer`, `antifraud_refund`,
  `aml_reasons_notice`, `aml_documents_answer`,
  `aml_commission_decision`, `commission_request_answer`,
  `commission_decision_notice`, `high_risk_notice`,
  `high_risk_commission_application`, `high_risk_rating_review`,
  `operator_application_decision`.
- Counts: `same_day`, `next_working_day`, `working_days`,
  `calendar_days`, `calendar_days_to_working_day`, `months`, `years`.
- Duties: `copy_to_bank_of_russia`, `copy_to_sro`,
  `notify_client_of_block`, `notify_client_of_repeat_block`,
  `notify_client_of_right_to_apply`, `restore_instrument`; when:
  `same_day_as_each_dispatch`, `same_day_as_reply`, `immediately`.
- Measures: `suspend_order`, `refuse_operation`,
  `suspend_confirmed_order`, `refuse_repeat`, `order_not_accepted`,
  `suspend_instrument`, `cap_transfers`, `cap_atm_cash`.
- Warnings: `registration_date_assumed`, `registered_late`,
  `money_claim_outside_ombudsman`, `money_claim_from_legal_entity`,
  `ombudsman_participation_unknown`, `breach_date_unknown`,
  `confirmation_late`, `confirmation_date_missing`,
  `refund_for_individuals_only`, `high_risk_for_legal_entities_only`,
  `documents_answer_beyond_text`, `sro_copy_not_applicable`,
  `ombudsman_term_may_have_passed`, `storage_term_not_set`,
  `commission_term_below_minimum`, `commission_term_assumed`,
  `transfer_cap_for_individuals_only`,
  `database_information_date_assumed`.
- Refusals: `extension_not_allowed`, `extension_ground_not_allowed`,
  `extension_too_long`, `transfer_cap_not_allowed`,
  `suspension_lift_not_allowed`.
- Errors: `invalid_date`, `outside_calendar`, `dates_out_of_order`,
  `invalid_extension`, `invalid_amount`, `unknown_code`, `missing_date`.
- Rubric: the findings above; client options `confirm_order`,
  `repeat_operation`, `submit_documents`, `apply_to_commission`,
  `apply_to_ombudsman`, `apply_for_removal`; acts `payment_system`, `anti_money_laundering`,
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

The 161-FZ provisions a reply names as the ground of what the operator
did (`reasons::PaymentGround`), each with a stable code:
`payment_8_3_4` (art. 8 part 3.4, the first action on an operation that
matched a sign), `payment_8_3_10` (part 3.10, the second action after a
confirmation or a repeat), `payment_9_11_6` (art. 9 part 11.6, the
client's card or online banking suspended for the client's own data in
the Bank of Russia's database, the ground of a reply about removing the
data) and `payment_9_11_7` (part 11.7, the same with the Ministry of
Internal Affairs' information, where the suspension is a duty). The
codes keep this order and a new ground is added at the end; the
`suspend_instrument` measure of the clock rests on the third or the
fourth. A reply about the transfer cap the bank chose instead of the
suspension names `payment_9_11_6` as well: the cap is part 11.6's
second sentence.

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
| `client_option_missing` | an option the law gives the client is not offered: confirming a suspended order, repeating a refused operation (161-FZ art. 8 parts 3.6, 3.10); documents and then the commission against a 115-FZ refusal (art. 7 items 13.4, 13.5); the commission against high-risk measures (art. 7.7 item 8); the financial ombudsman for a 123-FZ claim (art. 16 part 4); for a card or online banking suspended for the client's own data in the Bank of Russia's database, or the client's transfers capped instead, while the data are there, the right to apply to the Bank of Russia to remove them, through the bank or the Bank of Russia's Internet reception (161-FZ art. 9 part 11.8; Directive No. 6748-U item 1.2; for the cap, the Bank of Russia's letter No. IN-03-59/11) | the letter and each provision; for the removal, the finding cites 161-FZ art. 9 part 11.8 itself, and the channels come from the directive and the Bank of Russia's letter No. IN-03-59/11 |
| `deadline_missing`, `deadline_mismatch` | a deadline that concerns the client and runs on the reply's day is not stated, or stated with another date than the clock's | the Bank of Russia's recommendations on replies (concrete terms) |
| `measure_missing`, `measure_not_taken` | for the client's own data in the database, while they are there, a restriction that applies is not stated, or one is stated that does not apply: the suspension of the card or online banking, or the transfer cap instead (161-FZ art. 9 part 11.6), and the ATM cash cap (Banking Law art. 30 part 16) | the Bank of Russia's letter No. IN-03-59/11 ("вид примененных ограничений, правовые основания их применения") |
| `text_empty`, `sentence_too_long`, `sentences_long_on_average` | no text; a sentence of more than 25 words; more than 15 words a sentence on average | the same recommendations (no long sentences) |

The word limits, 25 words a sentence at most and 15 on average, are the
values this project sets: the Bank of Russia advises against long
sentences but gives no number. They are set, not measured, and remain
hypotheses to calibrate on real replies. Sentences end at a full stop, question or
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
  `revision`, `url`, `reading`), `duties`, `measures` (each with `kind`,
  `on`, `until` when the facts give the day it stops applying, and a
  `basis`), `warnings`, `refusals` and `replyDue`.
- `factRequestDue(input, sentOn)`: the last day of a fact request sent
  on `sentOn` in the case `input` describes, as a `FactRequestOutput`
  with `due`, `policyDue` and `cappedBy` (a deadline code, or undefined).
- `od2506Signs()`: the signs, each with `number`, `code`, `group`,
  `summary`, `appliesFrom`, `thresholds` (`value`, `unit`, `bound`, `of`)
  and `wording`.
- `amlReasons()`: the 115-FZ categories, each with `code`, `source`,
  `article`, `part` and `revision`.
- `paymentGrounds()`: the 161-FZ grounds in the order of their codes,
  each with `code`, `source`, `article`, `part` and `revision`.
- `rubric(reply, input)`: `reply` is a `ReplyInput`, made with
  `new ReplyInput(repliedOn, text)` and filled with `grounds`
  (`GroundInput`s of an act code, article and part), `reasons`,
  `nextSteps`, `clientOptions`, `statedDeadlines`
  (`StatedDeadlineInput`s) and `measures` (measure codes the reply says
  apply); `input` is the case's `CaseInput`, from which
  the clock is computed. Returns `FindingOutput`s with `code`, `subject`,
  `sentence`, `words`, `source` and `reference`.

## Sources

Each rule cites its source from `src/sources.rs`; every source is listed
here with the revision its text was checked against, read on 2026-10-06
or, where `sources.rs` says so, on 2026-10-07, 2026-10-08, 2026-10-09 or
2026-10-10.
A test fails when this list and the code disagree.

| Source | Revision | Text read at |
|---|---|---|
| Labour Code (Трудовой кодекс РФ) No. 197-FZ, art. 112 | 2026-05-25 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_34683/98ef2900507766e70ff29c0b9d8e2353ea80a1cf/) |
| Civil Code, part one (Гражданский кодекс РФ) No. 51-FZ, arts. 191 to 193 | 2026-06-10 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_5142/60f6af8755cda8e568604f21cd44e823c3407d8f/) |
| Government Decree No. 1335 of 04.10.2024, transfers of days off in 2025 | 2024-10-04 | [government.ru, PDF](http://static.government.ru/media/files/QkGT2QIDdzICtlaxOxctIZQONofaJwZO.pdf) |
| Government Decree No. 1466 of 24.09.2025, transfers of days off in 2026 | 2025-09-24 | [government.ru, PDF](http://static.government.ru/media/files/4jeB8hNKm69ggOa9yDiYOli6YoAyM21i.pdf) |
| Government Decree No. 1187 of 17.09.2026, transfers of days off in 2027 | 2026-09-17 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_544706/) |
| Banking Law (О банках и банковской деятельности) No. 395-1, art. 30.1 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_5842/c96fe25edab2fcc32ab9225c1b392a2b2d599467/) |
| Banking Law No. 395-1, art. 30 (part 16, ATM cash for a client whose data are in the Bank of Russia's database) | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_5842/e452b6541ff9e2aad438b239b6e5ba38a28162da/) |
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
| Bank of Russia Directive No. 6748-U of 13.06.2024, the client's application to remove data from the database, as amended by Directive No. 7287-U of 19.01.2026 | 2026-01-19 | [legalacts.ru, a full-text copy](https://legalacts.ru/doc/ukazanie-banka-rossii-ot-13062024-n-6748-u-o-porjadke/); revision confirmed on [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_480956/) |
| Bank of Russia Directive No. 7282-U of 13.01.2026, how operators report to the database and receive its information (items 6.1 to 6.3) and the restrictions they apply for the client's data in it (item 4.2.8) | 2026-01-13 | [legalacts.ru, a full-text copy](https://legalacts.ru/doc/ukazanie-banka-rossii-ot-13012026-n-7282-u-ob-ustanovlenii/); the official scan is on [cbr.ru](https://www.cbr.ru/Queries/UniDbQuery/File/90134/7492) |
| Bank of Russia page on requests to remove data from its database | 2026-10-06 (page as read) | [cbr.ru](https://www.cbr.ru/contactBR/161-FZ/) |
| Anti-Money-Laundering Law No. 115-FZ, art. 7 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_32834/3e3e0d20d2919071b55ef95f26f849df6a4f11e8/) |
| Anti-Money-Laundering Law No. 115-FZ, art. 7.7 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_32834/0a562008be657e44b6145557f337cc626af9ffab/) |
| Anti-Money-Laundering Law No. 115-FZ, art. 7.8 | 2026-08-04 | [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_32834/b9e70868f2269695609ac83c8cabbc15dbc7b4e0/) |
| Bank of Russia Regulation No. 842-P of 23.09.2024, the interagency commission's review, as amended by Directive No. 7382-U of 25.06.2026 | 2026-06-25 | [legalacts.ru, a full-text copy](https://legalacts.ru/doc/polozhenie-banka-rossii-ot-23092024-n-842-p-o-trebovanijakh/); revision confirmed on [consultant.ru](https://www.consultant.ru/document/cons_doc_LAW_490180/) |
| Bank of Russia Order No. OD-2506 of 05.11.2025, the signs of a transfer without voluntary consent, in force from 01.01.2026 | 2025-11-05 | [cbr.ru, PDF](https://cbr.ru/Crosscut/LawActs/File/10123) |
| Bank of Russia information letter No. IN-01-59/98 of 26.08.2025, informing clients of restrictions | 2025-08-26 | [garant.ru](https://www.garant.ru/products/ipo/prime/doc/412494092/) |
| Bank of Russia information letter No. IN-03-59/11 of 24.03.2026, informing clients of restrictions in advance | 2026-03-24 | [rulaws.ru, a full-text copy](https://rulaws.ru/acts/Informatsionnoe-pismo-Banka-Rossii-ot-24.03.2026-N-IN-03-59_11/) |
| Bank of Russia page on replies to complaints, with its recommendations | 2026-10-06 (page as read) | [cbr.ru](https://www.cbr.ru/protection_rights/rassmotrenie-obrascheniy-potrebiteley-finansovykh-uslug/) |

The decrees, the letters and Order No. OD-2506 have not been amended as
far as could be found; their revision is their date. Directive No. 6748-U
was amended by Directive No. 7287-U of 19.01.2026, registered by the
Ministry of Justice on 10.04.2026 under No. 85995 and officially
published on 21.04.2026, as the Bank of Russia's
[registry of information security acts](https://www.cbr.ru/information_security/acts/)
lists it; the directive counts the Bank of Russia's 15 working days from
its receipt of the application, where the Bank of Russia's page says from
its registration, and the engine follows the directive. The order's PDF on
cbr.ru carries a registration stamp placeholder instead of its number and
date; both are confirmed by the order's entry in the Bank of Russia's
[registry of information security acts](https://www.cbr.ru/information_security/acts/),
which links the same PDF. Under 161-FZ art. 8 part 3.3 the signs are
published on the Bank of Russia's site, and the order was posted on
cbr.ru on 14.11.2025, as the Bank of Russia stated in its comments on the
order; it is not among the acts published in the Bulletin of the Bank of
Russia. No amending order was found on 2026-10-07; the registry was last
updated on 16.06.2026. The 123-FZ revision is that of its latest amendment
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
