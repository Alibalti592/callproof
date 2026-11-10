import type { CallRow } from "./repo";

export function fmtR(r: number | null | undefined, digits = 2) {
  if (r === null || r === undefined) return "—";
  const v = Math.abs(r) < 0.005 ? 0 : r;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}R`;
}

export function fmtPct(x: number | null) {
  return x === null ? "—" : `${(x * 100).toFixed(0)}%`;
}

export function fmtPrice(p: number | null | undefined) {
  if (p === null || p === undefined) return "—";
  const d = p >= 1000 ? 2 : p >= 1 ? 4 : 6;
  return p.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: p >= 1000 ? 2 : 0 });
}

export function fmtTime(ms: number | null | undefined) {
  if (!ms) return "—";
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function fmtDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Short status for a call, e.g. "TP1, then stopped". */
export function statusLabel(c: CallRow): string {
  if (c.status === "pending") return "Waiting for entry";
  if (c.status === "open") {
    const n = c.state?.hits.length ?? 0;
    return n ? `Open · TP${n} hit` : "Open";
  }
  const hits = c.state?.hits.length ?? 0;
  switch (c.outcome) {
    case "targets":
      return "All targets hit";
    case "stopped":
      return hits ? `TP${hits} hit, then stopped` : "Stopped out";
    case "manual":
      return "Closed by analyst";
    case "timed_out":
      return "Closed at time limit";
    case "expired_unfilled":
      return "Never filled";
    case "cancelled":
      return "Cancelled before entry";
    default:
      return "Closed";
  }
}

export function eventLabel(type: string, payload: Record<string, unknown>) {
  if (type === "edit_stop") return `Stop moved to ${fmtPrice(Number(payload.stop))}`;
  if (type === "edit_targets") return `Targets changed to ${(payload.targets as number[]).map((t) => fmtPrice(Number(t))).join(" / ")}`;
  return "Analyst closed the call";
}
