// The letter of a case from legal review on: the review (the letter as it
// stands, the decision, what the rubric finds, the changes against the
// assistant's draft, and the reviewer's edit) and the signature (the
// decision record, then the signed letter, frozen, with the signatory named
// on it). Approve and return are the case's transitions, in the work above.
import { useRef, useState } from "react";
import { Button, ChoiceGroup, Dialog, Letter, Panel, Select, TextDiff, TextField, useFormatters } from "@ghostjima/stoa-react";
import { GROUND_COUNT, Stage, rowId, type ColumnStore, type Role } from "@ariadne/grid";
import type { CaseFacts } from "@ariadne/rules";
import { strings as agentStrings } from "../agent/i18n";
import { makeFmt } from "../agent/format";
import type { Text } from "../agent/text";
import { ReplyCheck } from "../agent/ui/ReplyCheck";
import { POOLS } from "../data/query";
import { LOCALES, type Lang, type Strings } from "../i18n";
import { LETTER_MAX, RECORD_MIN, SIGN_DECISIONS, type CaseFiles, type DecisionRecord, type LetterError, type SignDecision, type SignError } from "./caseFile";
import { workflowStrings } from "./i18n";
import { actorText, personName } from "./Journal";
import { assistantDraft, currentLetter, draftText } from "./letter";
import { TextArea } from "./TextArea";
import { changeStats, diffText } from "./textDiff";
import { actsOn } from "./CaseWork";

export type LetterPanelProps = {
  store: ColumnStore;
  row: number;
  role: Role;
  lang: Lang;
  t: Strings;
  version: number;
  files: CaseFiles;
  facts: CaseFacts;
  onEditLetter: (text: string, current: string) => LetterError | null;
  /** Sets the decision or the ground through the register's edit rules;
   * the refusal's sentence, or null. */
  onField: (field: "outcome" | "ground", value: number) => string | null;
  onSign: (record: DecisionRecord & { decision: Exclude<SignDecision, "defer"> }) => SignError | null;
  onDefer: (record: { concerns: string; wrong: string }) => SignError | null;
};

