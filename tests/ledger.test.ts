import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory://";
process.env.PRICE_SOURCE = "synthetic";
delete process.env.DATABASE_URL;

import { getDb } from "../src/lib/db";
import { runGrading } from "../src/lib/gradeJob";
import { MINUTE } from "../src/lib/grader";
import { syntheticPrice } from "../src/lib/prices";
import { addEvent, createCall, ensureCompany, getCall, listCalls, verifyChain } from "../src/lib/repo";

const HOUR = 60 * MINUTE;
let callId = "";

describe("ledger", () => {
  beforeAll(async () => {
    await ensureCompany("biz_test", "Test");
    const t = Date.now() - 6 * HOUR;
    const px = syntheticPrice("BTCUSDT", Math.ceil(t / MINUTE));
    callId = await createCall({
      companyId: "biz_test",
      authorUserId: "user_1",
      analystName: "A",
      symbol: "BTCUSDT",
      side: "long",
      entryType: "market",
      entry: null,
      stop: px * 0.5,
      targets: [px * 2],
      note: "",
      fillExpiryMs: 72 * HOUR,
      maxOpenMs: 30 * 24 * HOUR,
      backdateMs: t,
    });
  }, 30_000);

  it("refuses to delete a call", async () => {
    const db = await getDb();
    await expect(db.query("delete from calls where id = $1", [callId])).rejects.toThrow(/cannot be changed or deleted/);
  });

  it("refuses to rewrite a call's terms", async () => {
    const db = await getDb();
    await expect(db.query("update calls set stop = 1 where id = $1", [callId])).rejects.toThrow(/immutable/);
    await expect(db.query("update calls set created_ms = 1 where id = $1", [callId])).rejects.toThrow(/immutable/);
  });

  it("grades from candles and records edits as events", async () => {
    const run = await runGrading();
    expect(run.errors).toEqual([]);
    let call = await getCall("biz_test", callId);
    expect(call?.status).toBe("open");
    expect(call?.state?.fillPrice).toBeGreaterThan(0);

    await addEvent("biz_test", callId, "edit_stop", { stop: call!.stop * 1.1 });
    await addEvent("biz_test", callId, "close", {});
    call = await getCall("biz_test", callId);
    expect(call?.events.map((e) => e.type)).toEqual(["edit_stop", "close"]);

    const db = await getDb();
    await expect(db.query("delete from call_events where call_id = $1", [callId])).rejects.toThrow();
    await expect(db.query("update call_events set payload = '{}'::jsonb where call_id = $1", [callId])).rejects.toThrow();
  });

  it("keeps a hash chain that verifies and detects tampering", async () => {
    const ok = await verifyChain("biz_test");
    expect(ok).toMatchObject({ ok: true, entries: 3, brokenAtSeq: null });

    const db = await getDb();
    await db.query("alter table call_events disable trigger events_immutable");
    await db.query("update call_events set payload = '{\"stop\": 1}'::jsonb where call_id = $1 and type = 'edit_stop'", [callId]);
    await db.query("alter table call_events enable trigger events_immutable");
    const bad = await verifyChain("biz_test");
    expect(bad.ok).toBe(false);
    expect(bad.brokenAtSeq).toBe(2);
    expect((await listCalls("biz_test")).length).toBe(1);
  });
});
