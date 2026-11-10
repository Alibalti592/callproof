import { headers } from "next/headers";
import { ActionForm } from "@/components/ActionForm";
import { windowStats } from "@/components/ProofView";
import { AuthError, requireAdmin } from "@/lib/auth";
import { fmtPct, fmtPrice, fmtR, fmtTime, statusLabel } from "@/lib/format";
import { ensureCompany, listCalls } from "@/lib/repo";
import { closeCall, moveStop, postCall, saveSettings } from "./actions";

export const dynamic = "force-dynamic";

async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

export default async function Dashboard({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  try {
    await requireAdmin(companyId);
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    return (
      <div className="wrap">
        <div className="panel empty">{e.message}</div>
      </div>
    );
  }

  const company = await ensureCompany(companyId);
  const calls = await listCalls(companyId);
  const active = calls.filter((c) => c.status !== "closed");
  const s = windowStats(calls, "90");
  const base = await origin();
  const pageUrl = `${base}/p/${company.slug}`;
  const named = company.name !== "My community";

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <div className="eyebrow">CallProof</div>
          <h1>{company.name}</h1>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            90 days: <span className="num">{fmtR(s.totalR, 1)}</span> · {fmtPct(s.winRate)} win rate · {s.resolved} closed calls
          </p>
        </div>
        <a className="btn" href={`/p/${company.slug}`} target="_blank" rel="noreferrer">
          Open public record ↗
        </a>
      </header>

      <div className="grid2">
        <section className="panel">
          <h2>Post a call</h2>
          <ActionForm
            action={postCall}
            submit="Post and lock"
            primary
            resetOnOk
            confirmText="Post this call? It is timestamped now and can never be deleted. Later changes to the stop or targets are shown publicly."
          >
            <input type="hidden" name="companyId" value={companyId} />
            <div className="row">
              <label className="field">
                Pair
                <input type="text" name="symbol" placeholder="BTCUSDT" required autoComplete="off" list="pairs" />
                <datalist id="pairs">
                  {["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "LINKUSDT", "AVAXUSDT"].map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <div className="field">
                Direction
                <div className="seg" role="radiogroup" aria-label="Direction">
                  <label><input type="radio" name="side" value="long" defaultChecked /> Long</label>
                  <label><input type="radio" name="side" value="short" /> Short</label>
                </div>
              </div>
              <div className="field">
                Entry
                <div className="seg" role="radiogroup" aria-label="Entry type">
                  <label><input type="radio" name="entryType" value="market" defaultChecked /> Market</label>
                  <label><input type="radio" name="entryType" value="limit" /> Limit</label>
                </div>
              </div>
            </div>
            <div className="row">
              <label className="field">
                Limit price (limit only)
                <input type="number" name="entry" step="any" min="0" inputMode="decimal" />
              </label>
              <label className="field">
                Stop
                <input type="number" name="stop" step="any" min="0" inputMode="decimal" required />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Target 1
                <input type="number" name="tp1" step="any" min="0" inputMode="decimal" required />
              </label>
              <label className="field">
                Target 2 (optional)
                <input type="number" name="tp2" step="any" min="0" inputMode="decimal" />
              </label>
              <label className="field">
                Target 3 (optional)
                <input type="number" name="tp3" step="any" min="0" inputMode="decimal" />
              </label>
            </div>
            <label className="field">
              Note (optional, public)
              <textarea name="note" rows={2} maxLength={280} />
            </label>
          </ActionForm>
        </section>

        <div className="side">
          <section className="panel">
            <h2>Get set up</h2>
            <ul className="checklist">
              <li className={named ? "done" : ""}>Name your community and analyst below</li>
              <li className={calls.length ? "done" : ""}>Post your first call</li>
              <li className={s.resolved ? "done" : ""}>Let the first call close</li>
              <li>Add the badge to your Whop store page</li>
            </ul>
          </section>

          <section className="panel">
            <h2>Share your record</h2>
            <p className="small muted" style={{ margin: 0 }}>Public page</p>
            <pre className="snippet">{pageUrl}</pre>
            <p className="small muted" style={{ margin: "12px 0 0" }}>Badge (paste into any page that accepts HTML)</p>
            <pre className="snippet">{`<a href="${pageUrl}"><img src="${base}/api/badge/${company.slug}" alt="Verified call record on CallProof" height="64"></a>`}</pre>
            <p className="small" style={{ margin: "12px 0 0" }}>
              Recap images: <a href={`/api/recap/${company.slug}?days=7`} target="_blank" rel="noreferrer">last 7 days</a> ·{" "}
              <a href={`/api/recap/${company.slug}?days=30`} target="_blank" rel="noreferrer">last 30 days</a>
            </p>
          </section>
        </div>
      </div>

      <section className="section">
        <h2>Live calls ({active.length})</h2>
        <div className="panel">
          {active.length === 0 && <p className="empty" style={{ padding: 12 }}>Nothing open. Posted calls appear here until they close.</p>}
          {active.map((c) => {
            const closing = c.events.some((e) => e.type === "close");
            return (
              <div className="callcard" key={c.id}>
                <div className="head">
                  <div>
                    <span className="num">{c.symbol}</span>
                    <span className={`chip ${c.side}`}>{c.side}</span>
                    <span className="muted small" style={{ marginLeft: 10 }}>{statusLabel(c)}</span>
                  </div>
                  <span className="muted small num">{fmtTime(c.createdMs)}</span>
                </div>
                <div className="num small">
                  Entry {c.state?.fillPrice ? fmtPrice(c.state.fillPrice) : c.entryType === "market" ? "market" : fmtPrice(c.entry)} · Stop{" "}
                  {fmtPrice(c.state?.stop ?? c.stop)} · Targets {(c.state?.targets ?? c.targets).map((t) => fmtPrice(t)).join(" / ")}
                  {c.state && c.state.realizedR !== 0 && <> · Booked {fmtR(c.state.realizedR)}</>}
                </div>
                {closing ? (
                  <p className="muted small" style={{ margin: 0 }}>Close logged. It fills at the next candle open.</p>
                ) : (
                  <div className="inline">
                    <ActionForm action={moveStop} submit="Move stop" className="inline">
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="callId" value={c.id} />
                      <label className="field">
                        New stop
                        <input type="number" name="stop" step="any" min="0" inputMode="decimal" required />
                      </label>
                    </ActionForm>
                    <ActionForm
                      action={closeCall}
                      submit={c.status === "pending" ? "Cancel call" : "Close at market"}
                      className="inline"
                      confirmText={c.status === "pending" ? "Cancel this call before entry? The cancellation stays on the record." : "Close this call at the next candle open?"}
                    >
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="callId" value={c.id} />
                    </ActionForm>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Settings</h2>
        <div className="panel">
          <ActionForm action={saveSettings} submit="Save settings">
            <input type="hidden" name="companyId" value={companyId} />
            <div className="row">
              <label className="field">
                Community name
                <input type="text" name="name" defaultValue={company.name} maxLength={60} required />
              </label>
              <label className="field">
                Analyst name shown on calls
                <input type="text" name="analystName" defaultValue={company.analystName} maxLength={40} required />
              </label>
              <label className="field">
                Public page address
                <input type="text" name="slug" defaultValue={company.slug} pattern="[a-z0-9][a-z0-9-]{2,29}" required />
              </label>
            </div>
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}>
              <input type="checkbox" name="isPublic" defaultChecked={company.isPublic} /> Show my record on a public page
            </label>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
