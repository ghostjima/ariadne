// The export for an inspection of one case, put together from the
// register, the rules, the journal, the letter and the copies, in the
// reader's language. The rules module must be loaded.
import { AS_OF_DAY, caseJournal, clientName, copiesDueOn, copiesOwed, copiesSent, effectiveDue, moscowMs, rowId, type ColumnStore } from "@ariadne/grid";
import type { useStoaFormat } from "@ghostjima/stoa-react";
import { strings as agentStrings } from "../agent/i18n";
import { makeFmt } from "../agent/format";
import type { Text } from "../agent/text";
import { caseDerivation } from "../case/CaseCard";
import { POOLS } from "../data/query";
import { LOCALES, type Lang, type Strings } from "../i18n";
import { parseDecisionComment, type CaseFiles } from "./caseFile";
import { workflowStrings } from "./i18n";
import { actorText, personName } from "./Journal";
import { currentLetter } from "./letter";
import type { Inspection } from "./inspection";

const DAY_MS = 86_400_000;

type Fmt = { date: (ms: number) => string; dateTime: (ms: number) => string };

export function inspectionOf(store: ColumnStore, row: number, lang: Lang, t: Strings, files: CaseFiles, fmt: Fmt, stoa: ReturnType<typeof useStoaFormat>, retention: string): Inspection {
  const w = workflowStrings[lang];
  const f = w.inspection.fields;
  const { pools, labels } = POOLS[lang];
  const day = (d: number) => fmt.date(d * DAY_MS);
  const x: Text = { t: agentStrings[lang], f: makeFmt(LOCALES[lang]), labels, lang };
  const file = files.get(row);
  const journal = caseJournal(store, row).map((e) => {
    const record = e.action === "sign" || e.action === "defer" ? parseDecisionComment(e.comment) : null;
    const detail = [
      e.from !== e.to ? w.move(labels.stage[e.from] ?? "", labels.stage[e.to] ?? "") : "",
      e.reason ? w.why(w.reasons[e.reason]) : "",
      e.copy ? w.dispatch.copy[e.copy] : "",
      e.view ? w.database.viewSaid(w.database.views[e.view]) : "",
      e.missing ? w.database.missingSaid(e.missing.map((code) => w.database.data[code]).join("; ")) : "",
      record
        ? [w.signature.record(w.signature.decisions[record.decision]), record.concerns ? w.signature.concernsSaid(record.concerns) : "", w.signature.wrongSaid(record.wrong)].filter(Boolean).join(" ")
        : e.comment
          ? w.said(e.comment)
          : "",
    ]
      .filter(Boolean)
      .join(" ");
    return { when: fmt.dateTime(e.at), who: actorText(w, t, pools, e.actor), what: w.action[e.action], detail };
  });
  // The letter kept in this page: signed, edited or handed over.
  const letter = file?.signature || file?.draft || file?.edits?.length ? currentLetter(x, store, row, files) : null;
  const signatory = personName(pools, "signatory", store.signatory[row] ?? 0);
  const signed = file?.signature;
  const due = copiesDueOn(store, row);
  return {
    title: w.inspection.title(rowId(row)),
    notes: [w.inspection.taken(day(AS_OF_DAY)), w.inspection.synthetic],
    header: [
      [f.case, rowId(row)],
      [f.applicant, clientName(store.applicant[row] ?? 0, store.client[row] ?? 0, pools)],
      [f.stream, labels.stream[store.stream[row] ?? 0] ?? ""],
      [f.organisation, labels.sector[store.sector[row] ?? 0] ?? ""],
      [f.source, labels.source[store.source[row] ?? 0] ?? ""],
      [f.received, fmt.dateTime(moscowMs(store.received[row] ?? 0, store.receivedMinute[row] ?? 0))],
      [f.registered, day(store.registered[row] ?? 0)],
      [f.replyDue, day(effectiveDue(store, row))],
      [f.stage, labels.stage[store.stage[row] ?? 0] ?? ""],
      [f.retention, retention],
    ],
    derivation: { caption: w.inspection.derivation, steps: caseDerivation(store, row, t, lang, fmt, stoa) },
    journal: { caption: w.inspection.journal, lines: journal },
    letter: {
      caption: w.inspection.letter,
      text: letter?.text ?? null,
      signatory: signed
        ? w.letter.signedBy(personName(pools, "signatory", signed.by.person), w.letter.position, fmt.dateTime(signed.at))
        : w.letter.toBeSigned(signatory, w.letter.position),
      none: w.inspection.noLetter,
    },
    copies: {
      caption: w.inspection.copies,
      lines: [
        ...copiesSent(store, row).map((k) => ({ when: day(due), who: "", what: w.dispatch.copy[k], detail: w.dispatch.sentOn(day(due)) })),
        ...copiesOwed(store, row).map((k) => ({ when: day(due), who: "", what: w.dispatch.copy[k], detail: w.dispatch.due(day(due)) })),
      ],
    },
    columns: w.inspection.columns,
  };
}
