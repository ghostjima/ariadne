/*
  Days as whole numbers since 1970-01-01, and back to the `YYYY-MM-DD`
  strings ariadne-rules takes. Plain calendar arithmetic only: whether a
  day is a working day, and every legal count, comes from ariadne-rules.
*/

const DAY_MS = 86_400_000;

/* The day number of a `YYYY-MM-DD` string */
export function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`not a day: ${iso}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/* The `YYYY-MM-DD` string of a day number */
export function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/* Epoch milliseconds at the start of a day, UTC */
export function dayStartMs(day: number): number {
  return day * DAY_MS;
}

/* Epoch milliseconds of a minute of a day; the register keeps Moscow time
   (UTC+3, no daylight saving) */
export function moscowMs(day: number, minute: number): number {
  return day * DAY_MS + (minute - 180) * 60_000;
}
