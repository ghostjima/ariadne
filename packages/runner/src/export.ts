/*
  Structured export of the session log plus the clock helpers a timeline
  needs. The export is data (JSON-ready), not text: the application writes it
  out in the reader's language. Clock strings contain digits and colons only.
*/

import { EXPORT_FORMAT, PROTOCOL_VERSION, type AgentKind, type Autonomy, type TaskCode } from "./codes.js";
import type { LogEntry } from "./machines/plan.machine.js";
import { taskOf, type CaseBrief } from "./scenario.js";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/* Local HH:MM:SS of a timestamp, used for log lines */
export function clockTime(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* Local HH:MM of a timestamp, used for the time a step becomes irreversible */
export function clockShort(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* Remaining time as m:ss, never negative */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export type LogHeader = {
  seed: number;
  autonomy: Autonomy;
  total: number;
  brief: CaseBrief;
  /* Who proposed what the steps say; the seeded script when left out */
  agent?: AgentKind;
};

export type ExportedEntry = LogEntry & { time: string };

export type SessionExport = {
  format: typeof EXPORT_FORMAT;
  /* The export's own version: 2 since the run is about one complaint */
  version: 2;
  /* The event protocol the entries were received in */
  protocol: number;
  task: { code: TaskCode; caseNo: number };
  /* The case as the run was given it: codes, numbers and dates */
  brief: CaseBrief;
  /* Who proposed what the steps say: the seeded script, or a model whose
     proposals the engine validated */
  agent: AgentKind;
  seed: number;
  autonomy: Autonomy;
  total: number;
  /* False while the plan has not been run: there are no entries yet */
  started: boolean;
  /* Every entry keeps its timestamp and gains its local clock time */
  entries: ExportedEntry[];
};

export function exportLog(entries: readonly LogEntry[], header: LogHeader): SessionExport {
  return {
    format: EXPORT_FORMAT,
    version: 2,
    protocol: PROTOCOL_VERSION,
    task: taskOf(header.brief),
    brief: header.brief,
    agent: header.agent ?? "scripted",
    seed: header.seed,
    autonomy: header.autonomy,
    total: header.total,
    started: entries.length > 0,
    entries: entries.map((e) => ({ ...e, time: clockTime(e.at) })),
  };
}
