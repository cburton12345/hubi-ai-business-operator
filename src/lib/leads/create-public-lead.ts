import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
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

function dateDetail(details: Record<string, unknown>, key: string) {
  const value = textDetail(details, key);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function intDetail(details: Record<string, unknown>, key: string) {
  const value = details[key];
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null;
}

function numericDetail(details: Record<string, unknown>, key: string) {
  const value = details[key];
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

export async function createPublicLead(input: PublicLeadInput, requestMeta: { ipAddress?: string; userAgent?: string }) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return createPublicLeadWithPostgres(input, requestMeta);
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
      metadata_json: {
        details: input.details,
        utm: input.utm,
        submittedAt: input.submittedAt ?? null
      }
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
      details: input.details,
      utm: input.utm,
      submittedAt: input.submittedAt ?? null
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
      leadType: input.leadType,
      utm: input.utm
    }
  });

  return {
    ok: true,
    status: 201,
    leadId: lead.id
  };
}

async function createPublicLeadWithPostgres(
  input: PublicLeadInput,
  requestMeta: { ipAddress?: string; userAgent?: string }
) {
  const formResult = await queryPostgres<FormRecord>(
    `
    select id, tenant_id, brand_id, active
    from public.forms
    where public_key = $1
    limit 1
    `,
    [input.formPublicKey]
  );
  const form = formResult?.rows[0];

  if (!form || !form.active) {
    return {
      ok: false,
      status: 404,
      error: "Lead form was not found."
    };
  }

  const leadResult = await queryPostgres<LeadRecord>(
    `
    insert into public.leads (
      tenant_id,
      brand_id,
      form_id,
      source,
      source_detail,
      name,
      email,
      phone,
      message,
      lead_type,
      status,
      qualification_status,
      priority,
      consent_to_contact,
      metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', $11, $12, $13, $14::jsonb)
    returning id
    `,
    [
      form.tenant_id,
      form.brand_id,
      form.id,
      input.source ?? "website",
      input.sourceDetail ?? null,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.message ?? null,
      input.leadType,
      input.leadType === "case_intake" ? "needs_review" : "unqualified",
      input.leadType === "case_intake" ? "high" : "normal",
      input.consentToContact,
      JSON.stringify({
        details: input.details,
        utm: input.utm,
        submittedAt: input.submittedAt ?? null
      })
    ]
  );
  const lead = leadResult?.rows[0];

  if (!lead) {
    return {
      ok: false,
      status: 500,
      error: "Unable to create lead."
    };
  }

  await insertLeadDetailsWithPostgres({
    tenantId: form.tenant_id,
    brandId: form.brand_id,
    leadId: lead.id,
    leadType: input.leadType,
    details: input.details
  });

  await queryPostgres(
    `
    insert into public.form_submissions (
      tenant_id,
      brand_id,
      form_id,
      lead_id,
      payload_json,
      ip_address,
      user_agent
    )
    values ($1, $2, $3, $4, $5::jsonb, $6::inet, $7)
    `,
    [
      form.tenant_id,
      form.brand_id,
      form.id,
      lead.id,
      JSON.stringify({
        source: input.source,
        sourceDetail: input.sourceDetail,
        name: input.name,
        email: input.email,
        phone: input.phone,
        message: input.message,
        leadType: input.leadType,
        consentToContact: input.consentToContact,
        details: input.details,
        utm: input.utm,
        submittedAt: input.submittedAt ?? null
      }),
      requestMeta.ipAddress ?? null,
      requestMeta.userAgent ?? null
    ]
  );

  await queryPostgres(
    `
    insert into public.lead_events (
      tenant_id,
      brand_id,
      lead_id,
      type,
      body,
      metadata_json
    )
    values ($1, $2, $3, 'form_submission', 'Lead captured from public form.', $4::jsonb)
    `,
    [
      form.tenant_id,
      form.brand_id,
      lead.id,
      JSON.stringify({
        source: input.source ?? "website",
        leadType: input.leadType,
        utm: input.utm
      })
    ]
  );

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
      rental_start_date: dateDetail(details, "rentalStartDate"),
      rental_end_date: dateDetail(details, "rentalEndDate"),
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
      units_managed: intDetail(details, "unitsManaged"),
      demo_requested: true
    });
  }

  if (leadType === "buyer" || leadType === "seller" || leadType === "bidder" || leadType === "consignor") {
    await supabase.from("marketplace_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      intent: leadType,
      asset_category: textDetail(details, "assetCategory"),
      estimated_value: numericDetail(details, "estimatedValue"),
      location: textDetail(details, "location")
    });
  }

  if (leadType === "case_intake") {
    await supabase.from("legal_lead_details").insert({
      tenant_id: tenantId,
      brand_id: brandId,
      lead_id: leadId,
      case_type: textDetail(details, "caseType"),
      incident_date: dateDetail(details, "incidentDate"),
      state: textDetail(details, "state") ?? textDetail(details, "location"),
      injury_type: textDetail(details, "injuryType"),
      has_attorney: boolDetail(details, "hasAttorney"),
      treatment_received: boolDetail(details, "treatmentReceived"),
      legal_disclaimer_acknowledged: Boolean(details.legalDisclaimerAcknowledged)
    });
  }
}

async function insertLeadDetailsWithPostgres({
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
  if (leadType === "appointment" || leadType === "quote" || leadType === "general") {
    await queryPostgres(
      `
      insert into public.local_service_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        service_interest,
        location,
        appointment_window,
        urgency
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "serviceInterest"),
        textDetail(details, "location"),
        textDetail(details, "appointmentWindow"),
        textDetail(details, "urgency")
      ]
    );
  }

  if (leadType === "rental_request") {
    await queryPostgres(
      `
      insert into public.rental_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        rental_item_type,
        rental_start_date,
        rental_end_date,
        delivery_needed,
        location
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "rentalItemType"),
        dateDetail(details, "rentalStartDate"),
        dateDetail(details, "rentalEndDate"),
        boolDetail(details, "deliveryNeeded"),
        textDetail(details, "location")
      ]
    );
  }

  if (leadType === "demo") {
    await queryPostgres(
      `
      insert into public.software_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        company_name,
        role,
        current_system,
        units_managed,
        demo_requested
      )
      values ($1, $2, $3, $4, $5, $6, $7, true)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "companyName"),
        textDetail(details, "role"),
        textDetail(details, "currentSystem"),
        intDetail(details, "unitsManaged")
      ]
    );
  }

  if (leadType === "buyer" || leadType === "seller" || leadType === "bidder" || leadType === "consignor") {
    await queryPostgres(
      `
      insert into public.marketplace_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        intent,
        asset_category,
        estimated_value,
        location
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        brandId,
        leadId,
        leadType,
        textDetail(details, "assetCategory"),
        numericDetail(details, "estimatedValue"),
        textDetail(details, "location")
      ]
    );
  }

  if (leadType === "case_intake") {
    await queryPostgres(
      `
      insert into public.legal_lead_details (
        tenant_id,
        brand_id,
        lead_id,
        case_type,
        incident_date,
        state,
        injury_type,
        has_attorney,
        treatment_received,
        legal_disclaimer_acknowledged
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        tenantId,
        brandId,
        leadId,
        textDetail(details, "caseType"),
        dateDetail(details, "incidentDate"),
        textDetail(details, "state") ?? textDetail(details, "location"),
        textDetail(details, "injuryType"),
        boolDetail(details, "hasAttorney"),
        boolDetail(details, "treatmentReceived"),
        Boolean(details.legalDisclaimerAcknowledged)
      ]
    );
  }
}
