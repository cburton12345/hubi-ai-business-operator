import type { NextRequest } from "next/server";
import {
  importMarketplaceProLead,
  marketplaceProEventSchema,
  marketplaceProLeadSchema,
  marketplaceProStatusSchema,
  recordMarketplaceProEvent,
  updateMarketplaceProLeadStatus,
} from "@/lib/integrations/marketplacepro";
import {
  receiveMarketplaceProDelivery,
  type MarketplaceProDeliveryEnvelope,
  type MarketplaceProDeliveryKind,
} from "@/lib/integrations/marketplacepro-delivery";
import {
  executeMarketplaceProDeliveryOnce,
  findMarketplaceProDeliveryConnections,
  getMarketplaceProDeliverySigningCredential,
  type MarketplaceProQuery,
} from "@/lib/integrations/marketplacepro-delivery-store";
import { prepareMarketplaceProHttpRequest } from "@/lib/integrations/marketplacepro-http";

function payloadIsValid(envelope: MarketplaceProDeliveryEnvelope) {
  if (envelope.kind === "event") return marketplaceProEventSchema.safeParse(envelope.payload).success;
  if (envelope.kind === "lead") return marketplaceProLeadSchema.safeParse(envelope.payload).success;
  return marketplaceProStatusSchema.safeParse(envelope.payload).success;
}

async function applyMarketplaceProPayload(
  envelope: MarketplaceProDeliveryEnvelope,
  connection: Awaited<ReturnType<typeof findMarketplaceProDeliveryConnections>>[number],
  query: MarketplaceProQuery,
) {
  const context = {
    connection,
    query,
    deliveryId: envelope.deliveryId,
    occurredAt: envelope.occurredAt,
  };
  if (envelope.kind === "event") {
    const input = marketplaceProEventSchema.parse(envelope.payload);
    if (input.marketplaceAccountId && input.marketplaceAccountId !== envelope.source.accountId) {
      throw new Error("MarketplacePro payload account does not match the authenticated source account.");
    }
    return recordMarketplaceProEvent(input, context);
  }
  if (envelope.kind === "lead") {
    const input = marketplaceProLeadSchema.parse(envelope.payload);
    if (input.marketplaceAccountId && input.marketplaceAccountId !== envelope.source.accountId) {
      throw new Error("MarketplacePro payload account does not match the authenticated source account.");
    }
    const result = await importMarketplaceProLead(input, context);
    if (!result.ok) throw new Error(result.error ?? "MarketplacePro lead import failed.");
    return result;
  }
  const input = marketplaceProStatusSchema.parse(envelope.payload);
  if (input.marketplaceAccountId && input.marketplaceAccountId !== envelope.source.accountId) {
    throw new Error("MarketplacePro payload account does not match the authenticated source account.");
  }
  return updateMarketplaceProLeadStatus(input, context);
}

export async function receiveMarketplaceProHttpDelivery(request: NextRequest, expectedKind: MarketplaceProDeliveryKind) {
  const prepared = await prepareMarketplaceProHttpRequest(request, `v1:${expectedKind}`);
  if (!prepared.ok) return prepared;

  try {
    return await receiveMarketplaceProDelivery(
      { rawBody: prepared.rawBody, headers: request.headers, expectedKind },
      {
        now: Date.now,
        findConnections: findMarketplaceProDeliveryConnections,
        getSigningCredential: getMarketplaceProDeliverySigningCredential,
        validate: payloadIsValid,
        executeOnce: (input) => executeMarketplaceProDeliveryOnce(input, async (query) => {
          return applyMarketplaceProPayload(input.envelope, input.connection, query);
        }),
        // The SQL-backed executeOnce adapter performs the domain apply inside
        // the same transaction. This callback is only used by isolated tests.
        apply: async () => {
          throw new Error("MarketplacePro delivery apply callback was not bound.");
        },
      },
    );
  } catch {
    return {
      ok: false as const,
      status: 503,
      code: "temporarily_unavailable",
      error: "MarketplacePro delivery is temporarily unavailable.",
    };
  }
}
