import { windowStats } from "@/components/ProofView";
import { fmtPct, fmtR } from "@/lib/format";
import { getCompanyBySlug, listCalls } from "@/lib/repo";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** A small SVG badge with live 90-day figures, for store pages and bios. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const company = await getCompanyBySlug((await params).slug);
  if (!company || !company.isPublic) return new Response("Not found", { status: 404 });
  const s = windowStats(await listCalls(company.id), "90");
  const line = s.resolved
    ? `${fmtR(s.totalR, 1)} · ${fmtPct(s.winRate)} win rate · ${s.resolved} calls · 90 days`
    : "Record started · no closed calls yet";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="64" viewBox="0 0 340 64" role="img" aria-label="${esc(company.name)}: verified call record on CallProof. ${esc(line)}">
  <rect width="340" height="64" rx="10" fill="#0c0e11"/>
  <rect x="0.5" y="0.5" width="339" height="63" rx="9.5" fill="none" stroke="#262b34"/>
  <rect x="18" y="24" width="10" height="10" fill="#d9b56a" transform="rotate(45 23 29)"/>
  <text x="40" y="27" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="11" font-weight="600" letter-spacing="1.4" fill="#d9b56a">VERIFIED RECORD · CALLPROOF</text>
  <text x="40" y="46" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="12.5" fill="#e9e6df">${esc(line)}</text>
</svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
