import { queryPostgres } from "@/lib/db/postgres";
import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";
import { listBusinessProfileAccounts, listBusinessProfileLocations, listBusinessProfileReviews } from "./client";

async function connectionId(tenantId: string) {
  const result = await queryPostgres<{ id: string }>(
    "select id from public.integration_connections where tenant_id=$1 and provider='google_business_profile' and status='connected' limit 1",
    [tenantId]
  );
  if (!result?.rows[0]?.id) throw new Error("Connect Google Business Profile first.");
  return result.rows[0].id;
}

export async function discoverBusinessProfileLocations(tenantId: string, fetchImpl: typeof fetch = fetch) {
  const connection = await connectionId(tenantId);
  const accessToken = await getFreshProviderAccessToken(tenantId, "google_business_profile", fetchImpl);
  const accounts = await listBusinessProfileAccounts(accessToken, fetchImpl);
  const locations = (await Promise.all(accounts.map((account) => listBusinessProfileLocations(account.name, accessToken, fetchImpl)))).flat();
  for (const location of locations) {
    await queryPostgres(
      `insert into public.business_profile_locations
       (tenant_id,connection_id,external_account_name,external_location_name,title,store_code,website_uri,primary_phone,address_text,primary_category,verification_state,metadata_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       on conflict (connection_id,external_account_name,external_location_name) do update set
       title=excluded.title,store_code=excluded.store_code,website_uri=excluded.website_uri,primary_phone=excluded.primary_phone,
       address_text=excluded.address_text,primary_category=excluded.primary_category,verification_state=excluded.verification_state,
       metadata_json=excluded.metadata_json,source_updated_at=now(),updated_at=now()`,
      [tenantId, connection, location.accountName, location.name, location.title, location.storeCode, location.websiteUri,
        location.primaryPhone, location.addressText, location.primaryCategory, location.verificationState, JSON.stringify(location.metadata)]
    );
  }
  await queryPostgres(
    `update public.integration_connections set metadata_json=metadata_json || $3::jsonb,last_checked_at=now(),updated_at=now()
     where tenant_id=$1 and provider='google_business_profile' and id=$2`,
    [tenantId, connection, JSON.stringify({ locationDiscoveryCount: locations.length, locationDiscoveryAt: new Date().toISOString() })]
  );
  return locations.length;
}

export async function selectBusinessProfileLocation(tenantId: string, locationId: string) {
  await queryPostgres("update public.business_profile_locations set selected=false,updated_at=now() where tenant_id=$1", [tenantId]);
  const result = await queryPostgres(
    "update public.business_profile_locations set selected=true,updated_at=now() where tenant_id=$1 and id=$2",
    [tenantId, locationId]
  );
  if (!result?.rowCount) throw new Error("That business location is not available in this workspace.");
}

export async function syncBusinessProfileReviews(tenantId: string, fetchImpl: typeof fetch = fetch) {
  const connection = await connectionId(tenantId);
  const locationResult = await queryPostgres<{ id: string; external_account_name: string; external_location_name: string }>(
    "select id,external_account_name,external_location_name from public.business_profile_locations where tenant_id=$1 and connection_id=$2 and selected=true limit 1",
    [tenantId, connection]
  );
  const location = locationResult?.rows[0];
  if (!location) throw new Error("Choose a Google Business Profile location first.");
  const accessToken = await getFreshProviderAccessToken(tenantId, "google_business_profile", fetchImpl);
  const reviews = await listBusinessProfileReviews(location.external_account_name, location.external_location_name, accessToken, fetchImpl);
  for (const review of reviews) {
    await queryPostgres(
      `insert into public.business_profile_reviews
       (tenant_id,connection_id,location_id,external_review_name,reviewer_name,star_rating,comment_text,review_created_at,review_updated_at,reply_comment,reply_updated_at,metadata_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11::timestamptz,$12::jsonb)
       on conflict (connection_id,external_review_name) do update set reviewer_name=excluded.reviewer_name,star_rating=excluded.star_rating,
       comment_text=excluded.comment_text,review_created_at=excluded.review_created_at,review_updated_at=excluded.review_updated_at,
       reply_comment=excluded.reply_comment,reply_updated_at=excluded.reply_updated_at,metadata_json=excluded.metadata_json,updated_at=now()`,
      [tenantId, connection, location.id, review.name, review.reviewerName, review.starRating, review.comment,
        review.createTime, review.updateTime, review.replyComment, review.replyUpdateTime, JSON.stringify(review.metadata)]
    );
  }
  await queryPostgres(
    `update public.integration_connections set metadata_json=metadata_json || $3::jsonb,last_checked_at=now(),updated_at=now()
     where tenant_id=$1 and id=$2`,
    [tenantId, connection, JSON.stringify({ reviewSyncCount: reviews.length, reviewSyncAt: new Date().toISOString(), reviewSyncMode: "read_only" })]
  );
  return reviews.length;
}
