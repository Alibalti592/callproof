/**
 * CallProof grading engine. Pure functions, no I/O.
 *
 * Rules (also printed on every public proof page):
 *  - Only 1-minute candles that start at or after the call's server timestamp count.
 *  - Market calls fill at the open of the first such candle. Limit calls fill when
 *    price trades through the entry.
 *  - Results are in R: 1R = distance between the fill and the stop in force at the
 *    fill. Moving the stop later never changes what 1R means.
 *  - Position is split equally across targets. A stop closes whatever is left.
 *  - If one candle touches both the stop and a target, the stop is assumed first.
 *  - In the candle where a limit entry fills, only the stop is checked.
 *  - Stop gaps fill at the worse of stop and open.
 */

export type Side = "long" | "short";
export type EntryType = "market" | "limit";

export interface Candle {
  /** Candle start, ms since epoch. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface CallSpec {
  side: Side;
  entryType: EntryType;
  /** Limit price. Null for market calls. */
  entry: number | null;
  stop: number;
  targets: number[];
  /** Server timestamp of the call, ms. */
  createdAt: number;
  /** A call that has not filled after this long expires. */
  fillExpiryMs: number;
  /** A filled call still open after this long is closed at market. */
  maxOpenMs: number;
}

export type CallEvent = { at: number } & (
  | { type: "edit_stop"; stop: number }
  | { type: "edit_targets"; targets: number[] }
  | { type: "close" }
);

export type Outcome =
  | "targets"
  | "stopped"
  | "manual"
  | "timed_out"
  | "expired_unfilled"
  | "cancelled";

export interface Hit {
  index: number;
  price: number;
  at: number;
  r: number;
}

export interface GradeState {
  status: "pending" | "open" | "closed";
  outcome: Outcome | null;
  fillPrice: number | null;
  filledAt: number | null;
  /** Price distance that equals 1R. Fixed at the fill. */
  risk: number | null;
  stop: number;
  targets: number[];
  hits: Hit[];
  /** Fraction of the position still open. */
  remaining: number;
  realizedR: number;
  closedAt: number | null;
  exitPrice: number | null;
  lastCandleT: number | null;
  eventsApplied: number;
  /** Which side of the limit entry price started on: -1 below, 1 above, 0 at. */
  entrySide: -1 | 0 | 1 | null;
  closeRequested: boolean;
}

export const MINUTE = 60_000;
export const ceilMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE;
export const floorMinute = (ms: number) => Math.floor(ms / MINUTE) * MINUTE;

export function initialState(spec: CallSpec): GradeState {
  return {
    status: "pending",
    outcome: null,
    fillPrice: null,
    filledAt: null,
    risk: null,
    stop: spec.stop,
    targets: [...spec.targets],
    hits: [],
    remaining: 1,
    realizedR: 0,
    closedAt: null,
    exitPrice: null,
    lastCandleT: null,
    eventsApplied: 0,
    entrySide: null,
    closeRequested: false,
  };
}

/**
 * Fold candles into a call's state. Pass the previous state to grade
 * incrementally; candles at or before `prev.lastCandleT` are skipped.
 * `events` must be the call's full event list every time.
 */
export function grade(
  spec: CallSpec,
  events: CallEvent[],
  candles: Candle[],
  prev?: GradeState | null,
): GradeState {
  const s: GradeState = prev ? structuredClone(prev) : initialState(spec);
  const evs = [...events].sort((a, b) => a.at - b.at);
  const start = ceilMinute(spec.createdAt);
  for (const c of candles) {
    if (s.status === "closed") break;
    if (c.t < start) continue;
    if (s.lastCandleT !== null && c.t <= s.lastCandleT) continue;
    applyEvents(spec, s, evs, c.t);
    stepCandle(spec, s, c);
    s.lastCandleT = c.t;
  }
  s.realizedR = round(s.realizedR);
  return s;
}

function applyEvents(spec: CallSpec, s: GradeState, evs: CallEvent[], t: number) {
  while (s.eventsApplied < evs.length && evs[s.eventsApplied].at <= t) {
    const e = evs[s.eventsApplied];
    if (e.type === "edit_stop") {
      s.stop = e.stop;
    } else if (e.type === "edit_targets") {
      if (e.targets.length === spec.targets.length) {
        const hit = new Set(s.hits.map((h) => h.index));
        e.targets.forEach((p, i) => {
          if (!hit.has(i)) s.targets[i] = p;
        });
      }
    } else {
      s.closeRequested = true;
    }
    s.eventsApplied++;
  }
}

