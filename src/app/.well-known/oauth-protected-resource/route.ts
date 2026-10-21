import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    resource: "https://api.ferocity.live/mcp",
    authorization_servers: [],
    bearer_methods_supported: ["header"],
    scopes_supported: [
      "business:read", "customers:read", "jobs:read", "invoices:read",
      "commitments:read", "commitments:write", "workflows:read", "workflows:write",
    ],
    resource_documentation: "https://ferocity.live/app/integrations/external-ai",
    ferocity_oauth_status: "planned_authorization_code_pkce",
  }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
