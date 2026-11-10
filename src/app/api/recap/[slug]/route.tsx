import { ImageResponse } from "next/og";
import { fmtPct, fmtR } from "@/lib/format";
import { getCompanyBySlug, listCalls } from "@/lib/repo";
import { computeStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** A 1080×1350 recap card for social posts: /api/recap/<slug>?days=7 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const company = await getCompanyBySlug((await params).slug);
  if (!company || !company.isPublic) return new Response("Not found", { status: 404 });
  const days = new URL(req.url).searchParams.get("days") === "30" ? 30 : 7;
  const calls = await listCalls(company.id);
  const s = computeStats(calls.map((c) => ({ outcome: c.outcome, r: c.finalR, closedAt: c.closedMs })), Date.now() - days * DAY);
  const tone = s.totalR > 0 ? "#58b98a" : s.totalR < 0 ? "#e0736b" : "#e9e6df";
  const tiles: [string, string][] = [
    ["Win rate", fmtPct(s.winRate)],
    ["Closed calls", String(s.resolved)],
    ["Average per call", fmtR(s.avgR)],
    ["Max drawdown", s.maxDrawdownR ? fmtR(-s.maxDrawdownR, 1) : "0R"],
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0c0e11", color: "#e9e6df", padding: 80 }}>
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 5, color: "#d9b56a" }}>{`VERIFIED RECORD · LAST ${days} DAYS`}</div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 28 }}>{company.name}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 90 }}>
          <div style={{ display: "flex", fontSize: 34, color: "#8f96a3" }}>Total result</div>
          <div style={{ display: "flex", fontSize: 220, fontWeight: 700, color: tone, lineHeight: 1.05 }}>{fmtR(s.totalR, 1)}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 70 }}>
          {tiles.map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", width: 460, marginBottom: 44 }}>
              <div style={{ display: "flex", fontSize: 28, color: "#8f96a3" }}>{k}</div>
              <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", fontSize: 24, color: "#8f96a3", borderTop: "2px solid #262b34", paddingTop: 28 }}>
          Every call timestamped and graded on exchange candles by CallProof. R = result in units of risk. Past results do not guarantee future results.
        </div>
      </div>
    ),
    { width: 1080, height: 1350 },
  );
}
