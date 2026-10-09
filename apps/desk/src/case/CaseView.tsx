// One case, in one window: the work on it (its stage, what the role may do
// now, its journal) and its card, and the assistant beside them. The
// header (Stoa's DetailHeader) says which case, where it stands and how
// long is left, and takes the focus when the case opens; Back to the queue
// (Q) puts the focus on the row it was opened from (focusWhenReady), once
// the queue is drawn again. On a wide screen the
// card and the assistant sit side by side; on a narrower one they are two
// tabs, so the assistant's Run is never a long scroll away.
import { useEffect, useState } from "react";
import { loadRules, rulesLoaded } from "@ariadne/rules";
import {
  Button,
  Countdown,
  DetailHeader,
  ProgressBar,
  Tabs,
  Tag,
  VisuallyHidden,
  focusWhenReady,
  useBreakpoint,
  useShortcuts,
  type FocusTarget,
  type Shortcut,
  type ToastQueue,
} from "@ghostjima/stoa-react";
import { Stage, caseFacts, clientName, isAnswered, rowId, wasReturned, workingDaysLeft, type ColumnStore, type Role } from "@ariadne/grid";
import type { ReplyDraft } from "@ariadne/runner";
import { AgentPanel } from "../agent/AgentPanel";
import { strings as agentStrings } from "../agent/i18n";
import { sessionFor, type RunService } from "../agent/service";
import { POOLS } from "../data/query";
import { DUE_SOON, stageTone } from "../desk/columns";
import type { Lang, Strings } from "../i18n";
import { CaseCard } from "./CaseCard";
import { CaseWork, actsOn, type TransitionRequest, type WorkRefusal } from "../workflow/CaseWork";
import { LetterPanel } from "../workflow/LetterPanel";
import { DispatchPanel, type PendingDispatch } from "../workflow/DispatchPanel";
import { DatabasePanel } from "../workflow/DatabasePanel";
import type { CopyKind, ExtensionError, QueryError, QueryView, RemovalError } from "@ariadne/grid";
import type { DecisionRecord, LetterError, SignDecision, SignError } from "../workflow/caseFile";
import { Handover } from "../workflow/Handover";
import type { CaseFiles } from "../workflow/caseFile";
import { workflowStrings } from "../workflow/i18n";
import { caseBrief } from "./brief";

/** The rules module, loaded once for the page: the card asks it for the
 * case's whole clock. */
