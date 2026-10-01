import crypto from "node:crypto";

type OAuth1Credentials = {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
};

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function createOAuth1Authorization(input: {
  method: "GET" | "POST";
  url: string;
  credentials: OAuth1Credentials;
  oauthExtras?: Record<string, string>;
  query?: Record<string, string>;
  nonce?: string;
  timestamp?: string;
}) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: input.credentials.consumerKey,
    oauth_nonce: input.nonce ?? crypto.randomBytes(18).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: input.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...(input.credentials.token ? { oauth_token: input.credentials.token } : {}),
    ...(input.oauthExtras ?? {})
  };
  const url = new URL(input.url);
  const params = [
    ...Array.from(url.searchParams.entries()),
    ...Object.entries(input.query ?? {}),
    ...Object.entries(oauth)
  ].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = encode(leftKey).localeCompare(encode(rightKey));
    return keyOrder || encode(leftValue).localeCompare(encode(rightValue));
  });
  const normalized = params.map(([key, value]) => `${encode(key)}=${encode(value)}`).join("&");
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
  const signatureBase = `${input.method}&${encode(baseUrl)}&${encode(normalized)}`;
  const signingKey = `${encode(input.credentials.consumerSecret)}&${encode(input.credentials.tokenSecret ?? "")}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  return `OAuth ${Object.entries(oauth).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}

function parseFormResponse(value: string) {
  return Object.fromEntries(new URLSearchParams(value).entries());
}

async function formRequest(input: {
  url: string;
  credentials: OAuth1Credentials;
  oauthExtras: Record<string, string>;
  fetchImpl?: typeof fetch;
}) {
  const authorization = createOAuth1Authorization({ method: "POST", url: input.url, credentials: input.credentials, oauthExtras: input.oauthExtras });
  const response = await (input.fetchImpl ?? fetch)(input.url, {
    method: "POST",
    headers: { authorization, "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store"
  });
  const text = await response.text();
  const body = parseFormResponse(text);
  if (!response.ok) throw new Error(body.oauth_problem || body.error || `X OAuth returned HTTP ${response.status}.`);
  return body;
}

export async function requestXOAuthToken(input: {
  consumerKey: string;
  consumerSecret: string;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const body = await formRequest({
    url: "https://api.x.com/oauth/request_token",
    credentials: { consumerKey: input.consumerKey, consumerSecret: input.consumerSecret },
    oauthExtras: { oauth_callback: input.callbackUrl },
    fetchImpl: input.fetchImpl
  });
  if (!body.oauth_token || !body.oauth_token_secret) throw new Error("X did not return a request token.");
  return { token: body.oauth_token, tokenSecret: body.oauth_token_secret };
}

export async function exchangeXOAuthToken(input: {
  consumerKey: string;
  consumerSecret: string;
  requestToken: string;
  requestTokenSecret: string;
  verifier: string;
  fetchImpl?: typeof fetch;
}) {
  const body = await formRequest({
    url: "https://api.x.com/oauth/access_token",
    credentials: {
      consumerKey: input.consumerKey,
      consumerSecret: input.consumerSecret,
      token: input.requestToken,
      tokenSecret: input.requestTokenSecret
    },
    oauthExtras: { oauth_verifier: input.verifier },
    fetchImpl: input.fetchImpl
  });
  if (!body.oauth_token || !body.oauth_token_secret) throw new Error("X did not return an access token.");
  return {
    accessToken: body.oauth_token,
    accessTokenSecret: body.oauth_token_secret,
    userId: body.user_id ?? null,
    screenName: body.screen_name ?? null
  };
}

export async function discoverXAdAccounts(input: {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  fetchImpl?: typeof fetch;
}) {
  const url = "https://ads-api.x.com/12/accounts?with_deleted=false";
  const authorization = createOAuth1Authorization({
    method: "GET",
    url,
    credentials: {
      consumerKey: input.consumerKey,
      consumerSecret: input.consumerSecret,
      token: input.accessToken,
      tokenSecret: input.accessTokenSecret
    }
  });
  const response = await (input.fetchImpl ?? fetch)(url, { headers: { authorization, accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => null) as { data?: Array<Record<string, unknown>>; errors?: Array<{ message?: string }> } | null;
  if (!response.ok) throw new Error(body?.errors?.[0]?.message || `X Ads account discovery returned HTTP ${response.status}.`);
  return (body?.data ?? []).filter((row) => row.id).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.id),
    kind: "ad_account" as const,
    status: row.approval_status == null ? undefined : String(row.approval_status),
    currency: row.currency == null ? undefined : String(row.currency)
  }));
}
