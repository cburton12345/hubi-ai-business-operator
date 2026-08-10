import type { BusinessProfileAccount, BusinessProfileLocation, BusinessProfileReview } from "./types";

type ApiError = { error?: { message?: string } };

async function apiJson<T>(fetchImpl: typeof fetch, url: string, accessToken: string): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as (T & ApiError) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message || `Google Business Profile returned HTTP ${response.status}.`);
  return body;
}

function addressText(address: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string } | undefined) {
  if (!address) return null;
  return [...(address.addressLines ?? []), [address.locality, address.administrativeArea, address.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ") || null;
}

function stars(value: string | undefined) {
  const values: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return value ? values[value] ?? null : null;
}

export async function listBusinessProfileAccounts(accessToken: string, fetchImpl: typeof fetch = fetch) {
  const body = await apiJson<{ accounts?: Array<{ name?: string; accountName?: string }> }>(
    fetchImpl, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts", accessToken
  );
  return (body.accounts ?? []).flatMap<BusinessProfileAccount>((account) => account.name
    ? [{ name: account.name, accountName: account.accountName || "Google Business Profile" }]
    : []);
}

export async function listBusinessProfileLocations(accountName: string, accessToken: string, fetchImpl: typeof fetch = fetch) {
  const fields = "name,title,storeCode,websiteUri,phoneNumbers,categories,storefrontAddress,metadata";
  let pageToken = "";
  const locations: BusinessProfileLocation[] = [];
  do {
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
    url.searchParams.set("readMask", fields);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await apiJson<{
      locations?: Array<{
        name?: string; title?: string; storeCode?: string; websiteUri?: string;
        phoneNumbers?: { primaryPhone?: string };
        categories?: { primaryCategory?: { displayName?: string } };
        storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
        metadata?: Record<string, unknown> & { hasVoiceOfMerchant?: boolean };
      }>;
      nextPageToken?: string;
    }>(fetchImpl, url.toString(), accessToken);
    for (const location of body.locations ?? []) {
      if (!location.name || !location.title) continue;
      locations.push({
        accountName, name: location.name, title: location.title, storeCode: location.storeCode ?? null,
        websiteUri: location.websiteUri ?? null, primaryPhone: location.phoneNumbers?.primaryPhone ?? null,
        addressText: addressText(location.storefrontAddress), primaryCategory: location.categories?.primaryCategory?.displayName ?? null,
        verificationState: location.metadata?.hasVoiceOfMerchant === true ? "verified" : "unknown",
        metadata: location.metadata ?? {}
      });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return locations;
}

export async function listBusinessProfileReviews(accountName: string, locationName: string, accessToken: string, fetchImpl: typeof fetch = fetch) {
  const accountId = accountName.replace(/^accounts\//, "");
  const locationId = locationName.replace(/^locations\//, "");
  let pageToken = "";
  const reviews: BusinessProfileReview[] = [];
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await apiJson<{
      reviews?: Array<{
        name?: string; reviewer?: { displayName?: string }; starRating?: string; comment?: string;
        createTime?: string; updateTime?: string; reviewReply?: { comment?: string; updateTime?: string };
      }>;
      nextPageToken?: string;
    }>(fetchImpl, url.toString(), accessToken);
    for (const review of body.reviews ?? []) {
      if (!review.name) continue;
      reviews.push({
        name: review.name, reviewerName: review.reviewer?.displayName ?? null, starRating: stars(review.starRating),
        comment: review.comment ?? null, createTime: review.createTime ?? null, updateTime: review.updateTime ?? null,
        replyComment: review.reviewReply?.comment ?? null, replyUpdateTime: review.reviewReply?.updateTime ?? null,
        metadata: {}
      });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return reviews;
}
