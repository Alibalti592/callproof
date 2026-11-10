import { type Candle, floorMinute, MINUTE } from "./grader";

/**
 * 1-minute candle sources. All are public endpoints that need no API key.
 *
 *   PRICE_SOURCE=bybit      Bybit USDT perpetuals (default), falls back to OKX
 *   PRICE_SOURCE=okx        OKX USDT swaps only
 *   PRICE_SOURCE=synthetic  Deterministic fake prices for local development
 *
 * Host the app in a region the exchange serves; check each exchange's API terms.
 */
export type PriceSource = "bybit" | "okx" | "synthetic";

export const SYMBOL_RE = /^[A-Z0-9]{2,15}USDT$/;

export function priceSource(): PriceSource {
  const s = (process.env.PRICE_SOURCE ?? "bybit").toLowerCase();
  return s === "okx" || s === "synthetic" ? s : "bybit";
}

/** Closed 1m candles with start time in [fromMs, toMs], oldest first. */
export async function fetchCandles(symbol: string, fromMs: number, toMs: number): Promise<Candle[]> {
  if (!SYMBOL_RE.test(symbol)) throw new Error(`Unsupported symbol ${symbol}`);
  if (toMs < fromMs) return [];
  const src = priceSource();
  if (src === "synthetic") return synthetic(symbol, fromMs, toMs);
  if (src === "okx") return okx(symbol, fromMs, toMs);
  try {
    return await bybit(symbol, fromMs, toMs);
  } catch (e) {
    console.warn(`[prices] Bybit failed for ${symbol}, trying OKX:`, (e as Error).message);
    return okx(symbol, fromMs, toMs);
  }
}

/** Close of the most recent finished minute, or null if the symbol has no data. */
export async function lastPrice(symbol: string): Promise<number | null> {
  const end = floorMinute(Date.now()) - MINUTE;
  const candles = await fetchCandles(symbol, end - 4 * MINUTE, end);
  return candles.length ? candles[candles.length - 1].c : null;
}

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

// https://bybit-exchange.github.io/docs/v5/market/kline — newest first, max 1000 per call.
async function bybit(symbol: string, fromMs: number, toMs: number): Promise<Candle[]> {
  const out: Candle[] = [];
  for (let start = fromMs; start <= toMs; start += 1000 * MINUTE) {
    const end = Math.min(start + 999 * MINUTE, toMs);
    const j = await getJson(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=1&start=${start}&end=${end}&limit=1000`,
    );
    if (j.retCode !== 0) throw new Error(`Bybit: ${j.retMsg}`);
    const rows: string[][] = j.result?.list ?? [];
    for (const r of rows.reverse()) out.push({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] });
  }
  return clean(out, fromMs, toMs);
}

// OKX history candles — newest first, 100 per call. `after`/`before` are exclusive.
async function okx(symbol: string, fromMs: number, toMs: number): Promise<Candle[]> {
  const inst = `${symbol.slice(0, -4)}-USDT-SWAP`;
  const out: Candle[] = [];
  for (let start = fromMs; start <= toMs; start += 100 * MINUTE) {
    const end = Math.min(start + 99 * MINUTE, toMs);
    const j = await getJson(
      `https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=1m&before=${start - 1}&after=${end + 1}&limit=100`,
    );
    if (j.code !== "0") throw new Error(`OKX: ${j.msg}`);
    const rows: string[][] = j.data ?? [];
    for (const r of rows.reverse()) out.push({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] });
  }
  return clean(out, fromMs, toMs);
}

/** Keep only finished candles inside the window, sorted and de-duplicated. */
function clean(candles: Candle[], fromMs: number, toMs: number): Candle[] {
  const lastClosed = floorMinute(Date.now()) - MINUTE;
  const seen = new Set<number>();
  return candles
    .filter((c) => c.t >= fromMs && c.t <= toMs && c.t <= lastClosed && Number.isFinite(c.o) && !seen.has(c.t) && seen.add(c.t))
    .sort((a, b) => a.t - b.t);
}

// ---- synthetic prices: for development and demos only ----------------------

function base(symbol: string) {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return symbol.startsWith("BTC") ? 65_000 : symbol.startsWith("ETH") ? 3_200 : 1 + (h % 400);
}

function noise(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function syntheticPrice(symbol: string, minute: number) {
  const b = base(symbol);
  const p = b.toString().length;
  return (
    b *
    (1 +
      0.09 * Math.sin(minute / 2900 + p) +
      0.035 * Math.sin(minute / 610 + 2 * p) +
      0.012 * Math.sin(minute / 97) +
      0.004 * Math.sin(minute / 11))
  );
}

function synthetic(symbol: string, fromMs: number, toMs: number): Candle[] {
  const out: Candle[] = [];
  const lastClosed = floorMinute(Date.now()) - MINUTE;
  for (let t = Math.ceil(fromMs / MINUTE) * MINUTE; t <= Math.min(toMs, lastClosed); t += MINUTE) {
    const i = t / MINUTE;
    const o = syntheticPrice(symbol, i);
    const c = syntheticPrice(symbol, i + 1);
    const wick = o * 0.0015;
    out.push({ t, o, c, h: Math.max(o, c) + wick * noise(i, 1), l: Math.min(o, c) - wick * noise(i, 2) });
  }
  return out;
}
