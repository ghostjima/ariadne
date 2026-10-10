/*
  The kinds of case the inbox has complaints for, and the register's rows
  of each kind.

  A kind is a set of facts a complaint can state so that its reader can
  tell the stream and the grounds from the text alone: which operation was
  stopped and how, what the bank said of the client's data in the Bank of
  Russia's database, which 115-FZ decision was taken. The register decides
  which rows are of a kind; the texts (texts/) only say what the row holds.

  A row is taken when the assistant would draft its reply (before legal
  review), the complaint is to the bank itself, and the grounds its brief
  names are the ones the facts give: a ground a person added in the
  register (the contract, beside the law) is nothing a complaint could
  show, so such a row is left out.
*/

import { Applicant, Database, Operation, Path, Restriction, Sector, Stage, Stream, type ColumnStore } from "@ariadne/grid";
import type { GroundCode } from "@ariadne/runner";
import { groundsOf } from "./brief.js";

export const CASE_KINDS = [
  /* 442-FZ: a fee charged, the app that does not let the client in, a
     reissued card that has not come */
  "general_fee",
  "general_access",
  "general_card",
  /* A claim for money: insurance added to a loan, a service package never
     agreed to, deposit interest paid short */
  "claim_insurance",
  "claim_service",
  "claim_interest",
  /* 161-FZ art. 8: a transfer by bank details suspended, a card payment or
     a Faster Payments transfer refused (part 3.4); the same confirmed or
     repeated and stopped again after the Bank of Russia's database
     answered (parts 3.4 and 3.10) */
  "block_transfer",
  "block_card",
  "block_second_transfer",
  "block_second_card",
  /* 161-FZ art. 9: the client's own data in the Bank of Russia's database:
     the card and online banking suspended (part 11.6), the same with the
     Ministry of Internal Affairs' information (part 11.7), the transfers
     capped instead (part 11.6, sentence 2) */
  "data_suspended",
  "data_police",
  "data_capped",
  /* 115-FZ, by category */
  "aml_operation_refused",
  "aml_account_refused",
  "aml_account_terminated",
  "aml_operation_suspended",
  "aml_suspended_by_decision",
  "aml_funds_frozen",
  "aml_high_risk",
] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

const AML_KINDS: readonly CaseKind[] = [
  "aml_operation_refused",
  "aml_account_refused",
  "aml_account_terminated",
  "aml_operation_suspended",
  "aml_suspended_by_decision",
  "aml_funds_frozen",
  "aml_high_risk",
];
/* The register's complaint templates the general and money kinds follow
   (the pools' order), so a row's operation and amounts fit its text */
const GENERAL_KINDS: readonly (CaseKind | null)[] = ["general_fee", "general_access", null, "general_card", null];
const CLAIM_KINDS: readonly (CaseKind | null)[] = ["claim_insurance", null, "claim_service", "claim_interest", null];

/* The grounds a reply to a kind names, as the facts give them */
export const KIND_GROUNDS: Record<CaseKind, readonly GroundCode[]> = {
  general_fee: ["contract"],
  general_access: ["contract"],
  general_card: ["contract"],
  claim_insurance: ["contract"],
  claim_service: ["contract"],
  claim_interest: ["contract"],
  block_transfer: ["payment_8_3_4"],
  block_card: ["payment_8_3_4"],
  block_second_transfer: ["payment_8_3_4", "payment_8_3_10"],
  block_second_card: ["payment_8_3_4", "payment_8_3_10"],
  data_suspended: ["payment_9_11_6"],
  data_police: ["payment_9_11_7"],
  data_capped: ["payment_9_11_6"],
  aml_operation_refused: ["aml_operation_refused"],
  aml_account_refused: ["aml_account_refused"],
  aml_account_terminated: ["aml_account_terminated"],
  aml_operation_suspended: ["aml_operation_suspended"],
  aml_suspended_by_decision: ["aml_operation_suspended_by_decision"],
  aml_funds_frozen: ["aml_funds_frozen"],
  aml_high_risk: ["aml_high_risk_measures"],
};

function rawKind(store: ColumnStore, row: number): CaseKind | null {
  const stream = store.stream[row];
  const template = store.template[row] ?? 0;
  if (stream === Stream.General) return GENERAL_KINDS[template] ?? null;
  if (stream === Stream.MoneyClaim) return CLAIM_KINDS[template] ?? null;
  if (stream === Stream.Aml) return AML_KINDS[(store.reason[row] ?? 0) - 1] ?? null;
  if (stream !== Stream.Antifraud) return null;
  const database = store.database[row] ?? Database.None;
  if (database === Database.ClientDataWithPoliceInformation) return "data_police";
  if (database === Database.ClientData) return store.restriction[row] === Restriction.TransfersCapped ? "data_capped" : "data_suspended";
  const operation = store.operation[row];
  const second = store.path[row] === Path.SecondStep;
  if (operation === Operation.BankTransfer) return second ? "block_second_transfer" : "block_transfer";
  if (operation === Operation.CardPayment || operation === Operation.FasterPayment) return second ? "block_second_card" : "block_card";
  return null;
}

/* The kind of a register row the inbox has a complaint for, or null */
export function kindOf(store: ColumnStore, row: number): CaseKind | null {
  if (store.loaded[row] === 0) return null;
  if ((store.stage[row] ?? Stage.Closed) >= Stage.LegalReview) return null;
  if (store.sector[row] !== Sector.Bank) return null;
  const kind = rawKind(store, row);
  if (kind === null) return null;
  /* The texts speak as the applicant does: a company complains of a 115-FZ
     measure, a person of everything else (a company's money claim has
     another clock besides) */
  const company = store.applicant[row] === Applicant.LegalEntity;
  if (company !== (store.stream[row] === Stream.Aml)) return null;
  const grounds = groundsOf(store, row);
  const expected = KIND_GROUNDS[kind];
  if (grounds.length !== expected.length || grounds.some((g, i) => g !== expected[i])) return null;
  return kind;
}

/* Whether the row is linked to an earlier complaint about the same matter */
export function isLinked(store: ColumnStore, row: number): boolean {
  return (store.linked[row] ?? -1) >= 0;
}

/* The rows of each kind, without and with a linked case, in row order */
export type KindIndex = { plain: Record<CaseKind, number[]>; linked: Record<CaseKind, number[]> };

export function indexKinds(store: ColumnStore): KindIndex {
  const empty = () => Object.fromEntries(CASE_KINDS.map((k) => [k, [] as number[]])) as Record<CaseKind, number[]>;
  const index: KindIndex = { plain: empty(), linked: empty() };
  for (let row = 0; row < store.size; row++) {
    const kind = kindOf(store, row);
    if (kind !== null) (isLinked(store, row) ? index.linked : index.plain)[kind].push(row);
  }
  return index;
}
