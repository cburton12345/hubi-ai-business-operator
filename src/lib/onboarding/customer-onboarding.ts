import { queryPostgres } from "@/lib/db/postgres";
import { addOperatingGoalDependency, createOperatingGoal } from "@/lib/operations/goal-engine";

export const CUSTOMER_ONBOARDING_GOAL_KEY = "customer-onboarding:v1";

export type OnboardingConnectionRecommendation = {
  capability: "communications" | "calendar" | "crm" | "phone" | "advertising" | "payments";
  label: string;
  reason: string;
  href: string;
  providers: string[];
};

export type CustomerOnboardingState = {
  goalId: string | null;
  complete: boolean;
  firstValueReached: boolean;
  firstValueEvidence: OnboardingFirstValueEvidence | null;
  connectedProviders: string[];
  connectionIssues: OnboardingConnectionIssue[];
  recommendations: OnboardingConnectionRecommendation[];
  steps: Array<{ label: string; complete: boolean; href: string }>;
  currentStep: { label: string; href: string } | null;
};

export type OnboardingFirstValueEvidence = {
  receiptId: string;
  title: string;
  href: string;
  targetTable: string;
  targetId: string;
};

export type OnboardingConnectionIssue = {
  provider: string;
  missingScopes: string[];
  reason: "insufficient_scopes" | "invalid_credentials" | "disconnected";
};

export type OnboardingSignals = {
  tenant_name: string;
  onboarding_status: string;
  brand_id: string | null;
  brand_name: string | null;
  industry: string | null;
  business_model: string | null;
  description: string | null;
  primary_goal: string | null;
  approval_mode: string | null;
  authority_confirmations: number;
  connected_providers: string[] | null;
  verified_receipts: number;
  operational_records: number;
  first_value_evidence?: unknown;
  connection_issues?: unknown;
};

