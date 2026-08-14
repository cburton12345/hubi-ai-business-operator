import { queryPostgres } from "@/lib/db/postgres";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export function normalizeVoicePhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function compact(values: Array<string | null | undefined>, limit = 12) {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))].slice(0, limit);
}

export function composeInboundCallVariables(input: {
  businessName: string;
  industry?: string | null;
  description?: string | null;
  primaryLocation?: string | null;
  callerName?: string | null;
  callerType: "customer" | "lead" | "new_caller";
  contactFacts?: string[];
  services?: string[];
  serviceAreas?: string[];
  businessHours?: string | null;
  transferRules?: string[];
}) {
  const facts = compact(input.contactFacts ?? [], 10);
  const services = compact(input.services ?? [], 12);
  const areas = compact(input.serviceAreas ?? [], 12);
  const transferRules = compact(input.transferRules ?? [], 10);
  return {
    business_name: clean(input.businessName, 180) || "the business",
    business_context: compact([
      input.industry ? `Industry: ${input.industry}` : null,
      input.description ? `Business description: ${input.description}` : null,
      input.primaryLocation ? `Primary location: ${input.primaryLocation}` : null
    ]).join("; ").slice(0, 2_000),
    caller_status: input.callerType,
    caller_name: clean(input.callerName, 160) || "unknown",
    caller_context: facts.join("; ").slice(0, 2_500) || "No prior caller record was found. Collect the minimum information needed to help and create a complete lead record.",
    verified_services: services.join("; ").slice(0, 2_000) || "No verified service catalog is available. Do not invent services or prices.",
    verified_service_areas: areas.join("; ").slice(0, 1_500) || "Service area has not been configured. Collect the location and flag it for confirmation.",
    business_hours: clean(input.businessHours, 500) || "Business hours have not been configured. Offer to take a message or schedule only after availability is verified.",
    transfer_rules: transferRules.join("; ").slice(0, 1_500) || "Transfer only when an attached Ferocity tool confirms an allowed destination; otherwise take a complete message.",
    allowed_next_steps: "Answer only from verified context. Qualify the need, update the contact through tools, check availability before booking, and transfer only through a confirmed Ferocity tool. Never claim an action succeeded unless its tool confirms success."
  } satisfies Record<string, string>;
}

type InboundContext = {
  brandId: string;
  customerId: string | null;
  leadId: string | null;
  variables: Record<string, string>;
};

