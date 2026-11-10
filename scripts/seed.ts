/**
 * Fills the local database with a demo community so every screen has data.
 * Uses synthetic prices: nothing here reflects a real market or a real analyst.
 *
 *   npm run seed
 */
process.env.PRICE_SOURCE = "synthetic";

import { runGrading } from "../src/lib/gradeJob";
import { MINUTE } from "../src/lib/grader";
import { syntheticPrice } from "../src/lib/prices";
import { addEvent, createCall, ensureCompany, getCompany, listCalls, updateCompany } from "../src/lib/repo";

const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];

function rand(i: number) {
  const x = Math.sin(i * 91.17 + 4.2) * 10000;
  return x - Math.floor(x);
}

async function main() {
  const id = "biz_demo";
  await ensureCompany(id, "Demo Signals (sample data)");
  const co = await getCompany(id);
  if (co && co.chainSeq > 0) {
    console.log("Demo data already present. Delete .data/ to start over.");
    return;
  }
  await updateCompany(id, { name: "Demo Signals (sample data)", slug: "demo", analystName: "Sample Analyst", isPublic: true });

  const now = Date.now();
  const n = 28;
  for (let i = 0; i < n; i++) {
    const recent = i >= n - 3; // the last three stay open so the dashboard has live calls
    const t = recent
      ? now - (n - i) * 25 * MINUTE
      : now - 40 * DAY + Math.floor((i / n) * 38 * DAY) + Math.floor(rand(i) * 6 * HOUR);
    const symbol = SYMBOLS[i % SYMBOLS.length];
    const px = syntheticPrice(symbol, Math.ceil(t / MINUTE));
    // A believable sample: a little under half the calls go the right way.
    const later = syntheticPrice(symbol, Math.ceil((t + 36 * HOUR) / MINUTE));
    const withMove = rand(i + 100) < 0.46;
    const side = later > px === withMove ? "long" : "short";
    const dir = side === "long" ? 1 : -1;
    const risk = recent ? 0.05 : 0.012 + rand(i + 200) * 0.01;
    const limit = !recent && i % 5 === 3;
    const entry = limit ? px * (1 - dir * 0.004) : null;
    const ref = entry ?? px;
    await createCall({
      companyId: id,
      authorUserId: "user_demo",
      analystName: "Sample Analyst",
      symbol,
      side,
      entryType: limit ? "limit" : "market",
      entry,
      stop: ref * (1 - dir * risk),
      targets: [ref * (1 + dir * risk * 1.2), ref * (1 + dir * risk * 2.2), ref * (1 + dir * risk * 3.5)].slice(0, 1 + (i % 3)),
      note: i % 4 === 0 ? "Sample call generated for the demo." : "",
      fillExpiryMs: 72 * HOUR,
      maxOpenMs: 14 * DAY,
      backdateMs: t,
    });
  }

  const first = await runGrading();
  console.log(`Graded ${first.updated} calls, ${first.closed} closed, ${first.errors.length} errors in ${first.ms} ms.`);

  // Show what an edit and a manual close look like on the public page.
  const open = (await listCalls(id)).filter((c) => c.status === "open");
  if (open[0]) await addEvent(id, open[0].id, "edit_stop", { stop: open[0].state?.fillPrice ?? open[0].stop });
  if (open[1]) await addEvent(id, open[1].id, "close", {});
  console.log("Done. Start the app with `npm run dev` and open /p/demo and /dashboard/biz_demo");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
