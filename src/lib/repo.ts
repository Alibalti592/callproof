import { createHash, randomUUID } from "node:crypto";
import { getDb, type Query } from "./db";
import type { CallEvent, CallSpec, EntryType, GradeState, Outcome, Side } from "./grader";

export interface Company {
  id: string;
  name: string;
  slug: string;
  analystName: string;
  isPublic: boolean;
  plan: string;
  chainHead: string;
  chainSeq: number;
  createdMs: number;
}

export interface EventRow {
  id: string;
  callId: string;
  seq: number;
  prevHash: string;
  hash: string;
  type: "edit_stop" | "edit_targets" | "close";
  payload: Record<string, unknown>;
  createdMs: number;
}

export interface CallRow {
  id: string;
  companyId: string;
  seq: number;
  prevHash: string;
  hash: string;
  analystName: string;
  authorUserId: string;
  symbol: string;
  side: Side;
  entryType: EntryType;
  entry: number | null;
  stop: number;
  targets: number[];
  note: string;
  createdMs: number;
  fillExpiryMs: number;
  maxOpenMs: number;
  status: "pending" | "open" | "closed";
  outcome: Outcome | null;
  finalR: number | null;
  closedMs: number | null;
  state: GradeState | null;
  lastCandleT: number | null;
  events: EventRow[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : (v as T));

function toCompany(r: Record<string, any>): Company {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    analystName: r.analyst_name,
    isPublic: r.is_public,
    plan: r.plan,
    chainHead: r.chain_head,
    chainSeq: Number(r.chain_seq),
    createdMs: Number(r.created_ms),
  };
}

function toEvent(r: Record<string, any>): EventRow {
  return {
    id: r.id,
    callId: r.call_id,
    seq: Number(r.seq),
    prevHash: r.prev_hash,
    hash: r.hash,
    type: r.type,
    payload: json(r.payload),
    createdMs: Number(r.created_ms),
  };
}

function toCall(r: Record<string, any>): CallRow {
  return {
    id: r.id,
    companyId: r.company_id,
    seq: Number(r.seq),
    prevHash: r.prev_hash,
    hash: r.hash,
    analystName: r.analyst_name,
    authorUserId: r.author_user_id,
    symbol: r.symbol,
    side: r.side,
    entryType: r.entry_type,
    entry: num(r.entry),
    stop: Number(r.stop),
    targets: json<number[]>(r.targets).map(Number),
    note: r.note,
    createdMs: Number(r.created_ms),
    fillExpiryMs: Number(r.fill_expiry_ms),
    maxOpenMs: Number(r.max_open_ms),
    status: r.status,
    outcome: r.outcome,
    finalR: num(r.final_r),
    closedMs: num(r.closed_ms),
    state: r.state ? json<GradeState>(r.state) : null,
    lastCandleT: num(r.last_candle_t),
    events: [],
  };
}

const NOW_SQL = "select (extract(epoch from clock_timestamp()) * 1000)::bigint as now";

async function dbNow(q: Query): Promise<number> {
  return Number((await q(NOW_SQL))[0].now);
}

// ---- hash chain -------------------------------------------------------------

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function callDigest(c: Pick<CallRow, "seq" | "id" | "symbol" | "side" | "entryType" | "entry" | "stop" | "targets" | "note" | "analystName" | "createdMs">) {
  return stable(["call", c.seq, c.id, c.symbol, c.side, c.entryType, c.entry, c.stop, c.targets, c.note, c.analystName, c.createdMs]);
}

export function eventDigest(e: Pick<EventRow, "seq" | "id" | "callId" | "type" | "payload" | "createdMs">) {
  return stable(["event", e.seq, e.id, e.callId, e.type, e.payload, e.createdMs]);
}

export const chainHash = (prev: string, digest: string) => createHash("sha256").update(`${prev}|${digest}`).digest("hex");

