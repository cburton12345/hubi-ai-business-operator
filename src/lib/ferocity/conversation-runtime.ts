import { createHash } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";

export const ferocityPlannedActionKeys = [
  "inspect_workspace",
  "create_operating_goal",
  "refresh_business_memory",
  "apply_setup_plan",
  "import_website",
  "prepare_marketing",
  "prepare_seo",
  "scan_revenue_loop",
  "prepare_authority",
  "create_expense_review_task",
  "create_time_review_task",
  "create_reminder",
  "create_job_estimate_task",
  "scan_business",
] as const;

export type FerocityPlannedActionKey = (typeof ferocityPlannedActionKeys)[number];

export type FerocityMemoryCandidate = {
  kind: "business_fact" | "preference" | "constraint" | "person" | "workflow";
  key: string;
  value: string;
  confidence: number;
};

export type FerocityCustomerMode = "internal_operator" | "active_customer" | "prospect_or_inactive";

export type FerocityCustomerRuntime = {
  mode: FerocityCustomerMode;
  accountType: string;
  planKey: string | null;
  subscriptionStatus: string | null;
  activeEntitlements: number;
  promptContext: string;
};

export function ferocityCustomerModeFor(
  accountType: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): FerocityCustomerMode {
  if (accountType === "internal") return "internal_operator";
  if (subscriptionStatus && ["active", "trialing", "manual"].includes(subscriptionStatus)) {
    return "active_customer";
  }
  return "prospect_or_inactive";
}

export type FerocityActionReceiptInput = {
  receiptKind: "inspection" | "draft" | "workspace_change" | "goal" | "approval" | "external" | "result";
  title: string;
  summary: string;
  status: "prepared" | "completed" | "needs_input" | "needs_approval" | "blocked" | "failed";
  href?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  operatingGoalId?: string | null;
  evidence?: Record<string, unknown>;
};

export type FerocityArtifactLink = {
  id: string;
  kind: FerocityActionReceiptInput["receiptKind"];
  title: string;
  status: FerocityActionReceiptInput["status"];
  href: string;
};

function completionEvidenceDisposition(evidence: Record<string, unknown> | undefined) {
  if (!evidence) return null;
  const verifiedCompletedActionCount = Number(evidence.verifiedCompletedActionCount ?? 0);
  if (Number.isFinite(verifiedCompletedActionCount) && verifiedCompletedActionCount > 0) return null;
  const statusValues = [
    evidence.planningAiStatus,
    evidence.responseAiStatus,
    evidence.providerStatus,
    evidence.reasoningStatus,
    evidence.executionStatus,
  ].filter((value): value is string => typeof value === "string").map((value) => value.toLowerCase());
  if (statusValues.some((value) => ["failed", "error"].includes(value))) return "failed" as const;
  if (evidence.fallbackUsed === true || statusValues.some((value) => ["fallback", "unavailable", "deferred"].includes(value))) {
    return "prepared" as const;
  }
  return null;
}

