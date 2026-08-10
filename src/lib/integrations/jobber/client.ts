export const JOBBER_GRAPHQL_ENDPOINT = "https://api.getjobber.com/api/graphql";
export const JOBBER_GRAPHQL_VERSION = "2025-04-16";

type JobberGraphQLError = { message?: string; extensions?: { code?: string } };

export type JobberGraphQLResponse<T> = {
  data: T;
  cost: {
    requested: number | null;
    actual: number | null;
    currentlyAvailable: number | null;
    restoreRate: number | null;
  };
  version: string | null;
};

export async function queryJobberGraphQL<T>(input: {
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<JobberGraphQLResponse<T>> {
  const response = await (input.fetchImpl ?? fetch)(JOBBER_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
      "x-jobber-graphql-version": JOBBER_GRAPHQL_VERSION
    },
    body: JSON.stringify({ query: input.query, variables: input.variables ?? {} }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as {
    data?: T;
    errors?: JobberGraphQLError[];
    extensions?: {
      cost?: { requestedQueryCost?: number; actualQueryCost?: number; throttleStatus?: { currentlyAvailable?: number; restoreRate?: number } };
      versioning?: { version?: string };
    };
  } | null;
  if (!response.ok || !body?.data || body.errors?.length) {
    const first = body?.errors?.[0];
    const throttled = first?.extensions?.code === "THROTTLED" || response.status === 429;
    throw new Error(throttled ? "Jobber is temporarily rate-limiting this account. Ferocity will retry safely." : first?.message || `Jobber returned HTTP ${response.status}.`);
  }
  return {
    data: body.data,
    cost: {
      requested: body.extensions?.cost?.requestedQueryCost ?? null,
      actual: body.extensions?.cost?.actualQueryCost ?? null,
      currentlyAvailable: body.extensions?.cost?.throttleStatus?.currentlyAvailable ?? null,
      restoreRate: body.extensions?.cost?.throttleStatus?.restoreRate ?? null
    },
    version: body.extensions?.versioning?.version ?? null
  };
}
