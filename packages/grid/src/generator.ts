import { od2506Signs } from "@ariadne/rules";
import { dayNumber } from "./days.js";
import { isWorking, nextWorking, plusWorkingDays, replyClock, workingDaysFrom } from "./legal.js";
import {
  AML_GROUND_OFFSET,
  AML_REASON_COUNT,
  AS_OF,
  ASSIGNEE_COUNT,
  Applicant,
  CHUNK_SIZE,
  COMPANY_COUNT,
  Channel,
  ELECTRONIC_CHANNELS,
  Extension,
  FIRST_NAME_COUNT,
  Ground,
  INJECTION_COUNT,
  NOTE_COUNT,
  Operation,
  Outcome,
  SIGNATORY_COUNT,
  SIGN_COUNT,
  SURNAME_COUNT,
  Source,
  Stage,
  Stream,
  TEMPLATE_COUNT,
  TOTAL_ROWS,
  WINDOW_DAYS,
} from "./schema.js";
import { RulesFlag, allocColumns, applyChunk, createStore, type Chunk, type ColumnStore } from "./store.js";

/*
  The synthetic complaints register. Every row is a fictional complaint to
  a fictional bank; no real client, operation or text is used. Rows are
  numbered in the order the complaints arrived, over WINDOW_DAYS up to
  AS_OF, and each chunk is seeded from (seed, start), so a chunk can be
  regenerated on its own (a worker retry) and still equal its slice of the
  whole. Every draw picks a code, a day or an amount, never a word, so the
  rows do not depend on the language they are shown in.

  The legal facts of each row come from ariadne-rules (legal.ts): the day
  of registration is counted on its calendar, and the reply's last day,
  the extension and the working days left are its answers. The generator
  only decides what happened (when it arrived, what about, how far the
  work has gone), and keeps the register consistent with those answers: a
  money claim is never extended, a case is sent no earlier than it was
  registered, a refusal past drafting names a legal ground.

  Generation needs the rules module loaded (loadRules from @ariadne/rules).
*/

/* mulberry32: small, fast, good enough for demo data */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Mixes a second number into a seed so derived streams are independent */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (salt + 1), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/* The client code of an individual: surname, first name and gender. The
   language module writes the name in its own order and script. */
export function individualCode(surname: number, first: number, female: boolean): number {
  return (surname * FIRST_NAME_COUNT + first) * 2 + (female ? 1 : 0);
}

export function individualParts(code: number): { surname: number; first: number; female: boolean } {
  const female = code % 2 === 1;
  const rest = Math.floor(code / 2);
  return { surname: Math.floor(rest / FIRST_NAME_COUNT) % SURNAME_COUNT, first: rest % FIRST_NAME_COUNT, female };
}

/* Draws an index by weight */
function weighted(r: number, weights: readonly number[]): number {
  let acc = 0;
  for (let k = 0; k < weights.length; k++) {
    acc += weights[k] ?? 0;
    if (r < acc) return k;
  }
  return weights.length - 1;
}

const STREAM_WEIGHTS = [0.36, 0.12, 0.32, 0.2];
/* OD-2506 signs in the order's order: 1.6 (an atypical operation) and 1.1
   (a database match) lead; the digital-ruble signs (2.1, 2.2) are not
   drawn, since the register has no digital-ruble operations. */
const SIGN_WEIGHTS = [0.14, 0.06, 0.01, 0.06, 0.05, 0.35, 0.05, 0.01, 0.08, 0.12, 0.01, 0.06, 0, 0];
/* 115-FZ categories in ariadne-rules' order */
const AML_WEIGHTS = [0.42, 0.08, 0.16, 0.12, 0.04, 0.04, 0.14];
const AML_OPERATION = [
  Operation.BankTransfer,
  Operation.AccountOpening,
  Operation.AccountService,
  Operation.BankTransfer,
  Operation.BankTransfer,
  Operation.AccountService,
  Operation.AccountService,
];
const HIGH_RISK = 6;
/* The complaint template each 115-FZ category leads to (pools' order:
   payment refused, contract terminated, account refused, operations
   suspended, high-risk measures) */
const AML_TEMPLATE = [0, 2, 1, 3, 3, 3, 4];
/* The operation each money-claim template is about (pools' order:
   insurance, ATM, unagreed service, deposit interest, transfer fee) */
