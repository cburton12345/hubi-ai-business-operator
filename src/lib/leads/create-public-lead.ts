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
