import { env } from "@/lib/env";

export type AdvertisingAccountCandidate = {
  id: string;
  name: string;
  kind: "ad_account" | "page" | "business";
  parentId?: string;
  status?: string;
  currency?: string;
};

export type AdvertisingAccountDiscovery = {
  status: "discovered" | "not_available" | "failed";
  accounts: AdvertisingAccountCandidate[];
  selectedAccountId: string | null;
  selectionRequired: boolean;
  message: string;
};

function result(accounts: AdvertisingAccountCandidate[], message: string): AdvertisingAccountDiscovery {
  const selectable = accounts.filter((account) => account.kind === "ad_account");
  return {
    status: accounts.length > 0 ? "discovered" : "not_available",
    accounts,
    selectedAccountId: selectable.length === 1 ? selectable[0]!.id : null,
    selectionRequired: selectable.length !== 1,
    message
  };
}

async function jsonRequest(url: string, accessToken: string, fetchImpl: typeof fetch, headers: Record<string, string> = {}) {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...headers },
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = body?.error;
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof body?.message === "string" ? body.message : "";
    throw new Error(message || `Account discovery returned HTTP ${response.status}.`);
  }
  return body ?? {};
}

async function discoverGoogleAds(accessToken: string, fetchImpl: typeof fetch) {
  const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return result([], "Google authorization is saved, but Ferocity's Google Ads developer token is not configured for account discovery.");
  }
  const body = await jsonRequest(
    "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
    accessToken,
    fetchImpl,
    { "developer-token": developerToken }
  );
  const resourceNames = Array.isArray(body.resourceNames) ? body.resourceNames : [];
  const accounts = resourceNames
    .map((value) => String(value).replace(/^customers\//, ""))
    .filter(Boolean)
    .map((id) => ({ id, name: `Google Ads ${id}`, kind: "ad_account" as const }));
  return result(accounts, accounts.length ? "Choose the Google Ads customer account Ferocity should use." : "No accessible Google Ads customer accounts were returned.");
}

async function discoverMeta(accessToken: string, fetchImpl: typeof fetch) {
  const [ads, pages] = await Promise.all([
    jsonRequest("https://graph.facebook.com/v25.0/me/adaccounts?fields=id,account_id,name,account_status,business&limit=200", accessToken, fetchImpl),
    jsonRequest("https://graph.facebook.com/v25.0/me/accounts?fields=id,name&limit=200", accessToken, fetchImpl)
  ]);
  const adRows = Array.isArray(ads.data) ? ads.data as Record<string, unknown>[] : [];
  const pageRows = Array.isArray(pages.data) ? pages.data as Record<string, unknown>[] : [];
  const accounts: AdvertisingAccountCandidate[] = [
    ...adRows.filter((row) => row.id).map((row) => ({
      id: String(row.account_id ?? row.id).replace(/^act_/, ""),
      name: String(row.name ?? row.account_id ?? row.id),
      kind: "ad_account" as const,
      status: row.account_status == null ? undefined : String(row.account_status),
      parentId: typeof row.business === "object" && row.business && "id" in row.business
        ? String((row.business as { id?: unknown }).id ?? "") || undefined
        : undefined
    })),
    ...pageRows.filter((row) => row.id).map((row) => ({ id: String(row.id), name: String(row.name ?? row.id), kind: "page" as const }))
  ];
  return result(accounts, adRows.length ? "Choose the Meta ad account and Page Ferocity should use." : "Meta authorization is saved; no accessible ad account was returned.");
}

async function discoverReddit(accessToken: string, fetchImpl: typeof fetch) {
  const businessesBody = await jsonRequest("https://ads-api.reddit.com/api/v3/me/businesses", accessToken, fetchImpl);
  const businesses = Array.isArray(businessesBody.data) ? businessesBody.data as Record<string, unknown>[] : [];
  const accounts: AdvertisingAccountCandidate[] = businesses
    .filter((business) => business.id)
    .map((business) => ({ id: String(business.id), name: String(business.name ?? business.id), kind: "business" as const }));
  for (const business of businesses) {
    if (!business.id) continue;
    const body = await jsonRequest(`https://ads-api.reddit.com/api/v3/businesses/${encodeURIComponent(String(business.id))}/ad_accounts`, accessToken, fetchImpl);
    const rows = Array.isArray(body.data) ? body.data as Record<string, unknown>[] : [];
    accounts.push(...rows.filter((row) => row.id).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.id),
      kind: "ad_account" as const,
      parentId: String(business.id),
      status: row.status == null ? undefined : String(row.status),
      currency: row.currency == null ? undefined : String(row.currency)
    })));
  }
  return result(accounts, accounts.some((account) => account.kind === "ad_account")
    ? "Choose the Reddit Ads account Ferocity should use."
    : "Reddit authorization is saved; no accessible Ads account was returned.");
}