function useRules(): boolean {
  const [ready, setReady] = useState(rulesLoaded);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void loadRules().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

export type CaseViewProps = {
  store: ColumnStore;
  row: number;
  lang: Lang;
  t: Strings;
  version: number;
  service: RunService;
  toasts: ToastQueue;
  onBack: () => void;
  /** Where the focus lands after Back or Q: the queue's active cell, drawn
   * again once the case is closed. */
  backFocus: FocusTarget;
  onOpenCase: (row: number) => void;
  role: Role;
  /** What the desk keeps with each case: the draft handed over. */
  files: CaseFiles;
  onTransition: (request: TransitionRequest) => WorkRefusal | null;
  onEditLetter: (text: string, current: string) => LetterError | null;
  onField: (field: "outcome" | "ground", value: number) => string | null;
  onSign: (record: DecisionRecord & { decision: Exclude<SignDecision, "defer"> }) => SignError | null;
  onDefer: (record: { concerns: string; wrong: string }) => SignError | null;
  /** A dispatch waiting out its send delay, if any. */
  pending: PendingDispatch | null;
  sendDelay: number;
  onDispatch: () => void;
  onCancelDispatch: () => void;
  onMarkCopy: (kind: CopyKind) => void;
  onBreach: (found: boolean) => string | null;
  onExtend: (reason: string) => ExtensionError | null;
  /** Sends the bank's own application to remove the client's data from
   * the Bank of Russia's database. */
  onApplyForRemoval: (reason: string) => RemovalError | null;
  /** Records the Bank of Russia's request about the client's own
   * application, received today, and the bank's answer to it. */
  onRecordQuery: () => QueryError | null;
  onAnswerQuery: (view: QueryView | null, reason: string) => QueryError | null;
  onExported: () => void;
  /** Records the assistant's handover a person confirmed. */
  onHandover: (draft: ReplyDraft, run: number) => void;
};

export function CaseView(props: CaseViewProps) {
  const { store, row, lang, t, version, service, toasts, onBack, backFocus, onOpenCase, role, files, onTransition, onHandover } = props;
  const ready = useRules();
  const breakpoint = useBreakpoint();
  const wide = breakpoint === "wide";
  const [tab, setTab] = useState<"card" | "assistant">(() => (new URLSearchParams(location.search).get("panel") === "assistant" ? "assistant" : "card"));
  const [helpOpen, setHelpOpen] = useState(false);
  const { pools, labels } = POOLS[lang];
  const c = t.case;
  const id = rowId(row);
  const name = clientName(store.applicant[row] ?? 0, store.client[row] ?? 0, pools);
  const stage = store.stage[row] ?? 0;
  // The assistant is told the case's codes, dates and amounts, never its
  // text (brief.ts); the session is made once the rules have loaded.
  const session = ready ? sessionFor(row, caseBrief(store, row), service.transport) : null;

  // Q does what Back does: the focus goes to the queue's row once it is
  // drawn, never to the page's body in between.
  const back = () => {
    focusWhenReady(backFocus);
    onBack();
  };
  const shortcuts: Shortcut[] = [{ key: "q", description: c.keys.back, group: c.keysGroup, onTrigger: back }];
  // The assistant's panel lists Q with its own keys and listens for it;
  // until the panel is there (the rules module is still loading), the view
  // listens for Q itself, so Back to the queue works from the first moment.
  useShortcuts(shortcuts, { enabled: session === null });
  const operator = role === "operator" && actsOn(store, row, role);
  const card = ready ? (
    <div className="case__main">
      <CaseWork
        store={store}
        row={row}
        role={role}
        lang={lang}
        t={t}
        version={version}
        onTransition={onTransition}
        hidden={files.get(row)?.signature || props.pending ? ["return", "send"] : ["send"]}
      />
      <LetterPanel
        store={store}
        row={row}
        role={role}
        lang={lang}
        t={t}
        version={version}
        files={files}
        facts={caseFacts(store, row)}
        onEditLetter={props.onEditLetter}
        onField={props.onField}
        onSign={props.onSign}
        onDefer={props.onDefer}
      />
      <DispatchPanel
        store={store}
        row={row}
        role={role}
        lang={lang}
        t={t}
        version={version}
        files={files}
        pending={props.pending}
        delay={props.sendDelay}
        onDispatch={props.onDispatch}
        onCancel={props.onCancelDispatch}
        onMarkCopy={props.onMarkCopy}
        onBreach={props.onBreach}
        onExtend={props.onExtend}
        onExported={props.onExported}
      />
      <DatabasePanel
        store={store}
        row={row}
        role={role}
        lang={lang}
        version={version}
        onApplyForRemoval={props.onApplyForRemoval}
        onRecordQuery={props.onRecordQuery}
        onAnswerQuery={props.onAnswerQuery}
      />
      <CaseCard store={store} row={row} lang={lang} t={t} version={version} onOpenCase={onOpenCase} />
    </div>
  ) : (
    <ProgressBar label={c.region(id, name)} isIndeterminate />
  );
  const assistant = (
    <aside className="case__assistant" aria-labelledby="assistant-heading">
      {wide ? (
        <div className="case__assistant-head">
          <h3 id="assistant-heading">{agentStrings[lang].title}</h3>
          <p className="muted">{agentStrings[lang].subtitle}</p>
        </div>
      ) : (
        // The tab names it on a narrower screen; the heading stays in the
        // outline.
        <VisuallyHidden>
          <h3 id="assistant-heading">{agentStrings[lang].title}</h3>
        </VisuallyHidden>
      )}
      {session ? (
        <AgentPanel
          key={row}
          lang={lang}
          session={session}
          facts={caseFacts(store, row)}
          service={service}
          toasts={toasts}
          shortcuts={shortcuts}
          helpOpen={helpOpen}
          onHelpOpenChange={setHelpOpen}
          visible={wide || tab === "assistant"}
          stage={stage}
          handover={({ draft, confirmed, startedAt }) => (
            <Handover
              store={store}
              row={row}
              files={files}
              lang={lang}
              t={t}
              run={startedAt}
              draft={draft}
              operator={operator}
              confirmed={confirmed}
              onRecord={() => draft && onHandover(draft, startedAt)}
            />
          )}
          handoverFinal={(startedAt) => files.get(row)?.draft?.run === startedAt}
        />
      ) : (
        <ProgressBar label={agentStrings[lang].service.starting} isIndeterminate />
      )}
    </aside>
  );

  return (
    <section className="case" aria-labelledby="case-heading">
      <DetailHeader
        // A case opened from the card (a linked one) takes the focus too.
        key={row}
        title={c.region(id, name)}
        titleId="case-heading"
        focusOnOpen
        back={{ onBack, focusAfter: backFocus, label: c.back, shortcut: breakpoint === "narrow" ? undefined : { key: "q" } }}
        status={{ tone: stageTone(stage) ?? "neutral", label: labels.stage[stage] }}
        meta={
          <>
            <Tag size="small">{labels.stream[store.stream[row] ?? 0]}</Tag>
            {ready && stage === Stage.Drafting && wasReturned(store, row) && (
              <Tag size="small" tone="warning">
                {workflowStrings[lang].returned}
              </Tag>
            )}
            {!isAnswered(store, row) && <Countdown left={workingDaysLeft(store, row)} unit="workingDays" warnAt={DUE_SOON} />}
          </>
        }
        actions={
          breakpoint !== "narrow" && (
            // A phone has no keys to list; "?" still opens the list.
            <Button variant="ghost" onPress={() => setHelpOpen(true)} shortcut={{ key: "?" }}>
              {c.shortcuts}
            </Button>
          )
        }
      />
      {wide ? (
        <div className="case__body">
          {card}
          {assistant}
        </div>
      ) : (
        <Tabs
          label={c.panels}
          selected={tab}
          onChange={(id) => setTab(id === "assistant" ? "assistant" : "card")}
          keepMounted
          items={[
            { id: "card", label: c.card, content: card },
            { id: "assistant", label: agentStrings[lang].title, content: assistant },
          ]}
        />
      )}
    </section>
  );
}