function stepCandle(spec: CallSpec, s: GradeState, c: Candle) {
  const dir = spec.side === "long" ? 1 : -1;

  if (s.status === "pending") {
    if (s.closeRequested) return finish(s, "cancelled", c.t, null);
    if (c.t >= spec.createdAt + spec.fillExpiryMs) {
      return finish(s, "expired_unfilled", c.t, null);
    }

    let fillPrice: number | null = null;
    let limitFill = false;
    if (spec.entryType === "market") {
      fillPrice = c.o;
    } else {
      const e = spec.entry as number;
      const sideNow = Math.sign(c.o - e) as -1 | 0 | 1;
      if (s.entrySide === null) s.entrySide = sideNow;
      if (s.entrySide === 0 || sideNow === 0) fillPrice = e;
      else if (sideNow !== s.entrySide) fillPrice = c.o; // gapped through the entry
      else if (c.l <= e && e <= c.h) fillPrice = e;
      if (fillPrice === null) return;
      limitFill = true;
    }

    s.fillPrice = fillPrice;
    s.filledAt = c.t;
    s.status = "open";
    const risk = (fillPrice - s.stop) * dir;
    if (risk <= 0) {
      // Filled at or beyond the stop: a full loss by definition.
      s.risk = Math.abs(risk) || 1;
      s.realizedR = -1;
      s.remaining = 0;
      return finish(s, "stopped", c.t, fillPrice);
    }
    s.risk = risk;
    if (limitFill) {
      if (stopTouched(s, c, dir)) stopOut(s, c, dir);
      return;
    }
  }

  // Open position.
  if (s.closeRequested) return closeRemainder(s, c.o, dir, "manual", c.t);
  if (c.t >= (s.filledAt as number) + spec.maxOpenMs) {
    return closeRemainder(s, c.o, dir, "timed_out", c.t);
  }
  if (stopTouched(s, c, dir)) return stopOut(s, c, dir);

  const n = spec.targets.length;
  const hit = new Set(s.hits.map((h) => h.index));
  for (let i = 0; i < n; i++) {
    if (hit.has(i)) continue;
    const tp = s.targets[i];
    const reached = dir === 1 ? c.h >= tp : c.l <= tp;
    if (!reached) continue;
    const r = (((tp - (s.fillPrice as number)) * dir) / (s.risk as number)) / n;
    s.hits.push({ index: i, price: tp, at: c.t, r: round(r) });
    s.realizedR += r;
    s.remaining = (n - s.hits.length) / n;
    s.exitPrice = tp;
  }
  if (s.hits.length === n) finish(s, "targets", c.t, s.exitPrice);
}

function stopTouched(s: GradeState, c: Candle, dir: number) {
  return dir === 1 ? c.l <= s.stop : c.h >= s.stop;
}

function stopOut(s: GradeState, c: Candle, dir: number) {
  const px = dir === 1 ? Math.min(s.stop, c.o) : Math.max(s.stop, c.o);
  closeRemainder(s, px, dir, "stopped", c.t);
}

function closeRemainder(
  s: GradeState,
  px: number,
  dir: number,
  outcome: Outcome,
  t: number,
) {
  s.realizedR +=
    (((px - (s.fillPrice as number)) * dir) / (s.risk as number)) * s.remaining;
  s.remaining = 0;
  finish(s, outcome, t, px);
}

function finish(s: GradeState, outcome: Outcome, t: number, exit: number | null) {
  s.status = "closed";
  s.outcome = outcome;
  s.closedAt = t;
  s.exitPrice = exit;
}

function round(x: number) {
  return Math.round(x * 10_000) / 10_000;
}

/** Validate price levels for a new call. Returns an error message or null. */
export function validateLevels(
  side: Side,
  reference: number,
  stop: number,
  targets: number[],
): string | null {
  const dir = side === "long" ? 1 : -1;
  const nums = [reference, stop, ...targets];
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return "Prices must be positive numbers.";
  if (targets.length < 1 || targets.length > 3) return "Give one to three targets.";
  if ((reference - stop) * dir <= 0) {
    return side === "long" ? "For a long, the stop must be below the entry." : "For a short, the stop must be above the entry.";
  }
  if (Math.abs(reference - stop) / reference < 0.002) {
    return "The stop is closer than 0.2% to the entry. Stops that tight make R meaningless.";
  }
  let prev = reference;
  for (const tp of targets) {
    if ((tp - prev) * dir <= 0) {
      return side === "long"
        ? "For a long, targets must be above the entry and in ascending order."
        : "For a short, targets must be below the entry and in descending order.";
    }
    prev = tp;
  }
  return null;
}
