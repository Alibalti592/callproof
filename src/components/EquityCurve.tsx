import { fmtDate, fmtR } from "@/lib/format";

/** Cumulative R after each resolved call, drawn as a step line. */
export function EquityCurve({ curve }: { curve: { t: number; cum: number }[] }) {
  if (curve.length < 2) {
    return <p className="empty">The curve appears once two calls have closed.</p>;
  }
  const W = 760;
  const H = 230;
  const left = 52;
  const right = 64;
  const y0 = 16;
  const bottom = 30;
  const pts = [{ t: curve[0].t, cum: 0 }, ...curve];
  const lo = Math.min(0, ...pts.map((p) => p.cum));
  const hi = Math.max(0, ...pts.map((p) => p.cum));
  const span = hi - lo || 1;
  const x = (i: number) => left + (i / (pts.length - 1)) * (W - left - right);
  const y = (v: number) => y0 + (1 - (v - lo) / span) * (H - y0 - bottom);

  let d = `M ${x(0)} ${y(0)}`;
  for (let i = 1; i < pts.length; i++) d += ` H ${x(i)} V ${y(pts[i].cum)}`;
  const last = pts[pts.length - 1];
  const up = last.cum >= 0;
  const stroke = up ? "var(--good)" : "var(--bad)";

  return (
    <>
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cumulative result: ${fmtR(last.cum)} over ${curve.length} closed calls`}>
      <path d={`${d} V ${y(0)} H ${x(0)} Z`} fill={stroke} opacity="0.08" />
      <line x1={left} x2={W - right} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(last.cum)} r="3.5" fill={stroke} />
      <g fontFamily="var(--mono)" fontSize="12" fill="var(--muted)">
        <text x={left - 8} y={y(hi) + 4} textAnchor="end">{fmtR(hi, 1)}</text>
        {lo < 0 && <text x={left - 8} y={y(lo) + 4} textAnchor="end">{fmtR(lo, 1)}</text>}
        {hi > 0 && lo < 0 && <text x={left - 8} y={y(0) + 4} textAnchor="end">0R</text>}
        <text x={left} y={H - 8}>{fmtDate(pts[0].t)}</text>
        <text x={W - right} y={H - 8} textAnchor="end">{fmtDate(last.t)}</text>
        <text x={x(pts.length - 1) + 8} y={y(last.cum) + 4} fill="var(--text)" fontWeight="600">{fmtR(last.cum, 1)}</text>
      </g>
    </svg>
    <p className="curve-cap small muted num">
      {fmtDate(pts[0].t)} to {fmtDate(last.t)} · low {fmtR(lo, 1)} · high {fmtR(hi, 1)} · now {fmtR(last.cum, 1)}
    </p>
    </>
  );
}
