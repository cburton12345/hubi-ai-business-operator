"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { generateA2pRegistrationPacket } from "@/lib/messaging/a2p-registration";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const a2pSchema = z.object({
  legalBusinessName: z.string().trim().min(2).max(180),
  dbaName: z.string().trim().max(180).optional(),
  businessType: z.string().trim().min(2).max(80),
  addressLine1: z.string().trim().min(2).max(180),
  addressLine2: z.string().trim().max(180).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(60),
  postalCode: z.string().trim().min(3).max(20),
  websiteUrl: z.string().trim().url().max(500),
  messagingUseCase: z.string().trim().min(8).max(600),
  expectedVolume: z.string().trim().min(2).max(120),
  optInMethod: z.string().trim().min(8).max(600),
  privacyPolicyUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  termsUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  sampleMessageOne: z.string().trim().max(320).optional(),
  sampleMessageTwo: z.string().trim().max(320).optional()
});

function text(formData: FormData, key: string) {
  return formData.get(key)?.toString() || undefined;
}

export async function saveA2pRegistrationDraftAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const tenantId = await getCurrentWorkspaceId();
  const parsed = a2pSchema.safeParse({
    legalBusinessName: text(formData, "legalBusinessName"),
    dbaName: text(formData, "dbaName"),
    businessType: text(formData, "businessType"),
    addressLine1: text(formData, "addressLine1"),
    addressLine2: text(formData, "addressLine2"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    postalCode: text(formData, "postalCode"),
    websiteUrl: text(formData, "websiteUrl"),
    messagingUseCase: text(formData, "messagingUseCase"),
    expectedVolume: text(formData, "expectedVolume"),
    optInMethod: text(formData, "optInMethod"),
    privacyPolicyUrl: text(formData, "privacyPolicyUrl") || "",
    termsUrl: text(formData, "termsUrl") || "",
    sampleMessageOne: text(formData, "sampleMessageOne"),
    sampleMessageTwo: text(formData, "sampleMessageTwo")
  });
  if (!parsed.success) return;

  const packet = generateA2pRegistrationPacket({
    ...parsed.data,
    privacyPolicyUrl: parsed.data.privacyPolicyUrl || undefined,
    termsUrl: parsed.data.termsUrl || undefined
  });

  const accountResult = await queryPostgres<{ id: string }>(
    `
    select id
    from public.tenant_messaging_accounts
    where tenant_id = $1
      and provider_key = 'twilio_sms'
      and ownership_mode in ('customer_owned', 'ferocity_managed')
    order by case ownership_mode when 'customer_owned' then 1 else 2 end
    limit 1
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    insert into public.messaging_registrations (
      tenant_id, messaging_account_id, provider_key, registration_type, status,
      legal_business_name, dba_name, business_address_json, website_url, messaging_use_case,
      expected_volume, sample_messages_json, opt_in_method, privacy_policy_url, terms_url,
      generated_campaign_description, generated_compliance_text_json, metadata_json
    )
    values ($1, $2, 'twilio_sms', 'a2p_10dlc', 'needs_info', $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
    `,
    [
      tenantId,
      accountResult?.rows[0]?.id ?? null,
      parsed.data.legalBusinessName,
      parsed.data.dbaName || null,
      JSON.stringify(packet.address),
      parsed.data.websiteUrl,
      parsed.data.messagingUseCase,
      parsed.data.expectedVolume,
      JSON.stringify(packet.sampleMessages),
      parsed.data.optInMethod,
      parsed.data.privacyPolicyUrl || null,
      parsed.data.termsUrl || null,
      packet.campaignDescription,
      JSON.stringify({
        optInWording: packet.optInWording,
        stopHelpWording: packet.stopHelpWording,
        complianceChecklist: packet.complianceChecklist
      }),
      JSON.stringify({ generatedBy: "ferocity_a2p_wizard", businessType: parsed.data.businessType, noProviderSubmission: true })
    ]
  );

  await queryPostgres(
    `
    update public.tenant_messaging_accounts
    set connection_status = 'needs_attention',
        credentials_status = case when credentials_status = 'not_required' then credentials_status else credentials_status end,
        metadata_json = metadata_json || $2::jsonb,
        updated_at = now()
    where tenant_id = $1 and provider_key = 'twilio_sms'
    `,
    [tenantId, JSON.stringify({ a2pDraftStarted: true, a2pDraftStartedAt: new Date().toISOString() })]
  );

  revalidatePath("/app/messaging");
  revalidatePath("/app/messaging/a2p");
  revalidatePath("/app/receptionist-setup");
}
