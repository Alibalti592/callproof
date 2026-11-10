import type { Outcome } from "./grader";

export interface GradedCall {
  outcome: Outcome | null;
  r: number | null;
  closedAt: number | null;
}

export interface Stats {
  /** Calls that filled and closed, so they have a result in R. */
  resolved: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** 0..1, or null when nothing has resolved. */
  winRate: number | null;
  totalR: number;
  /** Average R per resolved call (the expectancy). */
  avgR: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Largest peak-to-trough fall of cumulative R, as a positive number. */
  maxDrawdownR: number;
  longestLosingStreak: number;
  /** Calls that never filled (expired or cancelled). They carry no R. */
  unfilled: number;
  curve: { t: number; cum: number }[];
}

const NO_RESULT: Outcome[] = ["expired_unfilled", "cancelled"];

export function computeStats(calls: GradedCall[], sinceMs?: number): Stats {
  const closed = calls.filter(
    (c) => c.outcome !== null && c.closedAt !== null && (sinceMs === undefined || c.closedAt >= sinceMs),
  );
  const unfilled = closed.filter((c) => NO_RESULT.includes(c.outcome as Outcome)).length;
  const resolved = closed
    .filter((c) => !NO_RESULT.includes(c.outcome as Outcome) && c.r !== null)
    .sort((a, b) => (a.closedAt as number) - (b.closedAt as number));

  let total = 0;
  let peak = 0;
  let maxDd = 0;
  let streak = 0;
  let longest = 0;
  let wins = 0;
  let losses = 0;
  let winSum = 0;
  let lossSum = 0;
  const curve: { t: number; cum: number }[] = [];

  for (const c of resolved) {
    const r = c.r as number;
    total += r;
    if (r > 0) {
      wins++;
      winSum += r;
      streak = 0;
    } else if (r < 0) {
      losses++;
      lossSum += r;
      streak++;
      longest = Math.max(longest, streak);
    }
    peak = Math.max(peak, total);
    maxDd = Math.max(maxDd, peak - total);
    curve.push({ t: c.closedAt as number, cum: r4(total) });
  }

  const n = resolved.length;
  return {
    resolved: n,
    wins,
    losses,
    breakeven: n - wins - losses,
    winRate: n ? wins / n : null,
    totalR: r4(total),
    avgR: n ? r4(total / n) : null,
    avgWin: wins ? r4(winSum / wins) : null,
    avgLoss: losses ? r4(lossSum / losses) : null,
    maxDrawdownR: r4(maxDd),
    longestLosingStreak: longest,
    unfilled,
    curve,
  };
}

function r4(x: number) {
  return Math.round(x * 10_000) / 10_000;
}
