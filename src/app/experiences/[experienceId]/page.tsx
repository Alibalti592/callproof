import { parseWindow, ProofView } from "@/components/ProofView";
import { accessLevel, AuthError, companyOfExperience, currentUserId } from "@/lib/auth";
import { ensureCompany, listCalls } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ experienceId: string }>; searchParams: Promise<{ w?: string }> };

/** Member view: what a community's customers see inside the whop. */
export default async function ExperiencePage({ params, searchParams }: Props) {
  const { experienceId } = await params;
  try {
    const userId = await currentUserId();
    if ((await accessLevel(userId, experienceId)) === "no_access") throw new AuthError("You need a membership to view this.");
    const company = await ensureCompany(await companyOfExperience(experienceId));
    const calls = await listCalls(company.id);
    return <ProofView company={company} calls={calls} window={parseWindow((await searchParams).w)} basePath={`/experiences/${experienceId}`} />;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    return (
      <div className="wrap">
        <div className="panel empty">{e.message}</div>
      </div>
    );
  }
}
