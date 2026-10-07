// What goes out with a reply, and around it, on the case: the dispatch of
// the signed reply (a high-risk step a person confirms, then a send delay
// counted down in which it can be cancelled; once it has left it is not
// recalled), the copies it owes and their marks, the breach of a standard
// that owes a self-regulatory organisation its copy, the supervisor's
// extension with its reason, how long the case is kept, and the export
// for an inspection.
import { useEffect, useRef, useState } from "react";
import { AlertDialog, Button, Callout, Checkbox, Panel, ProgressBar, TextField, useFormatters, useStoaFormat } from "@ghostjima/stoa-react";
import {
  Copy,
  Sector,
  Stage,
  copiesOwed,
  copiesSent,
  copiesDueOn,
  replyCopies,
  retentionOf,
  rowId,
  type ColumnStore,
  type CopyKind,
  type ExtensionError,
  type Role,
} from "@ariadne/grid";
import { POOLS } from "../data/query";
import type { Lang, Strings } from "../i18n";
import { actsOn } from "./CaseWork";
import type { CaseFiles } from "./caseFile";
import { workflowStrings } from "./i18n";
import { inspectionCsv, inspectionText } from "./inspection";
import { inspectionOf } from "./inspectionOf";

const DAY_MS = 86_400_000;

export type PendingDispatch = { until: number; delayMs: number };

export type DispatchPanelProps = {
  store: ColumnStore;
  row: number;
  role: Role;
  lang: Lang;
  t: Strings;
  version: number;
  files: CaseFiles;
  pending: PendingDispatch | null;
  /** Seconds of the send delay. */
  delay: number;
  onDispatch: () => void;
  onCancel: () => void;
  onMarkCopy: (kind: CopyKind) => void;
  onBreach: (found: boolean) => string | null;
  onExtend: (reason: string) => ExtensionError | null;
  /** Said once an export is saved. */
  onExported: () => void;
};

