import crypto from "node:crypto";
import { z } from "zod";

export const MARKETPLACEPRO_DELIVERY_VERSION = "2026-10-22.v1";
export const MARKETPLACEPRO_DELIVERY_MAX_AGE_MS = 5 * 60_000;
export const MARKETPLACEPRO_EVENT_MAX_AGE_MS = 90 * 24 * 60 * 60_000;
export const MARKETPLACEPRO_EVENT_MAX_FUTURE_MS = 5 * 60_000;
export const MARKETPLACEPRO_MAX_REQUEST_BYTES = 128 * 1024;

const marketplaceProDeliveryEnvelopeSchema = z.object({
  version: z.literal(MARKETPLACEPRO_DELIVERY_VERSION),
  deliveryId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
  source: z.object({
    accountId: z.string().trim().min(1).max(200),
  }).strict(),
  occurredAt: z.string().datetime({ offset: true }),
  kind: z.enum(["event", "lead", "lead_status"]),
  payload: z.unknown(),
}).strict();

export type MarketplaceProDeliveryEnvelope = z.infer<typeof marketplaceProDeliveryEnvelopeSchema>;
export type MarketplaceProDeliveryKind = MarketplaceProDeliveryEnvelope["kind"];

export type MarketplaceProDeliveryConnection = {
  id: string;
  tenantId: string;
  brandId: string | null;
  sourceAccountId: string;
  profileMode: string;
  connectionStatus: string;
  syncStatus: string;
  pilotEnabled: boolean;
  contractVersion: string;
  credentialLabel: string;
};

export type MarketplaceProDeliveryExecution =
  | { state: "processed"; result: Record<string, unknown> }
  | { state: "replayed"; result: Record<string, unknown> }
  | { state: "in_progress" }
  | { state: "conflict" }
  | { state: "authorization_changed" }
  | { state: "failed"; retryable: boolean };

export type MarketplaceProDeliverySigningCredential = {
  id: string;
  secret: string;
  updatedAt: string;
};

export type MarketplaceProDeliveryDependencies = {
  now: () => number;
  findConnections: (sourceAccountId: string) => Promise<MarketplaceProDeliveryConnection[]>;
  getSigningCredential: (
    connection: MarketplaceProDeliveryConnection,
    credentialLabel: string,
  ) => Promise<MarketplaceProDeliverySigningCredential | null>;
  executeOnce: (
    input: {
      connection: MarketplaceProDeliveryConnection;
      envelope: MarketplaceProDeliveryEnvelope;
      payloadDigest: string;
      credentialLabel: string;
      credentialId: string;
      credentialUpdatedAt: string;
    },
    apply: () => Promise<Record<string, unknown>>,
  ) => Promise<MarketplaceProDeliveryExecution>;
  validate?: (envelope: MarketplaceProDeliveryEnvelope) => boolean;
  apply: (connection: MarketplaceProDeliveryConnection, envelope: MarketplaceProDeliveryEnvelope) => Promise<Record<string, unknown>>;
};

export type MarketplaceProDeliveryResponse = {
  ok: boolean;
  status: number;
  code: string;
  error?: string;
  contractVersion?: string;
  deliveryId?: string;
  kind?: MarketplaceProDeliveryKind;
  sourceAccountId?: string;
  payloadDigest?: string;
  result?: Record<string, unknown>;
};

type DeliveryHeaders = Pick<Headers, "get">;

