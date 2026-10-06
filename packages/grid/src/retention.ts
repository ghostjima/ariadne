import { dayNumber, isoDay } from "./days.js";
import { Sector } from "./schema.js";
import type { ColumnStore } from "./store.js";

/*
  How long the complaint, the reply and every notice are kept: three years
  from the day of registration, in every sector whose complaint article
  says so (Banking Law art. 30.1 part 11; 151-FZ art. 9.1 part 11;
  4015-1 art. 6.2 item 14; 39-FZ art. 15.11 item 9). The credit
  cooperatives' article (190-FZ art. 6.2) sets no term: the desk keeps
  their cases three years too, its own choice and the conservative one,
  and says it is not the law's. Plain calendar arithmetic: the term ends
  on the same date three years later (Civil Code art. 192), the last day
  of February for a 29 February.
*/

export const RETENTION_YEARS = 3;

export type Retention = {
  /* The last day the case is kept, a day number */
  until: number;
  /* Set by the sector's statute, or the desk's own choice */
  statutory: boolean;
  /* The statute's article and part, as the desk names them; null when none */
  basis: { act: string; article: string; part: string } | null;
};

const BASIS: Readonly<Record<number, Retention["basis"]>> = {
  [Sector.Bank]: { act: "banking_law", article: "30.1", part: "11" },
  [Sector.Microfinance]: { act: "microfinance_law", article: "9.1", part: "11" },
  [Sector.Insurer]: { act: "insurance_law", article: "6.2", part: "14" },
  [Sector.SecuritiesProfessional]: { act: "securities_law", article: "15.11", part: "9" },
  [Sector.CreditCooperative]: null,
};

/* The same date `years` later; the last day of the month when there is no
   such date */
export function plusYears(day: number, years: number): number {
  const [y, m, d] = isoDay(day).split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return dayNumber(`${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`);
}

export function retentionOf(store: ColumnStore, row: number): Retention {
  const basis = BASIS[store.sector[row] ?? Sector.Bank] ?? null;
  return { until: plusYears(store.registered[row] ?? 0, RETENTION_YEARS), statutory: basis !== null, basis };
}
