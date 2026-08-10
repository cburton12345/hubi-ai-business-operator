export type GoogleReportingResource = {
  externalId: string;
  displayName: string;
  resourceType: "search_console_site" | "ga4_property";
  metadata: Record<string, unknown>;
};

async function readJson(response: Response, label: string) {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = body?.error as { message?: string } | undefined;
    throw new Error(error?.message || `${label} returned HTTP ${response.status}.`);
  }
  return body ?? {};
}

export async function listSearchConsoleSites(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GoogleReportingResource[]> {
  const response = await fetchImpl("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const body = await readJson(response, "Search Console");
  const entries = Array.isArray(body.siteEntry) ? body.siteEntry as Array<{ siteUrl?: string; permissionLevel?: string }> : [];
  return entries.filter((entry) => entry.siteUrl).map((entry) => ({
    externalId: entry.siteUrl!,
    displayName: entry.siteUrl!,
    resourceType: "search_console_site",
    metadata: { permissionLevel: entry.permissionLevel ?? null }
  }));
}

export async function listGa4Properties(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GoogleReportingResource[]> {
  const response = await fetchImpl("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const body = await readJson(response, "Google Analytics");
  const accounts = Array.isArray(body.accountSummaries) ? body.accountSummaries as Array<{
    account?: string;
    displayName?: string;
    propertySummaries?: Array<{ property?: string; displayName?: string; propertyType?: string }>;
  }> : [];
  return accounts.flatMap((account) => (account.propertySummaries ?? []).filter((property) => property.property).map((property) => ({
    externalId: property.property!,
    displayName: property.displayName || property.property!,
    resourceType: "ga4_property" as const,
    metadata: { account: account.account ?? null, accountName: account.displayName ?? null, propertyType: property.propertyType ?? null }
  })));
}

export async function readSearchConsoleDaily(input: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await (input.fetchImpl ?? fetch)(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate: input.startDate, endDate: input.endDate, dimensions: ["date"], rowLimit: 25000 }),
      cache: "no-store"
    }
  );
  const body = await readJson(response, "Search Console reporting");
  const rows = Array.isArray(body.rows) ? body.rows as Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> : [];
  return rows.filter((row) => row.keys?.[0]).map((row) => ({
    date: row.keys![0],
    metrics: { clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? 0, averagePosition: row.position ?? 0 }
  }));
}

export async function readGa4Daily(input: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  fetchImpl?: typeof fetch;
}) {
  const property = input.propertyId.startsWith("properties/") ? input.propertyId : `properties/${input.propertyId}`;
  const response = await (input.fetchImpl ?? fetch)(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" }, { name: "conversions" }]
    }),
    cache: "no-store"
  });
  const body = await readJson(response, "Google Analytics reporting");
  const rows = Array.isArray(body.rows) ? body.rows as Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }> : [];
  return rows.map((row) => {
    const rawDate = row.dimensionValues?.[0]?.value ?? "";
    const date = rawDate.length === 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    const values = row.metricValues ?? [];
    return { date, metrics: { sessions: Number(values[0]?.value ?? 0), users: Number(values[1]?.value ?? 0), newUsers: Number(values[2]?.value ?? 0), conversions: Number(values[3]?.value ?? 0) } };
  }).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
}
