import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseWindow, ProofView } from "@/components/ProofView";
import { getCompanyBySlug, listCalls } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ w?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const company = await getCompanyBySlug((await params).slug);
  return { title: company?.isPublic ? `${company.name} — verified call record` : "CallProof" };
}

export default async function PublicProofPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (!company || !company.isPublic) notFound();
  const calls = await listCalls(company.id);
  return <ProofView company={company} calls={calls} window={parseWindow((await searchParams).w)} basePath={`/p/${company.slug}`} />;
}