async function nextLink(q: Query, companyId: string) {
  const rows = await q("select chain_head, chain_seq from companies where id = $1 for update", [companyId]);
  if (!rows.length) throw new Error("Unknown company");
  return { prev: rows[0].chain_head as string, seq: Number(rows[0].chain_seq) + 1 };
}

async function advance(q: Query, companyId: string, seq: number, hash: string) {
  await q("update companies set chain_head = $2, chain_seq = $3 where id = $1", [companyId, hash, seq]);
}

// ---- companies --------------------------------------------------------------

export function defaultSlug(companyId: string) {
  return companyId.replace(/^biz_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || randomUUID().slice(0, 8);
}

export async function ensureCompany(id: string, name = "My community"): Promise<Company> {
  const db = await getDb();
  const found = await db.query("select * from companies where id = $1", [id]);
  if (found.length) return toCompany(found[0]);
  await db.query(
    `insert into companies (id, name, slug, created_ms)
     values ($1, $2, $3, (extract(epoch from clock_timestamp()) * 1000)::bigint)
     on conflict (id) do nothing`,
    [id, name, defaultSlug(id)],
  );
  return toCompany((await db.query("select * from companies where id = $1", [id]))[0]);
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const db = await getDb();
  const rows = await db.query("select * from companies where slug = $1", [slug.toLowerCase()]);
  return rows.length ? toCompany(rows[0]) : null;
}

export async function getCompany(id: string): Promise<Company | null> {
  const db = await getDb();
  const rows = await db.query("select * from companies where id = $1", [id]);
  return rows.length ? toCompany(rows[0]) : null;
}

export async function updateCompany(id: string, v: { name: string; slug: string; analystName: string; isPublic: boolean }) {
  const db = await getDb();
  const taken = await db.query("select 1 from companies where slug = $1 and id <> $2", [v.slug, id]);
  if (taken.length) throw new Error("That page address is already taken.");
  await db.query("update companies set name = $2, slug = $3, analyst_name = $4, is_public = $5 where id = $1", [
    id,
    v.name,
    v.slug,
    v.analystName,
    v.isPublic,
  ]);
}

// ---- calls ------------------------------------------------------------------

export interface NewCall {
  companyId: string;
  authorUserId: string;
  analystName: string;
  symbol: string;
  side: Side;
  entryType: EntryType;
  entry: number | null;
  stop: number;
  targets: number[];
  note: string;
  fillExpiryMs: number;
  maxOpenMs: number;
  /** Only for seeding demo data. Real calls always take the database clock. */
  backdateMs?: number;
}

export async function createCall(n: NewCall): Promise<string> {
  const db = await getDb();
  return db.tx(async (q) => {
    const { prev, seq } = await nextLink(q, n.companyId);
    const createdMs = n.backdateMs ?? (await dbNow(q));
    const id = randomUUID();
    const hash = chainHash(prev, callDigest({ ...n, id, seq, createdMs }));
    await q(
      `insert into calls (id, company_id, seq, prev_hash, hash, analyst_name, author_user_id, symbol, side,
         entry_type, entry, stop, targets, note, created_ms, fill_expiry_ms, max_open_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17)`,
      [id, n.companyId, seq, prev, hash, n.analystName, n.authorUserId, n.symbol, n.side, n.entryType, n.entry, n.stop,
        JSON.stringify(n.targets), n.note, createdMs, n.fillExpiryMs, n.maxOpenMs],
    );
    await advance(q, n.companyId, seq, hash);
    return id;
  });
}

export async function addEvent(
  companyId: string,
  callId: string,
  type: EventRow["type"],
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db.tx(async (q) => {
    const { prev, seq } = await nextLink(q, companyId);
    const call = await q("select status from calls where id = $1 and company_id = $2", [callId, companyId]);
    if (!call.length) throw new Error("Call not found.");
    if (call[0].status === "closed") throw new Error("This call is already closed.");
    const createdMs = await dbNow(q);
    const id = randomUUID();
    const hash = chainHash(prev, eventDigest({ seq, id, callId, type, payload, createdMs }));
    await q(
      `insert into call_events (id, call_id, company_id, seq, prev_hash, hash, type, payload, created_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [id, callId, companyId, seq, prev, hash, type, JSON.stringify(payload), createdMs],
    );
    await advance(q, companyId, seq, hash);
  });
}

async function attachEvents(q: Query, calls: CallRow[]): Promise<CallRow[]> {
  if (!calls.length) return calls;
  const rows = await q("select * from call_events where call_id = any($1::text[]) order by seq", [calls.map((c) => c.id)]);
  const byId = new Map(calls.map((c) => [c.id, c]));
  for (const r of rows) byId.get(r.call_id)?.events.push(toEvent(r));
  return calls;
}

export async function listCalls(companyId: string): Promise<CallRow[]> {
  const db = await getDb();
  const rows = await db.query("select * from calls where company_id = $1 order by created_ms desc, seq desc", [companyId]);
  return attachEvents(db.query, rows.map(toCall));
}

export async function getCall(companyId: string, callId: string): Promise<CallRow | null> {
  const db = await getDb();
  const rows = await db.query("select * from calls where id = $1 and company_id = $2", [callId, companyId]);
  if (!rows.length) return null;
  return (await attachEvents(db.query, rows.map(toCall)))[0];
}

export async function activeCalls(): Promise<CallRow[]> {
  const db = await getDb();
  const rows = await db.query("select * from calls where status <> 'closed' order by created_ms");
  return attachEvents(db.query, rows.map(toCall));
}

export async function saveGrade(callId: string, s: GradeState): Promise<void> {
  const db = await getDb();
  await db.query(
    `update calls set status = $2, outcome = $3, final_r = $4, closed_ms = $5, state = $6::jsonb, last_candle_t = $7
     where id = $1 and status <> 'closed'`,
    [callId, s.status, s.outcome, s.status === "closed" ? s.realizedR : null, s.closedAt, JSON.stringify(s), s.lastCandleT],
  );
}

// ---- conversions for the grader ----------------------------------------------

export function toSpec(c: CallRow): CallSpec {
  return {
    side: c.side,
    entryType: c.entryType,
    entry: c.entry,
    stop: c.stop,
    targets: c.targets,
    createdAt: c.createdMs,
    fillExpiryMs: c.fillExpiryMs,
    maxOpenMs: c.maxOpenMs,
  };
}

export function toGraderEvents(c: CallRow): CallEvent[] {
  return c.events.map((e) =>
    e.type === "edit_stop"
      ? { type: "edit_stop", at: e.createdMs, stop: Number(e.payload.stop) }
      : e.type === "edit_targets"
        ? { type: "edit_targets", at: e.createdMs, targets: (e.payload.targets as number[]).map(Number) }
        : { type: "close", at: e.createdMs },
  );
}

// ---- verification -------------------------------------------------------------

export interface ChainCheck {
  ok: boolean;
  entries: number;
  head: string;
  brokenAtSeq: number | null;
}

/** Recompute the company's hash chain from stored rows. */
export async function verifyChain(companyId: string): Promise<ChainCheck> {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Unknown company");
  const calls = await listCalls(companyId);
  const items = [
    ...calls.map((c) => ({ seq: c.seq, prev: c.prevHash, hash: c.hash, digest: callDigest(c) })),
    ...calls.flatMap((c) => c.events.map((e) => ({ seq: e.seq, prev: e.prevHash, hash: e.hash, digest: eventDigest(e) }))),
  ].sort((a, b) => a.seq - b.seq);

  let head = "genesis";
  let expected = 1;
  for (const it of items) {
    if (it.seq !== expected || it.prev !== head || chainHash(head, it.digest) !== it.hash) {
      return { ok: false, entries: items.length, head, brokenAtSeq: it.seq };
    }
    head = it.hash;
    expected++;
  }
  const ok = head === company.chainHead && items.length === company.chainSeq;
  return { ok, entries: items.length, head, brokenAtSeq: ok ? null : items.length + 1 };
}
