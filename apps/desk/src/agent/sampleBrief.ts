// A case brief for the unit tests and the throughput bench, which run the
// assistant without the register: a transfer suspended under 161-FZ (sign
// 1.4) with a linked case, so its fact request asks to deviate, and the
// confirmation of the order still running on the day the data is taken.
import type { CaseBrief } from "@ariadne/runner";

export const SAMPLE_BRIEF: CaseBrief = {
  caseNo: 867,
  stream: "antifraud",
  regime: "complaint",
  reason: "od2506_1_4",
  operation: "bank_transfer",
  opRef: 48_213_007,
  opOn: "2026-09-01",
  amountKopecks: 4_850_000,
  claimKopecks: 0,
  forwarded: true,
  stage: "drafting",
  outcome: "pending",
  receivedOn: "2026-09-03",
  asOf: "2026-10-06",
  replyDue: "2026-10-12",
  factsDue: "2026-10-08",
  linkedCase: 807,
  grounds: ["payment_8_3_4"],
  clientOptions: ["confirm_order"],
  deadlines: [{ kind: "antifraud_confirmation", due: "2026-10-07" }],
  measures: [],
};
