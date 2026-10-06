// The export of one case for an inspection: its header, how the reply's
// last day was worked out, its journal, its letter, its copies and how
// long it is kept, as plain text and as CSV. The CSV goes through the
// register's own CSV code: semicolons, quotes where needed, and every text
// cell that a spreadsheet would read as a formula written as text, since a
// comment or a letter is a person's words and the complaint's subject the
// applicant's.
import { csvEscape, neutralizeFormula } from "@ariadne/grid";
import type { DerivationStep } from "@ghostjima/stoa-react";

export type InspectionLine = { when: string; who: string; what: string; detail: string };

export type Inspection = {
  title: string;
  notes: string[];
  header: [label: string, value: string][];
  derivation: { caption: string; steps: DerivationStep[] };
  journal: { caption: string; lines: InspectionLine[] };
  letter: { caption: string; text: string | null; signatory: string; none: string };
  copies: { caption: string; lines: InspectionLine[] };
  columns: { section: string; when: string; who: string; what: string; detail: string };
};

/** A derivation step as one line of detail: formula, value, source. */
function stepDetail(step: DerivationStep): string {
  const source = step.source ? `${step.source.name}, ${step.source.revision}` : "";
  return [step.formula, step.value, source].filter((s) => s !== undefined && s !== "").join("; ");
}

export function inspectionText(x: Inspection): string {
  const out: string[] = [x.title, ...x.notes, ""];
  for (const [label, value] of x.header) out.push(`${label}: ${value}`);
  out.push("", x.derivation.caption);
  for (const step of x.derivation.steps) out.push(`- ${step.label}: ${stepDetail(step)}`);
  out.push("", x.journal.caption);
  for (const l of x.journal.lines) out.push(`- ${l.when}. ${l.what}. ${l.who}.${l.detail ? ` ${l.detail}` : ""}`);
  out.push("", x.letter.caption);
  if (x.letter.text === null) out.push(x.letter.none);
  else out.push(x.letter.text, x.letter.signatory);
  out.push("", x.copies.caption);
  for (const l of x.copies.lines) out.push(`- ${l.what}: ${l.detail}`);
  return `${out.join("\n")}\n`;
}

/** Section, when, who, what, detail: one row a line of the export. The
 * caller prepends a byte order mark for a spreadsheet program. */
export function inspectionCsv(x: Inspection): string {
  const rows: string[][] = [[x.columns.section, x.columns.when, x.columns.who, x.columns.what, x.columns.detail]];
  for (const [label, value] of x.header) rows.push([x.title, "", "", label, value]);
  for (const step of x.derivation.steps) rows.push([x.derivation.caption, "", "", step.label, stepDetail(step)]);
  for (const l of x.journal.lines) rows.push([x.journal.caption, l.when, l.who, l.what, l.detail]);
  rows.push([x.letter.caption, "", "", x.letter.signatory, x.letter.text ?? x.letter.none]);
  for (const l of x.copies.lines) rows.push([x.copies.caption, l.when, l.who, l.what, l.detail]);
  return rows.map((r) => r.map((cell) => csvEscape(neutralizeFormula(cell))).join(";")).join("\r\n");
}
