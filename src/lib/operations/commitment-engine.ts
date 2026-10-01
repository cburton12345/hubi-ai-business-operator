import { createHash } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";

export type CommitmentCandidate = {
  description: string;
  dueAt: string | null;
  responsibleType:
    | "user"
    | "employee"
    | "vendor"
    | "customer"
    | "ai"
    | "ferocity"
    | "unassigned";
  responsibleLabel: string | null;
  expectedOutcome: string | null;
  importance: "low" | "normal" | "high" | "critical";
  confidenceScore: number;
  completionEvidenceRequired: boolean;
};

export type CommitmentTransition =
  "active" | "completed" | "verified" | "canceled";

function cleanText(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeCommitmentCandidate(
  value: unknown,
): CommitmentCandidate | null {
  if (typeof value === "string") {
    const description = cleanText(value);
    return description
      ? {
          description,
          dueAt: null,
          responsibleType: "unassigned",
          responsibleLabel: null,
          expectedOutcome: null,
          importance: "normal",
          confidenceScore: 50,
          completionEvidenceRequired: false,
        }
      : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const description = cleanText(
    item.description ?? item.commitment ?? item.action ?? item.text,
  );
  if (!description) return null;
  const allowedResponsible = new Set([
    "user",
    "employee",
    "vendor",
    "customer",
    "ai",
    "ferocity",
    "unassigned",
  ]);
  const responsibleType = allowedResponsible.has(String(item.responsibleType))
    ? (String(item.responsibleType) as CommitmentCandidate["responsibleType"])
    : "unassigned";
  const allowedImportance = new Set(["low", "normal", "high", "critical"]);
  const importance = allowedImportance.has(String(item.importance))
    ? (String(item.importance) as CommitmentCandidate["importance"])
    : "normal";
  const confidence = Number(item.confidenceScore ?? item.confidence ?? 70);
  return {
    description,
    dueAt: validDate(item.dueAt ?? item.due_at ?? item.deadline),
    responsibleType,
    responsibleLabel:
      cleanText(
        item.responsibleLabel ?? item.owner ?? item.responsibleParty,
        180,
      ) || null,
    expectedOutcome:
      cleanText(item.expectedOutcome ?? item.outcome, 1_000) || null,
    importance,
    confidenceScore: Number.isFinite(confidence)
      ? Math.max(0, Math.min(100, Math.round(confidence)))
      : 50,
    completionEvidenceRequired:
      item.completionEvidenceRequired === true ||
      item.evidenceRequired === true,
  };
}

export function commitmentState(input: {
  status: string;
  dueAt: string | Date | null;
  now?: Date;
}) {
  if (!["active", "due_soon", "overdue"].includes(input.status) || !input.dueAt)
    return input.status;
  const due = new Date(input.dueAt).getTime();
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(due)) return input.status;
  if (due < now) return "overdue";
  if (due - now <= 24 * 60 * 60 * 1_000) return "due_soon";
  return "active";
}

export async function transitionOperatingCommitment(input: {
  tenantId: string;
  commitmentId: string;
  nextStatus: CommitmentTransition;
  actorType: "user" | "employee" | "ai" | "ferocity" | "system";
  actorId?: string | null;
  note?: string | null;
  evidence?: Record<string, unknown>;
}) {
  const currentResult = await queryPostgres<{
    id: string;
    status: string;
    due_at: Date | null;
    responsible_type: string;
    completion_evidence_required: boolean;
    completion_evidence_json: Record<string, unknown> | null;
  }>(
    `select id,status,due_at,responsible_type,completion_evidence_required,completion_evidence_json
     from public.operating_commitments where tenant_id=$1 and id=$2 limit 1`,
    [input.tenantId, input.commitmentId],
  );
  const current = currentResult?.rows[0];
  if (!current) throw new Error("Commitment not found.");
  if (
    input.nextStatus === "active" &&
    (!current.due_at || current.responsible_type === "unassigned")
  ) {
    throw new Error(
      "A commitment needs a responsible party and deadline before it can be confirmed.",
    );
  }
  if (
    input.nextStatus === "completed" &&
    current.completion_evidence_required &&
    !Object.keys(input.evidence ?? {}).length &&
    !input.note?.trim()
  ) {
    throw new Error(
      "Completion evidence is required before this commitment can be completed.",
    );
  }
  if (input.nextStatus === "verified" && current.status !== "completed") {
    throw new Error(
      "A commitment must be completed before its outcome can be verified.",
    );
  }

  const evidence = {
    ...(current.completion_evidence_json ?? {}),
    ...(input.evidence ?? {}),
  };
  await queryPostgres(
    `update public.operating_commitments set status=$3,completion_evidence_json=$4::jsonb,
       confirmed_at=case when $3='active' then coalesce(confirmed_at,now()) else confirmed_at end,
       completed_at=case when $3='completed' then now() else completed_at end,
       verified_at=case when $3='verified' then now() else verified_at end,
       canceled_at=case when $3='canceled' then now() else canceled_at end,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [
      input.tenantId,
      input.commitmentId,
      input.nextStatus,
      JSON.stringify(evidence),
    ],
  );
  await queryPostgres(
    `insert into public.operating_commitment_events
       (tenant_id,commitment_id,event_type,previous_status,next_status,actor_type,actor_id,note,evidence_json)
     values ($1,$2,'status_changed',$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      input.tenantId,
      input.commitmentId,
      current.status,
      input.nextStatus,
      input.actorType,
      input.actorId ?? null,
      input.note?.trim() || null,
      JSON.stringify(input.evidence ?? {}),
    ],
  );
  return {
    id: input.commitmentId,
    previousStatus: current.status,
    status: input.nextStatus,
  };
}

export async function captureCommitmentsFromActionItems(input: {
  tenantId: string;
  brandId?: string | null;
  sourceType: string;
  sourceTable: string;
  sourceId: string;
  sourceReference?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  actionItems: unknown[];
}) {
  let created = 0;
  let needsConfirmation = 0;
  for (const [index, raw] of input.actionItems.slice(0, 20).entries()) {
    const candidate = normalizeCommitmentCandidate(raw);
    if (!candidate) continue;
    const commitmentKey = createHash("sha256")
      .update(
        `${input.sourceType}:${input.sourceId}:${index}:${candidate.description.toLowerCase()}`,
      )
      .digest("hex");
    const confirmed = Boolean(
      candidate.dueAt &&
      candidate.responsibleType !== "unassigned" &&
      candidate.confidenceScore >= 70,
    );
    const result = await queryPostgres<{ id: string }>(
      `insert into public.operating_commitments (
         tenant_id,brand_id,commitment_key,description,status,importance,responsible_type,responsible_label,
         due_at,related_entity_type,related_entity_id,source_type,source_table,source_id,source_reference,
         confidence_score,expected_outcome,completion_evidence_required,confirmed_at,metadata_json
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)
       on conflict (tenant_id,commitment_key) do nothing returning id`,
      [
        input.tenantId,
        input.brandId ?? null,
        commitmentKey,
        candidate.description,
        confirmed ? "active" : "needs_confirmation",
        candidate.importance,
        candidate.responsibleType,
        candidate.responsibleLabel,
        candidate.dueAt,
        input.relatedEntityType ?? null,
        input.relatedEntityId ?? null,
        input.sourceType,
        input.sourceTable,
        input.sourceId,
        input.sourceReference ?? null,
        candidate.confidenceScore,
        candidate.expectedOutcome,
        candidate.completionEvidenceRequired,
        confirmed ? new Date().toISOString() : null,
        JSON.stringify({ capturedFromActionItem: true, sourceIndex: index }),
      ],
    );
    if (!result?.rows[0]) continue;
    created += 1;
    if (!confirmed) needsConfirmation += 1;
    await queryPostgres(
      `insert into public.operating_commitment_events (tenant_id,commitment_id,event_type,next_status,actor_type,note,evidence_json) values ($1,$2,'captured',$3,'system',$4,$5::jsonb)`,
      [
        input.tenantId,
        result.rows[0].id,
        confirmed ? "active" : "needs_confirmation",
        "Captured from a completed business interaction.",
        JSON.stringify({
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          confidenceScore: candidate.confidenceScore,
        }),
      ],
    );
  }
  return { created, needsConfirmation };
}

export async function syncOperatingCommitmentsForTenant(tenantId: string) {
  const rows = await queryPostgres<{
    id: string;
    description: string;
    status: string;
    importance: string;
    due_at: Date | null;
    responsible_label: string | null;
    related_entity_type: string | null;
    related_entity_id: string | null;
  }>(
    `select id,description,status,importance,due_at,responsible_label,related_entity_type,related_entity_id
     from public.operating_commitments where tenant_id=$1 and status in ('needs_confirmation','active','due_soon','overdue','blocked')
     order by due_at nulls last,created_at limit 250`,
    [tenantId],
  );
  let updated = 0;
  let followUps = 0;
  let ownerEscalations = 0;
  for (const row of rows?.rows ?? []) {
    const next = commitmentState({ status: row.status, dueAt: row.due_at });
    if (next !== row.status) {
      await queryPostgres(
        `update public.operating_commitments set status=$3,updated_at=now() where tenant_id=$1 and id=$2`,
        [tenantId, row.id, next],
      );
      await queryPostgres(
        `insert into public.operating_commitment_events (tenant_id,commitment_id,event_type,previous_status,next_status,actor_type,note) values ($1,$2,$3,$4,$5,'system',$6)`,
        [
          tenantId,
          row.id,
          next === "overdue" ? "deadline_missed" : "due_soon",
          row.status,
          next,
          next === "overdue"
            ? "The commitment passed its deadline without completion evidence."
            : "The commitment is due within 24 hours.",
        ],
      );
      updated += 1;
    }
    if (next !== "overdue") continue;
    const requiresOwner = row.importance === "critical";
    const request = await queryPostgres<{ id: string }>(
      `insert into public.office_manager_action_requests (
         tenant_id,action_type,status,priority,confidence_score,title,summary,recommended_action,
         target_table,target_id,idempotency_key,requires_owner,due_at,metadata_json
       ) values ($1,'custom','needs_review',$2,100,'Broken commitment needs follow-through',$3,$4,
         'operating_commitments',$5,$6,$7,$8,$9::jsonb)
       on conflict (tenant_id,idempotency_key) do nothing returning id`,
      [
        tenantId,
        requiresOwner
          ? "urgent"
          : row.importance === "high"
            ? "high"
            : "normal",
        row.description,
        `Confirm the outcome, contact ${row.responsible_label ?? "the responsible party"}, or reassign with a new deadline.`,
        row.id,
        `commitment-overdue:${row.id}`,
        requiresOwner,
        row.due_at,
        JSON.stringify({
          commitmentId: row.id,
          ownerEscalationReason: requiresOwner
            ? "critical broken commitment"
            : null,
          desiredOutcome: "commitment completed and verified",
        }),
      ],
    );
    if (request?.rows[0]) {
      followUps += 1;
      await queryPostgres(
        `update public.operating_commitments set last_followed_up_at=now(),updated_at=now() where tenant_id=$1 and id=$2`,
        [tenantId, row.id],
      );
    }
    if (requiresOwner) {
      const event = await queryPostgres<{ id: string }>(
        `insert into public.owner_command_events (tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,owner_attention,ai_handled,recommended_action,action_href,risk_type,confidence_score,metadata_json) values ($1,'ferocity','Ferocity',$2,'commitment.overdue','A critical promise was missed',$3,'critical','needs_owner',true,false,$4,'/app/owner-command-center','operational',100,$5::jsonb) on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do nothing returning id`,
        [
          tenantId,
          `commitment-overdue:${row.id}`,
          row.description,
          "Review Ferocity's follow-through packet and decide whether to reassign, recover, or cancel.",
          JSON.stringify({
            commitmentId: row.id,
            dueAt: row.due_at,
            relatedEntityType: row.related_entity_type,
            relatedEntityId: row.related_entity_id,
          }),
        ],
      );
      if (event?.rows[0]) ownerEscalations += 1;
    }
  }
  return {
    checked: rows?.rows.length ?? 0,
    updated,
    followUps,
    ownerEscalations,
  };
}
