"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { recordLaborOwnerEvent } from "@/lib/labor-bench/record-labor-owner-event";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value?: string) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

const staffingRequestSchema = z.object({
  title: z.string().min(2).max(180),
  trade: z.string().min(2).max(120),
  jobsite: z.string().max(220).optional(),
  serviceArea: z.string().max(180).optional(),
  startDate: z.string().optional(),
  durationLabel: z.string().max(120).optional(),
  headcount: z.string().optional(),
  payRange: z.string().max(120).optional(),
  urgency: z.enum(["low", "normal", "high", "urgent"]),
  placementMode: z.enum(["manual_or_paid_tier", "included_in_plan", "placement_fee", "not_offered"]),
  notes: z.string().max(2000).optional()
});

const workerAvailabilitySchema = z.object({
  name: z.string().min(2).max(160),
  trade: z.string().min(2).max(120),
  serviceArea: z.string().max(180).optional(),
  homeLocation: z.string().max(180).optional(),
  phone: z.string().max(80).optional(),
  email: z.string().email().optional(),
  availabilityLabel: z.string().max(160).optional(),
  travelRadiusMiles: z.string().optional(),
  rateLabel: z.string().max(120).optional(),
  experienceLabel: z.string().max(220).optional(),
  source: z.enum(["manual", "marketplacepro", "public_form", "referral", "import"]),
  consentToContact: z.boolean().default(false)
});

const requestIdSchema = z.object({
  requestId: z.string().uuid()
});

const matchStatusSchema = z.object({
  matchId: z.string().uuid(),
  status: z.enum(["suggested", "owner_approved_contact", "contacted", "worker_interested", "placed", "rejected", "not_available"])
});

const requestStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["open", "matching", "approval_needed", "contacting", "filled", "paused", "cancelled"])
});

const workerStatusSchema = z.object({
  workerId: z.string().uuid(),
  status: z.enum(["available", "needs_review", "contacted", "placed", "unavailable", "archived"])
});