/** Saves text as a file, as the queue's CSV export does. */
function save(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The legal words of a retention basis, in the reader's language. */
function basisWords(lang: Lang, basis: { act: string; article: string; part: string }): string {
  const acts: Record<string, Record<Lang, string>> = {
    banking_law: { ru: "Закон о банках", en: "Banking Law" },
    microfinance_law: { ru: "151-ФЗ", en: "151-FZ" },
    insurance_law: { ru: "закон № 4015-1", en: "Law No. 4015-1" },
    securities_law: { ru: "39-ФЗ", en: "39-FZ" },
  };
  const items = basis.act === "insurance_law" || basis.act === "securities_law";
  const act = acts[basis.act]?.[lang] ?? basis.act;
  return lang === "ru"
    ? `${act}, ст. ${basis.article}, ${items ? "п." : "ч."} ${basis.part}`
    : `${act}, art. ${basis.article}, ${items ? "item" : "part"} ${basis.part}`;
}

export function DispatchPanel(props: DispatchPanelProps) {
  const { store, row, role, lang, t, version, files, pending } = props;
  void version;
  const w = workflowStrings[lang];
  const d = w.dispatch;
  const { labels } = POOLS[lang];
  const fmt = useFormatters({ timeZone: "Europe/Moscow" });
  const stoa = useStoaFormat();
  const box = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [extendError, setExtendError] = useState<ExtensionError | null>(null);
  const [breachError, setBreachError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stage = store.stage[row] ?? 0;
  const id = rowId(row);
  const day = (dayNumber: number) => fmt.date(dayNumber * DAY_MS);
  const signed = files.get(row)?.signature !== undefined;
  const signer = role === "signatory" && actsOn(store, row, role);

  // The send delay, counted down every second while it runs.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [pending]);

  const focusHeading = () => {
    const heading = box.current?.querySelector<HTMLElement>(".stoa-panel__title");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };
  // Once the confirmation has gone, the Dispatch button that opened it has
  // gone too (the send delay took its place): the heading takes the focus.
  const refocus = useRef(false);
  useEffect(() => {
    if (asking || !refocus.current) return;
    refocus.current = false;
    const frame = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(frame);
  }, [asking, pending]);

  const retention = retentionOf(store, row);
  const owed = copiesOwed(store, row);
  const sent = copiesSent(store, row);
  const nonBank = (store.sector[row] ?? Sector.Bank) !== Sector.Bank;
  const dueCopies = (() => {
    // What a dispatch now would owe, as the rules compute it for the case.
    const bits = replyCopies(store, row);
    const out: CopyKind[] = [];
    if (bits & Copy.BankOfRussiaDue) out.push("bank_of_russia");
    if (bits & Copy.SroDue) out.push("sro");
    return out;
  })();
  const left = pending ? Math.max(0, Math.ceil((pending.until - now) / 1000)) : 0;
  const extensionText = (e: ExtensionError) =>
    e.code === "extension-reason-required"
      ? d.reasonRequired(String(e.min))
      : e.code === "already-extended"
        ? d.alreadyExtended
        : e.code === "extension-not-allowed"
          ? d.extensionRefusedBy(t.case.extensionRefusal["extension_not_allowed"] ?? t.editErrors.extensionNotAllowed)
          : e.code === "extension-too-late"
            ? t.editErrors.extensionTooLate(day(e.lastDay))
            : e.code === "extension-after-reply"
              ? t.editErrors.extensionAfterReply
              : e.code === "role-cannot-edit"
                ? t.editErrors.roleCannotEdit(labels.columns.extension ?? "")
                : t.editErrors.valueUnknown;

  const retentionText = retention.basis ? d.retention(day(retention.until), basisWords(lang, retention.basis)) : d.retentionNone(day(retention.until));
  const exportAs = (kind: "text" | "csv") => {
    const inspection = inspectionOf(store, row, lang, t, files, fmt, stoa, retentionText);
    if (kind === "text") save(inspectionText(inspection), d.file(id, "txt"), "text/plain;charset=utf-8");
    else save(`\uFEFF${inspectionCsv(inspection)}`, d.file(id, "csv"), "text/csv;charset=utf-8");
    props.onExported();
  };

  return (
    <div ref={box} className="dispatch-panel">
      <Panel title={d.panel} level={3}>
        <p className="muted">{retentionText}</p>

        {stage === Stage.AwaitingSignature &&
          (pending ? (
            <div className="dispatch-pending" role="group" aria-label={d.pendingLabel}>
              <ProgressBar label={d.pending(String(left))} value={Math.max(0, pending.until - now)} maxValue={pending.delayMs} />
              <Button
                variant="danger"
                onPress={() => {
                  focusHeading();
                  props.onCancel();
                }}
              >
                {d.cancel}
              </Button>
            </div>
          ) : signed && signer ? (
            <div className="letter-form">
              <p className="muted">{d.help}</p>
              <div className="letter-form__actions">
                <Button variant="primary" onPress={() => setAsking(true)}>
                  {d.dispatch}
                </Button>
              </div>
            </div>
          ) : (
            <p className="muted">{d.notYet}</p>
          ))}

        <h4>{d.copies}</h4>
        <p className="muted">{d.copyBasis}</p>
        {owed.length + sent.length === 0 ? (
          <p className="muted">{d.noCopies}</p>
        ) : (
          <ul className="copies">
            {sent.map((kind) => (
              <li key={`sent-${kind}`}>
                {d.copy[kind]}: {d.sentOn(day(copiesDueOn(store, row)))}
              </li>
            ))}
            {owed.map((kind) => (
              <li key={`owed-${kind}`}>
                <span>
                  {d.copy[kind]}: <strong>{d.due(day(copiesDueOn(store, row)))}</strong>
                </span>
                {role !== "reviewer" && (
                  <Button
                    size="small"
                    onPress={() => {
                      focusHeading();
                      props.onMarkCopy(kind);
                    }}
                    aria-label={`${d.markSent}: ${d.copy[kind]}`}
                  >
                    {d.markSent}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {nonBank && stage < Stage.Sent && role !== "signatory" && (
          <div className="letter-form">
            <Checkbox
              isSelected={store.breach[row] === 1}
              onChange={(found) => setBreachError(props.onBreach(found))}
              description={d.breachHelp}
            >
              {d.breach}
            </Checkbox>
            {breachError && (
              <p className="field-error" role="alert">
                {breachError}
              </p>
            )}
          </div>
        )}

        {role === "supervisor" && stage < Stage.Sent && (
          <div className="letter-form">
            <h4>{d.extension}</h4>
            <p className="muted">{d.extensionHelp}</p>
            <TextField label={d.extensionReason} value={reason} onChange={setReason} />
            {extendError && (
              <p className="field-error" role="alert">
                {extensionText(extendError)}
              </p>
            )}
            <div className="letter-form__actions">
              <Button
                onPress={() => {
                  const refused = props.onExtend(reason);
                  setExtendError(refused);
                  if (!refused) setReason("");
                }}
              >
                {d.extend}
              </Button>
            </div>
          </div>
        )}

        <h4>{d.export}</h4>
        <div className="letter-form__actions">
          <Button onPress={() => exportAs("text")}>{d.exportText}</Button>
          <Button onPress={() => exportAs("csv")}>{d.exportCsv}</Button>
        </div>
      </Panel>
      <AlertDialog
        isOpen={asking}
        onOpenChange={setAsking}
        title={d.confirmTitle(id)}
        confirmLabel={d.confirm}
        cancelLabel={d.keep}
        tone="destructive"
        onConfirm={() => {
          refocus.current = true;
          props.onDispatch();
        }}
      >
        <p>{d.confirmTo(labels.channel[store.channel[row] ?? 0] ?? "")}</p>
        {dueCopies.length > 0 ? (
          <>
            <p>{d.confirmCopies}</p>
            <ul>
              {dueCopies.map((kind) => (
                <li key={kind}>{d.copy[kind]}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>{d.confirmNoCopies}</p>
        )}
        <Callout tone="warning" role="none">
          {d.confirmDelay(String(props.delay))}
        </Callout>
      </AlertDialog>
    </div>
  );
}
