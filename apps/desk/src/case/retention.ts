// How long a case is kept, in words: the complaint, the reply and every
// notice, three years from registration as ariadne-rules counts it
// (`storage_until`, with the sector article's part). The credit
// cooperatives' article sets no term (the rules warn
// `storage_term_not_set`); the desk keeps those cases three years too, its
// own choice, and says so. The rules module must be loaded.
import { caseFacts, dayNumber, retentionOf, type ColumnStore } from "@ariadne/grid";
import { clock, type Deadline } from "@ariadne/rules";
import type { Lang } from "../i18n";
import { workflowStrings } from "../workflow/i18n";
import type { CaseDetails } from "./details";
import { basisName } from "./sources";

/** The rules' storage term of a case, or null where the sector's article
 * sets none. */
export function storageOf(store: ColumnStore, row: number): Deadline | null {
  return clock(caseFacts(store, row)).deadlines.find((d) => d.kind === "storage_until") ?? null;
}

export function retentionText(store: ColumnStore, row: number, details: Pick<CaseDetails, "storage">, lang: Lang, day: (d: number) => string): string {
  const d = workflowStrings[lang].dispatch;
  const storage = details.storage;
  if (storage) return d.retention(day(dayNumber(storage.due)), basisName(storage.basis, lang));
  return d.retentionNone(day(retentionOf(store, row).until));
}
