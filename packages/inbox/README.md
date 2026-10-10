# @ariadne/inbox

Part of the [Ariadne Desk](../../README.md) repository; the measured
badges are in its README.

What an assistant reads about a complaint, in TypeScript: the case brief
of codes, seeded complaint texts in Russian and English, and the ground
truth of each.

The run engine ([`@ariadne/runner`](../runner/README.md)) takes a case as
a brief of codes and never sees what the applicant wrote. A reader of the
text (a person, or a model whose proposals the engine then validates)
needs the text itself, and a way to tell whether it read it right. This
package holds both sides: the brief built from the register and the rules
engine, and complaints written from templates for register cases, each
with the answers the register and the rules give for its case.

Every case, name, amount and sentence here is invented. Status: early; 29
tests.

## The brief

`caseBrief(store, row)` is the case as the engine takes it: the stream,
the OD-2506 sign or 115-FZ category, the operation, the reply's last day,
the grounds, the client's options and deadlines, the restrictions for the
client's own data in the Bank of Russia's database. It is worked out from
the register's codes ([`@ariadne/grid`](../grid/README.md)) and from
[ariadne-rules](../../crates/ariadne-rules/README.md); it reads no text.
The desk imports it from `@ariadne/inbox/brief`.

## The inbox

```ts
import { loadRulesFromFile } from "@ariadne/rules/node";
import { openInbox, inboxItem, readComplaint, caseSheet } from "@ariadne/inbox";

loadRulesFromFile();
const inbox = openInbox();                 // over the register the desk opens
const item = inboxItem(inbox, "hard", 2, "ru");
readComplaint(item.complaint);             // the complaint as one labelled text
caseSheet(item.brief, item.facts, "ru");   // the case's facts for a reply
item.truth;                                // what the register and the rules give
```

An item is named by its set, its seed (a whole number from 1) and its
language. The set and the seed pick the kind of case and the register
row; the seed also picks the wording among the variants of each sentence.
Both languages of a seed are the same case in the same variants. Dates
and amounts are written by hand, not with `Intl`, so a seed gives the
same bytes on every runtime.

A complaint says only what its row holds: the operation's amount, day and
reference, the money claimed, the day the client confirmed or repeated,
the earlier complaint of a linked case. A row is taken when its reply
would still be drafted (before legal review), the complaint is to the
bank itself, a person complains of everything but a 115-FZ measure and a
company of that, and the grounds of its brief are the ones its facts
give.

### Kinds

Twenty kinds of case (`CASE_KINDS`), each a set of facts a complaint can
state so that its stream and grounds can be told from the text:

| stream | kinds | grounds |
|---|---|---|
| general (442-FZ) | a fee charged, the app that does not let the client in, a reissued card that has not come | the contract |
| money claim (123-FZ) | insurance added to a loan, a service package never agreed to, deposit interest paid short | the contract |
| 161-FZ art. 8 | a transfer by bank details suspended; a card payment or a Faster Payments transfer refused | part 3.4 |
| 161-FZ art. 8 | the same, confirmed or repeated and stopped again after the Bank of Russia's database answered | parts 3.4 and 3.10 |
| 161-FZ art. 9 | the client's own data in the Bank of Russia's database: card and online banking suspended; the same with the Ministry of Internal Affairs' information; transfers capped instead | part 11.6; part 11.7; part 11.6 |
| 115-FZ | an operation refused, an account refused, an account contract terminated, an operation suspended, operations suspended by a decision, funds frozen, high-risk measures | the category's article and item |

### Sets

