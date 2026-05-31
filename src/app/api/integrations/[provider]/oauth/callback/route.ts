import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";
import type { env } from "@/lib/env";

type EnvKey = keyof typeof env;

const providerEnv: Record<string, EnvKey[]> = {
  reddit: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_OAUTH_REDIRECT_URI"],
  microsoft: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_OAUTH_REDIRECT_URI"],
  yahoo: ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_OAUTH_REDIRECT_URI"]
};

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const normalizedProvider = provider.toLowerCase();
  const requiredEnv = providerEnv[normalizedProvider];

  if (!requiredEnv) {
    return Response.json(
      {
        ok: false,
        status: "unsupported_provider",
        message: "This OAuth provider is not registered in Ferocity."
      },
      { status: 404 }
    );
  }

  return integrationNotConfiguredResponse({
    provider: normalizedProvider,
    request,
    requiredEnv
  });
}
