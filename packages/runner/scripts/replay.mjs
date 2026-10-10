/*
  Replays the run of a transcript without its model and prints the run's
  events, one JSON value a line (the id, then the event).

    pnpm build
    node scripts/replay.mjs transcript.json [--no-decisions]

  With --no-decisions the recorded decisions are left out: the run then
  stops at the first step that waits for a person. Timestamps are printed
  as 1000, so the output of a transcript is the same every time.
*/

import { readFileSync } from "node:fs";
import { readTranscript, replayTranscript } from "../dist/index.js";

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/replay.mjs transcript.json [--no-decisions]");
  process.exit(2);
}
const read = readTranscript(JSON.parse(readFileSync(file, "utf8")));
if (!read.ok) {
  console.error(read.error);
  process.exit(1);
}
const options = { now: () => 1000, ...(flag === "--no-decisions" ? { decisions: [] } : {}) };
for (const item of replayTranscript(read.transcript, options)) {
  if (item.kind === "event") console.log(JSON.stringify([item.id, item.event]));
  else if (item.kind === "pause") console.log(JSON.stringify(["waiting", { stepId: item.stepId, accepts: item.accepts, ...(item.proposal ? { proposal: item.proposal } : {}) }]));
}
