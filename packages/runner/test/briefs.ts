import type { CaseBrief } from "../src/index.js";

/* A transfer suspended under 161-FZ, sign 1.4, forwarded by the Bank of
   Russia, with a linked case: its fact request asks to reuse the linked
   case's facts */
export const BRIEF: CaseBrief = {
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
  deadlines: [],
};

/* A general complaint about a card payment, no linked case */
export const PLAIN: CaseBrief = {
  ...BRIEF,
  caseNo: 1200,
  stream: "general",
  reason: null,
  operation: "card_payment",
  forwarded: false,
  stage: "registered",
  linkedCase: null,
  grounds: ["contract"],
  clientOptions: [],
};

/* A refused operation under 115-FZ: documents, then the commission, with
   the answer to the documents still running */
export const AML: CaseBrief = {
  ...PLAIN,
  caseNo: 431,
  stream: "aml_refusal",
  reason: "aml_operation_refused",
  operation: "bank_transfer",
  outcome: "refused",
  grounds: ["aml_operation_refused"],
  clientOptions: ["submit_documents", "apply_to_commission"],
  deadlines: [{ kind: "aml_documents_answer", due: "2026-10-09" }],
};

/* A refused card payment whose client's own card was then suspended for
   their data in the Bank of Russia's database, and who applied through
   the bank to remove the data: the reply names art. 8 part 3.4 and
   art. 9 part 11.6, and the Bank of Russia's decision still to come */
export const REMOVAL: CaseBrief = {
  ...BRIEF,
  caseNo: 1150,
  reason: "od2506_1_1",
  operation: "card_payment",
  forwarded: false,
  linkedCase: null,
  grounds: ["payment_8_3_4", "payment_9_11_6"],
  clientOptions: ["repeat_operation"],
  deadlines: [{ kind: "exclusion_decision", due: "2026-10-23" }],
};
