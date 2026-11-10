import { type Candle, ceilMinute, floorMinute, grade, MINUTE } from "./grader";
import { fetchCandles } from "./prices";
import { activeCalls, saveGrade, toGraderEvents, toSpec } from "./repo";

export interface GradeRun {
  checked: number;
  updated: number;
  closed: number;
  errors: { callId: string; message: string }[];
  ms: number;
}

const g = globalThis as unknown as { __callproofGrading?: boolean };

/** Grade every call that is still pending or open against new candles. */
export async function runGrading(): Promise<GradeRun> {
  const started = Date.now();
  const run: GradeRun = { checked: 0, updated: 0, closed: 0, errors: [], ms: 0 };
  if (g.__callproofGrading) return run; // a run is already in progress
  g.__callproofGrading = true;
  try {
    const calls = await activeCalls();
    const to = floorMinute(Date.now()) - MINUTE; // last finished candle
    const cache = new Map<string, { from: number; candles: Candle[] }>();

    // One download per symbol, from the earliest candle any of its calls needs.
    const need = new Map<string, number>();
    for (const c of calls) {
      const from = c.lastCandleT !== null ? c.lastCandleT + MINUTE : ceilMinute(c.createdMs);
      need.set(c.symbol, Math.min(need.get(c.symbol) ?? Infinity, from));
    }

    for (const c of calls) {
      run.checked++;
      try {
        const from = c.lastCandleT !== null ? c.lastCandleT + MINUTE : ceilMinute(c.createdMs);
        if (from > to) continue;
        let entry = cache.get(c.symbol);
        if (!entry) {
          const symFrom = need.get(c.symbol) as number;
          entry = { from: symFrom, candles: await fetchCandles(c.symbol, symFrom, to) };
          cache.set(c.symbol, entry);
        }
        const candles = entry.candles.filter((k) => k.t >= from);
        if (!candles.length) continue;
        const next = grade(toSpec(c), toGraderEvents(c), candles, c.state);
        await saveGrade(c.id, next);
        run.updated++;
        if (next.status === "closed") run.closed++;
      } catch (e) {
        run.errors.push({ callId: c.id, message: (e as Error).message });
      }
    }
  } finally {
    g.__callproofGrading = false;
    run.ms = Date.now() - started;
  }
  return run;
}
