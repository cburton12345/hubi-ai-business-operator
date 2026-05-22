import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";

export async function GET(request: Request) {
  return integrationNotConfiguredResponse({
    provider: "meta",
    request,
    requiredEnv: ["META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI"]
  });
}