const PROVIDER_GROUPS: Record<OnboardingConnectionRecommendation["capability"], string[]> = {
  communications: ["gmail_mailbox", "microsoft_mailbox"],
  calendar: ["google_calendar", "microsoft_calendar"],
  crm: ["jobber", "housecall_pro", "servicetitan", "hubspot"],
  phone: ["retell", "twilio", "ferocity_connect"],
  advertising: ["facebook", "google_ads", "microsoft_ads", "linkedin_ads", "pinterest_ads", "reddit", "snapchat_ads", "tiktok_business", "x_ads"],
  payments: ["stripe_connect", "stripe"],
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function recommendOnboardingConnections(input: {
  industry?: string | null;
  businessModel?: string | null;
  description?: string | null;
  primaryGoal?: string | null;
}) {
  const context = [input.industry, input.businessModel, input.description, input.primaryGoal]
    .filter(Boolean).join(" ").toLowerCase();
  const recommendations: OnboardingConnectionRecommendation[] = [];
  const add = (item: OnboardingConnectionRecommendation) => {
    if (!recommendations.some((current) => current.capability === item.capability)) recommendations.push(item);
  };

  // Communication is the safest high-value discovery source for nearly every operating business.
  add({
    capability: "communications",
    label: "Connect the inbox customers use",
    reason: "Ferocity can learn customer context and prepare follow-up without sending anything.",
    href: "/app/integrations?focus=mailbox&onboarding=1",
    providers: PROVIDER_GROUPS.communications,
  });
  if (includesAny(context, ["appointment", "schedule", "booking", "calendar", "service", "rental", "property"])) {
    add({ capability: "calendar", label: "Connect the operating calendar", reason: "Ferocity can find availability and scheduling conflicts before proposing work.", href: "/app/integrations/calendar?onboarding=1", providers: PROVIDER_GROUPS.calendar });
  }
  if (includesAny(context, ["lead", "customer", "crm", "job", "estimate", "service", "contractor", "repair"])) {
    add({ capability: "crm", label: "Connect the system holding customers and jobs", reason: "Ferocity can discover the existing workflow instead of making you re-enter it.", href: "/app/integrations?focus=service-platform&onboarding=1", providers: PROVIDER_GROUPS.crm });
  }
  if (includesAny(context, ["call", "phone", "text", "sms", "reception", "appointment"])) {
    add({ capability: "phone", label: "Connect calls and texts", reason: "Ferocity can monitor communication and prepare authorized responses with the business context intact.", href: "/app/integrations?focus=phone&onboarding=1", providers: PROVIDER_GROUPS.phone });
  }
  if (includesAny(context, ["advert", "campaign", "marketing", "lead generation", "growth", "social media"])) {
    add({ capability: "advertising", label: "Connect the advertising account you already use", reason: "Ferocity starts with reporting and account discovery; publishing and spend remain separately controlled.", href: "/app/integrations/advertising?onboarding=1", providers: PROVIDER_GROUPS.advertising });
  }
  if (includesAny(context, ["payment", "invoice", "billing", "revenue", "cash", "subscription"])) {
    add({ capability: "payments", label: "Connect payments", reason: "Ferocity can reconcile operating signals without receiving authority to move money.", href: "/app/billing?onboarding=1", providers: PROVIDER_GROUPS.payments });
  }
  return recommendations.slice(0, 4);
}

async function loadSignals(tenantId: string) {
  const result = await queryPostgres<OnboardingSignals>(`
    select tenant.name as tenant_name,tenant.onboarding_status,
      brand.id as brand_id,brand.name as brand_name,brand.industry,brand.business_model,
      brand.description,brand.primary_goal,settings.approval_mode,
      ((select count(*) from public.operator_timeline_events event
          where event.tenant_id=tenant.id
            and event.event_type in ('autopilot_preset_applied','service_control_updated'))+
       (select count(*) from public.activity_logs log
          where log.tenant_id=tenant.id
            and log.action='workspace.auto_created_from_public_request'
            and log.metadata_json ? 'autonomyMode'))::int as authority_confirmations,
      coalesce((select array_agg(distinct connection.provider order by connection.provider)
        from public.integration_connections connection
        where connection.tenant_id=tenant.id and connection.status='connected'
          and connection.credentials_status='configured'
          and coalesce(connection.metadata_json->>'scopeVerificationStatus','verified') <> 'insufficient'),array[]::text[]) as connected_providers,
      coalesce((select jsonb_agg(jsonb_build_object(
          'provider',connection.provider,
          'status',connection.status,
          'credentialsStatus',connection.credentials_status,
          'scopeVerificationStatus',connection.metadata_json->>'scopeVerificationStatus',
          'missingScopes',coalesce(connection.metadata_json->'missingScopes','[]'::jsonb)
        ) order by connection.provider)
        from public.integration_connections connection
        where connection.tenant_id=tenant.id and (
          connection.status <> 'connected'
          or connection.credentials_status <> 'configured'
          or connection.metadata_json->>'scopeVerificationStatus'='insufficient'
        )), '[]'::jsonb) as connection_issues,
      (select count(*)::int from public.ferocity_chat_action_receipts receipt
        where receipt.tenant_id=tenant.id and receipt.status='completed'
          and nullif(receipt.href,'') is not null
          and nullif(receipt.target_table,'') is not null
          and nullif(receipt.target_id,'') is not null
          and (receipt.receipt_kind in ('external','result')
            or (receipt.receipt_kind='workspace_change' and receipt.evidence_json->>'verifiedAfterWrite'='true'))) as verified_receipts,
      (select jsonb_build_object(
          'receiptId',receipt.id,
          'title',receipt.title,
          'href',receipt.href,
          'targetTable',receipt.target_table,
          'targetId',receipt.target_id
        ) from public.ferocity_chat_action_receipts receipt
        where receipt.tenant_id=tenant.id and receipt.status='completed'
          and nullif(receipt.href,'') is not null
          and nullif(receipt.target_table,'') is not null
          and nullif(receipt.target_id,'') is not null
          and (receipt.receipt_kind in ('external','result')
            or (receipt.receipt_kind='workspace_change' and receipt.evidence_json->>'verifiedAfterWrite'='true'))
        order by receipt.created_at desc limit 1) as first_value_evidence,
      ((select count(*) from public.leads lead where lead.tenant_id=tenant.id)+
       (select count(*) from public.customers customer where customer.tenant_id=tenant.id)+
       (select count(*) from public.service_jobs job where job.tenant_id=tenant.id)+
       (select count(*) from public.service_invoices invoice where invoice.tenant_id=tenant.id)+
       (select count(*) from public.mailbox_messages message where message.tenant_id=tenant.id)+
       (select count(*) from public.external_calendar_events event where event.tenant_id=tenant.id and event.provider_deleted_at is null)+
       (select count(*) from public.document_intelligence_documents document where document.tenant_id=tenant.id and document.status <> 'failed'))::int as operational_records
    from public.tenants tenant
    left join lateral (select * from public.brands b where b.tenant_id=tenant.id and b.status='active' order by b.created_at limit 1) brand on true
    left join public.brand_marketing_settings settings on settings.brand_id=brand.id
    where tenant.id=$1 and tenant.status <> 'archived' limit 1`, [tenantId]);
  return result?.rows[0] ?? null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeFirstValueEvidence(value: unknown): OnboardingFirstValueEvidence | null {
  const input = record(value);
  if (!input) return null;
  const receiptId = typeof input.receiptId === "string" ? input.receiptId.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const href = typeof input.href === "string" ? input.href.trim() : "";
  const targetTable = typeof input.targetTable === "string" ? input.targetTable.trim() : "";
  const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
  if (!receiptId || !title || !href.startsWith("/app/") || !targetTable || !targetId) return null;
  return { receiptId, title, href, targetTable, targetId };
}

export function normalizeOnboardingConnectionIssues(value: unknown): OnboardingConnectionIssue[] {
  if (!Array.isArray(value)) return [];
  const issues: OnboardingConnectionIssue[] = [];
  for (const entry of value) {
    const input = record(entry);
    const provider = typeof input?.provider === "string" ? input.provider.trim() : "";
    if (!provider) continue;
    const missingScopes = Array.isArray(input?.missingScopes)
      ? input.missingScopes.filter((scope): scope is string => typeof scope === "string" && scope.trim().length > 0)
      : [];
    const scopeStatus = input?.scopeVerificationStatus;
    const credentialsStatus = input?.credentialsStatus;
    const status = input?.status;
    const reason: OnboardingConnectionIssue["reason"] = scopeStatus === "insufficient"
      ? "insufficient_scopes"
      : credentialsStatus !== "configured"
        ? "invalid_credentials"
        : status !== "connected"
          ? "disconnected"
          : "invalid_credentials";
    if (!issues.some((issue) => issue.provider === provider && issue.reason === reason)) {
      issues.push({ provider, missingScopes: [...new Set(missingScopes)].sort(), reason });
    }
  }
  return issues;
}

export function evaluateCustomerOnboardingSignals(row: OnboardingSignals) {
  const recommendations = recommendOnboardingConnections({
    industry: row.industry,
    businessModel: row.business_model,
    description: row.description,
    primaryGoal: row.primary_goal,
  });
  const connectedProviders = row.connected_providers ?? [];
  const connectionIssues = normalizeOnboardingConnectionIssues(row.connection_issues);
  const firstValueEvidence = normalizeFirstValueEvidence(row.first_value_evidence);
  const businessContextComplete = Boolean(row.brand_name && row.industry && (row.description || row.primary_goal));
  // Provisioning installs conservative defaults, but defaults are not owner
  // consent. Count only a durable user-originated authority decision.
  const authorityComplete = Number(row.authority_confirmations) > 0;
  const matchedConnection = recommendations.find((recommendation) =>
    recommendation.providers.some((provider) => connectedProviders.includes(provider)));
  // Outside providers are optional. A customer can begin with Ferocity-native
  // records or documents and still finish onboarding without granting OAuth.
  const primaryConnectionComplete = Boolean(matchedConnection) || connectedProviders.length > 0 || Number(row.operational_records) > 0;
  // Existing records provide useful context, but onboarding first value requires
  // a completed, directly openable Ferocity result tied to an authoritative row.
  const firstValueReached = Boolean(firstValueEvidence);
  // A successful OAuth handshake is connection evidence, not business discovery.
  // Discovery becomes complete only when Ferocity has also produced a verified
  // result or imported a real operating record from the business.
  const discoveryComplete = primaryConnectionComplete && (Number(row.operational_records) > 0 || firstValueReached);
  const complete = businessContextComplete && authorityComplete && primaryConnectionComplete && discoveryComplete && firstValueReached;
  return { recommendations, connectedProviders, connectionIssues, firstValueEvidence, businessContextComplete, authorityComplete, primaryConnectionComplete, discoveryComplete, firstValueReached, complete };
}

type EvaluatedOnboardingState = ReturnType<typeof evaluateCustomerOnboardingSignals>;

export function buildCustomerOnboardingResumePlan(state: EvaluatedOnboardingState) {
  const nextConnection = state.recommendations.find((item) => !item.providers.some((provider) => state.connectedProviders.includes(provider))) ?? state.recommendations[0];
  // A failed optional connector must not block a customer who already supplied
  // another healthy source or native record. It becomes blocking only when it
  // is the unfinished path currently expected to provide business context.
  const connectionIssue = state.primaryConnectionComplete ? undefined : state.connectionIssues[0];
  const reconnectHref = connectionIssue
    ? `/app/integrations?onboarding=1&setup=scope_reconnect_required&provider=${encodeURIComponent(connectionIssue.provider)}&missing=${encodeURIComponent(connectionIssue.missingScopes.join(","))}`
    : null;
  const reconnectLabel = connectionIssue
    ? connectionIssue.reason === "insufficient_scopes"
      ? `Reconnect ${connectionIssue.provider.replaceAll("_", " ")} with the required read access`
      : `Reconnect ${connectionIssue.provider.replaceAll("_", " ")}`
    : null;
  const steps = [
    { key: "business_context", type: "information" as const, title: "Tell Ferocity what the business does and the outcome that matters", done: state.businessContextComplete, href: "/app/business-brain" },
    { key: "authority_preferences", type: "capability" as const, title: "Confirm what Ferocity may handle and what still needs approval", done: state.authorityComplete, href: "/app/controls?onboarding=1" },
    { key: "primary_connection", type: "integration" as const, title: reconnectLabel ?? nextConnection?.label ?? "Connect a system or give Ferocity one real business item", done: state.primaryConnectionComplete, href: reconnectHref ?? nextConnection?.href ?? "/app/integrations" },
    { key: "initial_discovery", type: "information" as const, title: "Let Ferocity verify and discover the connected business context", done: state.discoveryComplete, href: "/app/integrations" },
    { key: "first_value", type: "external_event" as const, title: "Complete and verify the first useful business result", done: state.firstValueReached, href: state.firstValueEvidence?.href ?? "/app/ferocity?onboarding=1" },
  ];
  return { steps, currentStep: steps.find((step) => !step.done) ?? null };
}

export async function ensureCustomerOnboardingGoal(tenantId: string, sourceType = "customer_signup") {
  const row = await loadSignals(tenantId);
  if (!row) return null;
  const goal = await createOperatingGoal({
    tenantId,
    brandId: row.brand_id,
    goalKey: CUSTOMER_ONBOARDING_GOAL_KEY,
    goalType: "customer_onboarding",
    title: "Get Ferocity working on the business",
    desiredOutcome: "Ferocity understands the business, has the minimum safe connections and authority, completes discovery, and produces a verified useful result.",
    priority: "high",
    authorityMode: "prepare",
    domainSystem: "ferocity",
    sourceType,
    completionRules: {
      businessContextRequired: true,
      authorityPreferencesRequired: true,
      contextualBusinessSourceRequired: true,
      discoveryEvidenceRequired: true,
      verifiedFirstValueRequired: true,
    },
    constraints: { readFirst: true, consequentialActionsRequireApproval: true, credentialsViaOAuthOnly: true },
  });
  return goal;
}

export async function syncCustomerOnboardingForTenant(tenantId: string): Promise<CustomerOnboardingState | null> {
  const row = await loadSignals(tenantId);
  if (!row) return null;
  const goal = await ensureCustomerOnboardingGoal(tenantId, "onboarding_sync");
  if (!goal) return null;
  const state = evaluateCustomerOnboardingSignals(row);
  const { steps: dependencies, currentStep: currentDependency } = buildCustomerOnboardingResumePlan(state);
  await Promise.all(dependencies.map((dependency) => addOperatingGoalDependency({
    tenantId, goalId: goal.id, dependencyKey: dependency.key, dependencyType: dependency.type,
    title: dependency.title, status: dependency.done ? "satisfied" : "pending", required: true,
    ownerActionRequired: !dependency.done && ["business_context", "authority_preferences", "primary_connection"].includes(dependency.key),
    externalReference: dependency.href,
    evidence: { complete: dependency.done, checkedAt: new Date().toISOString() },
  })));
  await queryPostgres(`update public.operating_goals set status=$3,
      current_state_json=current_state_json || $4::jsonb,
      last_evaluation_summary=$5,completed_at=case when $3='completed' then coalesce(completed_at,now()) else null end,
      next_evaluation_at=case when $3='completed' then now()+interval '365 days' else now() end,updated_at=now()
    where tenant_id=$1 and id=$2`, [tenantId, goal.id, state.complete ? "completed" : "active", JSON.stringify({ ...state, recommendations: state.recommendations, outcomeVerified: state.complete, currentStepKey: currentDependency?.key ?? null, currentStepHref: currentDependency?.href ?? null }), state.complete ? "Onboarding is complete with connection, discovery, and first-value evidence." : `Ferocity is continuing from ${currentDependency?.title ?? "the next unfinished setup step"}.`]);
  await queryPostgres(`update public.tenants set onboarding_status=$2,
      onboarding_completed_at=case when $2='completed' then coalesce(onboarding_completed_at,now()) else null end,updated_at=now()
    where id=$1`, [tenantId, state.complete ? "completed" : "in_progress"]);
  return {
    goalId: goal.id,
    complete: state.complete,
    firstValueReached: state.firstValueReached,
    firstValueEvidence: state.firstValueEvidence,
    connectedProviders: state.connectedProviders,
    connectionIssues: state.connectionIssues,
    recommendations: state.recommendations,
    steps: dependencies.map((dependency) => ({ label: dependency.title, complete: dependency.done, href: dependency.href })),
    currentStep: currentDependency ? { label: currentDependency.title, href: currentDependency.href } : null,
  };
}

export async function getCustomerOnboardingState(tenantId: string): Promise<CustomerOnboardingState> {
  const synced = await syncCustomerOnboardingForTenant(tenantId).catch(() => null);
  if (synced) return synced;
  return {
    goalId: null, complete: false, firstValueReached: false, firstValueEvidence: null, connectedProviders: [], connectionIssues: [],
    recommendations: recommendOnboardingConnections({}),
    steps: [
      { label: "Tell Ferocity about the business and desired outcome", complete: false, href: "/app/business-brain" },
      { label: "Confirm what Ferocity may handle and what still needs approval", complete: false, href: "/app/controls?onboarding=1" },
      { label: "Connect a system or give Ferocity one real business item", complete: false, href: "/app/integrations?focus=mailbox&onboarding=1" },
      { label: "Complete and verify the first useful result", complete: false, href: "/app/ferocity?onboarding=1" },
    ],
    currentStep: { label: "Tell Ferocity about the business and desired outcome", href: "/app/business-brain" },
  };
}