const MONEY_OPERATION = [
  Operation.AccountService,
  Operation.CashWithdrawal,
  Operation.AccountService,
  Operation.AccountService,
  Operation.BankTransfer,
];
/* Email, online, post, office, chat: the channels of a direct complaint */
const DIRECT_CHANNEL_WEIGHTS = [0.3, 0.35, 0.12, 0.13, 0.1];

/* Outcome weights (upheld, partly upheld, refused) by stream */
const OUTCOME_WEIGHTS: readonly (readonly number[])[] = [
  [0.4, 0.2, 0.4],
  [0.35, 0.25, 0.4],
  [0.3, 0.15, 0.55],
  [0.2, 0.1, 0.7],
];

/* Share of complaints with an adversarial insertion */
const INJECTION_SHARE = 0.03;
/* Share of complaints linked to an earlier one about the same operation */
const LINK_SHARE = 0.07;
const LINK_REACH = 80;

const AS_OF_DAY = dayNumber(AS_OF);
const WINDOW_START = AS_OF_DAY - WINDOW_DAYS + 1;

function amount(rng: () => number, low: number, high: number): number {
  const v = Math.exp(Math.log(low) + rng() * (Math.log(high) - Math.log(low)));
  return v >= 10_000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10;
}

/* The stage a complaint has reached, from its age in working days */
function drawStage(r: number, age: number): number {
  if (age <= 1) return r < 0.65 ? Stage.Registered : Stage.WaitingForFacts;
  if (age <= 5) return weighted(r, [0.08, 0.45, 0.32, 0.15]);
  if (age <= 10) return weighted(r, [0, 0.22, 0.3, 0.2, 0.16, 0.12]);
  if (age <= 15) return weighted(r, [0, 0.08, 0.12, 0.12, 0.13, 0.4, 0.15]);
  /* Past the reply term: a few recent ones are still open (extended, or
     overdue by days rather than months) */
  if (age <= 25 && r < 0.15) return Stage.WaitingForFacts + Math.floor((r / 0.15) * 4);
  return r < 0.4 ? Stage.Sent : Stage.Closed;
}

/* `total` spreads the arrivals over the window: row r of `total` arrives on
   day WINDOW_START + r * WINDOW_DAYS / total, so ids follow arrival. */
