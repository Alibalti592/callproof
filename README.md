# CallProof

A Whop app that gives a trading community a verified record: every call is
timestamped by the server, locked, graded on 1-minute exchange candles and
counted in R. Calls cannot be deleted, and stop or target changes are public.

## Run it locally (no accounts needed)

```bash
npm install
npm run seed        # demo community on synthetic prices
CALLPROOF_DEV_AUTH=1 PRICE_SOURCE=synthetic CALLPROOF_INLINE_GRADER=1 npm run dev
```

- Public record: http://localhost:3000/p/demo
- Owner dashboard: http://localhost:3000/dashboard/biz_demo
- Member view: http://localhost:3000/experiences/exp_demo

Local data lives in `./.data` (an embedded Postgres). Delete the folder to reset.
`CALLPROOF_DEV_AUTH=1` skips Whop sign-in and must never be set in production.

```bash
npm test            # 29 tests: grading rules, statistics, ledger immutability
```

## What is in the box

| Part | Where |
| --- | --- |
| Grading rules (pure, tested) | `src/lib/grader.ts` |
| Statistics in R | `src/lib/stats.ts` |
| Candle sources: Bybit, OKX fallback, synthetic | `src/lib/prices.ts` |
| Schema with immutability triggers | `src/lib/schema.ts` |
| Ledger, hash chain, verification | `src/lib/repo.ts` |
| Grading job | `src/lib/gradeJob.ts` |
| Whop token check and access levels | `src/lib/auth.ts` |
| Owner dashboard and its actions | `src/app/dashboard/[companyId]` |
| Member view inside a whop | `src/app/experiences/[experienceId]` |
| Public proof page | `src/app/p/[slug]` |
| Badge, recap image, chain check, cron | `src/app/api/*` |

## Grading rules

1. Only candles that start at or after the call's server timestamp count.
2. Market calls fill at the open of the first such candle. Limit calls fill when price trades through the entry.
3. 1R is the distance from the fill to the stop in force at the fill. Moving the stop later does not change what 1R means, so widening a stop can lose more than 1R.
4. The position is split equally across targets. A stop closes what is left.
5. If one candle touches both the stop and a target, the stop is counted first.
6. In the candle where a limit entry fills, only the stop is checked.
7. A stop that is gapped through fills at the worse of stop and open.
8. Unfilled calls expire after 72 hours. Open calls are closed at market after 30 days.
9. Edits and manual closes apply from the first candle that starts after them.

Results exclude fees, funding and slippage. Stops closer than 0.2% to the entry are refused.

## Tamper evidence

- Database triggers refuse deletes and refuse changes to a call's original terms or to any event.
- Every call and event is chained to the previous one with SHA-256. `/api/verify/<slug>` recomputes the chain.
- Limit: whoever runs the database could still rebuild the whole chain. To close that gap, publish each community's chain head somewhere you do not control (a daily post, or a public timestamping service). This is not built yet.

## Deploy

1. Create the app in the Whop developer dashboard. Set the dashboard path to `/dashboard/[companyId]` and the experience path to `/experiences/[experienceId]`. Copy the app ID and app API key.
2. Create a Postgres database (Neon, Supabase or Railway) and copy the connection string. Tables are created on first start.
3. Deploy to an always-on host in a region the exchange serves. Set the variables from `.env.example`.
4. Grading: set `CALLPROOF_INLINE_GRADER=1` on a single always-on instance, or schedule a request to `/api/cron/grade` every minute with `Authorization: Bearer $CRON_SECRET`.
5. Set the app's base URL in Whop to your deployment and install the app on a test whop.

## Not done yet

- **Whop sign-in has not been exercised against a live Whop app.** The token check follows Whop's published verifier (same key, issuer and audience check) and the access calls follow the current API reference, but they need a real app ID and key to test.
- **Live exchange data has not been exercised.** The Bybit request follows its v5 kline documentation; the OKX fallback is written from memory of its API and should be checked with one manual run of `npm run grade` after deploy.
- **Billing and plan limits.** There is a `plan` column, but no paywall, trial or analyst limit yet.
- Multiple analysts per community, target edits in the dashboard (the grader already supports them), Discord and Telegram webhooks, weekly recap scheduling, and anchoring of chain heads.
- App Store listing, terms and privacy pages.
