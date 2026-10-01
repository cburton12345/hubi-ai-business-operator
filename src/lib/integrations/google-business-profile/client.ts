import type { BusinessProfileAccount, BusinessProfileLocation, BusinessProfileMetricPoint, BusinessProfileReview, BusinessProfileSearchQuery } from "./types";

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

async function apiMutation<T>(fetchImpl: typeof fetch, url: string, accessToken: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetchImpl(url, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  const parsed = response.status === 204 ? ({} as T) : await response.json().catch(() => null) as (T & ApiError) | null;
  if (!response.ok || parsed == null) throw new Error((parsed as ApiError | null)?.error?.message || `Google Business Profile returned HTTP ${response.status}.`);
  return parsed;
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
  const fields = "name,title,storeCode,languageCode,websiteUri,phoneNumbers,categories,storefrontAddress,regularHours,specialHours,serviceArea,openInfo,profile,moreHours,serviceItems,labels,metadata";
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
        languageCode?: string; regularHours?: Record<string, unknown>; specialHours?: Record<string, unknown>;
        serviceArea?: Record<string, unknown>; openInfo?: Record<string, unknown>; profile?: Record<string, unknown>;
        moreHours?: unknown[]; serviceItems?: unknown[]; labels?: string[];
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
        profile: {
          languageCode: location.languageCode ?? null,
          regularHours: location.regularHours ?? null,
          specialHours: location.specialHours ?? null,
          serviceArea: location.serviceArea ?? null,
          openInfo: location.openInfo ?? null,
          profile: location.profile ?? null,
          moreHours: location.moreHours ?? [],
          serviceItems: location.serviceItems ?? [],
          labels: location.labels ?? []
        },
        metadata: location.metadata ?? {}
      });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return locations;
}

