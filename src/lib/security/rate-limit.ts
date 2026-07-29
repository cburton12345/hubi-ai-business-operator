import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";

function clientAddress(request: NextRequest) {
  return (
    request.headers.get("x-nf-client-connection-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function securityFingerprint(source: string) {
  const secret = process.env.SECURITY_HMAC_KEY?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SECURITY_HMAC_KEY is required for production rate limiting.");
  }
  const localSecret =
    secret ||
    process.env.CREDENTIAL_ENCRYPTION_KEY?.trim() ||
    process.env.ADMIN_ACCESS_TOKEN?.trim() ||
    "ferocity-local-development-rate-limit-key";
  return crypto.createHmac("sha256", localSecret).update(source).digest("hex");
}

async function consumeRateLimit(input: {
  scope: string;
  fingerprint: string;
  limit: number;
  windowSeconds: number;
}) {
  const result = await queryPostgres<{ request_count: number }>(
    `
    insert into public.public_request_rate_limits (
      scope, requester_fingerprint, window_started_at, request_count, expires_at
    )
    values (
      $1, $2,
      to_timestamp(floor(extract(epoch from now()) / $3::integer) * $3::integer),
      1,
      to_timestamp((floor(extract(epoch from now()) / $3::integer) + 2) * $3::integer)
    )
    on conflict (scope, requester_fingerprint, window_started_at) do update
    set request_count = public.public_request_rate_limits.request_count + 1,
        updated_at = now()
    returning request_count
    `,
    [input.scope.slice(0, 180), input.fingerprint, input.windowSeconds]
  );
  const count = Number(result?.rows[0]?.request_count ?? input.limit + 1);
  return { allowed: count <= input.limit, count, limit: input.limit };
}

export async function consumePublicRateLimit(input: {
  request: NextRequest;
  scope: string;
  limit: number;
  windowSeconds: number;
}) {
  return consumeRateLimit({
    ...input,
    fingerprint: securityFingerprint(
      `${clientAddress(input.request)}|${(input.request.headers.get("user-agent") ?? "").slice(0, 240)}`
    )
  });
}

export async function consumeLoginRateLimit(input: {
  scope: string;
  identifier: string;
  clientHint: string;
  limit: number;
  windowSeconds: number;
}) {
  return consumeRateLimit({
    scope: input.scope,
    fingerprint: securityFingerprint(`${input.identifier.toLowerCase().trim()}|${input.clientHint.slice(0, 500)}`),
    limit: input.limit,
    windowSeconds: input.windowSeconds
  });
}
