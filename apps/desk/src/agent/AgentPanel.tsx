// The assistant beside the open case: its task, its plan before the run,
// the run as it happens (Stop always first), the confirmations it stops
// for, the log, and a summary at the end. The run streams from the desk's
// Service Worker (service.ts); the consent rule is the engine's. The
// panel's own keys (R runs, S stops, P pauses) work while it is shown.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSelector } from "@xstate/react";
import {
  AlertDialog,
  Button,
  Callout,
  LiveRegion,
  ProgressBar,
  ShortcutsDialog,
  groupShortcuts,
  keepFocusInPlace,
  useShortcuts,
  type Shortcut,
  type ToastQueue,
} from "@ghostjima/stoa-react";
import type { Autonomy, PlanStateValue } from "@ariadne/runner";
import { makeFmt } from "./format";
import { LOCALES, strings, type Lang } from "./i18n";
import { mark } from "./marks";
import type { RunService } from "./service";
import type { RunSession } from "./session";
import { summaryText, undoText, type Text } from "./text";
import { useRunSteps, useSession } from "./ui/hooks";
import { TaskPanel } from "./ui/TaskPanel";
import { PlanPanel } from "./ui/PlanPanel";
import { RunPanel } from "./ui/RunPanel";
import { Decisions } from "./ui/Decisions";
import { LogPanel, SummaryPanel } from "./ui/SidePanels";

function setSeedParam(seed: number) {
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(history.state, "", url);
}

export type AgentPanelProps = {
  lang: Lang;
  session: RunSession;
  service: RunService;
  toasts: ToastQueue;
  /** Keys of the view around the panel, listed with its own in the help. */
  shortcuts: Shortcut[];
  /** The help dialog is open; "?" and the view's Shortcuts button open it. */
  helpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  /** The panel is in view (not a tab behind the card): its run keys work. */
  visible: boolean;
};

