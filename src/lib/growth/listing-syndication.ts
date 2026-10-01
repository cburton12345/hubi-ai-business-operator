import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";

export const listingSyndicationProviderKeys = [
  "zillow_network",
  "apartments_feed",
  "tenantcloud",
  "turbotenant"
] as const;

export type ListingSyndicationProviderKey = (typeof listingSyndicationProviderKeys)[number];

export type SyndicationListing = {
  id: string;
  title: string;
  description: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postalCode: string;
  rent: number;
  bedrooms?: number;
  bathrooms?: number;
  photos: string[];
  listingUrl: string;
  updatedAt?: string;
};

export function isListingSyndicationProvider(value: string): value is ListingSyndicationProviderKey {
  return listingSyndicationProviderKeys.includes(value as ListingSyndicationProviderKey);
}

export function listingReadinessIssues(listing: Partial<SyndicationListing>) {
  const issues: string[] = [];
  if (!listing.street?.trim()) issues.push("missing provider street address");
  if (!listing.city?.trim()) issues.push("missing provider city");
  if (!listing.state?.trim()) issues.push("missing provider state");
  if (!listing.postalCode?.trim()) issues.push("missing provider ZIP");
  if (!Number(listing.rent || 0)) issues.push("missing rent");
  if (!listing.description?.trim()) issues.push("missing description");
  if (!listing.photos?.length) issues.push("missing photos");
  if (!listing.listingUrl?.trim()) issues.push("missing renter route");
  return issues;
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesFeedToken(token: string, expectedHash: string) {
  const actual = Buffer.from(sha256Hex(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function provisionListingSyndicationFeed(input: {
  tenantId: string;
  providerKey: ListingSyndicationProviderKey;
  createdByUserId?: string;
  appOrigin: string;
}) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const result = await withPostgresTransaction(async (client) => {
    const connector = await client.query<{ id: string }>(
      `insert into public.listing_syndication_connectors
        (tenant_id,provider_key,status,mode,feed_enabled,feed_token_hash,feed_token_created_at,
         provider_approved,publish_allowed,settings_json,created_by_user_id)
       values ($1,$2,'ready_for_test','review',true,$3,now(),false,false,$4::jsonb,$5)
       on conflict (tenant_id,provider_key) do update set
         status='ready_for_test',mode='review',feed_enabled=true,feed_token_hash=excluded.feed_token_hash,
         feed_token_created_at=now(),provider_approved=false,publish_allowed=false,
         settings_json=public.listing_syndication_connectors.settings_json || excluded.settings_json,
         last_error=null,updated_at=now()
       returning id`,
      [input.tenantId, input.providerKey, tokenHash, JSON.stringify({ tokenVisibleOnce: true, providerApprovalRequired: true }), input.createdByUserId ?? null]
    );
    const connectorId = connector.rows[0].id;
    await client.query(
      `insert into public.listing_syndication_provider_actions
        (tenant_id,connector_id,action_type,status,approval_status,idempotency_key,request_json,created_by_user_id)
       values ($1,$2,'listing_feed_token_created','draft','needs_approval',$3,$4::jsonb,$5)`,
      [input.tenantId, connectorId, `listing-feed-token:${input.tenantId}:${input.providerKey}:${tokenHash}`,
        JSON.stringify({ providerKey: input.providerKey, providerApprovalRequired: true, publishAllowed: false }), input.createdByUserId ?? null]
    );
    return connectorId;
  });
  if (!result) throw new Error("listing_feed_token_provision_failed");
  const url = new URL(`/api/listing-syndication/${input.tenantId}/${input.providerKey}`, input.appOrigin);
  url.searchParams.set("token", token);
  return { connectorId: result, providerKey: input.providerKey, token, tokenVisibleOnce: true, feedUrl: url.toString(), publishAllowed: false };
}

export async function getListingSyndicationFeed(input: {
  tenantId: string;
  providerKey: ListingSyndicationProviderKey;
  token: string;
}) {
  const connectorResult = await queryPostgres<{
    id: string; feed_enabled: boolean; feed_token_hash: string; provider_approved: boolean; publish_allowed: boolean; status: string;
  }>(
    `select id,feed_enabled,feed_token_hash,provider_approved,publish_allowed,status
     from public.listing_syndication_connectors
     where tenant_id=$1 and provider_key=$2 limit 1`,
    [input.tenantId, input.providerKey]
  );
  const connector = connectorResult?.rows[0];
  if (!connector || !connector.feed_enabled || ["paused", "revoked"].includes(connector.status) || !matchesFeedToken(input.token, connector.feed_token_hash)) {
    return null;
  }

  const rows = await queryPostgres<{
    id: string; title: string; body: string; canonical_payload_json: Record<string, unknown>; updated_at: Date;
  }>(
    `select distinct p.id,p.title,p.body,p.canonical_payload_json,p.updated_at
     from public.distribution_publications p
     join public.distribution_destinations d on d.publication_id=p.id and d.tenant_id=p.tenant_id
     where p.tenant_id=$1 and p.publication_type='listing'
       and p.status in ('approved','scheduled','partially_published','published')
       and d.destination_key=$2 and d.status not in ('unsupported','canceled','removed')
     order by p.updated_at desc`,
    [input.tenantId, input.providerKey]
  );

  const included: SyndicationListing[] = [];
  const skipped: Array<{ id: string; title: string; issues: string[] }> = [];
  for (const row of rows?.rows ?? []) {
    const listing = normalizeCanonicalListing(row);
    const issues = listingReadinessIssues(listing);
    if (issues.length) skipped.push({ id: row.id, title: row.title, issues });
    else included.push(listing as SyndicationListing);
  }
  return {
    connectorId: connector.id,
    providerKey: input.providerKey,
    providerApproved: connector.provider_approved,
    publishAllowed: connector.provider_approved && connector.publish_allowed,
    included,
    skipped
  };
}

export function normalizeCanonicalListing(row: {
  id: string; title: string; body: string; canonical_payload_json?: Record<string, unknown> | null; updated_at?: Date | string;
}): Partial<SyndicationListing> & { id: string; title: string } {
  const payload = row.canonical_payload_json ?? {};
  const location = object(payload.location);
  const property = object(payload.property);
  const privateProvider = object(payload.privateProviderFields);
  const cta = object(payload.callToAction);
  const media = Array.isArray(payload.media) ? payload.media : [];
  const photos = media.map((item) => object(item)).filter((item) => item.kind === "image" && typeof item.url === "string").map((item) => String(item.url)).slice(0, 30);
  return {
    id: row.id,
    title: row.title,
    description: row.body,
    street: stringValue(privateProvider.street ?? property.street ?? location.street),
    unit: stringValue(privateProvider.unit ?? property.unit),
    city: stringValue(privateProvider.city ?? location.city),
    state: stringValue(privateProvider.state ?? location.region),
    postalCode: stringValue(privateProvider.postalCode ?? location.postalCode),
    rent: numberValue(property.rent ?? payload.rent),
    bedrooms: optionalNumber(property.bedrooms ?? payload.bedrooms),
    bathrooms: optionalNumber(property.bathrooms ?? payload.bathrooms),
    photos,
    listingUrl: stringValue(cta.url ?? payload.listingUrl),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
  };
}

export function buildListingSyndicationXml(input: { tenantId: string; providerKey: ListingSyndicationProviderKey; listings: SyndicationListing[]; skippedCount: number }) {
  const items = input.listings.map((listing) => `  <Listing>
    <ListingID>${xml(listing.id)}</ListingID>
    <Title>${xml(listing.title)}</Title>
    <ListingUrl>${xml(listing.listingUrl)}</ListingUrl>
    <DateUpdated>${xml(listing.updatedAt ?? new Date().toISOString())}</DateUpdated>
    <Address><StreetAddress>${xml(listing.street)}</StreetAddress>${listing.unit ? `<Unit>${xml(listing.unit)}</Unit>` : ""}<City>${xml(listing.city)}</City><State>${xml(listing.state)}</State><Zip>${xml(listing.postalCode)}</Zip><Country>USA</Country></Address>
    <RentalDetails><Price>${Math.round(listing.rent)}</Price><Beds>${listing.bedrooms ?? ""}</Beds><Baths>${listing.bathrooms ?? ""}</Baths><Availability>Available</Availability></RentalDetails>
    <Description>${xml(listing.description)}</Description>
    <Photos>${listing.photos.map((url) => `<Photo><Url>${xml(url)}</Url></Photo>`).join("")}</Photos>
  </Listing>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ListingsFeed><FeedMetadata><Provider>Ferocity</Provider><TenantID>${xml(input.tenantId)}</TenantID><TargetProvider>${xml(input.providerKey)}</TargetProvider><GeneratedAt>${new Date().toISOString()}</GeneratedAt><IncludedListingCount>${input.listings.length}</IncludedListingCount><SkippedListingCount>${input.skippedCount}</SkippedListingCount></FeedMetadata>\n${items}\n</ListingsFeed>`;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function optionalNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
function xml(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
