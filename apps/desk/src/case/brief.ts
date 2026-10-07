// What the assistant is told about a case: the engine's CaseBrief, worked
// out from the register's codes and from ariadne-rules, never from the
// complaint's text. The applicant's words are for a person to read in the
// card; nothing they say can reach the plan, because nothing here reads
// them (a test runs the adversarial corpus through this function and finds
// the same brief with and without the insertions). The rules module must be
// loaded (loadRules).
import {
  AML_GROUND_OFFSET,
  AML_REASON_CODES,
  AS_OF,
  GROUNDS,
  Ground,
  Path,
  Source,
  Stream,
  caseFacts,
  effectiveDue,
  isoDay,
  type ColumnStore,
} from "@ariadne/grid";
import {
  CASE_STAGES,
  CLIENT_DEADLINE_KINDS,
  CLIENT_OPTIONS,
  OPERATIONS,
  OUTCOMES,
  STREAMS,
  type CaseBrief,
  type ClientDeadline,
  type ClientOption,
  type GroundCode,
  type ReasonCode,
} from "@ariadne/runner";
import { clock, factRequestDue, od2506Signs, rubric, type CaseFacts } from "@ariadne/rules";

const isCode = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/** The reason code of a row: its OD-2506 sign or its 115-FZ category. */
export function reasonOf(store: ColumnStore, row: number): ReasonCode | null {
  const reason = store.reason[row] ?? 0;
  if (reason === 0) return null;
  const stream = store.stream[row];
  const code = stream === Stream.Antifraud ? od2506Signs()[reason - 1]?.code : stream === Stream.Aml ? AML_REASON_CODES[reason - 1] : undefined;
  return code === undefined ? null : (code as ReasonCode);
}

/** The grounds the reply names: the law of an antifraud or 115-FZ case
 * first (161-FZ art. 8 part 3.4 for the first action on any operation that
 * matched a sign: a transfer by bank details suspended, a card, e-money or
 * Faster Payments operation refused; then part 3.10 for a case whose
 * client confirmed or repeated before the Bank of Russia's database
 * answered, the second action; the category's own article and item under
 * 115-FZ), then the ground the register holds, if it is another one its
 * stream may name. A general complaint or a money claim rests on the
 * contract unless the register says otherwise. */
const FIRST_ACTION = GROUNDS.findIndex((g) => g?.id === "payment_8_3_4");
const SECOND_ACTION = GROUNDS.findIndex((g) => g?.id === "payment_8_3_10");

export function groundsOf(store: ColumnStore, row: number): GroundCode[] {
  const stream = store.stream[row] ?? 0;
  const out: GroundCode[] = [];
  const add = (index: number) => {
    const spec = GROUNDS[index];
    if (spec && spec.streams.includes(stream) && !out.includes(spec.id as GroundCode)) out.push(spec.id as GroundCode);
  };
  if (stream === Stream.Antifraud) add(FIRST_ACTION);
  if (stream === Stream.Antifraud && store.path[row] === Path.SecondStep) add(SECOND_ACTION);
  if (stream === Stream.Aml && (store.reason[row] ?? 0) > 0) add(AML_GROUND_OFFSET + (store.reason[row] ?? 1) - 1);
  const held = store.ground[row] ?? Ground.None;
  if (held !== Ground.None) add(held);
  if (out.length === 0) add(Ground.Contract);
  return out;
}

/** The client's options and the deadlines that concern the client, as
 * ariadne-rules' rubric asks for them in this case: the findings of an
 * empty reply name every option and deadline it lacks. */
export function clientDuties(store: ColumnStore, row: number): { options: ClientOption[]; deadlines: ClientDeadline[] } {
  const facts = caseFacts(store, row);
  const findings = rubric({ repliedOn: AS_OF, text: "" }, facts);
  const due = new Map(clock(facts).deadlines.map((d) => [d.kind, d.due]));
  const options: ClientOption[] = [];
  const deadlines: ClientDeadline[] = [];
  for (const f of findings) {
    if (f.code === "client_option_missing" && f.subject && isCode(CLIENT_OPTIONS, f.subject)) options.push(f.subject);
    if (f.code === "deadline_missing" && f.subject && isCode(CLIENT_DEADLINE_KINDS, f.subject)) {
      const day = due.get(f.subject);
      if (day) deadlines.push({ kind: f.subject, due: day });
    }
  }
  return { options, deadlines };
}

/** The fact request's last day, sent on the day the data is taken:
 * ariadne-rules' `factRequestDue`, its two working days (a policy of this
 * desk, not a term of any law) capped by the earliest term that binds the
 * answering unit: the reply, the answer to the client's documents, to the
 * commission's request or to a Bank of Russia request. */
export function factsDueOf(facts: CaseFacts): string {
  return factRequestDue(facts, AS_OF).due;
}

/** The case as the engine takes it. */
export function caseBrief(store: ColumnStore, row: number): CaseBrief {
  const stream = STREAMS[store.stream[row] ?? 0] ?? "general";
  const operation = OPERATIONS[store.operation[row] ?? 0] ?? "none";
  const linked = store.linked[row] ?? -1;
  const replyDue = isoDay(effectiveDue(store, row));
  const facts = caseFacts(store, row);
  const { options, deadlines } = clientDuties(store, row);
  return {
    caseNo: row + 1,
    stream,
    regime: clock(facts).regime,
    reason: reasonOf(store, row),
    operation,
    opRef: operation === "none" ? 0 : (store.opRef[row] ?? 0),
    opOn: operation === "none" ? null : isoDay(store.opOn[row] ?? 0),
    amountKopecks: operation === "none" ? 0 : Math.round((store.opAmount[row] ?? 0) * 100),
    claimKopecks: Math.round((store.claim[row] ?? 0) * 100),
    forwarded: store.source[row] === Source.BankOfRussia,
    stage: CASE_STAGES[store.stage[row] ?? 0] ?? "registered",
    outcome: OUTCOMES[store.outcome[row] ?? 0] ?? "pending",
    receivedOn: isoDay(store.received[row] ?? 0),
    asOf: AS_OF,
    replyDue,
    factsDue: factsDueOf(facts),
    linkedCase: linked >= 0 ? linked + 1 : null,
    grounds: groundsOf(store, row),
    clientOptions: options,
    deadlines,
  };
}