export async function prepareInboundCallContext(input: {
  tenantId: string;
  callerNumber?: string | null;
  brandId?: string | null;
}): Promise<InboundContext | null> {
  const brandResult = await queryPostgres<{
    id: string;
    name: string;
    industry: string | null;
    description: string | null;
    primary_location: string | null;
  }>(
    `select id,name,industry,description,primary_location
       from public.brands
      where tenant_id=$1 and status='active' and ($2::uuid is null or id=$2::uuid)
      order by case when id=$2::uuid then 0 else 1 end, created_at
      limit 1`,
    [input.tenantId, input.brandId ?? null]
  );
  const brand = brandResult?.rows[0];
  if (!brand) return null;

  const phoneDigits = normalizeVoicePhone(input.callerNumber);
  const [customerResult, leadResult, servicesResult, areasResult, modeResult] = await Promise.all([
    phoneDigits.length >= 7
      ? queryPostgres<{
          id: string; name: string; customer_type: string; city: string | null; state: string | null; ai_summary: string | null;
        }>(
          `select id,name,customer_type,city,state,ai_summary
             from public.customers
            where tenant_id=$1 and status <> 'do_not_contact'
              and right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$2
            order by updated_at desc limit 1`,
          [input.tenantId, phoneDigits]
        )
      : Promise.resolve(null),
    phoneDigits.length >= 7
      ? queryPostgres<{
          id: string; name: string | null; status: string; qualification_status: string; priority: string; message: string | null;
        }>(
          `select id,name,status,qualification_status,priority,message
             from public.leads
            where tenant_id=$1 and right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$2
            order by updated_at desc limit 1`,
          [input.tenantId, phoneDigits]
        )
      : Promise.resolve(null),
    queryPostgres<{ name: string; description: string | null }>(
      `select name,description from public.brand_services
        where tenant_id=$1 and brand_id=$2 and active=true order by priority desc,name limit 12`,
      [input.tenantId, brand.id]
    ),
    queryPostgres<{ label: string }>(
      `select coalesce(nullif(service_area_name,''),concat_ws(', ',nullif(city,''),nullif(state,''))) as label
         from public.brand_locations
        where tenant_id=$1 and brand_id=$2 and active=true
        order by priority desc limit 12`,
      [input.tenantId, brand.id]
    ),
    queryPostgres<{
      display_name: string; active_when_json: Record<string, unknown>; transfer_categories_json: string[];
      minimum_transfer_score: number; minimum_sales_value_cents: number;
    }>(
      `select display_name,active_when_json,transfer_categories_json,minimum_transfer_score,minimum_sales_value_cents
         from public.call_handling_modes
        where tenant_id=$1 and status='active' and (brand_id=$2 or brand_id is null)
        order by case when brand_id=$2 then 0 else 1 end,is_default desc,created_at limit 1`,
      [input.tenantId, brand.id]
    )
  ]);

  const customer = customerResult?.rows[0] ?? null;
  const lead = customer ? null : leadResult?.rows[0] ?? null;
  const contactFacts: string[] = [];
  if (customer) {
    contactFacts.push(
      `Existing customer: ${customer.name}`,
      `Customer type: ${customer.customer_type}`,
      customer.city || customer.state ? `Customer area: ${[customer.city, customer.state].filter(Boolean).join(", ")}` : "",
      customer.ai_summary ? `Verified customer summary: ${customer.ai_summary}` : ""
    );
    const recent = await queryPostgres<{ fact: string }>(
      `select fact from (
         select 'Job: '||title||'; status '||status||coalesce('; scheduled '||scheduled_start::text,'') as fact,updated_at
           from public.service_jobs where tenant_id=$1 and customer_id=$2
         union all
         select 'Estimate: '||title||'; status '||status||'; total $'||to_char(total_cents/100.0,'FM999999990.00'),updated_at
           from public.service_estimates where tenant_id=$1 and customer_id=$2
         union all
         select 'Invoice: '||title||'; status '||status||'; balance $'||to_char((total_cents-amount_paid_cents)/100.0,'FM999999990.00'),updated_at
           from public.service_invoices where tenant_id=$1 and customer_id=$2
       ) recent order by updated_at desc limit 6`,
      [input.tenantId, customer.id]
    );
    contactFacts.push(...(recent?.rows ?? []).map((row) => row.fact));
  } else if (lead) {
    contactFacts.push(
      `Known lead: ${lead.name ?? "name not yet captured"}`,
      `Lead status: ${lead.status}; qualification ${lead.qualification_status}; priority ${lead.priority}`,
      lead.message ? `Original inquiry: ${lead.message}` : ""
    );
  }

  const mode = modeResult?.rows[0];
  const schedule = mode?.active_when_json ?? {};
  const startHour = Number(schedule.startHour ?? 8);
  const endHour = Number(schedule.endHour ?? 17);
  const weekdays = Array.isArray(schedule.weekdays) ? schedule.weekdays.join(",") : "1,2,3,4,5";
  const transferRules = mode
    ? [
        `Mode: ${mode.display_name}`,
        `Transfer categories: ${(mode.transfer_categories_json ?? []).join(", ")}`,
        `Minimum transfer score: ${mode.minimum_transfer_score}`,
        mode.minimum_sales_value_cents > 0 ? `High-value threshold: $${(mode.minimum_sales_value_cents / 100).toFixed(2)}` : ""
      ]
    : [];

  return {
    brandId: brand.id,
    customerId: customer?.id ?? null,
    leadId: lead?.id ?? null,
    variables: composeInboundCallVariables({
      businessName: brand.name,
      industry: brand.industry,
      description: brand.description,
      primaryLocation: brand.primary_location,
      callerName: customer?.name ?? lead?.name,
      callerType: customer ? "customer" : lead ? "lead" : "new_caller",
      contactFacts,
      services: (servicesResult?.rows ?? []).map((service) => `${service.name}${service.description ? `: ${service.description}` : ""}`),
      serviceAreas: (areasResult?.rows ?? []).map((area) => area.label),
      businessHours: `Configured schedule uses weekdays ${weekdays}, ${startHour}:00-${endHour}:00. Confirm timezone and availability through Ferocity before booking.`,
      transferRules
    })
  };
}
