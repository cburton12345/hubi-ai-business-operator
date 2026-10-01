import crypto from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

function timingSafeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyH4rSignedRequest(request: Request, rawBody: string) {
  const secret = env.H4R_SMS_BRIDGE_SECRET;
  if (!secret) return { ok: false as const, status: 503, error: "H4R SMS bridge secret is not configured." };

  const timestamp = request.headers.get("x-h4r-timestamp")?.trim() || "";
  const nonce = request.headers.get("x-h4r-nonce")?.trim() || "";
  const signature = (request.headers.get("x-h4r-signature") || "").replace(/^sha256=/i, "").trim();
  if (!timestamp || !nonce || !signature) return { ok: false as const, status: 401, error: "Missing bridge signature." };

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false as const, status: 401, error: "Stale bridge signature." };
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`, "utf8").digest("hex");
  if (!timingSafeHexEqual(expected, signature)) return { ok: false as const, status: 401, error: "Invalid bridge signature." };
  return { ok: true as const, nonce };
}

export async function claimH4rBridgeNonce(nonce: string) {
  await queryPostgres(`delete from public.h4r_ferocity_bridge_nonces where expires_at < now()`);
  const result = await queryPostgres<{ nonce: string }>(
    `insert into public.h4r_ferocity_bridge_nonces (nonce,expires_at)
     values ($1,now()+interval '10 minutes')
     on conflict (nonce) do nothing
     returning nonce`,
    [nonce]
  );
  return Boolean(result?.rows[0]);
}
