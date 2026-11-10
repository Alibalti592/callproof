export default function Home() {
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="eyebrow">CallProof</div>
      <h1 style={{ fontSize: 34, lineHeight: 1.15 }}>Every call timestamped, graded against the market, never deleted.</h1>
      <p className="muted" style={{ fontSize: 17, margin: "16px 0 24px" }}>
        CallProof gives a trading community a public record that buyers can check. Post a call and it is locked with a
        server timestamp, graded on exchange candles, and counted in R.
      </p>
      <ul className="rules" style={{ fontSize: 15 }}>
        <li>Calls cannot be deleted. Stop and target changes are logged and shown.</li>
        <li>Win rate, average R, drawdown and losing streaks, not screenshots.</li>
        <li>A public page and a badge for your Whop store.</li>
      </ul>
      <p style={{ marginTop: 28 }}>
        <a className="btn" href="/p/demo">See a sample record</a>
      </p>
      <p className="footnote">CallProof measures calls. It does not give advice or place trades. Past results do not guarantee future results.</p>
    </div>
  );
}
