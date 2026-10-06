// One case, in one window: its card, and the assistant beside it. The
// header says which case, where it stands and how long is left; Back to
// the queue (Q) returns to the row it was opened from. On a wide screen the
// card and the assistant sit side by side; on a narrower one they are two
// tabs, so the assistant's Run is never a long scroll away.
import { useEffect, useRef, useState } from "react";
import { loadRules, rulesLoaded } from "@ariadne/rules";
import { Button, Countdown, ProgressBar, StatusBadge, Tabs, Tag, VisuallyHidden, useBreakpoint, type Shortcut, type ToastQueue } from "@ghostjima/stoa-react";
import { clientName, isAnswered, rowId, workingDaysLeft, type ColumnStore } from "@ariadne/grid";
import { AgentPanel } from "../agent/AgentPanel";
import { strings as agentStrings } from "../agent/i18n";
import { sessionFor, type RunService } from "../agent/service";
import { POOLS } from "../data/query";
import { DUE_SOON, stageTone } from "../desk/columns";
import type { Lang, Strings } from "../i18n";
import { CaseCard } from "./CaseCard";

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
};

export function CaseView({ store, row, lang, t, version, service, toasts, onBack, onOpenCase }: CaseViewProps) {
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
  const session = sessionFor(row, service.transport);

  // The case's heading takes the focus when the case opens, so the next
  // Tab starts in the case, never at the top of the page.
  useEffect(() => {
    heading.current?.focus({ preventScroll: false });
  }, [row]);

  const shortcuts: Shortcut[] = [{ key: "q", description: c.keys.back, group: c.keysGroup, onTrigger: onBack }];
  const card = ready ? (
    <CaseCard store={store} row={row} lang={lang} t={t} version={version} onOpenCase={onOpenCase} />
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
      <AgentPanel
        key={row}
        lang={lang}
        session={session}
        service={service}
        toasts={toasts}
        shortcuts={shortcuts}
        helpOpen={helpOpen}
        onHelpOpenChange={setHelpOpen}
        visible={wide || tab === "assistant"}
      />
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
