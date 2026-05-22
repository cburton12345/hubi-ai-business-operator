import { NextResponse } from "next/server";
import { missingEnvVars, type env } from "@/lib/env";
import { logAppError } from "@/lib/observability/log-error";

type EnvKey = keyof typeof env;

export async function integrationNotConfiguredResponse(input: {
  provider: string;
  requiredEnv: EnvKey[];
  request: Request;
  method?: string;
}) {
  const missing = missingEnvVars(input.requiredEnv);
  const url = new URL(input.request.url);

  await logAppError({
    source: `api.integrations.${input.provider}`,
    message: missing.length > 0 ? `${input.provider} integration called before credentials were configured.` : `${input.provider} integration endpoint is ready but handler is not enabled.`,
    severity: "info",
    metadata: {
      provider: input.provider,
      method: input.method ?? input.request.method,
      path: url.pathname,
      missingEnvVars: missing
    }
  });

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        provider: input.provider,
        status: "missing_credentials",
        missingEnvVars: missing,
        message: "Provider credentials are not configured yet."
      },
      { status: 501 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      provider: input.provider,
      status: "handler_not_enabled",
      message: "Credentials are present, but live provider processing is intentionally disabled until the integration phase is approved."
    },
    { status: 501 }
  );
}
