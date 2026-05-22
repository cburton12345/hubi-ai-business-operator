import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";

export async function GET(request: Request) {
  return integrationNotConfiguredResponse({
    provider: "google",
    request,
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"]
  });
}