export function AgentPanel({ lang, session, service, toasts, shortcuts, helpOpen, onHelpOpenChange, visible }: AgentPanelProps) {
  const t = strings[lang];
  const f = makeFmt(LOCALES[lang]);
  const x: Text = useMemo(() => ({ t, f }), [t, f]);
  const [askNewPlan, setAskNewPlan] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const stream = useSession(session);
  const planState = useSelector(session.plan, (s) => s.value as PlanStateValue);
  const ctx = useSelector(session.plan, (s) => s.context);
  const steps = useRunSteps(session.plan);
  const draft = planState === "draft";
  const ended = planState === "finished" || planState === "stopped";
  const status = service.state.status;

  const latestText = useRef(x);
  latestText.current = x;

  // A new worker took over the page: the stream moved to it.
  const takeovers = useRef(service.takeovers);
  useEffect(() => {
    if (service.takeovers === takeovers.current) return;
    takeovers.current = service.takeovers;
    toasts.add({ tone: "info", text: latestText.current.t.service.updated });
  }, [service.takeovers, toasts]);

  // Undo windows and reconnections, as toasts.
  const undoToasts = useRef(new Map<string, { key: string; timer: ReturnType<typeof setTimeout> }>());
  const closeUndoToast = useCallback(
    (stepId: string) => {
      const entry = undoToasts.current.get(stepId);
      if (!entry) return;
      clearTimeout(entry.timer);
      toasts.close(entry.key);
      undoToasts.current.delete(stepId);
    },
    [toasts],
  );
  const undo = useCallback(
    (stepId: string) => {
      const result = session.plan.getSnapshot().context.stepRefs[stepId]?.getSnapshot().context.result;
      closeUndoToast(stepId);
      if (session.undo(stepId) && result) toasts.add({ tone: "positive", text: latestText.current.t.toast.undone(undoText(latestText.current, result.undo)) });
    },
    [session, toasts, closeUndoToast],
  );
  useEffect(
    () =>
      session.onNotice((notice) => {
        const { t: words, f: format } = latestText.current;
        if (notice.kind === "reconnected") {
          toasts.add({ tone: "positive", text: words.toast.reconnected });
          return;
        }
        const result = session.plan.getSnapshot().context.stepRefs[notice.stepId]?.getSnapshot().context.result;
        if (!result) return;
        // One undo toast at a time, the newest window's: the older windows
        // keep their Undo and countdown in the step list.
        for (const stepId of [...undoToasts.current.keys()]) closeUndoToast(stepId);
        const left = notice.deadline - Date.now();
        const key = toasts.add({
          tone: "info",
          text: words.toast.undoable(summaryText(latestText.current, result.summary), format.time(notice.deadline)),
          action: { label: words.step.undo, onAction: () => undo(notice.stepId) },
          timeout: null,
        });
        // The toast's own timer pauses while it is hovered or focused; the
        // undo window does not, so the toast closes when the window does.
        const timer = setTimeout(() => closeUndoToast(notice.stepId), Math.max(0, left));
        undoToasts.current.set(notice.stepId, { key, timer });
      }),
    [session, toasts, undo, closeUndoToast],
  );
  // The panel goes (another case, the queue): its undo toasts go with it;
  // the windows stay in the run, and come back with the case.
  useEffect(
    () => () => {
      for (const stepId of [...undoToasts.current.keys()]) closeUndoToast(stepId);
    },
    [closeUndoToast],
  );

  // Marks for the measurements: the first event and the stop, once drawn.
  const firstEventMarked = useRef(false);
  useEffect(() => {
    if (stream.lastEventId === 0) firstEventMarked.current = false;
    else if (!firstEventMarked.current) {
      firstEventMarked.current = true;
      mark("first-event");
    }
  }, [stream.lastEventId]);
  useEffect(() => {
    if (planState === "stopped") mark("stopped");
  }, [planState]);

  // Announcements: the run's turns, not every event.
  const previous = useRef({ planState, stopRequested: ctx.stopRequested, status: stream.status });
  useEffect(() => {
    const before = previous.current;
    previous.current = { planState, stopRequested: ctx.stopRequested, status: stream.status };
    if (before.planState !== planState) {
      if (planState === "running") setAnnouncement(t.announce.started);
      if (planState === "stopped") setAnnouncement(t.announce.stopped);
      if (planState === "finished") {
        const done = steps.filter((s) => s.snapshot.matches("done")).length;
        setAnnouncement(t.announce.finished(f.int(done), f.int(steps.length)));
      }
      return;
    }
    if (!before.stopRequested && ctx.stopRequested) return setAnnouncement(t.announce.stopping);
    if (before.status !== stream.status) {
      if (stream.status === "paused") setAnnouncement(t.announce.paused);
      else if (before.status === "paused") setAnnouncement(t.announce.resumed);
      else if (stream.status === "reconnecting") setAnnouncement(t.announce.reconnecting);
    }
  }, [planState, ctx.stopRequested, stream.status, steps, t, f]);

  const canRun = draft && ctx.steps.length > 0 && (status === "ready" || status === "page");
  const canStop = session.canStop();
  const run = () => {
    if (canRun) session.start();
  };
  const stop = () => {
    session.stop();
  };
  const pauseOrResume = () => {
    if (stream.status === "paused") session.resume();
    else session.pause();
  };
  // Finished steps whose undo window is still open: a new plan would end
  // them, so New plan asks first. (A step with no window can always be
  // undone where it was done; it has nothing to lose here.)
  const openWindows = steps.filter((s) => s.snapshot.matches({ done: "undoable" })).length;
  const startNewPlan = () => {
    setAskNewPlan(false);
    for (const stepId of [...undoToasts.current.keys()]) closeUndoToast(stepId);
    session.reset();
  };
  const newPlan = () => {
    if (openWindows > 0) setAskNewPlan(true);
    else startNewPlan();
  };

  const help = useShortcuts([
    { key: "r", description: t.shortcuts.start, group: t.shortcuts.run, onTrigger: run, isDisabled: !visible || !canRun },
    { key: "s", description: t.shortcuts.stop, group: t.shortcuts.run, onTrigger: stop, isDisabled: !visible || !canStop },
    {
      key: "p",
      description: t.shortcuts.pauseResume,
      group: t.shortcuts.run,
      onTrigger: pauseOrResume,
      isDisabled: !visible || !(stream.status === "paused" || session.canPause()),
    },
    { key: "?", description: t.shortcuts.help, group: t.shortcuts.general, onTrigger: () => onHelpOpenChange(true) },
    ...shortcuts,
  ]);

  const serviceView =
    status === "starting" ? (
      <ProgressBar label={t.service.starting} isIndeterminate />
    ) : service.state.status === "failed" ? (
      <Callout
        tone="negative"
        role="alert"
        title={t.service.failedTitle}
        action={
          <div className="actions">
            <Button
              variant="primary"
              onPress={(e) => {
                keepFocusInPlace(e.target);
                service.retry();
              }}
            >
              {t.service.retry}
            </Button>
            <Button
              onPress={(e) => {
                // Run can be pressed now, and it is the next thing to do.
                const plan = e.target.closest(".plan");
                flushSync(() => service.usePage());
                plan?.querySelector<HTMLButtonElement>(".plan-bar button")?.focus();
              }}
            >
              {t.service.usePage}
            </Button>
          </div>
        }
      >
        {t.service.errors[service.state.error]}
      </Callout>
    ) : status === "page" ? (
      <Callout tone="info" role="none">
        {t.service.pageNote}
      </Callout>
    ) : null;

  const decisionOpen = stream.status === "waiting" && !ctx.stopRequested && stream.waiting !== null && !stream.waiting.accepts.includes("retry");

  return (
    <div className="agent" data-plan-state={planState} data-stream={stream.status}>
      <TaskPanel
        x={x}
        seed={ctx.seed}
        autonomy={ctx.autonomy}
        editable={draft}
        onSeed={(seed) => {
          setSeedParam(seed);
          session.plan.send({ type: "REGENERATE", seed });
        }}
        onAutonomy={(autonomy: Autonomy) => session.plan.send({ type: "SET_AUTONOMY", autonomy })}
      />
      <div className="agent__work">
        {draft ? (
          <PlanPanel
            x={x}
            steps={ctx.steps}
            autonomy={ctx.autonomy}
            service={serviceView}
            canRun={canRun}
            onRun={run}
            onRestore={() => session.plan.send({ type: "RESTORE" })}
            onRemove={(id) => session.plan.send({ type: "REMOVE_STEP", id })}
            onAskFirst={(id, askFirst) => session.plan.send({ type: "SET_ASK_FIRST", id, askFirst })}
            onReorder={(ids) => {
              // One REORDER per item out of place: the machine's own event.
              for (let to = 0; to < ids.length; to += 1) {
                const current = session.plan.getSnapshot().context.steps.map((s) => s.id);
                const from = current.indexOf(ids[to] ?? "");
                if (from >= 0 && from !== to) session.plan.send({ type: "REORDER", from, to });
              }
            }}
          />
        ) : (
          <RunPanel
            x={x}
            steps={steps}
            autonomy={ctx.autonomy}
            session={stream}
            stopRequested={session.isStopping()}
            ended={ended}
            canStop={canStop}
            canPause={session.canPause()}
            onStop={stop}
            onPause={() => session.pause()}
            onResume={() => session.resume()}
            onRetryStream={() => session.retry()}
            onNewPlan={newPlan}
            onDecide={(stepId, command) => session.decide(stepId, command)}
            onUndo={undo}
            notice={status === "page" ? serviceView : null}
          />
        )}
        <div className="agent__side">
          {ended && (
            <SummaryPanel
              x={x}
              steps={steps}
              log={ctx.log}
              stopped={planState === "stopped"}
              stoppedAfter={ctx.stoppedAfter}
              startedAt={ctx.startedAt}
              finishedAt={ctx.finishedAt}
              asked={ctx.askedStepIds.length}
              events={stream.lastEventId}
            />
          )}
          <LogPanel x={x} log={ctx.log} steps={steps} />
        </div>
      </div>
      {/* What the assistant is, said once, under its work. */}
      <p className="muted">{t.task.scripted}</p>
      <Decisions x={x} steps={steps} waiting={stream.waiting} open={decisionOpen} onDecide={(stepId, command) => session.decide(stepId, command)} />
      <AlertDialog
        isOpen={askNewPlan && ended}
        onOpenChange={setAskNewPlan}
        title={t.newPlanAsk.title}
        confirmLabel={t.newPlanAsk.confirm}
        cancelLabel={t.newPlanAsk.keep}
        tone="destructive"
        onConfirm={startNewPlan}
      >
        <p>{t.newPlanAsk.open({ n: openWindows, text: f.int(openWindows) })}</p>
        <p>{t.newPlanAsk.ends}</p>
      </AlertDialog>
      <ShortcutsDialog isOpen={helpOpen} onOpenChange={onHelpOpenChange} title={t.shortcuts.title} groups={groupShortcuts(help, t.shortcuts.other)} />
      <LiveRegion>{announcement}</LiveRegion>
    </div>
  );
}