export function normalizeFerocityReceipt(receipt: FerocityActionReceiptInput): FerocityActionReceiptInput {
  const completionNeedsCanonicalTarget = receipt.status === "completed"
    && ["workspace_change", "external", "result"].includes(receipt.receiptKind);
  if (!completionNeedsCanonicalTarget) return receipt;
  const evidenceDisposition = completionEvidenceDisposition(receipt.evidence);
  const missingCanonicalTarget = !(receipt.href && receipt.targetTable && receipt.targetId);
  if (!evidenceDisposition && !missingCanonicalTarget) return receipt;
  return {
    ...receipt,
    status: evidenceDisposition ?? "prepared",
    evidence: {
      ...(receipt.evidence ?? {}),
      completionDowngraded: true,
      completionDowngradeReason: evidenceDisposition
        ? `execution_${evidenceDisposition}`
        : "missing_canonical_target",
    },
  };
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function memoryKey(value: string) {
  const normalized = clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || createHash("sha256").update(value).digest("hex").slice(0, 24);
}

const prohibitedMemory = /\b(password|passcode|api[- ]?key|secret|access[- ]?token|refresh[- ]?token|private[- ]?key|social security|ssn|routing number|bank account|credit card|card number|cvv|security code)\b/i;

export function memoryCandidateIsSafe(candidate: FerocityMemoryCandidate, ownerCommand: string) {
  const key = clean(candidate.key, 120);
  const value = clean(candidate.value, 1_000);
  const valueTokens = queryTokens(value);
  const commandTokens = new Set(queryTokens(ownerCommand));
  const groundedTokens = valueTokens.filter((token) => commandTokens.has(token)).length;
  const grounded = valueTokens.length <= 1
    ? ownerCommand.toLowerCase().includes(value.toLowerCase())
    : groundedTokens / valueTokens.length >= 0.6;
  return key
    && value
    && candidate.confidence >= 0.92
    && grounded
    && !prohibitedMemory.test(`${key} ${value}`)
    && !/\b\d{12,19}\b/.test(value);
}

export async function getFerocityCustomerRuntime(tenantId: string): Promise<FerocityCustomerRuntime> {
  try {
    const result = await queryPostgres<{
      account_type: string | null;
      plan_key: string | null;
      subscription_status: string | null;
      active_entitlements: string | number | null;
    }>(
      `select t.account_type,
         subscription.plan_key,
         subscription.status as subscription_status,
         (select count(*) from public.workspace_feature_entitlements entitlement
           where entitlement.tenant_id=t.id and entitlement.status in ('enabled','trial','limited')) as active_entitlements
       from public.tenants t
       left join lateral (
         select plan_key,status from public.billing_subscriptions
         where tenant_id=t.id order by updated_at desc limit 1
       ) subscription on true
       where t.id=$1 limit 1`,
      [tenantId],
    );
    const row = result?.rows[0];
    const accountType = row?.account_type ?? "customer";
    const subscriptionStatus = row?.subscription_status ?? null;
    const planKey = row?.plan_key ?? null;
    const activeEntitlements = Number(row?.active_entitlements ?? 0);
    const mode = ferocityCustomerModeFor(accountType, subscriptionStatus);
    const promptContext = mode === "active_customer"
      ? `This is an active Ferocity customer workspace${planKey ? ` on the ${planKey} plan` : ""}. Do not sell Ferocity or tell the owner to subscribe. Carry authorized work through the available workflows and ask only for missing facts, approval, or a genuinely unavailable connection.`
      : mode === "internal_operator"
        ? "This is Ferocity's internal operating workspace. Do not use sales or subscription language. Act as the implementation operator within the configured authority boundaries."
        : "This workspace does not have a verified active subscription. Give a useful diagnosis first, gather only the minimum business/economic context needed to evaluate the work, then offer one contextual Request Ferocity next step when execution would require Ferocity service.";
    return { mode, accountType, planKey, subscriptionStatus, activeEntitlements, promptContext };
  } catch {
    return {
      mode: "prospect_or_inactive",
      accountType: "unknown",
      planKey: null,
      subscriptionStatus: null,
      activeEntitlements: 0,
      promptContext: "Subscription state could not be verified. Do not claim paid access or sell aggressively; answer usefully and distinguish available work from setup requirements.",
    };
  }
}

function queryTokens(value: string) {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].slice(0, 20);
}

export async function getFerocityConversationMemory(input: {
  tenantId: string;
  userId?: string | null;
  query: string;
  limit?: number;
}) {
  try {
    const userKey = input.userId ? `user:${input.userId}` : "workspace";
    const result = await queryPostgres<{
      memory_kind: FerocityMemoryCandidate["kind"];
      memory_key: string;
      value_text: string;
      confidence: string | number;
      subject_user_key: string;
      updated_at: Date;
    }>(
      `select memory_kind,memory_key,value_text,confidence,subject_user_key,updated_at
       from public.ferocity_conversation_memories
       where tenant_id=$1 and status='active' and subject_user_key in ('workspace',$2)
       order by case when subject_user_key=$2 then 0 else 1 end,updated_at desc
       limit 80`,
      [input.tenantId, userKey],
    );
    const tokens = queryTokens(input.query);
    const memories = (result?.rows ?? []).map((row) => {
      const searchable = `${row.memory_key} ${row.value_text}`.toLowerCase();
      const relevance = tokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0);
      const personal = row.subject_user_key === userKey ? 2 : 0;
      return { ...row, score: relevance * 4 + personal + Number(row.confidence) };
    }).sort((left, right) => right.score - left.score).slice(0, Math.max(1, Math.min(input.limit ?? 12, 20)));
    if (!memories.length) return "";
    return memories.map((item) => `- ${item.memory_kind}/${item.memory_key}: ${item.value_text}`).join("\n");
  } catch {
    // Migration 241 may not be live yet. Chat must remain available without memory.
    return "";
  }
}

