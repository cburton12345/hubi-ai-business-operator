import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  importMarketplaceProLead,
  marketplaceProEventSchema,
  marketplaceProLeadSchema,
  marketplaceProStatusSchema,
  recordMarketplaceProEvent,
  updateMarketplaceProLeadStatus,
} from "@/lib/integrations/marketplacepro";
import type {
  MarketplaceProDeliveryConnection,
  MarketplaceProDeliveryKind,
} from "@/lib/integrations/marketplacepro-delivery";
import {
  executeMarketplaceProLegacyDelivery,
  findMarketplaceProLegacyConnections,
  type MarketplaceProQuery,
} from "@/lib/integrations/marketplacepro-delivery-store";
import { prepareMarketplaceProHttpRequest } from "@/lib/integrations/marketplacepro-http";
import { hasRotatingSecret, timingSafeSecretMatch } from "@/lib/security/rotating-secret";

type MarketplaceProLegacyDependencies = {
  prepare: typeof prepareMarketplaceProHttpRequest;
  findConnections: (sourceAccountId: string) => Promise<MarketplaceProDeliveryConnection[]>;
  execute: (
    connection: MarketplaceProDeliveryConnection,
    apply: (query: MarketplaceProQuery) => Promise<Record<string, unknown>>,
  ) => ReturnType<typeof executeMarketplaceProLegacyDelivery>;
  primarySecret?: string | null;
  previousSecret?: string | null;
  now: () => Date;
};

const defaultDependencies: MarketplaceProLegacyDependencies = {
  prepare: prepareMarketplaceProHttpRequest,
  findConnections: findMarketplaceProLegacyConnections,
  execute: executeMarketplaceProLegacyDelivery,
  primarySecret: env.MARKETPLACEPRO_WEBHOOK_SECRET,
  previousSecret: env.MARKETPLACEPRO_WEBHOOK_SECRET_PREVIOUS,
  now: () => new Date(),
};

function legacyTokenIsValid(
  request: Request,
  primarySecret: string | null | undefined,
  previousSecret: string | null | undefined,
) {
  const configured = hasRotatingSecret(
    primarySecret,
    previousSecret,
  );
  if (!configured) return false;
  const signature = request.headers.get("x-marketplacepro-signature")?.trim();
  const token = request.headers.get("x-marketplacepro-token")?.trim();
  return timingSafeSecretMatch(
    signature,
    primarySecret,
    previousSecret,
  ) || timingSafeSecretMatch(
    token,
    primarySecret,
    previousSecret,
  );
}

function failure(status: number, code: string, error: string) {
  return { ok: false as const, status, code, error };
}

export async function receiveMarketplaceProLegacyDelivery(
  request: NextRequest,
  expectedKind: MarketplaceProDeliveryKind,
  dependencies: MarketplaceProLegacyDependencies = defaultDependencies,
) {
  const prepared = await dependencies.prepare(request, `legacy:${expectedKind}`);
  if (!prepared.ok) return prepared;
  if (!legacyTokenIsValid(request, dependencies.primarySecret, dependencies.previousSecret)) {
    return failure(401, "authentication_failed", "MarketplacePro authentication failed.");
  }

  let value: unknown;
  try {
    value = JSON.parse(prepared.rawBody);
  } catch {
    return failure(400, "invalid_json", "Invalid JSON body.");
  }

  const schema = expectedKind === "event"
    ? marketplaceProEventSchema
    : expectedKind === "lead"
      ? marketplaceProLeadSchema
      : marketplaceProStatusSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success || !parsed.data.marketplaceAccountId) {
    return failure(400, "invalid_payload", "A valid payload with marketplaceAccountId is required.");
  }

  try {
    const matches = await dependencies.findConnections(parsed.data.marketplaceAccountId);
    if (matches.length !== 1) {
      return failure(409, "connection_unavailable", "MarketplacePro connection is unavailable.");
    }
    const connection = matches[0];
    if (
      connection.connectionStatus !== "connected" ||
      connection.syncStatus !== "ready" ||
      connection.profileMode !== "ferocity_connected" ||
      !connection.brandId
    ) {
      return failure(409, "connection_unavailable", "MarketplacePro connection is unavailable.");
    }

    const occurredAt = expectedKind === "lead" && "submittedAt" in parsed.data && parsed.data.submittedAt
      ? parsed.data.submittedAt
      : dependencies.now().toISOString();
    const execution = await dependencies.execute(connection, async (query) => {
      const context = { connection, query, occurredAt };
      if (expectedKind === "event") {
        return recordMarketplaceProEvent(marketplaceProEventSchema.parse(parsed.data), context);
      }
      if (expectedKind === "lead") {
        const result = await importMarketplaceProLead(marketplaceProLeadSchema.parse(parsed.data), context);
        if (!result.ok) throw new Error(result.error ?? "MarketplacePro lead import failed.");
        return result;
      }
      return updateMarketplaceProLeadStatus(marketplaceProStatusSchema.parse(parsed.data), context);
    });
    if (!execution.ok) {
      return failure(409, execution.code, "MarketplacePro connection changed or delivery failed.");
    }
    return {
      ...execution.result,
      ok: true as const,
      status: typeof execution.result.status === "number" ? execution.result.status : 200,
    };
  } catch {
    return failure(503, "temporarily_unavailable", "MarketplacePro delivery is temporarily unavailable.");
  }
}
