/**
 * With CALLPROOF_INLINE_GRADER=1 the server grades open calls once a minute
 * by itself. Use this on a single always-on host (Railway, a VPS). On
 * serverless hosts leave it off and call /api/cron/grade from a scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.CALLPROOF_INLINE_GRADER !== "1") return;
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