async function discoverMicrosoftAds(accessToken: string, fetchImpl: typeof fetch) {
  const developerToken = env.MICROSOFT_ADS_DEVELOPER_TOKEN || process.env.MICROSOFT_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return result([], "Microsoft authorization is saved, but Ferocity's Microsoft Advertising developer token is not configured for account discovery.");
  }
  const headers = {
    authorization: `Bearer ${accessToken}`,
    developerToken,
    "content-type": "application/json",
    accept: "application/json"
  };
  const userResponse = await fetchImpl(
    "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/User/Query",
    { method: "POST", headers, body: JSON.stringify({ UserId: null }), cache: "no-store" }
  );
  const userBody = await userResponse.json().catch(() => null) as {
    User?: { Id?: string | number };
    CustomerRoles?: Array<{ CustomerId?: string | number; AccountIds?: Array<string | number>; LinkedAccountIds?: Array<string | number> }>;
    OperationErrors?: Array<{ Message?: string }>;
  } | null;
  if (!userResponse.ok || !userBody?.User?.Id) {
    throw new Error(userBody?.OperationErrors?.[0]?.Message || `Microsoft Advertising user discovery returned HTTP ${userResponse.status}.`);
  }

  const accountMap = new Map<string, AdvertisingAccountCandidate>();
  for (const role of userBody.CustomerRoles ?? []) {
    const customerId = role.CustomerId == null ? undefined : String(role.CustomerId);
    for (const accountId of [...(role.AccountIds ?? []), ...(role.LinkedAccountIds ?? [])]) {
      const id = String(accountId);
      accountMap.set(id, { id, name: `Microsoft Ads ${id}`, kind: "ad_account", parentId: customerId });
    }
  }

  const searchResponse = await fetchImpl(
    "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Search",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        Predicates: [{ Field: "UserId", Operator: "Equals", Value: String(userBody.User.Id) }],
        Ordering: [{ Field: "Id", Order: "Ascending" }],
        PageInfo: { Index: 0, Size: 1000 }
      }),
      cache: "no-store"
    }
  );
  const searchBody = await searchResponse.json().catch(() => null) as {
    Accounts?: Array<{ Id?: string | number; Name?: string; ParentCustomerId?: string | number; AccountLifeCycleStatus?: string; CurrencyType?: string }>;
    OperationErrors?: Array<{ Message?: string }>;
  } | null;
  if (!searchResponse.ok) {
    throw new Error(searchBody?.OperationErrors?.[0]?.Message || `Microsoft Advertising account search returned HTTP ${searchResponse.status}.`);
  }
  for (const row of searchBody?.Accounts ?? []) {
    if (row.Id == null) continue;
    const id = String(row.Id);
    accountMap.set(id, {
      id,
      name: row.Name || `Microsoft Ads ${id}`,
      kind: "ad_account",
      parentId: row.ParentCustomerId == null ? accountMap.get(id)?.parentId : String(row.ParentCustomerId),
      status: row.AccountLifeCycleStatus,
      currency: row.CurrencyType
    });
  }
  const accounts = Array.from(accountMap.values());
  return result(accounts, accounts.length ? "Choose the Microsoft Advertising account Ferocity should use." : "No accessible Microsoft Advertising accounts were returned.");
}

async function discoverLinkedIn(accessToken: string, fetchImpl: typeof fetch) {
  const body = await jsonRequest(
    "https://api.linkedin.com/rest/adAccountUsers?q=authenticatedUser&projection=(elements*(account~(id,name,status,currency)))",
    accessToken,
    fetchImpl,
    { "LinkedIn-Version": "202609", "X-Restli-Protocol-Version": "2.0.0" }
  );
  const rows = Array.isArray(body.elements) ? body.elements as Record<string, unknown>[] : [];
  const accounts = rows.map((row) => {
    const expanded = row["account~"] as Record<string, unknown> | undefined;
    const rawAccount = expanded?.id ?? row.account;
    const id = String(rawAccount ?? "").replace(/^urn:li:sponsoredAccount:/, "");
    return {
      id,
      name: String(expanded?.name ?? id),
      kind: "ad_account" as const,
      status: expanded?.status == null ? undefined : String(expanded.status),
      currency: expanded?.currency == null ? undefined : String(expanded.currency)
    };
  }).filter((account) => account.id);
  return result(accounts, accounts.length ? "Choose the LinkedIn Campaign Manager account Ferocity should use." : "No accessible LinkedIn ad accounts were returned.");
}

