/**
 * On start, the server logs one line checking its database, price feed and
 * settings, so a deploy can be confirmed from the host's logs.
 *
 * With CALLPROOF_INLINE_GRADER=1 the server also grades open calls once a
 * minute by itself. Use this on a single always-on host. On hosts that sleep
 * (such as a free Render service) keep it on, but also call /api/cron/grade
 * from a scheduler so grading continues while no one visits.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  setTimeout(() => {
    startupCheck().catch((e) => console.error("[startup-check] failed:", (e as Error).message));
  }, 2_000);

  if (process.env.CALLPROOF_INLINE_GRADER !== "1") return;
  const { runGrading } = await import("./lib/gradeJob");
  const tick = () =>
    runGrading()
      .then((r) => {
        if (r.errors.length) console.warn("[grader]", JSON.stringify(r.errors.slice(0, 3)));
      })
      .catch((e) => console.error("[grader]", e));
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000);
}

async function startupCheck() {
  const { getDb } = await import("./lib/db");
  const { lastPrice, priceSource } = await import("./lib/prices");
  const { authEnvironment, devAuth } = await import("./lib/auth");
  const out: Record<string, unknown> = {};
  try {
    const db = await getDb();
    const r = await db.query("select count(*)::int as calls from calls");
    out.db = `ok (${process.env.DATABASE_URL ? "postgres" : "embedded"}, ${r[0].calls} calls)`;
  } catch (e) {
    out.db = `FAILED: ${(e as Error).message}`;
  }
  try {
    const px = await lastPrice("BTCUSDT");
    out.prices = px === null ? `FAILED: no candles from ${priceSource()}` : `ok (${priceSource()}, BTCUSDT ${px})`;
  } catch (e) {
    out.prices = `FAILED (${priceSource()}): ${(e as Error).message}`;
  }
  const a = authEnvironment();
  out.whopAppId = a.whopAppId ?? "MISSING";
  out.whopApiKey = a.whopApiKeySet ? "set" : "MISSING";
  out.devAuthBypass = devAuth() ? "ON — UNSAFE" : "off";
  out.cronSecret = process.env.CRON_SECRET ? "set" : "MISSING";
  console.log(`[startup-check] ${JSON.stringify(out)}`);
}
