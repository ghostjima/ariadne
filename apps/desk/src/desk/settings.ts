// What the page reads from its address and from storage: the shared view,
// the role, demo switches, and the saved views.
import { parseView, parseViews, serializeViews, type Role, type View } from "@ariadne/grid";

export const VIEWS_KEY = "argus-desk.views";

export type UrlConfig = {
  view: View | null;
  role: Role;
  /** Chunk indices that fail once, to show the error state. */
  failChunks: number[];
  /** No worker: generation and queries on the main thread. */
  useWorker: boolean;
  /** Mean seconds between a colleague's edits; null switches them off. */
  colleagueSeconds: number | null;
};

export function readUrlConfig(search: string = location.search): UrlConfig {
  const params = new URLSearchParams(search);
  const fail = params.get("failChunk");
  const colleague = params.get("colleague");
  const seconds = colleague === null ? 40 : Number(colleague);
  return {
    view: parseView(params.get("view")),
    role: params.get("role") === "operator" ? "operator" : "manager",
    failChunks: fail
      ? fail
          .split(",")
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 0)
      : [],
    useWorker: params.get("worker") !== "off",
    colleagueSeconds: colleague === "off" || !Number.isFinite(seconds) || seconds <= 0 ? null : seconds,
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
