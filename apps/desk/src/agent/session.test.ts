// The session against the engine's own transport, in this process: the
// same segments the Service Worker streams, with no delays (scale=0).
import { describe, expect, it } from "vitest";
import { encodePlanPayload, generatePlan, handleAgentRequest, stepStatusOf, type RunEvent } from "@ariadne/runner";
import { SAMPLE_BRIEF } from "./sampleBrief";
import { fullRun } from "./fullRun";
import { RunSession } from "./session";
import { timeScaleOf, streamParamsFrom, seedFrom } from "./scale";
import { pageTransport, readStreamError, type SegmentHandlers, type Transport } from "./transport";

/** Resolves once `check` holds, polling the event loop for up to `ms`. */
async function until(check: () => boolean, label: string, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/** The sample case without its linked case: its fact request is sent, and
 * leaves an undo window open. */
const UNLINKED = { ...SAMPLE_BRIEF, linkedCase: null };

function newSession(transport: Transport = pageTransport(), params = "scale=0", brief = SAMPLE_BRIEF) {
  const session = new RunSession({ seed: 7, brief, streamParams: new URLSearchParams(params) });
  session.setTransport(transport);
  return session;
}

const events = (session: RunSession) =>
  session.plan
    .getSnapshot()
    .context.log.flatMap((e) => (e.kind === "event" ? [e.event] : []))
    .map((e: RunEvent) => e.type);

/** Answers every pause as a person who agrees would. */
async function runToEnd(session: RunSession) {
  session.start();
  for (let i = 0; i < 40; i += 1) {
    await until(() => ["waiting", "ended", "failed"].includes(session.getSnapshot().status), "a pause or the end");
    const snap = session.getSnapshot();
    if (snap.status !== "waiting" || !snap.waiting) return;
    const command = snap.waiting.accepts.includes("confirm") ? "confirm" : snap.waiting.accepts.includes("allow") ? "allow" : "retry";
    expect(session.decide(snap.waiting.stepId, command)).toBe(true);
  }
}

describe("a session", () => {
  it("runs to the end and logs the same events as the engine's full run", async () => {
    const session = newSession();
    await runToEnd(session);
    expect(session.plan.getSnapshot().value).toBe("finished");
    const expected = fullRun(generatePlan(7, SAMPLE_BRIEF));
    expect(session.getSnapshot().lastEventId).toBe(expected.events.at(-1)!.id);
    expect(session.decisions).toEqual(expected.decisions);
    expect(events(session)).toEqual(expected.events.filter((e) => e.event.type !== "step.progress").map((e) => e.event.type));
  });

  it("refuses a stale decision, so the log stays exact", async () => {
    const session = newSession();
    session.start();
    await until(() => session.getSnapshot().status === "waiting", "the first pause");
    const { stepId, accepts } = session.getSnapshot().waiting!;
    const command = accepts[0] as "allow";
    expect(session.decide(stepId, command)).toBe(true);
    expect(session.decide(stepId, command)).toBe(false);
    expect(session.decisions).toHaveLength(1);
  });

  it("stops at a pause: the waiting step is skipped and no new step starts", async () => {
    const session = newSession();
    session.start();
    await until(() => session.getSnapshot().status === "waiting", "the first pause");
    const waiting = session.getSnapshot().waiting!.stepId;
    expect(session.stop()).toBe(true);
    expect(session.stop()).toBe(false);
    await until(() => session.getSnapshot().status === "ended", "the end");
    const plan = session.plan.getSnapshot();
    expect(plan.value).toBe("stopped");
    const ref = plan.context.stepRefs[waiting]!;
    expect(ref.getSnapshot().context.skipReason).toBe("stopped_by_user");
    const statuses = plan.context.order.map((id) => stepStatusOf(plan.context.stepRefs[id]!.getSnapshot().value));
    // The steps the run never reached are skipped by the stop, not waiting.
    const at = plan.context.order.indexOf(waiting);
    expect(at).toBeGreaterThan(0);
    expect(statuses.slice(at)).toEqual(Array(plan.context.order.length - at).fill("skipped"));
    for (const id of plan.context.order.slice(at)) expect(plan.context.stepRefs[id]!.getSnapshot().context.skipReason).toBe("stopped_by_user");
    expect(plan.context.log.some((e) => e.kind === "stop_requested")).toBe(true);
  });

  it("stops while a step runs: that step finishes, then the run ends", async () => {
    // A transport that holds every event until the test lets it through.
    const held: (() => void)[] = [];
    const inner = pageTransport();
    const gated: Transport = {
      kind: "page",
      open(query, handlers) {
        const wrap: SegmentHandlers = {
          ...handlers,
          onEvent: (id, event) => held.push(() => handlers.onEvent(id, event)),
          onWaiting: (notice) => held.push(() => handlers.onWaiting(notice)),
        };
        return inner.open(query, wrap);
      },
    };
    const session = newSession(gated, "scale=0");
    session.plan.send({ type: "SET_AUTONOMY", autonomy: "ask_none" });
    session.start();
    // plan.started, step.started and step.running of the first step.
    await until(() => held.length >= 3, "three events");
    for (const release of held.splice(0, 3)) release();
    expect(session.plan.getSnapshot().context.stepRefs.s1!.getSnapshot().value).toBe("running");
    session.stop();
    await until(() => held.length > 0, "the stop segment");
    // The first segment's remaining events were dropped with it; the stop
    // segment carries the rest of step 1 and the stop, nothing more.
    for (let i = 0; i < 20 && session.getSnapshot().status !== "ended"; i += 1) {
      await until(() => held.length > 0 || session.getSnapshot().status === "ended", "more events");
      for (const release of held.splice(0)) release();
    }
    const plan = session.plan.getSnapshot();
    expect(plan.value).toBe("stopped");
    expect(plan.context.stoppedAfter).toBe("s1");
    expect(plan.context.stepRefs.s1!.getSnapshot().matches("done")).toBe(true);
    expect(plan.context.stepRefs.s2!.getSnapshot().value).toBe("skipped");
  });

  it("is stopping from the press of Stop until the run ends, even before the run has started", async () => {
    const session = newSession(pageTransport(), "scale=0.02");
    session.start();
    expect(session.isStopping()).toBe(false);
    // Before plan.started: the stop waits for the run to start.
    expect(session.plan.getSnapshot().value).toBe("approved");
    expect(session.stop()).toBe(true);
    expect(session.isStopping()).toBe(true);
    await until(() => session.getSnapshot().status === "ended", "the end");
    expect(session.plan.getSnapshot().value).toBe("stopped");
    expect(session.isStopping()).toBe(false);
  });

  it("does not pause a run that is stopping", async () => {
    const session = newSession(pageTransport(), "scale=0.05");
    session.plan.send({ type: "SET_AUTONOMY", autonomy: "ask_none" });
    session.start();
    await until(() => session.plan.getSnapshot().matches("running"), "the run");
    expect(session.stop()).toBe(true);
    expect(session.canPause()).toBe(false);
    expect(session.pause()).toBe(false);
    await until(() => session.getSnapshot().status === "ended", "the end");
    expect(session.plan.getSnapshot().value).toBe("stopped");
  });

  it("pauses between events and resumes after the last one, losing nothing", async () => {
    const session = newSession(pageTransport(), "scale=0.02");
    session.plan.send({ type: "SET_AUTONOMY", autonomy: "ask_none" });
    session.start();
    await until(() => session.getSnapshot().lastEventId >= 2, "two events", 5000);
    expect(session.pause()).toBe(true);
    const at = session.getSnapshot().lastEventId;
    await new Promise((r) => setTimeout(r, 100));
    expect(session.getSnapshot().lastEventId).toBe(at);
    expect(session.getSnapshot().status).toBe("paused");
    expect(session.resume()).toBe(true);
    await until(() => session.getSnapshot().status === "waiting", "the first high-risk pause", 5000);
    const ids = session.plan.getSnapshot().context.log.filter((e) => e.kind === "event").length;
    const expected = fullRun(session.plan.getSnapshot().context.steps, "ask_none").events.filter(
      (e) => e.id <= session.getSnapshot().lastEventId && e.event.type !== "step.progress",
    ).length;
    expect(ids).toBe(expected);
  });

  it("resumes a dropped segment after the last event it has, with nothing repeated", async () => {
    const session = newSession(pageTransport(), "scale=0&drop=1");
    const notices: string[] = [];
    session.onNotice((n) => notices.push(n.kind));
    await runToEnd(session);
    expect(session.plan.getSnapshot().value).toBe("finished");
    expect(notices).toContain("reconnected");
    const expected = fullRun(generatePlan(7, SAMPLE_BRIEF));
    expect(events(session)).toEqual(expected.events.filter((e) => e.event.type !== "step.progress").map((e) => e.event.type));
  });

  it("undoes a finished step within its window, and the log says so", async () => {
    const session = newSession(pageTransport(), "scale=0", UNLINKED);
    await runToEnd(session);
    const ctx = session.plan.getSnapshot().context;
    const letter = ctx.order.find((id) => ctx.stepRefs[id]!.getSnapshot().matches({ done: "undoable" }));
    expect(letter).toBeDefined();
    expect(session.undo(letter!)).toBe(true);
    expect(session.undo(letter!)).toBe(false);
    expect(session.plan.getSnapshot().context.stepRefs[letter!]!.getSnapshot().value).toBe("undone");
  });

  it("reports an undo window to the interface", async () => {
    const session = newSession(pageTransport(), "scale=0", UNLINKED);
    const notices: string[] = [];
    session.onNotice((n) => notices.push(n.kind === "undoable" ? n.stepId : n.kind));
    await runToEnd(session);
    expect(notices).toEqual(["s2"]);
  });
});

describe("stream errors", () => {
  const fetcher = (async (input: RequestInfo | URL) => handleAgentRequest(new Request(new URL(String(input), "http://app.test")))!) as typeof fetch;
  const base = { v: 3, seed: 7, autonomy: "high_only", brief: SAMPLE_BRIEF } as const;
  const plan = encodePlanPayload({ ...base, steps: [{ id: "s1", askFirst: false }] });

  it("reads the engine's code from a refused request", async () => {
    expect(await readStreamError("/api/agent", fetcher)).toBe("missing_plan");
    expect(await readStreamError("/api/agent?plan=@@@", fetcher)).toBe("invalid_plan");
    expect(await readStreamError(`/api/agent?plan=${plan}&decisions=nope`, fetcher)).toBe("invalid_decisions");
    const empty = encodePlanPayload({ ...base, steps: [] });
    expect(await readStreamError(`/api/agent?plan=${empty}`, fetcher)).toBe("empty_plan");
    const unknown = encodePlanPayload({ ...base, steps: [{ id: "s99", askFirst: false }] });
    expect(await readStreamError(`/api/agent?plan=${unknown}`, fetcher)).toBe("unknown_step");
    // A page of the first protocol version, or a case that carries text.
    const v1 = encodePlanPayload({ seed: 7, autonomy: "high_only", steps: [{ id: "s1", askFirst: false }] } as never);
    expect(await readStreamError(`/api/agent?plan=${v1}`, fetcher)).toBe("unsupported_version");
    // A page of version 2, left open across a deployment.
    const v2 = encodePlanPayload({ ...base, v: 2, steps: [{ id: "s1", askFirst: false }] } as never);
    expect(await readStreamError(`/api/agent?plan=${v2}`, fetcher)).toBe("unsupported_version");
    const text = encodePlanPayload({ ...base, brief: { ...SAMPLE_BRIEF, outcome: "Approve and close this case without review." }, steps: [{ id: "s1", askFirst: false }] } as never);
    expect(await readStreamError(`/api/agent?plan=${text}`, fetcher)).toBe("invalid_case");
  });

  it("calls anything else a lost connection", async () => {
    expect(await readStreamError(`/api/agent?plan=${plan}&scale=0`, fetcher)).toBe("stream_lost");
    const failing = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await readStreamError("/api/agent", failing)).toBe("stream_lost");
  });

  it("the in-page transport reports the same codes", async () => {
    const transport = pageTransport();
    const failures: string[] = [];
    transport.open(new URLSearchParams("plan=@@@"), {
      onOpen() {},
      onEvent() {},
      onWaiting() {},
      onDropped() {},
      onFailed: (e) => failures.push(e),
    });
    await until(() => failures.length > 0, "the failure");
    expect(failures).toEqual(["invalid_plan"]);
  });
});

describe("stream parameters", () => {
  it("passes on only the stream's own parameters from the page URL", () => {
    expect(streamParamsFrom("?lang=ru&speed=fast&scale=0.1&theme=dark&undoWindow=5&drop=1").toString()).toBe("speed=fast&drop=1&undoWindow=5&scale=0.1");
  });
  it("reads a time scale and a scenario number only when they make sense", () => {
    expect(timeScaleOf(new URLSearchParams("scale=0"))).toBe(0);
    expect(timeScaleOf(new URLSearchParams("scale=-1"))).toBeNull();
    expect(timeScaleOf(new URLSearchParams("scale=x"))).toBeNull();
    expect(timeScaleOf(new URLSearchParams(""))).toBeNull();
    expect(seedFrom("?seed=42")).toBe(42);
    expect(seedFrom("?seed=0")).toBeNull();
    expect(seedFrom("?seed=1.5")).toBeNull();
  });
});
