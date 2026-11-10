import { timingSafeEqual } from "node:crypto";
import { runGrading } from "@/lib/gradeJob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs one grading pass. Call it every minute from a scheduler:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/grade
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runGrading());
}

export const GET = handle;
export const POST = handle;
