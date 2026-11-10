import { describe, expect, it } from "vitest";
import { type CallEvent, type CallSpec, type Candle, grade, MINUTE, validateLevels } from "../src/lib/grader";

const T0 = 1_800_000_000_000; // on a minute boundary
const HOUR = 60 * MINUTE;

const k = (i: number, o: number, h: number, l: number, c: number): Candle => ({ t: T0 + i * MINUTE, o, h, l, c });

const long = (over: Partial<CallSpec> = {}): CallSpec => ({
  side: "long",
  entryType: "market",
  entry: null,
  stop: 90,
  targets: [110, 120],
  createdAt: T0,
  fillExpiryMs: 72 * HOUR,
  maxOpenMs: 30 * 24 * HOUR,
  ...over,
});

describe("market entries", () => {
  it("fills at the open of the first candle and hits all targets", () => {
    const s = grade(long(), [], [k(0, 100, 105, 99, 104), k(1, 104, 111, 103, 110), k(2, 110, 121, 109, 120)]);
    expect(s.fillPrice).toBe(100);
    expect(s.outcome).toBe("targets");
    expect(s.realizedR).toBe(1.5); // (1R + 2R) / 2
    expect(s.hits.map((h) => h.r)).toEqual([0.5, 1]);
  });

  it("ignores candles that started before the call was posted", () => {
    const s = grade(long({ createdAt: T0 + 30_000 }), [], [k(0, 100, 130, 80, 100), k(1, 100, 101, 99, 100)]);
    expect(s.filledAt).toBe(T0 + MINUTE);
    expect(s.status).toBe("open");
  });

  it("stops out for -1R", () => {
    const s = grade(long(), [], [k(0, 100, 101, 99, 100), k(1, 100, 100, 89, 90)]);
    expect(s.outcome).toBe("stopped");
    expect(s.realizedR).toBe(-1);
  });

  it("assumes the stop first when one candle touches stop and target", () => {
    const s = grade(long(), [], [k(0, 100, 101, 99, 100), k(1, 100, 125, 85, 110)]);
    expect(s.outcome).toBe("stopped");
    expect(s.realizedR).toBe(-1);
    expect(s.hits).toHaveLength(0);
  });

  it("books a partial target then stops the remainder", () => {
    const s = grade(long(), [], [k(0, 100, 111, 99, 108), k(1, 108, 109, 88, 90)]);
    expect(s.outcome).toBe("stopped");
    expect(s.realizedR).toBe(0); // +0.5R then -0.5R
    expect(s.hits).toHaveLength(1);
  });

  it("fills a gap through the stop at the worse price", () => {
    const s = grade(long(), [], [k(0, 100, 101, 99, 100), k(1, 80, 82, 78, 81)]);
    expect(s.exitPrice).toBe(80);
    expect(s.realizedR).toBe(-2);
  });

  it("grades shorts symmetrically", () => {
    const spec = long({ side: "short", stop: 110, targets: [90, 80] });
    const s = grade(spec, [], [k(0, 100, 101, 95, 96), k(1, 96, 97, 79, 80)]);
    expect(s.outcome).toBe("targets");
    expect(s.realizedR).toBe(1.5);
  });
});

describe("limit entries", () => {
  const spec = long({ entryType: "limit", entry: 95, stop: 90, targets: [105] });

  it("stays pending until price trades through the entry", () => {
    const s = grade(spec, [], [k(0, 100, 101, 97, 98)]);
    expect(s.status).toBe("pending");
  });

  it("fills at the entry and does not credit a target in the fill candle", () => {
    const s = grade(spec, [], [k(0, 100, 101, 97, 98), k(1, 98, 106, 94, 105)]);
    expect(s.fillPrice).toBe(95);
    expect(s.status).toBe("open");
    expect(s.hits).toHaveLength(0);
  });

  it("stops out in the fill candle when the stop is also touched", () => {
    const s = grade(spec, [], [k(0, 100, 101, 97, 98), k(1, 98, 99, 89, 92)]);
    expect(s.outcome).toBe("stopped");
    expect(s.realizedR).toBe(-1);
  });

  it("expires unfilled without a result", () => {
    const s = grade(long({ entryType: "limit", entry: 95, fillExpiryMs: 2 * MINUTE }), [], [
      k(0, 100, 101, 97, 98),
      k(1, 98, 99, 97, 98),
      k(2, 98, 99, 97, 98),
    ]);
    expect(s.outcome).toBe("expired_unfilled");
    expect(s.realizedR).toBe(0);
  });

  it("fills at the open when price gaps through the entry", () => {
    const s = grade(spec, [], [k(0, 100, 101, 97, 98), k(1, 93, 94, 92, 93)]);
    expect(s.fillPrice).toBe(93);
    expect(s.risk).toBe(3);
  });
});

