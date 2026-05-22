import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";

export async function POST(request: Request) {
  return integrationNotConfiguredResponse({
    provider: "reviews",
    request,
    requiredEnv: ["REVIEW_PROVIDER", "REVIEW_API_KEY"]
  });
}
