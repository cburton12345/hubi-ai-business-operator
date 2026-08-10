import { queryPostgres } from "@/lib/db/postgres";

export type OutboundCallScenario =
  | "lead_follow_up"
  | "estimate_follow_up"
  | "appointment"
  | "job_update"
  | "invoice_follow_up"
  | "review_request"
  | "reactivation"
  | "general_service";

function clean(value: unknown, max = 500) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : "";
}

function unique(values: Array<string | null | undefined>, limit = 12) {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))].slice(0, limit);
}

export function classifyOutboundCallPurpose(purpose: string): OutboundCallScenario {
  const value = purpose.toLowerCase();
  if (/estimate|quote|proposal|bid/.test(value)) return "estimate_follow_up";
  if (/appointment|schedule|arrival|on my way|reschedul/.test(value)) return "appointment";
  if (/job|project|work update|crew|dispatch/.test(value)) return "job_update";
  if (/invoice|payment|balance|past due|collection/.test(value)) return "invoice_follow_up";
  if (/review|rating|feedback/.test(value)) return "review_request";
  if (/reactivat|win back|haven't heard|past customer/.test(value)) return "reactivation";
  if (/lead|inquir|requested|interest|demo|sales/.test(value)) return "lead_follow_up";
  return "general_service";
}

function desiredOutcome(scenario: OutboundCallScenario) {
  const outcomes: Record<OutboundCallScenario, string> = {
    lead_follow_up: "Understand the person's need, answer from verified context, and agree on the next useful step.",
    estimate_follow_up: "Confirm the estimate was understood, answer only from the supplied estimate context, and learn the decision or obstacle.",
    appointment: "Confirm or clarify the appointment or arrival details supplied by Ferocity without inventing availability.",
    job_update: "Explain the supplied job update, identify questions or concerns, and record the next needed step.",
    invoice_follow_up: "Explain the supplied invoice status respectfully and identify the next payment or human-review step without collecting sensitive payment data by voice.",
    review_request: "Ask for honest feedback after the supplied completed work and provide the approved review path only when it is available.",
    reactivation: "Reconnect helpfully, identify a current need, and avoid pressure or unsupported offers.",
    general_service: "Explain the specific reason for the call, help from verified context, and agree on a concrete next step."
  };
  return outcomes[scenario];
}

export function composeOutboundCallVariables(input: {
  contactName: string;
  contactType: "customer" | "lead";
  callPurpose: string;
  businessName: string;
  industry?: string | null;
  description?: string | null;
  primaryGoal?: string | null;
  primaryLocation?: string | null;
  contactFacts?: string[];
  businessFacts?: string[];
}) {
  const scenario = classifyOutboundCallPurpose(input.callPurpose);
  const contactFacts = unique(input.contactFacts ?? []);
  const businessFacts = unique([
    input.industry ? `Industry: ${input.industry}` : null,
    input.description ? `Business description: ${input.description}` : null,
    input.primaryGoal ? `Business priority: ${input.primaryGoal}` : null,
    input.primaryLocation ? `Primary location: ${input.primaryLocation}` : null,
    ...(input.businessFacts ?? [])
  ]);
  const genericPurpose = /^(a |the )?(requested |general )?(business |service )?follow[- ]?up\.?$/i.test(clean(input.callPurpose));
  const contextQuality = genericPurpose && contactFacts.length === 0 ? "limited" : "prepared";

  return {
    contact_name: clean(input.contactName, 160) || "there",
    contact_type: input.contactType,
    business_name: clean(input.businessName, 200) || "the business",
    call_purpose: clean(input.callPurpose, 500) || "a service follow-up",
    call_scenario: scenario,
    desired_outcome: desiredOutcome(scenario),
    business_context: businessFacts.join("; ").slice(0, 2_000) || "Use only the business name and call purpose supplied for this call.",
    contact_context: contactFacts.join("; ").slice(0, 2_500) || "No additional customer or job facts were supplied. Clarify naturally without making the person explain why Ferocity called.",
    context_quality: contextQuality,
    allowed_next_steps: "Answer from supplied context; ask one useful clarifying question when needed; record a callback only through the connected tool; never claim an appointment, payment, estimate change, or human follow-up was completed unless a tool confirms it."
  } satisfies Record<string, string>;
}

export async function prepareOutboundCallVariables(input: {
  tenantId: string;
  brandId?: string | null;
  contactType: "customer" | "lead";
  contactId: string;
  callPurpose: string;
}) {
  const baseResult = input.contactType === "customer"
    ? await queryPostgres<{
        contact_name: string;
        brand_id: string;
        business_name: string;
        industry: string | null;
        description: string | null;
        primary_goal: string | null;
        primary_location: string | null;
        customer_type: string;
        city: string | null;
        state: string | null;
        ai_summary: string | null;
      }>(
        `select c.name as contact_name,b.id as brand_id,b.name as business_name,b.industry,b.description,b.primary_goal,b.primary_location,
                c.customer_type,c.city,c.state,c.ai_summary
           from public.customers c
           join public.brands b on b.tenant_id=c.tenant_id and b.id=c.brand_id
          where c.tenant_id=$1 and c.id=$2 and ($3::uuid is null or c.brand_id=$3::uuid)
          limit 1`,
        [input.tenantId, input.contactId, input.brandId ?? null]
      )
    : await queryPostgres<{
        contact_name: string;
        brand_id: string;
        business_name: string;
        industry: string | null;
        description: string | null;
        primary_goal: string | null;
        primary_location: string | null;
        source: string | null;
        message: string | null;
        lead_type: string;
        status: string;
        qualification_status: string;
        priority: string;
        service_interest: string | null;
        location: string | null;
        appointment_window: string | null;
        urgency: string | null;
      }>(
        `select coalesce(l.name,'there') as contact_name,b.id as brand_id,b.name as business_name,b.industry,b.description,b.primary_goal,b.primary_location,
                l.source,l.message,l.lead_type,l.status,l.qualification_status,l.priority,
                d.service_interest,d.location,d.appointment_window,d.urgency
           from public.leads l
           join public.brands b on b.tenant_id=l.tenant_id and b.id=l.brand_id
           left join public.local_service_lead_details d on d.tenant_id=l.tenant_id and d.lead_id=l.id
          where l.tenant_id=$1 and l.id=$2 and ($3::uuid is null or l.brand_id=$3::uuid)
          limit 1`,
        [input.tenantId, input.contactId, input.brandId ?? null]
      );
  const base = baseResult?.rows[0];
  if (!base) return null;

  const servicesResult = await queryPostgres<{ name: string; description: string | null }>(
    `select s.name,s.description from public.brand_services s
     where s.tenant_id=$1 and s.brand_id=$2 and s.active=true order by s.priority desc,s.name limit 8`,
    [input.tenantId, base.brand_id]
  );
  const businessFacts = (servicesResult?.rows ?? []).map((service) =>
    `Service: ${service.name}${service.description ? ` — ${service.description}` : ""}`
  );
  const contactFacts: string[] = [];

  if (input.contactType === "lead") {
    const lead = base as Extract<typeof base, { lead_type: string }>;
    contactFacts.push(
      `Lead status: ${lead.status}; qualification: ${lead.qualification_status}; priority: ${lead.priority}`,
      lead.service_interest ? `Service interest: ${lead.service_interest}` : "",
      lead.location ? `Service location: ${lead.location}` : "",
      lead.appointment_window ? `Requested window: ${lead.appointment_window}` : "",
      lead.urgency ? `Stated urgency: ${lead.urgency}` : "",
      lead.message ? `Original inquiry: ${lead.message}` : "",
      lead.source ? `Lead source: ${lead.source}` : ""
    );
  } else {
    const customer = base as Extract<typeof base, { customer_type: string }>;
    contactFacts.push(
      `Customer type: ${customer.customer_type}`,
      customer.city || customer.state ? `Customer area: ${[customer.city, customer.state].filter(Boolean).join(", ")}` : "",
      customer.ai_summary ? `Verified customer summary: ${customer.ai_summary}` : ""
    );
    const [estimates, jobs, invoices, memory] = await Promise.all([
      queryPostgres<{ title: string; status: string; total_cents: number; valid_until: string | null }>(
        `select title,status,total_cents,valid_until::text from public.service_estimates
          where tenant_id=$1 and customer_id=$2 order by updated_at desc limit 3`,
        [input.tenantId, input.contactId]
      ),
      queryPostgres<{ title: string; status: string; scheduled_start: string | null; scheduled_end: string | null; ai_next_action: string | null }>(
        `select title,status,scheduled_start::text,scheduled_end::text,ai_next_action from public.service_jobs
          where tenant_id=$1 and customer_id=$2 order by updated_at desc limit 3`,
        [input.tenantId, input.contactId]
      ),
      queryPostgres<{ title: string; status: string; total_cents: number; amount_paid_cents: number; due_date: string | null }>(
        `select title,status,total_cents,amount_paid_cents,due_date::text from public.service_invoices
          where tenant_id=$1 and customer_id=$2 order by updated_at desc limit 3`,
        [input.tenantId, input.contactId]
      ),
      queryPostgres<{ title: string; fact_text: string }>(
        `select title,fact_text from public.office_manager_memory_facts
          where tenant_id=$1 and customer_id=$2 and status in ('approved','active')
            and sensitivity in ('public','customer_context') and (expires_at is null or expires_at>now())
          order by updated_at desc limit 5`,
        [input.tenantId, input.contactId]
      )
    ]);
    for (const estimate of estimates?.rows ?? []) {
      contactFacts.push(`Estimate: ${estimate.title}; status ${estimate.status}; total $${(estimate.total_cents / 100).toFixed(2)}${estimate.valid_until ? `; valid until ${estimate.valid_until}` : ""}`);
    }
    for (const job of jobs?.rows ?? []) {
      contactFacts.push(`Job: ${job.title}; status ${job.status}${job.scheduled_start ? `; scheduled ${job.scheduled_start}` : ""}${job.ai_next_action ? `; next step ${job.ai_next_action}` : ""}`);
    }
    for (const invoice of invoices?.rows ?? []) {
      contactFacts.push(`Invoice: ${invoice.title}; status ${invoice.status}; total $${(invoice.total_cents / 100).toFixed(2)}; paid $${(invoice.amount_paid_cents / 100).toFixed(2)}${invoice.due_date ? `; due ${invoice.due_date}` : ""}`);
    }
    for (const fact of memory?.rows ?? []) contactFacts.push(`${fact.title}: ${fact.fact_text}`);
  }

  return composeOutboundCallVariables({
    contactName: base.contact_name,
    contactType: input.contactType,
    callPurpose: input.callPurpose,
    businessName: base.business_name,
    industry: base.industry,
    description: base.description,
    primaryGoal: base.primary_goal,
    primaryLocation: base.primary_location,
    contactFacts,
    businessFacts
  });
}
