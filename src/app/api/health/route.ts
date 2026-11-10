import { authEnvironment, devAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { lastPrice, priceSource } from "@/lib/prices";

export const dynamic = "force-dynamic";

let cached: { at: number; body: Record<string, unknown> } | null = null;

/**
 * Deployment check: database, live price feed and which settings are present.
 * Never returns a secret's value. Cached for 60 seconds.
 */
export async function GET() {
  if (cached && Date.now() - cached.at < 60_000) return Response.json(cached.body);

  const body: Record<string, unknown> = { checkedAt: new Date().toISOString() };

  try {
    const db = await getDb();
    const rows = await db.query("select count(*)::int as calls from calls");
    body.database = { ok: true, engine: process.env.DATABASE_URL ? "postgres" : "embedded (not for production)", calls: rows[0].calls };
  } catch (e) {
    body.database = { ok: false, error: (e as Error).message };
  }

  try {
    const px = await lastPrice("BTCUSDT");
    body.prices = { ok: px !== null, source: priceSource(), btcusdt: px };
  } catch (e) {
    body.prices = { ok: false, source: priceSource(), error: (e as Error).message };
  }

  body.settings = {
    ...authEnvironment(),
    devAuthBypass: devAuth(),
    inlineGrader: process.env.CALLPROOF_INLINE_GRADER === "1",
    cronSecretSet: Boolean(process.env.CRON_SECRET),
    appUrl: process.env.APP_URL ?? null,
  };

  const settings = body.settings as Record<string, unknown>;
  body.ok =
    (body.database as { ok: boolean }).ok &&
    (body.prices as { ok: boolean }).ok &&
    !settings.devAuthBypass &&
    Boolean(settings.whopAppId) &&
    Boolean(settings.whopApiKeySet);

  cached = { at: Date.now(), body };
  return Response.json(body, { status: body.ok ? 200 : 503 });
}
