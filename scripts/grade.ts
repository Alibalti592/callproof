/**
 * Runs one grading pass and exits. Use it from a scheduler (for example a
 * Railway cron service) if you prefer that to the in-process grader.
 *
 *   npm run grade
 */
import { runGrading } from "../src/lib/gradeJob";

runGrading()
  .then((r) => {
    console.log(JSON.stringify(r));
    process.exit(r.errors.length ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
