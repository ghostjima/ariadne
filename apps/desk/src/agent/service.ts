// The run service of the desk's assistant: the Service Worker that streams
// a run, started once when the desk loads (a first visit has it take
// control before any case is opened), and the sessions, one per case, kept
// while the page lives so a case opened again finds its run where it was.
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SEED } from "@ariadne/runner";
import { seedFrom, streamParamsFrom } from "./scale";
import { RunSession } from "./session";
import { pageTransport, workerTransport, type Transport } from "./transport";
import { startWorker, watchWorker, type WorkerError } from "./worker";

const BASE = import.meta.env.BASE_URL;

export type ServiceState =
  | { status: "starting" }
  | { status: "ready" }
  | { status: "failed"; error: WorkerError }
  /** The person chose to run in this tab, without the worker. */
  | { status: "page" };

export type RunService = {
  state: ServiceState;
  /** Starts the worker again after it failed. */
  retry: () => void;
  /** Runs in this tab from now on. */
  usePage: () => void;
  /** The transport a session streams through, once there is one. */
  transport: Transport | null;
  /** Times a new worker took over the page. */
  takeovers: number;
};

export function useRunService(): RunService {
  const [state, setState] = useState<ServiceState>({ status: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [takeovers, setTakeovers] = useState(0);

  useEffect(() => {
    if (state.status !== "starting") return;
    let live = true;
    void startWorker(BASE)
      .catch((error: unknown): Awaited<ReturnType<typeof startWorker>> => ({ ok: false, error: "sw_registration_failed", detail: String(error) }))
      .then((result) => {
        if (!live) return;
        setState(result.ok ? { status: "ready" } : { status: "failed", error: result.error });
      });
    return () => {
      live = false;
    };
  }, [state.status, attempt]);

  // A new worker took over this page: open streams move to it.
  useEffect(() => {
    if (state.status !== "ready") return;
    return watchWorker(() => {
      for (const session of sessions.values()) session.workerChanged();
      setTakeovers((n) => n + 1);
    });
  }, [state.status]);

  const transport = state.status === "ready" ? workerTransport(`${BASE}api/agent`) : state.status === "page" ? pageTransport() : null;
  useEffect(() => {
    if (!transport) return;
    for (const session of sessions.values()) session.setTransport(transport);
  }, [transport?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    retry: useCallback(() => {
      setAttempt((a) => a + 1);
      setState({ status: "starting" });
    }, []),
    usePage: useCallback(() => setState({ status: "page" }), []),
    transport,
    takeovers,
  };
}

/** Every case's session, by row. */
const sessions = new Map<number, RunSession>();

/** The session of a case: made on first use, with the page's scenario
 * number and stream parameters, and the service's transport. */
export function sessionFor(row: number, transport: Transport | null): RunSession {
  let session = sessions.get(row);
  if (!session) {
    session = new RunSession({ seed: seedFrom(location.search) ?? DEFAULT_SEED, streamParams: streamParamsFrom(location.search) });
    sessions.set(row, session);
  }
  if (transport && session.getSnapshot().transport !== transport.kind) session.setTransport(transport);
  return session;
}