describe("edits and closes", () => {
  it("keeps 1R fixed when the stop is widened, so the loss exceeds -1R", () => {
    const ev: CallEvent[] = [{ type: "edit_stop", stop: 80, at: T0 + 30_000 }];
    const s = grade(long(), ev, [k(0, 100, 101, 99, 100), k(1, 100, 100, 85, 86), k(2, 86, 87, 79, 80)]);
    expect(s.outcome).toBe("stopped");
    expect(s.realizedR).toBe(-2);
  });

  it("locks in profit when the stop is moved to breakeven after a target", () => {
    const ev: CallEvent[] = [{ type: "edit_stop", stop: 100, at: T0 + 90_000 }];
    const s = grade(long(), ev, [k(0, 100, 111, 99, 110), k(1, 110, 112, 108, 109), k(2, 109, 109, 99, 100)]);
    expect(s.realizedR).toBe(0.5);
  });

  it("applies an edit only to candles that start after it", () => {
    const ev: CallEvent[] = [{ type: "edit_stop", stop: 80, at: T0 + MINUTE + 1 }];
    const s = grade(long(), ev, [k(0, 100, 101, 99, 100), k(1, 100, 100, 89, 90)]);
    expect(s.outcome).toBe("stopped"); // the candle in progress still used the old stop
    expect(s.realizedR).toBe(-1);
  });

  it("closes manually at the next candle open", () => {
    const ev: CallEvent[] = [{ type: "close", at: T0 + 90_000 }];
    const s = grade(long(), ev, [k(0, 100, 101, 99, 100), k(1, 100, 106, 99, 105), k(2, 105, 106, 104, 105)]);
    expect(s.outcome).toBe("manual");
    expect(s.exitPrice).toBe(105);
    expect(s.realizedR).toBe(0.5);
  });

  it("cancels a pending limit call with no result", () => {
    const spec = long({ entryType: "limit", entry: 95 });
    const s = grade(spec, [{ type: "close", at: T0 + 1 }], [k(0, 100, 101, 97, 98), k(1, 98, 99, 97, 98)]);
    expect(s.outcome).toBe("cancelled");
  });

  it("times out an open call at market", () => {
    const s = grade(long({ maxOpenMs: 2 * MINUTE }), [], [k(0, 100, 101, 99, 100), k(1, 100, 104, 99, 103), k(2, 104, 105, 103, 104)]);
    expect(s.outcome).toBe("timed_out");
    expect(s.realizedR).toBe(0.4);
  });
});

describe("incremental grading", () => {
  it("gives the same result in one pass or in several", () => {
    const candles = [k(0, 100, 101, 99, 100), k(1, 100, 111, 99, 110), k(2, 110, 112, 108, 109), k(3, 109, 121, 108, 120)];
    const ev: CallEvent[] = [{ type: "edit_stop", stop: 95, at: T0 + 2 * MINUTE }];
    const once = grade(long(), ev, candles);
    const a = grade(long(), [], candles.slice(0, 2));
    const b = grade(long(), ev, candles.slice(0, 3), a); // overlap is skipped
    const c = grade(long(), ev, candles, b);
    expect(c).toEqual(once);
  });
});

describe("validateLevels", () => {
  it("accepts a sound long and rejects bad ones", () => {
    expect(validateLevels("long", 100, 95, [105, 110])).toBeNull();
    expect(validateLevels("long", 100, 101, [105])).toMatch(/stop/);
    expect(validateLevels("long", 100, 95, [110, 105])).toMatch(/ascending/);
    expect(validateLevels("short", 100, 105, [95, 90])).toBeNull();
    expect(validateLevels("long", 100, 99.9, [105])).toMatch(/0.2%/);
  });
});
