import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";

export async function POST(request: Request) {
  return integrationNotConfiguredResponse({
    provider: "stripe",
    request,
    requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
  });
}
