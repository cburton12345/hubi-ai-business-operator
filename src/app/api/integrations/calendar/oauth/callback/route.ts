import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";

export async function GET(request: Request) {
  return integrationNotConfiguredResponse({
    provider: "calendar",
    request,
    requiredEnv: ["CALENDAR_PROVIDER", "CALENDAR_CLIENT_ID", "CALENDAR_CLIENT_SECRET", "CALENDAR_OAUTH_REDIRECT_URI"]
  });
}
