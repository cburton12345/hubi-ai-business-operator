import { queryPostgres } from "@/lib/db/postgres";

export type VisitConflict = {
  type:
    | "missing_time"
    | "invalid_time"
    | "worker_overlap"
    | "outside_availability"
    | "time_off"
    | "missing_skill"
    | "missing_certification"
    | "expired_certification"
    | "crew_shortage"
    | "location_missing";
  severity: "warning" | "blocking";
  title: string;
  detail: string;
  workerId?: string;
  metadata?: Record<string, unknown>;
};

type VisitRow = {
  id: string;
  tenant_id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  required_crew_size: number;
  required_skills_json: unknown;
  required_certifications_json: unknown;
  address_line1: string | null;
  latitude: string | null;
  longitude: string | null;
};

type AssignmentRow = {
  worker_id: string | null;
  worker_name: string | null;
};

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function evaluateVisitSchedule(params: {
  tenantId: string;
  visitId: string;
  persist?: boolean;
}) {
  const visitResult = await queryPostgres<VisitRow>(
    `
    select v.id, v.tenant_id, v.scheduled_start, v.scheduled_end,
           v.required_crew_size, v.required_skills_json,
           v.required_certifications_json, l.address_line1,
           l.latitude::text, l.longitude::text
    from public.service_visits v
    left join public.customer_locations l
      on l.id = v.location_id and l.tenant_id = v.tenant_id
    where v.tenant_id = $1 and v.id = $2
    limit 1
    `,
    [params.tenantId, params.visitId]
  );
  const visit = visitResult?.rows[0];
  if (!visit) return [];

  const assignmentResult = await queryPostgres<AssignmentRow>(
    `
    select va.worker_id, w.name as worker_name
    from public.service_visit_assignments va
    left join public.operations_workers w
      on w.id = va.worker_id and w.tenant_id = va.tenant_id
    where va.tenant_id = $1 and va.visit_id = $2
      and va.status in ('proposed','assigned','acknowledged','dispatched')
    `,
    [params.tenantId, params.visitId]
  );
  const assignments = assignmentResult?.rows ?? [];
  const workerAssignments = assignments.filter((row) => row.worker_id);
  const conflicts: VisitConflict[] = [];

  if (!visit.scheduled_start || !visit.scheduled_end) {
    conflicts.push({
      type: "missing_time",
      severity: "blocking",
      title: "Visit does not have a complete time",
      detail: "Choose both a start and end time before dispatching this visit."
    });
  } else if (new Date(visit.scheduled_end) <= new Date(visit.scheduled_start)) {
    conflicts.push({
      type: "invalid_time",
      severity: "blocking",
      title: "Visit end time is invalid",
      detail: "The visit must end after it starts."
    });
  }

  if (!visit.address_line1 && (!visit.latitude || !visit.longitude)) {
    conflicts.push({
      type: "location_missing",
      severity: "warning",
      title: "Service location needs an address",
      detail: "Add an address or verified coordinates before routing or sending an arrival estimate."
    });
  }

  if (workerAssignments.length < visit.required_crew_size) {
    conflicts.push({
      type: "crew_shortage",
      severity: "blocking",
      title: "The required crew is not assigned",
      detail: `This visit needs ${visit.required_crew_size} worker${visit.required_crew_size === 1 ? "" : "s"} and currently has ${workerAssignments.length}.`,
      metadata: { requiredCrewSize: visit.required_crew_size, assignedWorkers: workerAssignments.length }
    });
  }

  if (visit.scheduled_start && visit.scheduled_end) {
    const requiredSkills = stringList(visit.required_skills_json);
    const requiredCertifications = stringList(visit.required_certifications_json);

    for (const assignment of workerAssignments) {
      const workerId = assignment.worker_id as string;
      const workerName = assignment.worker_name ?? "Assigned worker";

      const overlapResult = await queryPostgres<{ title: string; scheduled_start: string; scheduled_end: string }>(
        `
        select other.title, other.scheduled_start, other.scheduled_end
        from public.service_visit_assignments ova
        join public.service_visits other
          on other.id = ova.visit_id and other.tenant_id = ova.tenant_id
        where ova.tenant_id = $1
          and ova.worker_id = $2
          and ova.visit_id <> $3
          and ova.status in ('assigned','acknowledged','dispatched')
          and other.status not in ('completed','canceled','no_show')
          and other.scheduled_start < $5::timestamptz
          and other.scheduled_end > $4::timestamptz
        limit 1
        `,
        [params.tenantId, workerId, params.visitId, visit.scheduled_start, visit.scheduled_end]
      );
      const overlap = overlapResult?.rows[0];
      if (overlap) {
        conflicts.push({
          type: "worker_overlap",
          severity: "blocking",
          title: `${workerName} is already scheduled`,
          detail: `${overlap.title} overlaps this visit.`,
          workerId,
          metadata: { overlappingVisit: overlap.title, startsAt: overlap.scheduled_start, endsAt: overlap.scheduled_end }
        });
      }

      const timeOffResult = await queryPostgres<{ reason: string | null }>(
        `
        select reason
        from public.operations_worker_time_off
        where tenant_id = $1 and worker_id = $2 and status = 'approved'
          and starts_at < $4::timestamptz and ends_at > $3::timestamptz
        limit 1
        `,
        [params.tenantId, workerId, visit.scheduled_start, visit.scheduled_end]
      );
      const timeOff = timeOffResult?.rows[0];
      if (timeOff) {
        conflicts.push({
          type: "time_off",
          severity: "blocking",
          title: `${workerName} is unavailable`,
          detail: timeOff.reason || "Approved time off overlaps this visit.",
          workerId
        });
      }

      const availabilityResult = await queryPostgres<{ has_rules: boolean; is_available: boolean }>(
        `
        select
          exists (
            select 1 from public.operations_worker_availability a
            where a.tenant_id = $1 and a.worker_id = $2 and a.active
          ) as has_rules,
          exists (
            select 1
            from public.operations_worker_availability a
            where a.tenant_id = $1 and a.worker_id = $2 and a.active
              and extract(dow from $3::timestamptz at time zone a.timezone)::int = a.weekday
              and ($3::timestamptz at time zone a.timezone)::time >= a.start_time
              and ($4::timestamptz at time zone a.timezone)::time <= a.end_time
              and (a.effective_from is null or ($3::timestamptz at time zone a.timezone)::date >= a.effective_from)
              and (a.effective_until is null or ($3::timestamptz at time zone a.timezone)::date <= a.effective_until)
          ) as is_available
        `,
        [params.tenantId, workerId, visit.scheduled_start, visit.scheduled_end]
      );
      const availability = availabilityResult?.rows[0];
      if (availability?.has_rules && !availability.is_available) {
        conflicts.push({
          type: "outside_availability",
          severity: "blocking",
          title: `${workerName} is outside working hours`,
          detail: "The scheduled time is outside this worker's active availability.",
          workerId
        });
      }

      if (requiredSkills.length > 0) {
        const skillResult = await queryPostgres<{ skill_key: string }>(
          `
          select skill_key
          from public.operations_worker_skills
          where tenant_id = $1 and worker_id = $2
            and skill_key = any($3::text[])
            and verified
            and (expires_at is null or expires_at >= current_date)
          `,
          [params.tenantId, workerId, requiredSkills]
        );
        const held = new Set((skillResult?.rows ?? []).map((row) => row.skill_key));
        const missing = requiredSkills.filter((skill) => !held.has(skill));
        if (missing.length > 0) {
          conflicts.push({
            type: "missing_skill",
            severity: "blocking",
            title: `${workerName} is missing required skills`,
            detail: missing.join(", "),
            workerId,
            metadata: { missing }
          });
        }
      }

      if (requiredCertifications.length > 0) {
        const certResult = await queryPostgres<{ certification_key: string; expires_at: string | null }>(
          `
          select certification_key, expires_at::text
          from public.operations_worker_certifications
          where tenant_id = $1 and worker_id = $2
            and certification_key = any($3::text[])
            and verified
          `,
          [params.tenantId, workerId, requiredCertifications]
        );
        const certifications = new Map(
          (certResult?.rows ?? []).map((row) => [row.certification_key, row.expires_at])
        );
        const missing = requiredCertifications.filter((key) => !certifications.has(key));
        const expired = requiredCertifications.filter((key) => {
          const expiration = certifications.get(key);
          return expiration ? new Date(expiration) < new Date() : false;
        });
        if (missing.length > 0) {
          conflicts.push({
            type: "missing_certification",
            severity: "blocking",
            title: `${workerName} is missing required certifications`,
            detail: missing.join(", "),
            workerId,
            metadata: { missing }
          });
        }
        if (expired.length > 0) {
          conflicts.push({
            type: "expired_certification",
            severity: "blocking",
            title: `${workerName} has expired certifications`,
            detail: expired.join(", "),
            workerId,
            metadata: { expired }
          });
        }
      }
    }
  }

  if (params.persist !== false) {
    await queryPostgres(
      `
      update public.service_visit_conflicts
      set status = 'resolved', resolved_at = now(), resolution = 'No longer detected', updated_at = now()
      where tenant_id = $1 and visit_id = $2 and status in ('open','acknowledged')
      `,
      [params.tenantId, params.visitId]
    );

    for (const conflict of conflicts) {
      await queryPostgres(
        `
        insert into public.service_visit_conflicts (
          tenant_id, visit_id, worker_id, conflict_type, severity, status,
          title, detail, metadata_json
        )
        values ($1,$2,$3,$4,$5,'open',$6,$7,$8::jsonb)
        on conflict (
          tenant_id, visit_id, conflict_type, (coalesce(worker_id::text, ''))
        ) where status in ('open','acknowledged')
        do update set
          severity = excluded.severity,
          status = 'open',
          title = excluded.title,
          detail = excluded.detail,
          detected_at = now(),
          resolved_at = null,
          resolution = null,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        `,
        [
          params.tenantId,
          params.visitId,
          conflict.workerId ?? null,
          conflict.type,
          conflict.severity,
          conflict.title,
          conflict.detail,
          JSON.stringify(conflict.metadata ?? {})
        ]
      );
    }
  }

  return conflicts;
}
