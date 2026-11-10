import { importJWK, jwtVerify } from "jose";
import { headers } from "next/headers";

/**
 * Whop renders apps in an iframe and adds a signed JWT in the
 * `x-whop-user-token` header of every same-origin request.
 * The current @whop/sdk does not ship a verifier for TypeScript, so the token
 * is checked here with Whop's public key (ES256), as published in @whop/api.
 */
const WHOP_USER_TOKEN_JWK = {
  kty: "EC",
  x: "rz8a8vxvexHC0TLT91g7llOdDOsNuYiGEfic4Qhni-E",
  y: "zH0QblKYToexd5PEIMGXPVJS9AB5smKrW4S_TbiXrOs",
  crv: "P-256",
};

const API = "https://api.whop.com/api/v1";

export type AccessLevel = "admin" | "customer" | "no_access";

/** Local development only: skips Whop and treats the visitor as an admin. */
export function devAuth() {
  return process.env.CALLPROOF_DEV_AUTH === "1";
}

export class AuthError extends Error {}

export async function currentUserId(): Promise<string> {
  if (devAuth()) return "user_dev";
  const appId = process.env.WHOP_APP_ID;
  if (!appId) throw new AuthError("WHOP_APP_ID is not set.");
  const token = (await headers()).get("x-whop-user-token");
  if (!token) throw new AuthError("Open CallProof from inside Whop.");
  try {
    const key = await importJWK(WHOP_USER_TOKEN_JWK, "ES256");
    const { payload } = await jwtVerify(token, key, { issuer: "urn:whopcom:exp-proxy", audience: appId });
    if (!payload.sub) throw new Error("no subject");
    return payload.sub;
  } catch {
    throw new AuthError("Your Whop session could not be verified.");
  }
}

async function whop(path: string) {
  const key = process.env.WHOP_API_KEY;
  if (!key) throw new AuthError("WHOP_API_KEY is not set.");
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new AuthError(`Whop API returned ${res.status}.`);
  return res.json();
}

/** Access of a user to an account (biz_), product (prod_) or experience (exp_). */
export async function accessLevel(userId: string, resourceId: string): Promise<AccessLevel> {
  if (devAuth()) return "admin";
  const r = await whop(`/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(resourceId)}`);
  return r.has_access ? (r.access_level as AccessLevel) : "no_access";
}

/** Throws unless the visitor is a team member of the company. Returns the user id. */
export async function requireAdmin(companyId: string): Promise<string> {
  if (!/^biz_[A-Za-z0-9]+$/.test(companyId)) throw new AuthError("Unknown company.");
  const userId = await currentUserId();
  if ((await accessLevel(userId, companyId)) !== "admin") throw new AuthError("Admin access required.");
  return userId;
}

const expCache = new Map<string, string>();

/** The company that owns an experience. */
export async function companyOfExperience(experienceId: string): Promise<string> {
  if (devAuth()) return "biz_demo";
  const hit = expCache.get(experienceId);
  if (hit) return hit;
  const exp = await whop(`/experiences/${encodeURIComponent(experienceId)}`);
  const id = exp.company?.id ?? exp.account?.id;
  if (!id) throw new AuthError("Could not find the community for this experience.");
  expCache.set(experienceId, id);
  return id;
}