async function discoverPinterest(accessToken: string, fetchImpl: typeof fetch) {
  const body = await jsonRequest("https://api.pinterest.com/v5/ad_accounts?page_size=100&include_shared_accounts=true", accessToken, fetchImpl);
  const rows = Array.isArray(body.items) ? body.items as Record<string, unknown>[] : [];
  const accounts = rows.filter((row) => row.id).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.id),
    kind: "ad_account" as const,
    status: row.status == null ? undefined : String(row.status),
    currency: row.currency == null ? undefined : String(row.currency)
  }));
  return result(accounts, accounts.length ? "Choose the Pinterest ad account Ferocity should use." : "No accessible Pinterest ad accounts were returned.");
}

async function discoverSnapchat(accessToken: string, fetchImpl: typeof fetch) {
  const body = await jsonRequest("https://adsapi.snapchat.com/v1/me/organizations?with_ad_accounts=true", accessToken, fetchImpl);
  const wrappers = Array.isArray(body.organizations) ? body.organizations as Record<string, unknown>[] : [];
  const accounts: AdvertisingAccountCandidate[] = [];
  for (const wrapper of wrappers) {
    const organization = (wrapper.organization ?? wrapper) as Record<string, unknown>;
    if (organization.id) accounts.push({ id: String(organization.id), name: String(organization.name ?? organization.id), kind: "business" });
    const adWrappers = Array.isArray(organization.ad_accounts) ? organization.ad_accounts as Record<string, unknown>[] : [];
    for (const adWrapper of adWrappers) {
      const ad = (adWrapper.ad_account ?? adWrapper) as Record<string, unknown>;
      if (!ad.id) continue;
      accounts.push({
        id: String(ad.id),
        name: String(ad.name ?? ad.id),
        kind: "ad_account",
        parentId: organization.id == null ? undefined : String(organization.id),
        status: ad.status == null ? undefined : String(ad.status),
        currency: ad.currency == null ? undefined : String(ad.currency)
      });
    }
  }
  return result(accounts, accounts.some((account) => account.kind === "ad_account") ? "Choose the Snap ad account Ferocity should use." : "No accessible Snap ad accounts were returned.");
}

async function discoverAmazon(accessToken: string, fetchImpl: typeof fetch) {
  const clientId = env.AMAZON_ADS_CLIENT_ID || process.env.AMAZON_ADS_CLIENT_ID;
  if (!clientId) return result([], "Amazon authorization is saved, but Ferocity's Amazon Ads client ID is not configured for profile discovery.");
  const response = await fetchImpl("https://advertising-api.amazon.com/v2/profiles", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "Amazon-Advertising-API-ClientId": clientId,
      accept: "application/json"
    },
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as Record<string, unknown>[] | { message?: string } | null;
  if (!response.ok || !Array.isArray(body)) throw new Error(!Array.isArray(body) && body?.message ? body.message : `Amazon profile discovery returned HTTP ${response.status}.`);
  const accounts = body.filter((row) => row.profileId).map((row) => ({
    id: String(row.profileId),
    name: String((row.accountInfo as Record<string, unknown> | undefined)?.name ?? row.countryCode ?? row.profileId),
    kind: "ad_account" as const,
    currency: row.currencyCode == null ? undefined : String(row.currencyCode)
  }));
  return result(accounts, accounts.length ? "Choose the Amazon advertising profile Ferocity should use." : "No eligible Amazon advertising profiles were returned.");
}

export async function discoverAdvertisingAccounts(input: {
  provider: "google_ads" | "facebook" | "reddit" | "microsoft_ads" | "linkedin_ads" | "pinterest_ads" | "snapchat_ads" | "amazon_ads";
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<AdvertisingAccountDiscovery> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    if (input.provider === "google_ads") return await discoverGoogleAds(input.accessToken, fetchImpl);
    if (input.provider === "facebook") return await discoverMeta(input.accessToken, fetchImpl);
    if (input.provider === "reddit") return await discoverReddit(input.accessToken, fetchImpl);
    if (input.provider === "microsoft_ads") return await discoverMicrosoftAds(input.accessToken, fetchImpl);
    if (input.provider === "linkedin_ads") return await discoverLinkedIn(input.accessToken, fetchImpl);
    if (input.provider === "pinterest_ads") return await discoverPinterest(input.accessToken, fetchImpl);
    if (input.provider === "snapchat_ads") return await discoverSnapchat(input.accessToken, fetchImpl);
    if (input.provider === "amazon_ads") return await discoverAmazon(input.accessToken, fetchImpl);
    return result([], "No advertising account discovery adapter is registered for this provider.");
  } catch (error) {
    return {
      status: "failed",
      accounts: [],
      selectedAccountId: null,
      selectionRequired: true,
      message: error instanceof Error ? error.message : "Advertising account discovery failed."
    };
  }
}