export function generateChunk(seed: number, start: number, count: number, total: number = TOTAL_ROWS): Chunk {
  const rng = makeRng(mixSeed(seed, start));
  const c: Chunk = { start, count, ...allocColumns(count) };
  const pick = (n: number) => Math.floor(rng() * n);
  const signs = od2506Signs();
  if (signs.length !== SIGN_COUNT) throw new Error(`@ariadne/grid: ariadne-rules lists ${signs.length} signs, not ${SIGN_COUNT}`);
  const signFrom = signs.map((s) => dayNumber(s.appliesFrom));

  for (let i = 0; i < count; i++) {
    const r = start + i;
    const received = Math.min(AS_OF_DAY, WINDOW_START + Math.floor(((r + rng()) * WINDOW_DAYS) / total));
    /* Mostly working hours, Moscow time */
    const receivedMinute = rng() < 0.8 ? 480 + pick(600) : pick(1440);

    /* Registered by the next working day; a few late */
    const working = isWorking(received);
    const lr = rng();
    let registered = working && lr < 0.72 ? received : nextWorking(received);
    if (lr > 0.98) registered = plusWorkingDays(received, 2);
    if (registered > AS_OF_DAY) registered = AS_OF_DAY;

    let stream = weighted(rng(), STREAM_WEIGHTS);
    const sr = rng();
    const source = sr < 0.18 ? Source.BankOfRussia : sr < 0.24 ? Source.Representative : Source.Client;
    const channel = source === Source.BankOfRussia ? Channel.BankOfRussiaAccount : weighted(rng(), DIRECT_CHANNEL_WEIGHTS);

    let applicant: number = Applicant.Individual;
    let reason = 0;
    let operation: number = Operation.None;
    let opOn = received;
    let opAmount = 0;
    let claim = 0;
    let claimForm = 0;
    let opRef = mixSeed(seed, r + 0x51);
    let template = 0;

    if (stream === Stream.Antifraud) {
      applicant = rng() < 0.97 ? Applicant.Individual : Applicant.LegalEntity;
      opOn = received - pick(7);
      let sign = weighted(rng(), SIGN_WEIGHTS);
      if ((signFrom[sign] ?? 0) > opOn) sign = 5;
      reason = sign + 1;
      const op = rng();
      operation = op < 0.35 ? Operation.CardPayment : op < 0.75 ? Operation.FasterPayment : Operation.BankTransfer;
      opAmount = amount(rng, 1_500, 900_000);
      /* The complaint the client writes follows what happened */
      template =
        sign === 0
          ? 3
          : sign === 9
            ? 2
            : operation === Operation.FasterPayment
              ? 0
              : operation === Operation.CardPayment
                ? 1
                : 4;
    } else if (stream === Stream.Aml) {
      const category = weighted(rng(), AML_WEIGHTS);
      reason = category + 1;
      operation = AML_OPERATION[category] ?? Operation.BankTransfer;
      applicant = category === HIGH_RISK || rng() < 0.8 ? Applicant.LegalEntity : Applicant.Individual;
      template = AML_TEMPLATE[category] ?? 0;
      opOn = received - 1 - pick(25);
      opAmount = operation === Operation.AccountOpening ? 0 : amount(rng, 20_000, 9_000_000);
    } else if (stream === Stream.MoneyClaim) {
      opOn = received - 5 - pick(255);
      template = pick(TEMPLATE_COUNT);
      operation = MONEY_OPERATION[template] ?? Operation.AccountService;
      claim = rng() < 0.06 ? amount(rng, 500_100, 1_200_000) : amount(rng, 1_000, 480_000);
      opAmount = claim;
      claimForm = channel === Channel.Online && rng() < 0.6 ? 1 : 0;
    } else {
      applicant = rng() < 0.1 ? Applicant.LegalEntity : Applicant.Individual;
      opOn = received - 1 - pick(40);
      template = pick(TEMPLATE_COUNT);
      operation = template === 0 ? Operation.AccountService : Operation.None;
      opAmount = operation === Operation.None ? 0 : amount(rng, 100, 6_000);
    }

    let client =
      applicant === Applicant.LegalEntity
        ? pick(COMPANY_COUNT)
        : individualCode(pick(SURNAME_COUNT), pick(FIRST_NAME_COUNT), rng() < 0.55);

    /* A repeat complaint, or the same complaint through the Bank of
       Russia: the same client and the same operation as an earlier row */
    let linked = -1;
    if (i > 0 && rng() < LINK_SHARE) {
      const j = Math.max(0, i - 1 - pick(Math.min(i, LINK_REACH)));
      linked = start + j;
      stream = c.stream[j] ?? stream;
      applicant = c.applicant[j] ?? applicant;
      client = c.client[j] ?? client;
      reason = c.reason[j] ?? 0;
      operation = c.operation[j] ?? Operation.None;
      opRef = c.opRef[j] ?? opRef;
      opOn = c.opOn[j] ?? opOn;
      opAmount = c.opAmount[j] ?? 0;
      claim = c.claim[j] ?? 0;
      claimForm = c.claimForm[j] ?? 0;
      template = c.template[j] ?? 0;
    }

    const clock = replyClock({
      stream,
      applicant,
      forwarded: source === Source.BankOfRussia,
      electronic: ELECTRONIC_CHANNELS.includes(channel),
      received,
      registered,
      claim,
      standardForm: claimForm === 1,
      breachOn: claim > 0 ? opOn : -1,
    });
    const allowed = (clock.flags & RulesFlag.ExtensionAllowed) !== 0;
    const age = workingDaysFrom(registered, AS_OF_DAY);
    const leftBase = workingDaysFrom(AS_OF_DAY, clock.due);
    const leftExt = allowed ? workingDaysFrom(AS_OF_DAY, clock.dueExt) : leftBase;

    const stage = drawStage(rng(), age);
    const answered = stage >= Stage.Sent;
    let extension: number = Extension.None;
    const er = rng();
    if (allowed) {
      if (!answered && stage <= Stage.Drafting && age >= 8 && er < 0.35) extension = Extension.Extended;
      else if (!answered && age > 15 && er < 0.5) extension = Extension.Extended;
      else if (answered && er < 0.08) extension = Extension.Extended;
    }
    const lastDay = extension === Extension.Extended ? clock.dueExt : clock.due;

    let sentOn = -1;
    if (answered) {
      const termDays = workingDaysFrom(registered, lastDay);
      const late = rng() < 0.06;
      let k = late ? termDays + 1 + pick(3) : Math.max(1, termDays - pick(Math.max(1, termDays - 4)));
      k = Math.min(Math.max(1, k), Math.max(1, age));
      sentOn = Math.min(AS_OF_DAY, plusWorkingDays(registered, k));
    }

    let outcome: number = Outcome.Pending;
    let ground: number = Ground.None;
    const decided = stage >= Stage.LegalReview || (stage === Stage.Drafting && rng() < 0.5);
    if (decided) {
      outcome = 1 + weighted(rng(), OUTCOME_WEIGHTS[stream] ?? OUTCOME_WEIGHTS[0]!);
      const gr = rng();
      if (outcome === Outcome.Refused && (stage >= Stage.LegalReview || gr < 0.6)) {
        if (stream === Stream.Antifraud) ground = gr < 0.7 ? 1 : gr < 0.85 ? 2 : Ground.Contract;
        else if (stream === Stream.Aml) ground = gr < 0.9 ? AML_GROUND_OFFSET + (reason - 1) : Ground.Contract;
        else ground = Ground.Contract;
      }
    }

    const noteSlot = pick(NOTE_COUNT + 4);
    const updatedDay = answered ? sentOn : registered + pick(Math.max(1, AS_OF_DAY - registered + 1));

    c.received[i] = received;
    c.receivedMinute[i] = receivedMinute;
    c.registered[i] = registered;
    c.stream[i] = stream;
    c.source[i] = source;
    c.channel[i] = channel;
    c.applicant[i] = applicant;
    c.client[i] = client;
    c.reason[i] = reason;
    c.operation[i] = operation;
    c.opRef[i] = opRef;
    c.opOn[i] = opOn;
    c.opAmount[i] = opAmount;
    c.claim[i] = claim;
    c.claimForm[i] = claimForm;
    c.stage[i] = stage;
    c.outcome[i] = outcome;
    c.ground[i] = ground;
    c.extension[i] = extension;
    c.assignee[i] = pick(ASSIGNEE_COUNT);
    c.signatory[i] = pick(SIGNATORY_COUNT);
    c.linked[i] = linked;
    c.due[i] = clock.due;
    c.dueExt[i] = clock.dueExt;
    c.extNotice[i] = clock.extNotice;
    c.leftBase[i] = leftBase;
    c.leftExt[i] = leftExt;
    c.rules[i] = clock.flags;
    c.sentOn[i] = sentOn;
    c.template[i] = template;
    c.variant[i] = pick(0x10000);
    c.injection[i] = rng() < INJECTION_SHARE ? 1 + pick(INJECTION_COUNT) : 0;
    c.note[i] = noteSlot < 4 ? 0 : noteSlot - 3;
    c.updatedAt[i] = Math.min(updatedDay, AS_OF_DAY) * 86_400_000;
  }
  return c;
}

export function chunkCount(total: number, chunkSize = CHUNK_SIZE): number {
  return Math.ceil(total / chunkSize);
}

/* Start and row count of chunk `index` */
export function chunkBounds(index: number, total: number, chunkSize = CHUNK_SIZE): { start: number; count: number } {
  const start = index * chunkSize;
  return { start, count: Math.max(0, Math.min(chunkSize, total - start)) };
}

/* Synchronous generation, used by tests, measurements and the no-Worker fallback */
export function generateAll(seed: number, total = TOTAL_ROWS, chunkSize = CHUNK_SIZE): ColumnStore {
  const store = createStore(total);
  for (let start = 0; start < total; start += chunkSize) {
    applyChunk(store, generateChunk(seed, start, Math.min(chunkSize, total - start), total));
  }
  return store;
}

/* AML_REASON_COUNT is the length of the categories ariadne-rules lists;
   the weights above must cover each */
if (AML_WEIGHTS.length !== AML_REASON_COUNT) throw new Error("@ariadne/grid: AML weights do not fit the categories");