export async function applyFerocityConversationMemory(input: {
  tenantId: string;
  userId?: string | null;
  threadId?: string | null;
  command: string;
  candidates: FerocityMemoryCandidate[];
}) {
  const userKey = input.userId ? `user:${input.userId}` : "workspace";
  const lower = input.command.toLowerCase();
  const forgetEverything = /\bforget (?:everything|all of that|all memories|what you know about me)\b/i.test(input.command);
  const forgetMatch = input.command.match(/\bforget (?:that |what i said about |what you know about )?(.{3,160})/i);
  try {
    if (forgetEverything) {
      const forgotten = await queryPostgres<{ id: string }>(
        `update public.ferocity_conversation_memories set status='forgotten',forgotten_at=now(),updated_at=now()
         where tenant_id=$1 and subject_user_key=$2 and status='active' returning id`,
        [input.tenantId, userKey],
      );
      return { saved: 0, forgotten: forgotten?.rows.length ?? 0, available: true };
    }
    if (forgetMatch?.[1]) {
      const target = clean(forgetMatch[1], 160).replace(/[%_]/g, "");
      const forgotten = await queryPostgres<{ id: string }>(
        `update public.ferocity_conversation_memories set status='forgotten',forgotten_at=now(),updated_at=now()
         where tenant_id=$1 and subject_user_key in ('workspace',$2) and status='active'
           and (memory_key ilike $3 or value_text ilike $3) returning id`,
        [input.tenantId, userKey, `%${target}%`],
      );
      return { saved: 0, forgotten: forgotten?.rows.length ?? 0, available: true };
    }
    if (/\b(?:password|passcode|secret|token|api key|card number|bank account)\b/i.test(lower)) {
      return { saved: 0, forgotten: 0, available: true };
    }
    const explicitRemember = input.command.match(/^\s*remember(?: that)?\s+(.{3,1000})\s*$/i)?.[1];
    const explicitCandidate: FerocityMemoryCandidate[] = explicitRemember
      ? [{ kind: "business_fact", key: explicitRemember.split(/\s+/).slice(0, 8).join(" "), value: explicitRemember, confidence: 1 }]
      : [];
    const accepted = [...explicitCandidate, ...input.candidates]
      .filter((candidate, index, items) => items.findIndex((item) => memoryKey(item.key) === memoryKey(candidate.key)) === index)
      .filter((candidate) => memoryCandidateIsSafe(candidate, input.command))
      .slice(0, 5);
    let saved = 0;
    for (const candidate of accepted) {
      const subjectUserKey = candidate.kind === "preference" ? userKey : "workspace";
      const result = await queryPostgres<{ id: string }>(
        `insert into public.ferocity_conversation_memories
           (tenant_id,subject_user_key,scope,memory_kind,memory_key,value_text,confidence,status,source_thread_id,source_message_excerpt,metadata_json)
         values ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10::jsonb)
         on conflict (tenant_id,subject_user_key,memory_key) do update set
           memory_kind=excluded.memory_kind,value_text=excluded.value_text,
           confidence=greatest(public.ferocity_conversation_memories.confidence,excluded.confidence),
           status='active',forgotten_at=null,source_thread_id=excluded.source_thread_id,
           source_message_excerpt=excluded.source_message_excerpt,updated_at=now()
         returning id`,
        [
          input.tenantId,
          subjectUserKey,
          subjectUserKey === "workspace" ? "workspace" : "user",
          candidate.kind,
          memoryKey(candidate.key),
          clean(candidate.value, 1_000),
          candidate.confidence,
          input.threadId ?? null,
          clean(input.command, 500),
          JSON.stringify({ source: "ask_ferocity", explicitOwnerStatement: true }),
        ],
      );
      if (result?.rows[0]) saved += 1;
    }
    return { saved, forgotten: 0, available: true };
  } catch {
    return { saved: 0, forgotten: 0, available: false };
  }
}

export async function recordFerocityActionReceipts(input: {
  tenantId: string;
  threadId?: string | null;
  commandRunId?: string | null;
  receipts: FerocityActionReceiptInput[];
}): Promise<FerocityArtifactLink[]> {
  const links: FerocityArtifactLink[] = [];
  for (const candidate of input.receipts.slice(0, 20)) {
    const receipt = normalizeFerocityReceipt(candidate);
    try {
      const result = await queryPostgres<{ id: string; href: string | null }>(
        `insert into public.ferocity_chat_action_receipts
           (tenant_id,thread_id,command_run_id,operating_goal_id,receipt_kind,title,summary,status,href,target_table,target_id,evidence_json)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         returning id,href`,
        [
          input.tenantId,
          input.threadId ?? null,
          input.commandRunId ?? null,
          receipt.operatingGoalId ?? null,
          receipt.receiptKind,
          clean(receipt.title, 240),
          clean(receipt.summary, 2_000),
          receipt.status,
          receipt.href ?? null,
          clean(receipt.targetTable, 120) || null,
          clean(receipt.targetId, 240) || null,
          JSON.stringify(receipt.evidence ?? {}),
        ],
      );
      const row = result?.rows[0];
      if (row?.href) links.push({ id: row.id, kind: receipt.receiptKind, title: receipt.title, status: receipt.status, href: row.href });
    } catch {
      // Receipts are additive evidence; failure must not duplicate or reverse completed work.
    }
  }
  return links;
}
