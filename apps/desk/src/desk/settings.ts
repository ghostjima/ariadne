// What the page reads from its address and from storage: the shared view,
// the role, demo switches, and the saved views.
import { ROLES, parseView, parseViews, serializeViews, type Role, type View } from "@ariadne/grid";

export const VIEWS_KEY = "ariadne.views";

export type UrlConfig = {
  view: View | null;
  role: Role;
  /** The scale mode (?rows=50000): 50,000 rows instead of the register's
   * realistic size. */
  scale: boolean;
  /** The case to open (?case=C-000123), as written in the link. */
  caseId: string | null;
  /** Chunk indices that fail once, to show the error state. */
  failChunks: number[];
  /** No worker: generation and queries on the main thread. */
  useWorker: boolean;
  /** Mean seconds between a colleague's edits; null switches them off. */
  colleagueSeconds: number | null;
  /** Seconds a dispatched reply waits before it leaves (?sendDelay=). */
  sendDelaySeconds: number;
};

/** The send delay of a dispatch, by default: the window in which it can
 * be cancelled. A demo value, not a rule. */
export const SEND_DELAY_SECONDS = 30;

export function readUrlConfig(search: string = location.search): UrlConfig {
  const params = new URLSearchParams(search);
  const fail = params.get("failChunk");
  const colleague = params.get("colleague");
  const seconds = colleague === null ? 40 : Number(colleague);
  return {
    view: parseView(params.get("view")),
    role: ROLES.find((r) => r === params.get("role")) ?? "supervisor",
    scale: params.get("rows") === "50000",
    caseId: params.get("case"),
    failChunks: fail
      ? fail
          .split(",")
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 0)
      : [],
    useWorker: params.get("worker") !== "off",
    colleagueSeconds: colleague === "off" || !Number.isFinite(seconds) || seconds <= 0 ? null : seconds,
    sendDelaySeconds: sendDelay(params.get("sendDelay")),
  };
}

export function readSavedViews(): View[] {
  try {
    return parseViews(localStorage.getItem(VIEWS_KEY));
  } catch {
    // Storage can be blocked; the views then last as long as the page.
    return [];
  }
}

export function writeSavedViews(views: readonly View[]): void {
  try {
    localStorage.setItem(VIEWS_KEY, serializeViews(views));
  } catch {
    // Kept in memory for this page only.
  }
}

/** Sets or removes one URL parameter, keeping the others. */
export function setParam(name: string, value: string | null): void {
  const url = new URL(location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  history.replaceState(history.state, "", url);
}

function sendDelay(raw: string | null): number {
  const n = raw === null ? SEND_DELAY_SECONDS : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 600 ? n : SEND_DELAY_SECONDS;
}
