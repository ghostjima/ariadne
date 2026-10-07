// One case, in one window: the work on it (its stage, what the role may do
// now, its journal) and its card, and the assistant beside them. The
// header says which case, where it stands and how long is left; Back to
// the queue (Q) returns to the row it was opened from. On a wide screen the
// card and the assistant sit side by side; on a narrower one they are two
// tabs, so the assistant's Run is never a long scroll away.
import { useEffect, useRef, useState } from "react";
import { loadRules, rulesLoaded } from "@ariadne/rules";
import { Button, Countdown, ProgressBar, StatusBadge, Tabs, Tag, VisuallyHidden, useBreakpoint, useShortcuts, type Shortcut, type ToastQueue } from "@ghostjima/stoa-react";
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
  onOpenCase: (row: number) => void;
  role: Role;
  /** What the desk keeps with each case: the draft handed over. */
  files: CaseFiles;
  onTransition: (request: TransitionRequest) => WorkRefusal | null;
  onEditLetter: (text: string, current: string) => LetterError | null;
  onField: (field: "outcome" | "ground", value: number) => string | null;
  onSign: (record: DecisionRecord & { decision: Exclude<SignDecision, "defer"> }) => SignError | null;
  onDefer: (record: { concerns: string; wrong: string }) => SignError | null;
  /** Records the assistant's handover a person confirmed. */
  onHandover: (draft: ReplyDraft, run: number) => void;
};

export function CaseView(props: CaseViewProps) {
  const { store, row, lang, t, version, service, toasts, onBack, onOpenCase, role, files, onTransition, onHandover } = props;
  const ready = useRules();
  const breakpoint = useBreakpoint();
  const wide = breakpoint === "wide";
  const [tab, setTab] = useState<"card" | "assistant">(() => (new URLSearchParams(location.search).get("panel") === "assistant" ? "assistant" : "card"));
  const [helpOpen, setHelpOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { pools, labels } = POOLS[lang];
  const c = t.case;
  const id = rowId(row);
  const name = clientName(store.applicant[row] ?? 0, store.client[row] ?? 0, pools);
  const stage = store.stage[row] ?? 0;
  // The assistant is told the case's codes, dates and amounts, never its
  // text (brief.ts); the session is made once the rules have loaded.
  const session = ready ? sessionFor(row, caseBrief(store, row), service.transport) : null;

  // The case's heading takes the focus when the case opens, so the next
  // Tab starts in the case, never at the top of the page.
  useEffect(() => {
    heading.current?.focus({ preventScroll: false });
  }, [row]);

  const shortcuts: Shortcut[] = [{ key: "q", description: c.keys.back, group: c.keysGroup, onTrigger: onBack }];
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
        hidden={files.get(row)?.signature ? ["return"] : stage === Stage.AwaitingSignature ? ["send"] : []}
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
      <div className="case__bar">
        <Button variant="ghost" onPress={onBack} shortcut={breakpoint === "narrow" ? undefined : { key: "q" }}>
          {c.back}
        </Button>
        <h2 id="case-heading" ref={heading} tabIndex={-1} className="case__heading">
          {c.region(id, name)}
        </h2>
        <div className="case__status">
          <Tag size="small">{labels.stream[store.stream[row] ?? 0]}</Tag>
          <StatusBadge tone={stageTone(stage) ?? "neutral"}>{labels.stage[stage]}</StatusBadge>
          {ready && stage === Stage.Drafting && wasReturned(store, row) && (
            <Tag size="small" tone="warning">
              {workflowStrings[lang].returned}
            </Tag>
          )}
          {!isAnswered(store, row) && <Countdown left={workingDaysLeft(store, row)} unit="workingDays" warnAt={DUE_SOON} />}
        </div>
        {breakpoint !== "narrow" && (
          // A phone has no keys to list; "?" still opens the list.
          <Button variant="ghost" onPress={() => setHelpOpen(true)} shortcut={{ key: "?" }}>
            {c.shortcuts}
          </Button>
        )}
      </div>
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