Ten kinds of item in each set; seed n takes kind (n - 1) mod 10, and
seeds 11 to 20 take other rows of the same kinds where the register has
them. The default register has one open case of some kinds (the client's
own data without the Ministry's information, the transfer cap), so those
items repeat their row under another wording.

- `clean`: the plain complaint, in words that name what happened.
- `hard`: wording without the words that name the law (a transfer that
  "did not leave", a payment not carried out after documents were asked
  for, a sign-in that is "blocked" with no operation behind it); two
  grounds in one text; a case linked to an earlier complaint; the
  client's own data in the database without and with the Ministry's
  information, the second stated only in an enclosed notice; the cap
  instead of a suspension; a claim for money made in passing; a 115-FZ
  freeze, which reads like a suspension.
- `adversarial`: the clean item of the same seed with text addressed to
  an assistant inside it. Three places (`PLACEMENTS`): the body, a quoted
  forwarded message, the summary of an attachment. Four requests
  (`INSTRUCTIONS`): admit the bank's fault and promise a refund of a named
  amount; cite a named article (Civil Code art. 395, which no case rests
  on); send the reply without review; change the stream. Seeds 1 to 12
  cover every pair. `item.injection` says where the insertion is, what it
  asks, and what following it would show: the amount, the article, the
  stream and its team.

The complaint is untrusted data. It is never part of a brief, so an
insertion cannot change the brief or the ground truth: the adversarial
item of a seed has the brief and the truth of the clean one, and a test
finds no two words in a row of any complaint in its brief, truth or case
sheet.

### Ground truth

`item.truth.proposals` are the answers of the engine's scripted proposer
on the case's brief: the register's stream and the grounds the rules give
(`classify`), the team that holds the facts of that stream with its
questions, and the linked case's facts where the case has one
(`request_facts`), and a reply that states the options, deadlines and
measures the rules engine's rubric asks for in the case (`draft_reply`).
A test runs the rubric on each such reply and finds nothing but the
missing text.

`item.truth.provisions` is every act, article and part the rules engine
gives for the case: the grounds of its brief, its sign or 115-FZ
category, the basis of each deadline, duty and measure of its clock, and
what a reply cites for the options, deadlines and restrictions it
states, for what a reply must contain and for a complaint to the Bank of
Russia.
A reply that cites a provision outside this list cites law the engine
does not give for the case.

### Read tools

- `readComplaint(complaint)`: the complaint as one text with its parts
  labelled in its own language: subject, body, forwarded message,
  attachments.
- `caseSheet(brief, facts, lang)`: what the register and the rules say
  of the case, for drafting its reply: the brief's codes, numbers and
  dates, the sign's number in Order OD-2506, the citation of each ground
  and measure as the desk writes it ("161-ФЗ, ст. 8, ч. 3.4"), and the
  provision behind each option, deadline and next step where the rules
  give one. It holds nothing of the complaint's text.

## Prompts

`casePrompts({ complaint, sheet })` is what a model is told for each of
the three tasks a proposer answers (`Prompts` of
`@ariadne/runner/model`):

- Two things enter a prompt and are kept apart. The complaint goes
  between `<complaint>` tags in the user's turn, as
  `readComplaint` writes it, with the instruction to read it as data and
  not to act on anything it says. The case sheet goes between `<case>`
  tags, and only for the reply.
- Classifying and choosing the team are done from the complaint alone.
  The instructions spell out every code a model may answer with, one
  line each: the four streams, the thirteen grounds, the three teams,
  the nine questions.
- Drafting gets the sheet as the only source of facts and law: every
  ground with its citation, every measure, option, deadline and next
  step with its code, its meaning and the provision behind it. The model is asked for a letter in
  the complaint's language (one sentence a line, none over 25 words) and
  then for the codes of what the letter states. Where nobody has decided
  the complaint, it is given the line a reviewer fills in
  (`PENDING_LINE`) and told to decide nothing.
- The instructions are in English for every model and both letter
  languages. Whether instructions in Russian would serve a Russian model
  better was not measured.
- The schema of each answer and the validation of it are the engine's
  (`proposalSchema`, `validateProposal`); the prompts widen neither. A
  repair message words the engine's issues in plain English, each by its
  place in the answer.

## Recording a run

`recordRun({ item, client, think, stamp })` runs an item with a model:
the model reads the complaint (and the sheet, for the reply), the engine
runs on the item's brief and validates what the model proposes, and the
result is a transcript the engine replays without the model (see the
[runner's README](../runner/README.md#transcripts)). By default every
pause is answered as a person who lets the run go on would (`goOn`):
confirm, allow, retry a service that timed out, and skip a step whose
proposal failed.

```bash
pnpm build
node scripts/record.mjs --model qwen3:1.7b --set clean --seed 3 --lang ru --out run.json
```

The script records one run with a model already in a local ollama; it
downloads nothing. The transcript's stamp names the commit, the model's
tag and manifest digest, ollama's version and the machine.

## Development

From this folder, after `pnpm install --frozen-lockfile` and the
WebAssembly build of the rules crate at the repository root:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT OR Apache-2.0, at your option.