export async function getBusinessProfileAttributes(locationName: string, accessToken: string, fetchImpl: typeof fetch = fetch) {
  const locationId = locationName.replace(/^locations\//, "");
  return apiJson<{ name?: string; attributes?: Array<Record<string, unknown>> }>(
    fetchImpl,
    `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${encodeURIComponent(locationId)}/attributes`,
    accessToken
  );
}

export async function getBusinessProfilePerformance(input: {
  locationName: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  metrics?: string[];
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const locationId = input.locationName.replace(/^locations\//, "");
  const metrics = input.metrics ?? [
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    "BUSINESS_DIRECTION_REQUESTS", "CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_BOOKINGS"
  ];
  const [startYear, startMonth, startDay] = input.startDate.split("-");
  const [endYear, endMonth, endDay] = input.endDate.split("-");
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/locations/${encodeURIComponent(locationId)}:fetchMultiDailyMetricsTimeSeries`);
  metrics.forEach((metric) => url.searchParams.append("dailyMetrics", metric));
  url.searchParams.set("dailyRange.startDate.year", startYear);
  url.searchParams.set("dailyRange.startDate.month", startMonth);
  url.searchParams.set("dailyRange.startDate.day", startDay);
  url.searchParams.set("dailyRange.endDate.year", endYear);
  url.searchParams.set("dailyRange.endDate.month", endMonth);
  url.searchParams.set("dailyRange.endDate.day", endDay);
  const body = await apiJson<{
    multiDailyMetricTimeSeries?: Array<{
      dailyMetricTimeSeries?: Array<{
        dailyMetric?: string;
        dailySubEntityType?: Record<string, unknown>;
        timeSeries?: { datedValues?: Array<{ date?: { year?: number; month?: number; day?: number }; value?: string | number }> };
      }>;
    }>;
  }>(fetchImpl, url.toString(), input.accessToken);
  return (body.multiDailyMetricTimeSeries ?? []).flatMap((group) => group.dailyMetricTimeSeries ?? []).flatMap<BusinessProfileMetricPoint>((series) =>
    (series.timeSeries?.datedValues ?? []).flatMap((point) => point.date && series.dailyMetric ? [{
      metric: series.dailyMetric,
      date: `${point.date.year}-${String(point.date.month).padStart(2, "0")}-${String(point.date.day).padStart(2, "0")}`,
      value: Number(point.value ?? 0),
      breakdown: series.dailySubEntityType ?? {}
    }] : [])
  );
}

export async function listBusinessProfileSearchQueries(input: {
  locationName: string;
  accessToken: string;
  startMonth: string;
  endMonth: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const locationId = input.locationName.replace(/^locations\//, "");
  const [startYear, startMonth] = input.startMonth.split("-");
  const [endYear, endMonth] = input.endMonth.split("-");
  let pageToken = "";
  const rows: BusinessProfileSearchQuery[] = [];
  do {
    const url = new URL(`https://businessprofileperformance.googleapis.com/v1/locations/${encodeURIComponent(locationId)}/searchkeywords/impressions/monthly`);
    url.searchParams.set("monthlyRange.startMonth.year", startYear);
    url.searchParams.set("monthlyRange.startMonth.month", startMonth);
    url.searchParams.set("monthlyRange.endMonth.year", endYear);
    url.searchParams.set("monthlyRange.endMonth.month", endMonth);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await apiJson<{
      searchKeywordsCounts?: Array<{ searchKeyword?: string; insightsValue?: { value?: string | number; threshold?: string | number } }>;
      nextPageToken?: string;
    }>(fetchImpl, url.toString(), input.accessToken);
    for (const item of body.searchKeywordsCounts ?? []) {
      if (!item.searchKeyword) continue;
      rows.push({
        query: item.searchKeyword,
        value: item.insightsValue?.value == null ? null : Number(item.insightsValue.value),
        threshold: item.insightsValue?.threshold == null ? null : Number(item.insightsValue.threshold)
      });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return rows;
}

const allowedLocationUpdateFields = new Set(["title", "phoneNumbers", "categories", "websiteUri", "regularHours", "specialHours", "serviceArea", "profile", "moreHours", "serviceItems"]);

export async function updateBusinessProfileLocation(input: {
  locationName: string;
  updateFields: string[];
  patch: Record<string, unknown>;
  accessToken: string;
  fetchImpl?: typeof fetch;
}) {
  if (!input.updateFields.length || input.updateFields.some((field) => !allowedLocationUpdateFields.has(field))) {
    throw new Error("Unsupported or empty Google Business Profile update mask.");
  }
  const locationId = input.locationName.replace(/^locations\//, "");
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/locations/${encodeURIComponent(locationId)}`);
  url.searchParams.set("updateMask", input.updateFields.join(","));
  return apiMutation<Record<string, unknown>>(input.fetchImpl ?? fetch, url.toString(), input.accessToken, "PATCH", { name: `locations/${locationId}`, ...input.patch });
}

export async function updateBusinessProfileReviewReply(input: {
  reviewName: string;
  comment: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}) {
  if (input.comment.trim().length < 2 || input.comment.length > 4_096) throw new Error("Review reply length is invalid.");
  return apiMutation<{ comment?: string; updateTime?: string }>(
    input.fetchImpl ?? fetch,
    `https://mybusiness.googleapis.com/v4/${input.reviewName.replace(/^\//, "")}/reply`,
    input.accessToken,
    "PUT",
    { comment: input.comment.trim() }
  );
}

export async function createBusinessProfileLocalPost(input: {
  accountName: string;
  locationName: string;
  payload: Record<string, unknown>;
  accessToken: string;
  fetchImpl?: typeof fetch;
}) {
  const accountId = input.accountName.replace(/^accounts\//, "");
  const locationId = input.locationName.replace(/^locations\//, "");
  return apiMutation<Record<string, unknown>>(
    input.fetchImpl ?? fetch,
    `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts`,
    input.accessToken,
    "POST",
    input.payload
  );
}

export async function listBusinessProfileMedia(
  accountName: string,
  locationName: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
) {
  const accountId = accountName.replace(/^accounts\//, "");
  const locationId = locationName.replace(/^locations\//, "");
  let pageToken = "";
  const media: Array<Record<string, unknown>> = [];
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/media`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await apiJson<{ mediaItems?: Array<Record<string, unknown>>; nextPageToken?: string }>(fetchImpl, url.toString(), accessToken);
    media.push(...(body.mediaItems ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return media;
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
