"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { publicationTypes, distributionDestinations, type DestinationReadiness } from "@/lib/growth/canonical-distribution";
import { createDistribution } from "@/lib/growth/distribution-service";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  publicationType: z.enum(publicationTypes),
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(10).max(50_000),
  ctaLabel: z.string().trim().max(80).optional(),
  ctaUrl: z.string().trim().url().max(2_000).optional().or(z.literal("")),
  publishAt: z.string().optional(),
  totalBudgetDollars: z.coerce.number().min(0).max(10_000_000).optional(),
  explicitSpendApproved: z.boolean(),
  publishEverywhere: z.boolean(),
  destinations: z.array(z.string()).max(50)
});

export async function createCanonicalDistributionAction(formData: FormData) {
  await requirePermission("ai:queue");
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (!session) throw new Error("Sign in is required.");

  const parsed = schema.parse({
    publicationType: formData.get("publicationType"),
    title: formData.get("title"),
    body: formData.get("body"),
    ctaLabel: formData.get("ctaLabel") || undefined,
    ctaUrl: formData.get("ctaUrl") || undefined,
    publishAt: formData.get("publishAt") || undefined,
    totalBudgetDollars: formData.get("totalBudgetDollars") || undefined,
    explicitSpendApproved: formData.get("explicitSpendApproved") === "on",
    publishEverywhere: formData.get("publishEverywhere") === "on",
    destinations: formData.getAll("destinations").map(String)
  });
  if (!parsed.publishEverywhere && parsed.destinations.length === 0) throw new Error("Choose at least one destination.");

  const brand = await queryPostgres<{ id: string }>(
    `select id from public.brands where tenant_id=$1 and status='active' order by created_at asc limit 1`,
    [tenantId]
  );
  const brandId = brand?.rows[0]?.id;
  if (!brandId) throw new Error("Create an active brand before preparing distribution.");

  const providers = [...new Set(Object.values(distributionDestinations).map((destination) => destination.providerKey))];
  const [lanes, listingConnectors] = await Promise.all([queryPostgres<{
    provider_key: string;
    connection_status: string;
    credentials_status: string;
    live_actions_enabled: boolean;
  }>(
    `select distinct on (provider_key) provider_key, connection_status, credentials_status, live_actions_enabled
     from public.provider_connection_lanes
     where tenant_id=$1 and provider_key = any($2::text[])
     order by provider_key, live_actions_enabled desc, connection_status='connected' desc`,
    [tenantId, providers]
  ), queryPostgres<{
    provider_key: string;
    status: string;
    feed_enabled: boolean;
    provider_approved: boolean;
    publish_allowed: boolean;
  }>(
    `select provider_key,status,feed_enabled,provider_approved,publish_allowed
     from public.listing_syndication_connectors
     where tenant_id=$1 and status not in ('revoked','blocked')`,
    [tenantId]
  )]);
  const readinessByProvider = new Map((lanes?.rows ?? []).map((lane) => [lane.provider_key, lane]));
  const listingReadinessByProvider = new Map((listingConnectors?.rows ?? []).map((connector) => [connector.provider_key, connector]));
  const readiness: Record<string, DestinationReadiness> = {};
  for (const [key, destination] of Object.entries(distributionDestinations)) {
    if (destination.providerKey === "manual") {
      readiness[key] = { connected: false, liveActionsEnabled: false, credentialsStatus: "not_required", connectionStatus: "available" };
      continue;
    }
    const listingConnector = listingReadinessByProvider.get(destination.providerKey);
    if (listingConnector) {
      readiness[key] = {
        connected: listingConnector.feed_enabled,
        liveActionsEnabled: listingConnector.provider_approved && listingConnector.publish_allowed,
        credentialsStatus: listingConnector.feed_enabled ? "configured" : "missing",
        connectionStatus: listingConnector.status
      };
      continue;
    }
    const lane = readinessByProvider.get(destination.providerKey);
    readiness[key] = {
      connected: lane?.connection_status === "connected" || lane?.connection_status === "available",
      liveActionsEnabled: lane?.live_actions_enabled ?? false,
      credentialsStatus: lane?.credentials_status,
      connectionStatus: lane?.connection_status
    };
  }

  await createDistribution({
    tenantId,
    brandId,
    createdByUserId: session.userId,
    publication: {
      type: parsed.publicationType,
      title: parsed.title,
      body: parsed.body,
      callToAction: parsed.ctaUrl ? { label: parsed.ctaLabel || "Learn more", url: parsed.ctaUrl } : undefined,
      budget: parsed.totalBudgetDollars != null && parsed.totalBudgetDollars > 0
        ? { totalCents: Math.round(parsed.totalBudgetDollars * 100), currency: "USD" }
        : undefined,
      schedule: parsed.publishAt ? { publishAt: new Date(parsed.publishAt).toISOString() } : undefined,
      approvalMode: "approval_required"
    },
    destinationKeys: parsed.publishEverywhere ? "all" : parsed.destinations,
    readiness,
    explicitSpendApproved: parsed.explicitSpendApproved
  });

  revalidatePath("/app/publishing-hub");
}
