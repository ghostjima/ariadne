/*
  What the bench reads of the machine it runs on: the stamp of a run, the
  memory of ollama's processes, and whether the machine swapped. Everything
  here only reads: `git`, `ps`, `vm_stat`, `sysctl` and ollama's own status
  routes.

  The memory figures are macOS's as its tools print them. On another
  system the probes return null and the bench says the figure was not
  taken.
*/

import { execFile, execFileSync } from "node:child_process";
import os from "node:os";

export type BenchStamp = {
  /* The commit the bench ran on, and whether the tree had changes */
  commit: string;
  dirty: boolean;
  /* How the code was built */
  build: string;
  node: string;
  /* The machine: its processor, cores, memory and system */
  machine: string;
  /* The day and time the bench started, ISO 8601 */
  date: string;
};

const run = (file: string, args: readonly string[]): string | null => {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

export function benchStamp(now: Date = new Date()): BenchStamp {
  const commit = run("git", ["rev-parse", "--short=12", "HEAD"])?.trim() ?? "unknown";
  const dirty = (run("git", ["status", "--porcelain"]) ?? "").trim() !== "";
  const cpus = os.cpus();
  return {
    commit,
    dirty,
    build: "tsc -p tsconfig.build.json of each package (dist), unbundled",
    node: process.version,
    machine: `${cpus[0]?.model ?? "unknown"}, ${cpus.length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}`,
    date: now.toISOString(),
  };
}

/* The resident memory of every process of ollama (the server and the
   model runners it starts), summed, in megabytes, as ps reports it; null
   where ps cannot be read */
export function ollamaRssMb(): Promise<number | null> {
  return new Promise((resolve) => {
    execFile("ps", ["-axo", "rss=,command="], { encoding: "utf8", maxBuffer: 1 << 24 }, (error, stdout) => {
      if (error) return resolve(null);
      let kb = 0;
      for (const line of stdout.split("\n")) {
        const m = /^\s*(\d+)\s+(.*)$/.exec(line);
        if (m && /(^|\/)ollama(\s|$)|\/ollama\//i.test(m[2]!)) kb += Number(m[1]);
      }
      resolve(kb / 1024);
    });
  });
}

export type SwapReading = {
  /* Pages swapped out since boot (vm_stat) */
  swapouts: number | null;
  /* Swap in use, in megabytes (sysctl vm.swapusage) */
  usedMb: number | null;
  /* The kernel's memory pressure level: 1 normal, 2 warning, 4 critical */
  pressure: number | null;
};

export function swapReading(): SwapReading {
  const vm = run("vm_stat", []);
  const usage = run("sysctl", ["-n", "vm.swapusage"]);
  const level = run("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]);
  const swapouts = vm ? /Swapouts:\s+(\d+)/.exec(vm) : null;
  const used = usage ? /used = ([\d.]+)M/.exec(usage) : null;
  return {
    swapouts: swapouts ? Number(swapouts[1]) : null,
    usedMb: used ? Number(used[1]) : null,
    pressure: level && /^\d+$/.test(level.trim()) ? Number(level.trim()) : null,
  };
}

/* What a watch over a stretch of the bench saw */
export type MemoryWatch = {
  /* ollama_peak_rss_mb: the largest sum of the resident memory of
     ollama's processes among the samples, taken every `everyMs` */
  ollamaPeakRssMb: number | null;
  samples: number;
  everyMs: number;
  swapBefore: SwapReading;
  swapAfter: SwapReading;
  /* Pages swapped out while watching, by the whole machine */
  swapoutsGrew: number | null;
  /* The highest memory pressure level sampled */
  pressureMax: number | null;
};

/* Samples ollama's memory and the machine's pressure until stopped */
export function watchMemory(everyMs = 500): { stop: () => Promise<MemoryWatch>; peek: () => { swapoutsGrew: number | null; pressureMax: number | null } } {
  const swapBefore = swapReading();
  let peak: number | null = null;
  let pressureMax = swapBefore.pressure;
  let samples = 0;
  let pending: Promise<void> = Promise.resolve();
  const sample = () => {
    pending = ollamaRssMb().then((mb) => {
      samples += 1;
      if (mb !== null && (peak === null || mb > peak)) peak = mb;
      const level = swapReading().pressure;
      if (level !== null && (pressureMax === null || level > pressureMax)) pressureMax = level;
    });
  };
  sample();
  const timer = setInterval(sample, everyMs);
  const grew = () => {
    const now = swapReading().swapouts;
    return now === null || swapBefore.swapouts === null ? null : now - swapBefore.swapouts;
  };
  return {
    peek: () => ({ swapoutsGrew: grew(), pressureMax }),
    stop: async () => {
      clearInterval(timer);
      await pending;
      const swapAfter = swapReading();
      return {
        ollamaPeakRssMb: peak,
        samples,
        everyMs,
        swapBefore,
        swapAfter,
        swapoutsGrew: swapAfter.swapouts === null || swapBefore.swapouts === null ? null : swapAfter.swapouts - swapBefore.swapouts,
        pressureMax,
      };
    },
  };
}

/* The models ollama has loaded now (GET /api/ps), with the size it gives */
export async function loadedModels(baseUrl: string): Promise<{ name: string; sizeMb: number; vramMb: number }[] | null> {
  try {
    const response = await fetch(`${baseUrl}/api/ps`);
    const body = (await response.json()) as { models?: { name?: string; size?: number; size_vram?: number }[] };
    return (body.models ?? []).map((m) => ({ name: m.name ?? "", sizeMb: (m.size ?? 0) / 2 ** 20, vramMb: (m.size_vram ?? 0) / 2 ** 20 }));
  } catch {
    return null;
  }
}

/* Tells ollama the bench is done with a model, so it frees its memory
   before the next one loads (an empty request with keep_alive 0, the
   API's way to say so). Other models are left alone. */
export async function releaseModel(baseUrl: string, model: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/generate`, { method: "POST", body: JSON.stringify({ model, keep_alive: 0 }) });
  } catch {
    /* Nothing to free */
  }
}
