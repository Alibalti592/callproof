import { EquityCurve } from "@/components/EquityCurve";
import { eventLabel, fmtPct, fmtPrice, fmtR, fmtTime, statusLabel } from "@/lib/format";
import type { CallRow, Company } from "@/lib/repo";
import { computeStats } from "@/lib/stats";

const DAY = 86_400_000;
export type Window = "30" | "90" | "all";

export function parseWindow(w: string | string[] | undefined): Window {
  return w === "30" || w === "all" ? w : "90";
}

export function windowStats(calls: CallRow[], w: Window) {
  const since = w === "all" ? undefined : Date.now() - Number(w) * DAY;
  return computeStats(calls.map((c) => ({ outcome: c.outcome, r: c.finalR, closedAt: c.closedMs })), since);
}

export function ProofView({ company, calls, window: w, basePath }: { company: Company; calls: CallRow[]; window: Window; basePath: string }) {
  const s = windowStats(calls, w);
  const since = w === "all" ? 0 : Date.now() - Number(w) * DAY;
  const shown = calls.filter((c) => c.status !== "closed" || (c.closedMs ?? 0) >= since).slice(0, 200);
  const edited = calls.filter((c) => c.events.some((e) => e.type !== "close")).length;
  const label = w === "all" ? "all time" : `last ${w} days`;
  const firstMs = Math.min(company.createdMs, ...calls.map((c) => c.createdMs));

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <div className="eyebrow">Verified call record</div>
          <h1>{company.name}</h1>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            {calls.length} calls on the ledger since {fmtTime(firstMs).slice(0, 10)} · calls cannot be deleted · edits are public
          </p>
        </div>
        <nav className="tabs" aria-label="Period">
          {(["30", "90", "all"] as Window[]).map((k) => (
            <a key={k} href={`${basePath}?w=${k}`} aria-current={k === w ? "page" : undefined}>
              {k === "all" ? "All" : `${k}d`}
            </a>
          ))}
        </nav>
      </header>

      <dl className="stats">
        <div className="stat">
          <dt>Total result</dt>
          <dd className={s.totalR > 0 ? "good" : s.totalR < 0 ? "bad" : ""}>{fmtR(s.totalR, 1)}</dd>
          <small>{label}</small>
        </div>
        <div className="stat">
          <dt>Win rate</dt>
          <dd>{fmtPct(s.winRate)}</dd>
          <small>{s.wins}W · {s.losses}L · {s.breakeven}BE</small>
        </div>
        <div className="stat">
          <dt>Average per call</dt>
          <dd>{fmtR(s.avgR)}</dd>
          <small>win {fmtR(s.avgWin, 1)} · loss {fmtR(s.avgLoss, 1)}</small>
        </div>
        <div className="stat">
          <dt>Closed calls</dt>
          <dd>{s.resolved}</dd>
          <small>{s.unfilled} never filled</small>
        </div>
        <div className="stat">
          <dt>Max drawdown</dt>
          <dd>{s.maxDrawdownR ? fmtR(-s.maxDrawdownR, 1) : "0R"}</dd>
          <small>peak to trough</small>
        </div>
        <div className="stat">
          <dt>Longest losing run</dt>
          <dd>{s.longestLosingStreak}</dd>
          <small>{s.longestLosingStreak === 1 ? "call" : "calls in a row"}</small>
        </div>
      </dl>

      <section className="panel" aria-label="Cumulative result">
        <h2>Cumulative result in R, {label}</h2>
        <EquityCurve curve={s.curve} />
      </section>

      <section className="section">
        <h2>Every call</h2>
        {shown.length === 0 ? (
          <div className="panel empty">No calls in this period yet.</div>
        ) : (
          <div className="scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Posted</th>
                  <th>Market</th>
                  <th>Entry</th>
                  <th>Stop</th>
                  <th>Targets</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Result</th>
                </tr>
              </thead>
              {shown.map((c) => (
                <CallRows key={c.id} c={c} />
              ))}
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>How results are measured</h2>
        <ul className="rules">
          <li>Each call is stamped with the server clock when it is posted and graded on 1-minute exchange candles that start after that moment.</li>
          <li>R is the result in units of the risk taken: 1R is the distance from the fill to the stop in force at the fill. Moving a stop later never changes what 1R means.</li>
          <li>The position is split equally across targets. A stop closes whatever is left.</li>
          <li>If a single candle touches both the stop and a target, the stop is counted first.</li>
          <li>Calls cannot be deleted. Stop and target changes are logged with their own timestamps and apply only from then on. {edited} of {calls.length} calls here were edited.</li>
          <li>Each ledger entry is chained to the one before it with a SHA-256 hash. <a href={`/api/verify/${company.slug}`}>Check the chain</a>.</li>
        </ul>
        <p className="footnote">
          CallProof measures calls; it does not give advice or place trades. Results exclude fees, funding and slippage and assume fills at the
          stated prices. Past results do not guarantee future results. Trading carries a risk of loss.
        </p>
      </section>
    </div>
  );
}

function CallRows({ c }: { c: CallRow }) {
  const hit = new Set((c.state?.hits ?? []).map((h) => h.index));
  const liveStop = c.state?.stop ?? c.stop;
  const liveTargets = c.state?.targets ?? c.targets;
  const edits = c.events.filter((e) => e.type !== "close").length;
  return (
    <tbody>
      <tr className="main">
        <td className="num small">{fmtTime(c.createdMs)}</td>
        <td>
          <span className="num">{c.symbol}</span>
          <span className={`chip ${c.side}`}>{c.side}</span>
        </td>
        <td className="num">{c.state?.fillPrice ? fmtPrice(c.state.fillPrice) : c.entryType === "market" ? "Market" : fmtPrice(c.entry)}</td>
        <td className="num">
          {fmtPrice(liveStop)}
          {liveStop !== c.stop && <span className="edited">moved</span>}
        </td>
        <td className="num">
          {liveTargets.map((t, i) => (
            <span key={i} className={`tp ${hit.has(i) ? "hit" : ""}`}>
              {i > 0 && <span className="muted"> / </span>}
              {fmtPrice(t)}
            </span>
          ))}
        </td>
        <td>
          {statusLabel(c)}
          {edits > 0 && <span className="edited">{edits} edit{edits > 1 ? "s" : ""}</span>}
        </td>
        <td className={`num r ${c.finalR === null ? "muted" : c.finalR > 0 ? "good" : c.finalR < 0 ? "bad" : ""}`}>
          {c.status === "closed" && c.outcome !== "expired_unfilled" && c.outcome !== "cancelled" ? fmtR(c.finalR) : "—"}
        </td>
      </tr>
      <tr className="more">
        <td colSpan={7}>
          <details>
            <summary>History · ledger #{c.seq}</summary>
            <div className="history">
              <span>
                Posted {fmtTime(c.createdMs)} by {c.analystName}: {c.side} {c.symbol}, {c.entryType === "market" ? "market entry" : `limit ${fmtPrice(c.entry)}`},
                stop {fmtPrice(c.stop)}, targets {c.targets.map((t) => fmtPrice(t)).join(" / ")}
              </span>
              {c.note && <span className="muted">“{c.note}”</span>}
              {c.state?.filledAt && <span>Filled {fmtTime(c.state.filledAt)} at {fmtPrice(c.state.fillPrice)}</span>}
              {c.events.map((e) => (
                <span key={e.id}>
                  {fmtTime(e.createdMs)} — {eventLabel(e.type, e.payload)} <span className="muted">(ledger #{e.seq})</span>
                </span>
              ))}
              {(c.state?.hits ?? []).map((h) => (
                <span key={h.index}>
                  {fmtTime(h.at)} — target {h.index + 1} reached at {fmtPrice(h.price)} ({fmtR(h.r)})
                </span>
              ))}
              {c.status === "closed" && (
                <span>
                  {fmtTime(c.closedMs)} — {statusLabel(c)}
                  {c.state?.exitPrice ? ` at ${fmtPrice(c.state.exitPrice)}` : ""}
                </span>
              )}
              <code>hash {c.hash}</code>
            </div>
          </details>
        </td>
      </tr>
    </tbody>
  );
}
