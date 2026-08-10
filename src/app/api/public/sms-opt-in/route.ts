import { NextRequest } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";
import { normalizePhoneForSmsConsent } from "@/lib/sms/public-consent";

const disclosureVersion = "ferocity-sms-opt-in-2026-08-05";

const smsOptInSchema = z.object({
  phone: z.string().trim().min(8).max(40),
  serviceConsent: z.literal("on"),
  marketingConsent: z.string().optional(),
  website: z.string().max(0).optional()
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = smsOptInSchema.safeParse({
    phone: formData.get("phone"),
    serviceConsent: formData.get("serviceConsent"),
    marketingConsent: formData.get("marketingConsent") ?? undefined,
    website: formData.get("website") ?? undefined
  });

  if (!parsed.success || parsed.data.website) {
    return safeRedirect(request, "/sms-opt-in?status=invalid");
  }

  const phone = normalizePhoneForSmsConsent(parsed.data.phone);
  if (!phone) return safeRedirect(request, "/sms-opt-in?status=invalid");

  try {
    await queryPostgres(
      `
      insert into public.public_sms_consents (
        phone_e164, service_consent, marketing_consent, status, source,
        disclosure_version, user_agent, consented_at, revoked_at, metadata_json, updated_at
      )
      values ($1, true, $2, 'granted', 'ferocity_public_sms_opt_in', $3, $4, now(), null, $5::jsonb, now())
      on conflict (phone_e164) do update
      set service_consent = true,
          marketing_consent = excluded.marketing_consent,
          status = 'granted',
          source = excluded.source,
          disclosure_version = excluded.disclosure_version,
          user_agent = excluded.user_agent,
          consented_at = now(),
          revoked_at = null,
          metadata_json = public.public_sms_consents.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [
        phone,
        parsed.data.marketingConsent === "on",
        disclosureVersion,
        request.headers.get("user-agent")?.slice(0, 500) ?? null,
        JSON.stringify({
          messageFrequency: "varies",
          ratesDisclosure: true,
          stopDisclosure: true,
          helpDisclosure: true,
          consentRequiredForPurchase: false,
          marketingConsentSeparated: true
        })
      ]
    );
    return safeRedirect(request, "/sms-opt-in?status=confirmed");
  } catch (error) {
    await logAppError({
      source: "public.sms_opt_in",
      severity: "warning",
      message: error instanceof Error ? error.message : "SMS opt-in could not be recorded."
    });
    return safeRedirect(request, "/sms-opt-in?status=error");
  }
}