export function marketplaceProPayloadDigest(rawBody: string) {
  return crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function marketplaceProSigningContent(input: {
  envelope: MarketplaceProDeliveryEnvelope;
  timestamp: string;
  payloadDigest: string;
}) {
  return [
    input.envelope.version,
    input.timestamp,
    input.envelope.deliveryId,
    input.envelope.source.accountId,
    input.payloadDigest,
  ].join("\n");
}

export function signMarketplaceProDelivery(input: {
  envelope: MarketplaceProDeliveryEnvelope;
  rawBody: string;
  timestamp: string;
  secret: string;
}) {
  const content = marketplaceProSigningContent({
    envelope: input.envelope,
    timestamp: input.timestamp,
    payloadDigest: marketplaceProPayloadDigest(input.rawBody),
  });
  return `v1=${crypto.createHmac("sha256", input.secret).update(content, "utf8").digest("hex")}`;
}

function signatureMatches(signature: string, expected: string) {
  const actualBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function failure(status: number, code: string, error: string): MarketplaceProDeliveryResponse {
  return { ok: false, status, code, error };
}

function terminalReceipt(
  code: "processed" | "replayed",
  envelope: MarketplaceProDeliveryEnvelope,
  payloadDigest: string,
  result: Record<string, unknown>,
): MarketplaceProDeliveryResponse {
  return {
    ok: true,
    status: 200,
    code,
    contractVersion: envelope.version,
    deliveryId: envelope.deliveryId,
    kind: envelope.kind,
    sourceAccountId: envelope.source.accountId,
    payloadDigest,
    result,
  };
}

export async function receiveMarketplaceProDelivery(
  input: {
    rawBody: string;
    headers: DeliveryHeaders;
    expectedKind: MarketplaceProDeliveryKind;
  },
  dependencies: MarketplaceProDeliveryDependencies,
): Promise<MarketplaceProDeliveryResponse> {
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return failure(400, "invalid_json", "Invalid JSON body.");
  }

  const parsed = marketplaceProDeliveryEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    return failure(400, "invalid_envelope", "Invalid MarketplacePro delivery envelope.");
  }
  const envelope = parsed.data;
  if (envelope.kind !== input.expectedKind) {
    return failure(400, "unexpected_delivery_kind", "The delivery kind does not match this endpoint.");
  }
  const occurredAt = Date.parse(envelope.occurredAt);
  if (
    !Number.isFinite(occurredAt) ||
    occurredAt < dependencies.now() - MARKETPLACEPRO_EVENT_MAX_AGE_MS ||
    occurredAt > dependencies.now() + MARKETPLACEPRO_EVENT_MAX_FUTURE_MS
  ) {
    return failure(400, "invalid_occurrence_time", "MarketplacePro occurrence time is outside the allowed window.");
  }

  const timestamp = input.headers.get("x-marketplacepro-timestamp")?.trim() ?? "";
  const timestampSeconds = Number(timestamp);
  if (!/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(timestampSeconds)) {
    return failure(401, "invalid_signature", "MarketplacePro signature is missing or invalid.");
  }
  if (Math.abs(dependencies.now() - timestampSeconds * 1000) > MARKETPLACEPRO_DELIVERY_MAX_AGE_MS) {
    return failure(401, "stale_signature", "MarketplacePro signature timestamp is outside the allowed window.");
  }

  const connections = await dependencies.findConnections(envelope.source.accountId);
  if (connections.length !== 1) {
    return failure(401, "authentication_failed", "MarketplacePro authentication failed.");
  }
  const connection = connections[0];
  const credential = await dependencies.getSigningCredential(connection, connection.credentialLabel);
  if (!credential) {
    return failure(401, "authentication_failed", "MarketplacePro authentication failed.");
  }

  const signature = input.headers.get("x-marketplacepro-signature")?.trim() ?? "";
  const payloadDigest = marketplaceProPayloadDigest(input.rawBody);
  const expectedSignature = signMarketplaceProDelivery({ envelope, rawBody: input.rawBody, timestamp, secret: credential.secret });
  if (!signatureMatches(signature, expectedSignature)) {
    return failure(401, "authentication_failed", "MarketplacePro authentication failed.");
  }

  if (connection.connectionStatus !== "connected" || connection.syncStatus !== "ready") {
    return failure(409, "connection_inactive", "The MarketplacePro connection is paused, revoked, or not ready.");
  }
  if (connection.profileMode !== "ferocity_connected" || !connection.brandId) {
    return failure(403, "connection_not_authorized", "This MarketplacePro connection is not authorized for owner-pilot delivery.");
  }
  if (!connection.pilotEnabled || connection.contractVersion !== MARKETPLACEPRO_DELIVERY_VERSION) {
    return failure(403, "owner_pilot_disabled", "MarketplacePro owner-pilot inbound delivery is disabled for this connection.");
  }
  if (dependencies.validate && !dependencies.validate(envelope)) {
    return failure(400, "invalid_payload", "Invalid MarketplacePro delivery payload.");
  }

  const execution = await dependencies.executeOnce(
    {
      connection,
      envelope,
      payloadDigest,
      credentialLabel: connection.credentialLabel,
      credentialId: credential.id,
      credentialUpdatedAt: credential.updatedAt,
    },
    () => dependencies.apply(connection, envelope),
  );
  if (execution.state === "processed") {
    return terminalReceipt("processed", envelope, payloadDigest, execution.result);
  }
  if (execution.state === "replayed") {
    return terminalReceipt("replayed", envelope, payloadDigest, execution.result);
  }
  if (execution.state === "in_progress") {
    return {
      ok: true,
      status: 202,
      code: "in_progress",
      contractVersion: envelope.version,
      deliveryId: envelope.deliveryId,
      kind: envelope.kind,
      sourceAccountId: envelope.source.accountId,
      payloadDigest,
    };
  }
  if (execution.state === "conflict") {
    return failure(409, "delivery_conflict", "The delivery ID was already used for different content.");
  }
  if (execution.state === "authorization_changed") {
    return failure(409, "authorization_changed", "MarketplacePro authorization changed before the delivery could be applied.");
  }
  return failure(500, "delivery_failed", execution.retryable
    ? "MarketplacePro delivery failed and may be retried with the same delivery ID."
    : "MarketplacePro delivery failed.");
}