export async function createStaffingRequestAction(formData: FormData) {
  const parsed = staffingRequestSchema.safeParse({
    title: text(formData, "title"),
    trade: text(formData, "trade"),
    jobsite: text(formData, "jobsite"),
    serviceArea: text(formData, "serviceArea"),
    startDate: text(formData, "startDate"),
    durationLabel: text(formData, "durationLabel"),
    headcount: text(formData, "headcount"),
    payRange: text(formData, "payRange"),
    urgency: text(formData, "urgency") ?? "normal",
    placementMode: text(formData, "placementMode") ?? "manual_or_paid_tier",
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const gate = await getServiceGate(tenantId, "labor_staffing_requests");
  if (!gate.enabled) {
    redirect(`/app/labor-bench?limit=labor_staffing_requests&reason=${encodeURIComponent(gate.reason)}`);
  }

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.labor_staffing_requests (
      tenant_id, title, trade, jobsite, service_area, start_date, duration_label,
      headcount, pay_range, urgency, placement_mode, notes, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    returning id
    `,
    [
      tenantId,
      parsed.data.title,
      parsed.data.trade,
      parsed.data.jobsite ?? null,
      parsed.data.serviceArea ?? null,
      parsed.data.startDate || null,
      parsed.data.durationLabel ?? null,
      Math.max(1, integer(parsed.data.headcount) || 1),
      parsed.data.payRange ?? null,
      parsed.data.urgency,
      parsed.data.placementMode,
      parsed.data.notes ?? null,
      JSON.stringify({
        source: "ferocity_labor_bench",
        contactOrPlacementRequiresApproval: true,
        workersMayNotExistInArea: true
      })
    ]
  );
  const requestId = result?.rows[0]?.id;
  if (requestId) {
    await recordLaborOwnerEvent({
      tenantId,
      externalEventId: `labor-request-${requestId}`,
      eventType: "labor.request.created",
      title: `Worker help requested: ${parsed.data.title}`,
      summary: `${parsed.data.headcount ?? "1"} ${parsed.data.trade} worker(s) needed for ${parsed.data.serviceArea ?? parsed.data.jobsite ?? "an unstated area"}.`,
      severity: parsed.data.urgency === "urgent" ? "high" : parsed.data.urgency === "high" ? "medium" : "low",
      status: parsed.data.urgency === "low" ? "watching" : "needs_owner",
      ownerAttention: parsed.data.urgency !== "low",
      recommendedAction: "Review the request, add or import available workers, then generate matches.",
      metadata: {
        requestId,
        trade: parsed.data.trade,
        serviceArea: parsed.data.serviceArea,
        urgency: parsed.data.urgency,
        placementMode: parsed.data.placementMode
      }
    });
  }
  revalidatePath("/app/labor-bench");
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app/owner-command-center");
}

export async function createWorkerAvailabilityAction(formData: FormData) {
  const parsed = workerAvailabilitySchema.safeParse({
    name: text(formData, "name"),
    trade: text(formData, "trade"),
    serviceArea: text(formData, "serviceArea"),
    homeLocation: text(formData, "homeLocation"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    availabilityLabel: text(formData, "availabilityLabel"),
    travelRadiusMiles: text(formData, "travelRadiusMiles"),
    rateLabel: text(formData, "rateLabel"),
    experienceLabel: text(formData, "experienceLabel"),
    source: text(formData, "source") ?? "manual",
    consentToContact: formData.get("consentToContact") === "on"
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const gate = await getServiceGate(tenantId, "labor_worker_intake");
  if (!gate.enabled) {
    redirect(`/app/labor-bench?limit=labor_worker_intake&reason=${encodeURIComponent(gate.reason)}`);
  }

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.labor_worker_availability (
      tenant_id, name, trade, service_area, home_location, phone, email,
      availability_label, travel_radius_miles, rate_label, experience_label,
      source, status, consent_to_contact, last_available_at, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15::jsonb)
    returning id
    `,
    [
      tenantId,
      parsed.data.name,
      parsed.data.trade,
      parsed.data.serviceArea ?? null,
      parsed.data.homeLocation ?? null,
      parsed.data.phone ?? null,
      parsed.data.email ?? null,
      parsed.data.availabilityLabel ?? null,
      integer(parsed.data.travelRadiusMiles) || null,
      parsed.data.rateLabel ?? null,
      parsed.data.experienceLabel ?? null,
      parsed.data.source,
      parsed.data.consentToContact ? "available" : "needs_review",
      parsed.data.consentToContact,
      JSON.stringify({
        source: "ferocity_labor_bench",
        ownerApprovalRequiredBeforeContact: true
      })
    ]
  );
  const workerId = result?.rows[0]?.id;
  if (workerId) {
    await recordLaborOwnerEvent({
      tenantId,
      externalEventId: `labor-worker-${workerId}`,
      eventType: "labor.worker.available",
      title: `Worker availability added: ${parsed.data.name}`,
      summary: `${parsed.data.name} was added for ${parsed.data.trade}${parsed.data.serviceArea ? ` in ${parsed.data.serviceArea}` : ""}.`,
      severity: parsed.data.consentToContact ? "low" : "medium",
      status: parsed.data.consentToContact ? "watching" : "needs_owner",
      ownerAttention: !parsed.data.consentToContact,
      recommendedAction: parsed.data.consentToContact
        ? "Generate matches when a request needs this role."
        : "Review consent before contacting this worker.",
      metadata: {
        workerId,
        trade: parsed.data.trade,
        serviceArea: parsed.data.serviceArea,
        source: parsed.data.source,
        consentToContact: parsed.data.consentToContact
      }
    });
  }
  revalidatePath("/app/labor-bench");
  revalidatePath("/app/owner-command-center");
}

export async function generateLaborMatchesAction(formData: FormData) {
  const parsed = requestIdSchema.safeParse({
    requestId: text(formData, "requestId")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const gate = await getServiceGate(tenantId, "labor_match_suggestions");
  if (!gate.enabled) {
    redirect(`/app/labor-bench?limit=labor_match_suggestions&reason=${encodeURIComponent(gate.reason)}`);
  }

  const requestResult = await queryPostgres<{
    title: string;
    trade: string;
    service_area: string | null;
    urgency: string;
  }>(
    `
    select title, trade, service_area, urgency
    from public.labor_staffing_requests
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [tenantId, parsed.data.requestId]
  );
  const request = requestResult?.rows[0];

  await queryPostgres(
    `
    with request as (
      select *
      from public.labor_staffing_requests
      where tenant_id = $1 and id = $2
      limit 1
    ),
    candidates as (
      select
        w.id,
        (
          case when lower(w.trade) = lower(r.trade) then 45
               when lower(w.trade) like '%' || lower(r.trade) || '%' or lower(r.trade) like '%' || lower(w.trade) || '%' then 30
               else 5 end
          + case when coalesce(lower(w.service_area), '') = coalesce(lower(r.service_area), '') and coalesce(r.service_area, '') <> '' then 25
                 when coalesce(lower(w.home_location), '') like '%' || coalesce(lower(r.service_area), '') || '%' and coalesce(r.service_area, '') <> '' then 15
                 else 5 end
          + case when w.status = 'available' then 15 when w.status = 'needs_review' then 8 else 0 end
          + case when w.consent_to_contact then 10 else 0 end
          + case when r.urgency in ('urgent','high') and w.status = 'available' then 5 else 0 end
        )::int as score,
        concat_ws(
          ' ',
          'Trade:', w.trade || '.',
          case when w.service_area is not null then 'Area: ' || w.service_area || '.' else null end,
          case when w.availability_label is not null then 'Availability: ' || w.availability_label || '.' else null end,
          case when w.consent_to_contact then 'Consent to contact is recorded.' else 'Contact consent still needs review.' end
        ) as reason
      from request r
      join public.labor_worker_availability w on w.tenant_id = r.tenant_id
      where w.status in ('available','needs_review','contacted')
    )
    insert into public.labor_staffing_matches (
      tenant_id, request_id, worker_availability_id, match_score, match_reason, status, metadata_json
    )
    select $1, $2, c.id, c.score, c.reason, 'suggested', $3::jsonb
    from candidates c
    where c.score >= 20
    order by c.score desc
    limit 8
    on conflict (request_id, worker_availability_id) do update
    set match_score = excluded.match_score,
        match_reason = excluded.match_reason,
        status = case
          when public.labor_staffing_matches.status in ('rejected','not_available','placed') then public.labor_staffing_matches.status
          else 'suggested'
        end,
        updated_at = now()
    `,
    [
      tenantId,
      parsed.data.requestId,
      JSON.stringify({
        generatedBy: "ferocity_labor_matcher",
        approvalRequired: true,
        noAvailabilityGuarantee: true
      })
    ]
  );

  await queryPostgres(
    `
    update public.labor_staffing_requests
    set status = case when status = 'open' then 'approval_needed' else status end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, parsed.data.requestId]
  );
  const matchCountResult = await queryPostgres<{ count: string }>(
    `
    select count(*)::text
    from public.labor_staffing_matches
    where tenant_id = $1 and request_id = $2 and status = 'suggested'
    `,
    [tenantId, parsed.data.requestId]
  );
  const matchCount = Number(matchCountResult?.rows[0]?.count ?? 0);
  await recordLaborOwnerEvent({
    tenantId,
    externalEventId: `labor-matches-${parsed.data.requestId}`,
    eventType: "labor.matches.generated",
    title: matchCount > 0 ? `${matchCount} labor match suggestion(s) ready` : "No labor matches found yet",
    summary: request
      ? `${request.title}: Ferocity checked available workers for ${request.trade}${request.service_area ? ` in ${request.service_area}` : ""}.`
      : "Ferocity checked available workers for this labor request.",
    severity: matchCount > 0 ? "medium" : "high",
    status: "needs_owner",
    ownerAttention: true,
    recommendedAction: matchCount > 0
      ? "Review suggested workers and approve contact for the best fit."
      : "Add workers, import MarketplacePro labor, or mark this as manual staffing needed.",
    metadata: {
      requestId: parsed.data.requestId,
      matchCount,
      request
    }
  });
  revalidatePath("/app/labor-bench");
  revalidatePath("/app/owner-command-center");
}

export async function updateLaborMatchStatusAction(formData: FormData) {
  const parsed = matchStatusSchema.safeParse({
    matchId: text(formData, "matchId"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const matchResult = await queryPostgres<{
    worker_name: string;
    request_title: string;
    trade: string;
  }>(
    `
    select w.name as worker_name, r.title as request_title, w.trade
    from public.labor_staffing_matches m
    join public.labor_worker_availability w on w.id = m.worker_availability_id
    join public.labor_staffing_requests r on r.id = m.request_id
    where m.tenant_id = $1 and m.id = $2
    limit 1
    `,
    [tenantId, parsed.data.matchId]
  );
  const match = matchResult?.rows[0];

  await queryPostgres(
    `
    update public.labor_staffing_matches
    set status = $3,
        owner_approved_at = case when $3 = 'owner_approved_contact' and owner_approved_at is null then now() else owner_approved_at end,
        contacted_at = case when $3 in ('contacted','worker_interested','placed') and contacted_at is null then now() else contacted_at end,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      parsed.data.matchId,
      parsed.data.status,
      JSON.stringify({
        updatedFrom: "labor_bench",
        livePlacementOrContactStillManual: parsed.data.status === "owner_approved_contact"
      })
    ]
  );
  if (match) {
    await recordLaborOwnerEvent({
      tenantId,
      externalEventId: `labor-match-${parsed.data.matchId}`,
      eventType: "labor.request.updated",
      title: `Labor match updated: ${match.worker_name}`,
      summary: `${match.worker_name} for ${match.request_title} is now ${parsed.data.status.replaceAll("_", " ")}.`,
      severity: ["owner_approved_contact", "worker_interested", "placed"].includes(parsed.data.status) ? "medium" : "low",
      status: parsed.data.status === "placed" ? "resolved" : "watching",
      ownerAttention: parsed.data.status === "owner_approved_contact",
      recommendedAction: parsed.data.status === "owner_approved_contact"
        ? "Contact the worker using approved business communication."
        : "Keep tracking the labor outcome in Labor Bench.",
      metadata: {
        matchId: parsed.data.matchId,
        matchStatus: parsed.data.status,
        trade: match.trade
      }
    });
  }
  revalidatePath("/app/labor-bench");
  revalidatePath("/app/owner-command-center");
}

export async function updateStaffingRequestStatusAction(formData: FormData) {
  const parsed = requestStatusSchema.safeParse({
    requestId: text(formData, "requestId"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ title: string; trade: string }>(
    `
    update public.labor_staffing_requests
    set status = $3,
        updated_at = now(),
        metadata_json = metadata_json || $4::jsonb
    where tenant_id = $1 and id = $2
    returning title, trade
    `,
    [
      tenantId,
      parsed.data.requestId,
      parsed.data.status,
      JSON.stringify({
        updatedFrom: "labor_bench",
        lifecycleStatus: parsed.data.status
      })
    ]
  );
  const request = result?.rows[0];

  if (request) {
    await recordLaborOwnerEvent({
      tenantId,
      externalEventId: `labor-request-status-${parsed.data.requestId}`,
      eventType: "labor.worker.updated",
      title: `Worker request ${parsed.data.status.replaceAll("_", " ")}: ${request.title}`,
      summary: `${request.title} for ${request.trade} is now ${parsed.data.status.replaceAll("_", " ")}.`,
      severity: ["cancelled", "paused", "filled"].includes(parsed.data.status) ? "low" : "medium",
      status: ["cancelled", "filled"].includes(parsed.data.status) ? "resolved" : "watching",
      ownerAttention: false,
      recommendedAction: parsed.data.status === "paused"
        ? "Resume the request when the business is ready to continue matching."
        : "Keep Labor Bench current so staffing needs do not clutter the owner view.",
      metadata: {
        requestId: parsed.data.requestId,
        requestStatus: parsed.data.status
      }
    });
  }

  revalidatePath("/app/labor-bench");
  revalidatePath("/app/owner-command-center");
}

export async function updateWorkerAvailabilityStatusAction(formData: FormData) {
  const parsed = workerStatusSchema.safeParse({
    workerId: text(formData, "workerId"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ name: string; trade: string }>(
    `
    update public.labor_worker_availability
    set status = $3,
        last_available_at = case when $3 = 'available' then now() else last_available_at end,
        updated_at = now(),
        metadata_json = metadata_json || $4::jsonb
    where tenant_id = $1 and id = $2
    returning name, trade
    `,
    [
      tenantId,
      parsed.data.workerId,
      parsed.data.status,
      JSON.stringify({
        updatedFrom: "labor_bench",
        lifecycleStatus: parsed.data.status
      })
    ]
  );
  const worker = result?.rows[0];

  if (worker) {
    await recordLaborOwnerEvent({
      tenantId,
      externalEventId: `labor-worker-status-${parsed.data.workerId}`,
      eventType: "labor.match.updated",
      title: `Worker status updated: ${worker.name}`,
      summary: `${worker.name} for ${worker.trade} is now ${parsed.data.status.replaceAll("_", " ")}.`,
      severity: parsed.data.status === "available" ? "low" : "info",
      status: "watching",
      ownerAttention: false,
      recommendedAction: "Keep worker availability current before generating new match suggestions.",
      metadata: {
        workerId: parsed.data.workerId,
        workerStatus: parsed.data.status
      }
    });
  }

  revalidatePath("/app/labor-bench");
  revalidatePath("/app/owner-command-center");
}
