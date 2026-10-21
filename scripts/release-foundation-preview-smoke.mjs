const rawBase = process.env.FEROCITY_PREVIEW_BASE_URL ?? process.argv[2];
if (!rawBase) throw new Error("FEROCITY_PREVIEW_BASE_URL or a preview URL argument is required.");
const base = new URL(rawBase);
if (base.protocol !== "https:") throw new Error("Preview smoke requires HTTPS.");
if (["ferocity.live", "www.ferocity.live", "api.ferocity.live"].includes(base.hostname)) {
  throw new Error("Preview smoke refuses production hosts. Use an immutable Netlify deploy-preview URL.");
}

async function request(path, init = {}) {
  return fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
}

function expectStatus(response, allowed, label) {
  if (!allowed.includes(response.status)) {
    throw new Error(`${label}: expected ${allowed.join("/")}, received ${response.status}.`);
  }
  console.log(`- ${label}: ${response.status}`);
}

const health = await request("/health");
expectStatus(health, [200], "health");

for (const path of ["/app/onboarding", "/app/expenses", "/app/integrations/external-ai"]) {
  const response = await request(path);
  expectStatus(response, [302, 303, 307, 308], `${path} unauthenticated guard`);
  const location = response.headers.get("location") ?? "";
  if (!location.includes("/login")) throw new Error(`${path} did not redirect to login.`);
}

const documentImport = await request("/api/document-intelligence/import/email", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
expectStatus(documentImport, [400, 401, 403], "document ingestion authorization guard");

const mcpGet = await request("/mcp");
expectStatus(mcpGet, [405], "MCP method guard");
const mcpUnauthorized = await request("/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: "preview-smoke", method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ferocity-preview-smoke", version: "1" } } }),
});
expectStatus(mcpUnauthorized, [401, 421], "MCP host/authentication guard");
if (mcpUnauthorized.status === 401 && mcpUnauthorized.headers.get("cache-control") !== "no-store") {
  throw new Error("MCP unauthorized response must use Cache-Control: no-store.");
}

console.log(`Preview smoke passed for ${base.origin} without credentials or mutations.`);
