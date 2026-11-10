"use server";

import { revalidatePath } from "next/cache";
import { AuthError, requireAdmin } from "@/lib/auth";
import { fmtPrice } from "@/lib/format";
import { validateLevels } from "@/lib/grader";
import { lastPrice, SYMBOL_RE } from "@/lib/prices";
import { addEvent, createCall, ensureCompany, getCall, updateCompany } from "@/lib/repo";

export type ActionState = { error?: string; ok?: string };

const HOUR = 3_600_000;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numOrNull = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

async function guarded(companyId: string, fn: (userId: string) => Promise<ActionState>): Promise<ActionState> {
  try {
    const userId = await requireAdmin(companyId);
    const out = await fn(userId);
    revalidatePath(`/dashboard/${companyId}`);
    return out;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error(e);
    return { error: (e as Error).message || "Something went wrong. Nothing was saved." };
  }
}

export async function postCall(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const companyId = str(fd, "companyId");
  return guarded(companyId, async (userId) => {
    const symbol = str(fd, "symbol").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const side = str(fd, "side") === "short" ? "short" : "long";
    const entryType = str(fd, "entryType") === "limit" ? "limit" : "market";
    const entry = numOrNull(fd, "entry");
    const stop = numOrNull(fd, "stop");
    const targets = ["tp1", "tp2", "tp3"].map((k) => numOrNull(fd, k)).filter((v): v is number => v !== null);
    const note = str(fd, "note").slice(0, 280);

    if (!SYMBOL_RE.test(symbol)) return { error: "Use a USDT pair such as BTCUSDT." };
    if (stop === null) return { error: "A stop is required. Without one there is no way to measure risk." };
    if (entryType === "limit" && entry === null) return { error: "Give the limit entry price." };

    let market: number | null;
    try {
      market = await lastPrice(symbol);
    } catch {
      return { error: "The price feed is not reachable right now. Nothing was posted; try again in a minute." };
    }
    if (market === null) return { error: `No price data found for ${symbol}. Check the pair.` };

    const reference = entryType === "limit" ? (entry as number) : market;
    const problem = validateLevels(side, reference, stop, targets);
    if (problem) return { error: entryType === "market" ? `${problem} (Market is at about ${fmtPrice(market)}.)` : problem };

    const company = await ensureCompany(companyId);
    await createCall({
      companyId,
      authorUserId: userId,
      analystName: company.analystName,
      symbol,
      side,
      entryType,
      entry: entryType === "limit" ? entry : null,
      stop,
      targets,
      note,
      fillExpiryMs: 72 * HOUR,
      maxOpenMs: 30 * 24 * HOUR,
    });
    return { ok: "Posted and locked. It will be graded from the next 1-minute candle." };
  });
}

export async function moveStop(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const companyId = str(fd, "companyId");
  return guarded(companyId, async () => {
    const stop = numOrNull(fd, "stop");
    if (stop === null || !Number.isFinite(stop) || stop <= 0) return { error: "Give the new stop price." };
    const call = await getCall(companyId, str(fd, "callId"));
    if (!call) return { error: "Call not found." };
    await addEvent(companyId, call.id, "edit_stop", { stop });
    return { ok: "Stop moved. The change is logged on the public record." };
  });
}

export async function closeCall(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const companyId = str(fd, "companyId");
  return guarded(companyId, async () => {
    const call = await getCall(companyId, str(fd, "callId"));
    if (!call) return { error: "Call not found." };
    if (call.events.some((e) => e.type === "close")) return { error: "A close is already logged for this call." };
    await addEvent(companyId, call.id, "close", {});
    return { ok: call.status === "pending" ? "Cancelled before entry." : "Close logged. It fills at the next candle open." };
  });
}

export async function saveSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const companyId = str(fd, "companyId");
  return guarded(companyId, async () => {
    const name = str(fd, "name").slice(0, 60);
    const analystName = str(fd, "analystName").slice(0, 40);
    const slug = str(fd, "slug").toLowerCase();
    if (!name || !analystName) return { error: "Community name and analyst name are required." };
    if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug)) return { error: "Page address: 3–30 lowercase letters, numbers or dashes." };
    await ensureCompany(companyId);
    await updateCompany(companyId, { name, analystName, slug, isPublic: fd.get("isPublic") === "on" });
    return { ok: "Saved." };
  });
}