export function LetterPanel(props: LetterPanelProps) {
  const { store, row, role, lang, t, version, files, facts } = props;
  void version;
  const w = workflowStrings[lang];
  const { pools, labels } = POOLS[lang];
  const fmt = useFormatters({ timeZone: "Europe/Moscow" });
  const x: Text = { t: agentStrings[lang], f: makeFmt(LOCALES[lang]), labels, lang };
  const box = useRef<HTMLDivElement>(null);
  const stage = store.stage[row] ?? 0;
  const file = files.get(row);
  const [editing, setEditing] = useState(false);
  const [draftEdit, setDraftEdit] = useState("");
  const [editError, setEditError] = useState<LetterError | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [decision, setDecision] = useState<SignDecision>("approve");
  const [concerns, setConcerns] = useState("");
  const [wrong, setWrong] = useState("");
  const [signError, setSignError] = useState<SignError | null>(null);

  if (stage < Stage.LegalReview && !file?.draft && !file?.edits?.length) return null;
  const id = rowId(row);
  const signatory = personName(pools, "signatory", store.signatory[row] ?? 0);
  const focusHeading = () => {
    const heading = box.current?.querySelector<HTMLElement>(".stoa-panel__title");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };

  if (stage >= Stage.Sent && !file?.signature)
    return (
      <div ref={box} className="letter-panel">
        <Panel title={w.letter.panel} level={3}>
          <p className="muted">{w.letter.notKept}</p>
        </Panel>
      </div>
    );

  const letter = currentLetter(x, store, row, files);
  const { draft, handedOver } = assistantDraft(store, row, files);
  const original = draftText(x, store, row, files);
  const parts = diffText(original, letter.text);
  const stats = changeStats(parts);
  const signed = file?.signature;
  const reviewer = role === "reviewer" && stage === Stage.LegalReview;
  const signer = role === "signatory" && stage === Stage.AwaitingSignature && actsOn(store, row, role) && !signed;
  const signLine = signed
    ? w.letter.signedBy(personName(pools, "signatory", signed.by.person), w.letter.position, fmt.dateTime(signed.at))
    : w.letter.toBeSigned(signatory, w.letter.position);
  const canEdit = !signed && (reviewer || signer);

  const openEditor = () => {
    setDraftEdit(letter.text);
    setEditError(null);
    setEditing(true);
  };
  const saveEdit = () => {
    const refused = props.onEditLetter(draftEdit, letter.text);
    setEditError(refused);
    if (!refused) setEditing(false);
  };
  const editErrorText = (e: LetterError) => (e.code === "letter-too-long" ? w.review.errors["letter-too-long"](String(e.max), String(e.length)) : w.review.errors[e.code]);
  const signErrorText = (e: SignError) =>
    e.code === "wrong-required" || e.code === "concerns-required"
      ? w.signature.errors[e.code](String(e.min))
      : e.code === "record-too-long"
        ? w.signature.errors["record-too-long"](String(e.max))
        : w.signature.errors[e.code];
  const decide = () => {
    const refused =
      decision === "defer" ? props.onDefer({ concerns, wrong }) : props.onSign({ decision, concerns, wrong });
    setSignError(refused);
    if (!refused) {
      setConcerns("");
      setWrong("");
      setDecision("approve");
      focusHeading();
    }
  };
  const setField = (field: "outcome" | "ground", value: number) => setFieldError(props.onField(field, value));

  return (
    <div ref={box} className="letter-panel">
      <Panel title={signed ? w.letter.signedPanel : w.letter.panel} level={3}>
        <p className="muted">
          {letter.edit
            ? w.letter.editedBy(actorText(w, t, pools, { kind: "person", ...letter.edit.by }), fmt.dateTime(letter.edit.at))
            : handedOver && file?.draft
              ? w.letter.handedOver(fmt.dateTime(file.draft.at))
              : w.letter.fromRegister}
        </p>
        {letter.lang !== lang && <p className="muted">{w.letter.otherLanguage}</p>}
        <div className="letter">
          <Letter label={signed ? w.letter.signedPanel : w.letter.asItStands} hideLabel lines={letter.text.split("\n")} lang={letter.lang} />
          <p className="letter__signatory">{signLine}</p>
        </div>
        {signed && <p>{w.signature.frozen}</p>}
        {canEdit && (
          <div className="letter-form__actions">
            <Button onPress={openEditor}>{w.review.edit}</Button>
          </div>
        )}

        {reviewer && (
          <div className="letter-form">
            <h4>{w.signature.decision}</h4>
            <div className="letter-form__actions">
              <Select<number>
                label={labels.columns.outcome ?? "outcome"}
                value={store.outcome[row] ?? 0}
                onChange={(v) => setField("outcome", v)}
                options={labels.outcome.map((label, code) => ({ id: code, label }))}
              />
              <Select<number>
                label={labels.columns.ground ?? "ground"}
                value={store.ground[row] ?? 0}
                onChange={(v) => setField("ground", v)}
                options={labels.ground.slice(0, GROUND_COUNT).map((label, code) => ({ id: code, label }))}
              />
            </div>
            {fieldError && (
              <p className="field-error" role="alert">
                {fieldError}
              </p>
            )}
          </div>
        )}

        <h4>{w.review.findings}</h4>
        <p className="muted">{w.review.findingsNote}</p>
        <ReplyCheck x={x} draft={draft} facts={facts} text={letter.text} />

        <h4>{w.review.diff}</h4>
        {stats.changed === 0 && stats.added === 0 && stats.removed === 0 ? (
          <p className="muted">{w.review.diffNone}</p>
        ) : (
          <>
            {/* Stoa's diff and its own share of changed characters; under
                it the share the supervisor's measure of light edits counts,
                which is this desk's own (textDiff.ts). */}
            <TextDiff label={w.review.diffCaption} hideLabel before={original} after={letter.text} lang={letter.lang} />
            <p className="muted">{w.review.diffStats(x.f.int(stats.changed), x.f.int(stats.base), x.f.percent(stats.share))}</p>
          </>
        )}

        {stage === Stage.AwaitingSignature && (
          <>
            <h4>{w.signature.panel}</h4>
            <p className="muted">{w.signature.basis}</p>
            {signed ? (
              <div className="signature-record">
                <p>{w.signature.record(w.signature.decisions[signed.decision])}</p>
                {signed.concerns && <p>{w.signature.concernsSaid(signed.concerns)}</p>}
                <p>{w.signature.wrongSaid(signed.wrong)}</p>
                <p>{w.signature.sendNext}</p>
              </div>
            ) : signer ? (
              <div className="letter-form">
                <ChoiceGroup<SignDecision>
                  label={w.signature.decision}
                  value={decision}
                  onChange={setDecision}
                  choices={SIGN_DECISIONS.map((d) => ({ id: d, label: w.signature.decisions[d] }))}
                  description={w.signature.decisionHelp[decision]}
                />
                <TextField label={w.signature.concerns} value={concerns} onChange={setConcerns} description={w.signature.concernsHelp(String(RECORD_MIN))} />
                <TextField label={w.signature.wrong} value={wrong} onChange={setWrong} description={w.signature.wrongHelp(String(RECORD_MIN))} />
                {signError && (
                  <p className="field-error" role="alert">
                    {signErrorText(signError)}
                  </p>
                )}
                <div className="letter-form__actions">
                  <Button variant="primary" onPress={decide}>
                    {decision === "defer" ? w.signature.defer : w.signature.sign}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="muted">{w.signature.notYours(signatory)}</p>
            )}
            {(file?.deferrals?.length ?? 0) > 0 && (
              <>
                <h4>{w.signature.deferrals}</h4>
                <ul className="signature-record">
                  {file!.deferrals!.map((d, k) => (
                    <li key={k}>
                      {fmt.dateTime(d.at)}: {w.signature.concernsSaid(d.concerns)} {w.signature.wrongSaid(d.wrong)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        {!canEdit && stage === Stage.LegalReview && role !== "reviewer" && <p className="muted">{w.review.readOnly}</p>}
      </Panel>
      <Dialog
        isOpen={editing}
        onOpenChange={setEditing}
        title={w.review.editTitle(id)}
        actions={
          <>
            <Button onPress={() => setEditing(false)}>{w.cancel}</Button>
            <Button variant="primary" onPress={saveEdit}>
              {w.review.save}
            </Button>
          </>
        }
      >
        <div className="letter-form">
          <TextArea
            label={w.review.editLabel}
            value={draftEdit}
            onChange={setDraftEdit}
            description={w.review.editHelp(x.f.int(LETTER_MAX))}
            lang={letter.lang}
            autoFocus
            isInvalid={editError !== null}
          />
          {editError && (
            <p className="field-error" role="alert">
              {editErrorText(editError)}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
