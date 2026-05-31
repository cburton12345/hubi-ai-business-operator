import { env } from "@/lib/env";
import { getResendEmailReadiness } from "@/lib/email/resend";

export type EmailProviderHealth = {
  provider: string;
  status: "ready" | "missing_config" | "provider_rejected" | "provider_error" | "unsupported";
  title: string;
  detail: string;
  missing: string[];
  fromAddress: string | null;
  notifyEmail: string | null;
};

export async function getEmailProviderHealth(): Promise<EmailProviderHealth> {
  const provider = (env.EMAIL_PROVIDER ?? "").toLowerCase();
  const readiness = getResendEmailReadiness();
  const base = {
    provider: provider || "not_set",
    missing: readiness.missing,
    fromAddress: env.EMAIL_FROM_ADDRESS ?? null,
    notifyEmail: env.FEROCITY_NOTIFY_EMAIL ?? null
  };

  if (!provider) {
    return {
      ...base,
      status: "missing_config",
      title: "Email provider is not selected",
      detail: "Set EMAIL_PROVIDER=resend before live onboarding emails can send."
    };
  }

  if (provider !== "resend") {
    return {
      ...base,
      status: "unsupported",
      title: "Email provider is not supported yet",
      detail: `Ferocity has a live sender path for Resend. Current provider is ${provider}.`
    };
  }

  if (!readiness.ready) {
    return {
      ...base,
      status: "missing_config",
      title: "Resend is missing required setup",
      detail: `Missing: ${readiness.missing.join(", ")}.`
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`
      },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timer);

    if (response.status === 401 || response.status === 403) {
      return {
        ...base,
        status: "provider_rejected",
        title: "Resend rejected the API key",
        detail: "Create a new Resend API key and update EMAIL_API_KEY before onboarding emails can send."
      };
    }

    if (!response.ok) {
      return {
        ...base,
        status: "provider_error",
        title: "Resend could not be checked",
        detail: `Resend returned HTTP ${response.status}. Try again before launch.`
      };
    }

    const body = (await response.json().catch(() => null)) as { data?: Array<{ name?: string; status?: string }> } | null;
    const domain = body?.data?.find((item) => env.EMAIL_FROM_ADDRESS?.endsWith(`@${item.name}`));
    const domainText = domain?.name ? `${domain.name} is ${domain.status ?? "listed"}` : "API key is accepted. Confirm the sender domain is verified in Resend.";

    return {
      ...base,
      status: "ready",
      title: "Resend API key is accepted",
      detail: domainText
    };
  } catch (error) {
    return {
      ...base,
      status: "provider_error",
      title: "Resend health check failed",
      detail: error instanceof Error ? error.message : "Unable to check Resend right now."
    };
  }
}
