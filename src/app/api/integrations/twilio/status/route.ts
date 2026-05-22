import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";

export async function POST(request: Request) {
  return integrationNotConfiguredResponse({
    provider: "twilio",
    request,
    requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]
  });
}
