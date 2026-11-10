import { getCompanyBySlug, verifyChain } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Recomputes the hash chain of a public record and reports whether it holds. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const company = await getCompanyBySlug((await params).slug);
  if (!company || !company.isPublic) return Response.json({ error: "Not found" }, { status: 404 });
  const check = await verifyChain(company.id);
  return Response.json({
    community: company.name,
    intact: check.ok,
    entries: check.entries,
    head: check.head,
    brokenAtEntry: check.brokenAtSeq,
    checkedAt: new Date().toISOString(),
    note: "Each entry's hash covers its contents and the previous entry's hash. Save the head value; if an old entry were altered later, the head would no longer match.",
  });
}
