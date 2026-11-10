import { describe, expect, it } from "vitest";
import { computeStats, type GradedCall } from "../src/lib/stats";

const mk = (r: number | null, i: number, outcome: GradedCall["outcome"] = r === null ? "expired_unfilled" : r > 0 ? "targets" : "stopped"): GradedCall => ({
  r,
  outcome,
  closedAt: 1000 + i,
});

describe("computeStats", () => {
  // Hand-computed fixture: cumulative 2, 1, 0, -1, 0.5, 0.5, 3.5
  const calls = [mk(2, 0), mk(-1, 1), mk(-1, 2), mk(-1, 3), mk(1.5, 4), mk(0, 5, "manual"), mk(3, 6), mk(null, 7), { r: null, outcome: null, closedAt: null }];
  const s = computeStats(calls);

  it("counts results", () => {
    expect(s.resolved).toBe(7);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(3);
    expect(s.breakeven).toBe(1);
    expect(s.unfilled).toBe(1);
  });

  it("computes R figures", () => {
    expect(s.totalR).toBe(3.5);
    expect(s.avgR).toBe(0.5);
    expect(s.winRate).toBeCloseTo(3 / 7);
    expect(s.avgWin).toBeCloseTo(2.1667, 4);
    expect(s.avgLoss).toBe(-1);
  });

  it("measures drawdown and streaks", () => {
    expect(s.maxDrawdownR).toBe(3); // peak 2 -> trough -1
    expect(s.longestLosingStreak).toBe(3);
    expect(s.curve.at(-1)?.cum).toBe(3.5);
  });

  it("filters by window", () => {
    const w = computeStats(calls, 1004);
    expect(w.resolved).toBe(3);
    expect(w.totalR).toBe(4.5);
  });

  it("handles an empty record", () => {
    const e = computeStats([]);
    expect(e.winRate).toBeNull();
    expect(e.totalR).toBe(0);
  });
});
