import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PublicLeadInput } from "@/lib/leads/schemas";

type FormRecord = {
  id: string;
  tenant_id: string;
  brand_id: string;
  active: boolean;
};

type LeadRecord = {
  id: string;
};

function textDetail(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolDetail(details: Record<string, unknown>, key: string) {
  return typeof details[key] === "boolean" ? details[key] : null;
}

export async function createPublicLead(input: PublicLeadInput, requestMeta: { ipAddress?: string; userAgent?: string }) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      status: 503,
      error: "Lead capture is not configured."
    };
  }

  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, tenant_id, brand_id, active")
    .eq("public_key", input.formPublicKey)
    .maybeSingle<FormRecord>();

  if (formError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to resolve lead form."
    };
  }

  if (!form || !form.active) {
    return {
      ok: false,
      status: 404,
      error: "Lead form was not found."
    };
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      tenant_id: form.tenant_id,
      brand_id: form.brand_id,
      form_id: form.id,
      source: input.source ?? "website",
      source_detail: input.sourceDetail,
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      lead_type: input.leadType,
      status: "new",
      qualification_status: input.leadType === "case_intake" ? "needs_review" : "unqualified",
      priority: input.leadType === "case_intake" ? "high" : "normal",
      consent_to_contact: input.consentToContact,
      metadata_json: input.details
    })
    .select("id")
    .single<LeadRecord>();

  if (leadError || !lead) {
    return {
      ok: false,
      status: 500,
      error: "Unable to create lead."
    };
  }

  await insertLeadDetails({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    leadType: input.leadType,
    details: input.details
  });

  const payload = {
    tenant_id: form.tenant_id,
    brand_id: form.brand_id,
    form_id: form.id,
    lead_id: lead.id,
    payload_json: {
      source: input.source,
      sourceDetail: input.sourceDetail,
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      leadType: input.leadType,
      consentToContact: input.consentToContact,
      details: input.details
    },
    ip_address: requestMeta.ipAddress,
    user_agent: requestMeta.userAgent
  };

  await supabase.from("form_submissions").insert(payload);
  await supabase.from("lead_events").insert({
    tenant_id: form.tenant_id,
    brand_id: form.brand_id,
    lead_id: lead.id,
    type: "form_submission",
    body: "Lead captured from public form.",
    metadata_json: {
      source: input.source ?? "website",
      leadType: input.leadType
    }
  });

  return {
    ok: true,
    status: 201,
    leadId: lead.id
  };
}

async function insertLeadDetails({
  tenantId,
  brandId,
  leadId,
  leadType,
  details
}: {
  tenantId: string;
  brandId: string;
  leadId: string;
  leadType: PublicLeadInput["leadType"];
  details: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  if (leadType === "appointment" || leadType === "quote" || leadType === "general") {
    await supabase.from("local_service_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      service_interest: textDetail(details, "serviceInterest"),
      location: textDetail(details, "location"),
      appointment_window: textDetail(details, "appointmentWindow"),
      urgency: textDetail(details, "urgency")
    });
  }

  if (leadType === "rental_request") {
    await supabase.from("rental_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      rental_item_type: textDetail(details, "rentalItemType"),
      delivery_needed: boolDetail(details, "deliveryNeeded"),
      location: textDetail(details, "location")
    });
  }

  if (leadType === "demo") {
    await supabase.from("software_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      company_name: textDetail(details, "companyName"),
      role: textDetail(details, "role"),
      current_system: textDetail(details, "currentSystem"),
      demo_requested: true
    });
  }

  if (leadType === "buyer" || leadType === "seller") {
    await supabase.from("marketplace_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      intent: leadType,
      asset_category: textDetail(details, "assetCategory"),
      location: textDetail(details, "location")
    });
  }

  if (leadType === "case_intake") {
    await supabase.from("legal_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      case_type: textDetail(details, "caseType"),
      state: textDetail(details, "state") ?? textDetail(details, "location"),
      injury_type: textDetail(details, "injuryType"),
      has_attorney: boolDetail(details, "hasAttorney"),
      treatment_received: boolDetail(details, "treatmentReceived"),
      legal_disclaimer_acknowledged: Boolean(details.legalDisclaimerAcknowledged)
    });
  }
}
