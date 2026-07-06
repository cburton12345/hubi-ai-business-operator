import { z } from "zod";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { recordLaborOwnerEvent } from "@/lib/labor-bench/record-labor-owner-event";

export type WorkerIntakeProfile = {
  publicKey: string;
  tenantId: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  industry: string;
};

export const publicWorkerIntakeSchema = z.object({
  formPublicKey: z.string().min(8).max(120),
  website: z.string().max(0).optional(),
  submittedAt: z.string().optional(),
  name: z.string().min(2).max(160),
  trade: z.string().min(2).max(120),
  serviceArea: z.string().max(180).optional(),
  homeLocation: z.string().max(180).optional(),
  phone: z.string().max(80).optional(),
  email: z.string().email().optional(),
  availabilityLabel: z.string().max(160).optional(),
  travelRadiusMiles: z.coerce.number().int().min(0).max(500).optional(),
  rateLabel: z.string().max(120).optional(),
  experienceLabel: z.string().max(220).optional(),
  toolsAndInsurance: z.string().max(400).optional(),
  notes: z.string().max(1200).optional(),
  consentToContact: z.boolean(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(160).optional(),
  pageUrl: z.string().max(500).optional(),
  referrer: z.string().max(500).optional()
}).refine((value) => value.phone || value.email, {
  message: "Phone or email is required.",
  path: ["phone"]
}).refine((value) => value.consentToContact, {
  message: "Consent is required.",
  path: ["consentToContact"]
});

export async function getWorkerIntakeProfile(publicKey: string) {
  const result = await queryPostgres<{
    public_key: string;
    tenant_id: string;
    brand_id: string;
    brand_name: string;
    brand_slug: string;
    industry: string | null;
  }>(
    `
    select
      f.public_key,
      f.tenant_id,
      f.brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      b.industry
    from public.forms f
    join public.brands b on b.id = f.brand_id
    where f.public_key = $1 and f.active = true
    limit 1
    `,
    [publicKey]
  );

  const row = result?.rows[0];
  if (!row) return null;

  return {
    publicKey: row.public_key,
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    industry: row.industry ?? "local service work"
  } satisfies WorkerIntakeProfile;
}

export async function createPublicWorkerAvailability(input: z.infer<typeof publicWorkerIntakeSchema>) {
  const profile = await getWorkerIntakeProfile(input.formPublicKey);
  if (!profile) {
    return { ok: false, reason: "not_found" as const };
  }

  if (input.website) {
    return { ok: false, reason: "spam" as const };
  }

  const gate = await getServiceGate(profile.tenantId, "labor_worker_intake");
  if (!gate.enabled) {
    return { ok: false, reason: "limit" as const, gate };
  }

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.labor_worker_availability (
      tenant_id, name, trade, service_area, home_location, phone, email,
      availability_label, travel_radius_miles, rate_label, experience_label,
      source, status, consent_to_contact, last_available_at, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'public_form',$12,$13,now(),$14::jsonb)
    returning id
    `,
    [
      profile.tenantId,
      input.name,
      input.trade,
      input.serviceArea || null,
      input.homeLocation || null,
      input.phone || null,
      input.email || null,
      input.availabilityLabel || null,
      input.travelRadiusMiles ?? null,
      input.rateLabel || null,
      input.experienceLabel || null,
      input.consentToContact ? "available" : "needs_review",
      input.consentToContact,
      JSON.stringify({
        source: "public_worker_intake",
        brandId: profile.brandId,
        brandSlug: profile.brandSlug,
        submittedAt: input.submittedAt,
        toolsAndInsurance: input.toolsAndInsurance,
        notes: input.notes,
        utm: {
          source: input.utmSource,
          medium: input.utmMedium,
          campaign: input.utmCampaign
        },
        pageUrl: input.pageUrl,
        referrer: input.referrer,
        ownerApprovalRequiredBeforeContact: true
      })
    ]
  );
  const workerId = result?.rows[0]?.id;

  if (workerId) {
    await recordLaborOwnerEvent({
      tenantId: profile.tenantId,
      externalEventId: `public-worker-${workerId}`,
      eventType: "labor.worker.available",
      title: `Worker availability submitted: ${input.name}`,
      summary: `${input.name} submitted availability for ${input.trade}${input.serviceArea ? ` in ${input.serviceArea}` : ""}.`,
      severity: "medium",
      status: "needs_owner",
      ownerAttention: true,
      recommendedAction: "Review the worker, confirm fit/consent, and match them to an open request if appropriate.",
      metadata: {
        workerId,
        brandId: profile.brandId,
        brandSlug: profile.brandSlug,
        source: "public_worker_intake",
        trade: input.trade,
        serviceArea: input.serviceArea,
        consentToContact: input.consentToContact
      }
    });
  }

  return { ok: true, profile };
}
