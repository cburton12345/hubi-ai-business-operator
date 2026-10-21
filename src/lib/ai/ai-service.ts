import { getServiceGate, getWorkspacePlanKey, type PlanKey } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import {
  managedAiConfiguration,
  resolveAiExecutionConfiguration,
  type AiExecutionConfiguration
} from "@/lib/ai/byo-ai";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { estimateTextCostCents, type TextTokenUsage } from "@/lib/ai/model-pricing";
import { ensureJsonInstruction } from "@/lib/ai/json-response";

type AiCategory = "core" | "premium_media";
type AiRequestType = "json" | "vision_json";
type AiStatus = "completed" | "fallback" | "failed";

type OpenAiUsage = TextTokenUsage & {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenAiChatResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: OpenAiUsage;
};

type OpenAiResponsesResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }>;
    action?: { sources?: Array<{ type?: string; url?: string; title?: string }> };
  }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

type AiBudgetDecision = {
  allowed: boolean;
  reason: string;
  policyId?: string;
  monthlyRequests?: number;
  monthlyCostCents?: number;
};

const defaultCoreAiCostCapsCents: Record<PlanKey, number> = {
  free: 50,
  earn: 5000,
  ferocity_connect: 100,
  calls: 250,
  job_tracker: 100,
  starter: 500,
  growth: 2000,
  operator: 5000,
  managed_operator: 10000,
  pro_agency: 10000
};

function defaultAiCostCapCents(planKey: PlanKey, aiCategory: AiCategory) {
  if (aiCategory === "premium_media") return 0;
  const envKey = `AI_CORE_MONTHLY_CAP_${planKey.toUpperCase()}_CENTS`;
  const configured = Number(process.env[envKey]);
  return Number.isFinite(configured) && configured >= 0 ? configured : defaultCoreAiCostCapsCents[planKey];
}

export type AiJsonRequest<T> = {
  tenantId: string;
  brandId?: string | null;
  userId?: string | null;
  featureKey?: string;
  runType: string;
  system: string;
  user: string;
  fallback: T;
  aiCategory?: AiCategory;
  requestType?: AiRequestType;
  temperature?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

let activeAiRequests = 0;

function maxConcurrentAiRequests() {
  const configured = Number(process.env.AI_MAX_CONCURRENT_REQUESTS ?? 6);
  return Number.isFinite(configured) ? Math.max(1, Math.min(Math.floor(configured), 25)) : 6;
}

export type AiVisionJsonRequest<T> = Omit<AiJsonRequest<T>, "user" | "requestType"> & {
  userText: string;
  imageUrl: string;
  imageUrls?: string[];
  mimeType?: string | null;
};

function providerConfig(input?: { requestType?: AiRequestType; runType?: string }) {
  const managed = managedAiConfiguration(input?.requestType ?? "json", input?.runType);
  return {
    provider: managed.providerKey,
    model: managed.model,
    apiKey: managed.apiKey
  };
}

function parseJsonObject<T>(value: string): T | null {
  const trimmed = value.trim();
  const jsonText = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() : trimmed;

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
}

function safeErrorCategory(error: unknown) {
  if (!(error instanceof Error)) return "provider_error";
  const message = error.message.toLowerCase();
  if (message.includes("timeout")) return "provider_timeout";
  if (message.includes("rate")) return "provider_rate_limited";
  if (message.includes("unauthorized") || message.includes("401")) return "provider_auth";
  if (message.includes("json")) return "invalid_provider_json";
  return "provider_error";
}

function safeRecordedMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {};
  // Vision URLs may be short-lived private links or large data URLs. They are
  // request transport, not durable audit data, and must never be persisted.
  const { imageUrl: _imageUrl, imageUrls: _imageUrls, ...safe } = metadata;
  void _imageUrl;
  void _imageUrls;
  return safe;
}

async function getAiBudgetDecision(tenantId: string, aiCategory: AiCategory): Promise<AiBudgetDecision> {
  const result = await queryPostgres<{
    id: string;
    monthly_cap_cents: string | number | null;
    monthly_request_cap: number | null;
    emergency_paused: boolean;
    monthly_requests: string | number;
    monthly_cost_cents: string | number;
  }>(
    `
    with usage as (
      select
        count(*) filter (where status in ('completed', 'failed'))::int as monthly_requests,
        coalesce(sum(estimated_cost_cents), 0) as monthly_cost_cents
      from public.ai_usage_events
      where tenant_id = $1
        and ai_category = $2
        and created_at >= date_trunc('month', now())
    )
    select
      p.id,
      p.monthly_cap_cents,
      p.monthly_request_cap,
      p.emergency_paused,
      u.monthly_requests,
      u.monthly_cost_cents
    from public.ai_budget_policies p
    cross join usage u
    where (p.tenant_id = $1 or p.tenant_id is null)
      and p.ai_category = $2
      and p.status = 'active'
      and p.scope_type = 'workspace'
    order by p.tenant_id nulls first
    `,
    [tenantId, aiCategory]
  );

  for (const policy of result?.rows ?? []) {
    const monthlyRequests = Number(policy.monthly_requests ?? 0);
    const monthlyCostCents = Number(policy.monthly_cost_cents ?? 0);
    if (policy.emergency_paused) {
      return { allowed: false, reason: "AI usage is emergency-paused.", policyId: policy.id, monthlyRequests, monthlyCostCents };
    }
    if (policy.monthly_request_cap !== null && monthlyRequests >= policy.monthly_request_cap) {
      return { allowed: false, reason: "Monthly AI request cap reached.", policyId: policy.id, monthlyRequests, monthlyCostCents };
    }
    if (policy.monthly_cap_cents !== null && monthlyCostCents >= Number(policy.monthly_cap_cents)) {
      return { allowed: false, reason: "Monthly AI provider-cost cap reached.", policyId: policy.id, monthlyRequests, monthlyCostCents };
    }
  }

  if (!result?.rows?.length) {
    const [usageResult, planKey] = await Promise.all([
      queryPostgres<{ monthly_requests: number | string; monthly_cost_cents: number | string }>(
        `
        select
          count(*) filter (where status in ('completed', 'failed'))::int as monthly_requests,
          coalesce(sum(estimated_cost_cents), 0) as monthly_cost_cents
        from public.ai_usage_events
        where tenant_id = $1
          and ai_category = $2
          and created_at >= date_trunc('month', now())
        `,
        [tenantId, aiCategory]
      ),
      getWorkspacePlanKey(tenantId)
    ]);
    const monthlyRequests = Number(usageResult?.rows[0]?.monthly_requests ?? 0);
    const monthlyCostCents = Number(usageResult?.rows[0]?.monthly_cost_cents ?? 0);
    const monthlyCapCents = defaultAiCostCapCents(planKey, aiCategory);

    if (monthlyCostCents >= monthlyCapCents) {
      return {
        allowed: false,
        reason: "Monthly AI provider-cost safety cap reached.",
        monthlyRequests,
        monthlyCostCents
      };
    }

    return {
      allowed: true,
      reason: "Provider cost remains within the plan safety budget.",
      monthlyRequests,
      monthlyCostCents
    };
  }

  return { allowed: true, reason: "No active AI budget limit has been reached." };
}

async function recordAiUsageEvent(input: {
  tenantId: string;
  brandId?: string | null;
  userId?: string | null;
  providerKey: string;
  modelName: string;
  featureKey: string;
  runType: string;
  requestType: AiRequestType;
  aiCategory: AiCategory;
  status: AiStatus;
  usage?: OpenAiUsage;
  mediaUnits?: number;
  fallbackUsed: boolean;
  latencyMs?: number | null;
  errorCategory?: string | null;
  ownershipMode?: "ferocity_managed" | "workspace";
  metadata?: Record<string, unknown>;
  extraCostCents?: number;
}) {
  await queryPostgres(
    `
    insert into public.ai_usage_events (
      tenant_id,
      brand_id,
      user_id,
      provider_key,
      model_name,
      feature_key,
      run_type,
      request_type,
      ai_category,
      status,
      prompt_tokens,
      cached_prompt_tokens,
      completion_tokens,
      total_tokens,
      media_units,
      estimated_cost_cents,
      latency_ms,
      fallback_used,
      error_category,
      metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)
    `,
    [
      input.tenantId,
      input.brandId ?? null,
      input.userId ?? null,
      input.providerKey,
      input.modelName,
      input.featureKey,
      input.runType,
      input.requestType,
      input.aiCategory,
      input.status,
      input.usage?.prompt_tokens ?? 0,
      input.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      input.usage?.completion_tokens ?? 0,
      input.usage?.total_tokens ?? 0,
      input.mediaUnits ?? 0,
      input.ownershipMode === "workspace" ? 0 : estimateTextCostCents(input.modelName, input.usage) + Math.max(0, input.extraCostCents ?? 0),
      input.latencyMs ?? null,
      input.fallbackUsed,
      input.errorCategory ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export type WebResearchResult<T> = {
  data: T;
  sources: Array<{ url: string; title: string | null }>;
  searched: boolean;
  fallbackUsed: boolean;
};

export async function generateJsonWithWebSearch<T extends Record<string, unknown>>(
  input: AiJsonRequest<T> & { allowedDomains?: string[]; searchContextSize?: "low" | "medium" | "high" }
): Promise<WebResearchResult<T>> {
  const featureKey = input.featureKey ?? "ai_generation";
  const aiCategory = input.aiCategory ?? "core";
  const gate = await getServiceGate(input.tenantId, featureKey);
  if (!gate.enabled) {
    await handleFallback(input, "fallback", `AI web research skipped: ${gate.reason}`, { gate });
    return { data: input.fallback, sources: [], searched: false, fallbackUsed: true };
  }
  const budget = await getAiBudgetDecision(input.tenantId, aiCategory);
  if (!budget.allowed) {
    await handleFallback(input, "fallback", `AI web research skipped: ${budget.reason}`, { budget });
    return { data: input.fallback, sources: [], searched: false, fallbackUsed: true };
  }
  const config = await resolveAiExecutionConfiguration({ tenantId: input.tenantId, runType: input.runType, requestType: "json" });
  if (!config.apiKey || !config.baseUrl.includes("api.openai.com")) {
    await handleFallback(input, "fallback", "Live web research requires a compatible OpenAI Responses API credential.", undefined, config);
    return { data: input.fallback, sources: [], searched: false, fallbackUsed: true };
  }
  if (activeAiRequests >= maxConcurrentAiRequests()) {
    await handleFallback(input, "fallback", "AI provider capacity is busy; web research was deferred safely.", { errorCategory: "local_capacity_limit" }, config);
    return { data: input.fallback, sources: [], searched: false, fallbackUsed: true };
  }

  const startedAt = Date.now();
  activeAiRequests += 1;
  try {
    const allowedDomains = [...new Set((input.allowedDomains ?? []).map((value) => value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]).filter(Boolean))].slice(0, 100);
    const usesAstra = /^gpt-6-astra(?:-|$)/i.test(config.model);
    const configuredAstraEffort = process.env.AI_REASONING_EFFORT_ADVANCED;
    const astraEffort = ["low", "medium", "high", "xhigh", "max"].includes(configuredAstraEffort ?? "") ? configuredAstraEffort : "low";
    const response = await resilientFetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        ...(usesAstra ? { reasoning: { effort: astraEffort } } : {}),
        instructions: ensureJsonInstruction(input.system),
        input: input.user,
        tools: [{
          type: "web_search",
          search_context_size: input.searchContextSize ?? "low",
          external_web_access: true,
          ...(allowedDomains.length ? { filters: { allowed_domains: allowedDomains } } : {})
        }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"]
      })
    }, { timeoutMs: input.timeoutMs ?? 45_000 });
    if (!response.ok) throw new Error((await response.text()).slice(0, 500));
    const body = await response.json() as OpenAiResponsesResponse;
    const text = (body.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n");
    const parsed = parseJsonObject<T>(text);
    if (!parsed) throw new Error("Web research provider returned non-JSON content.");
    const sourceMap = new Map<string, { url: string; title: string | null }>();
    for (const item of body.output ?? []) {
      for (const source of item.action?.sources ?? []) if (source.url) sourceMap.set(source.url, { url: source.url, title: source.title ?? null });
      for (const content of item.content ?? []) for (const annotation of content.annotations ?? []) if (annotation.url) sourceMap.set(annotation.url, { url: annotation.url, title: annotation.title ?? null });
    }
    const sources = [...sourceMap.values()].slice(0, 100);
    const webSearchCalls = (body.output ?? []).filter((item) => item.type === "web_search_call").length;
    const usage: OpenAiUsage = {
      prompt_tokens: body.usage?.input_tokens ?? 0,
      completion_tokens: body.usage?.output_tokens ?? 0,
      total_tokens: body.usage?.total_tokens ?? 0
    };
    await Promise.all([
      recordAiGenerationRun({ tenantId: input.tenantId, brandId: input.brandId, runType: input.runType, prompt: { system: input.system, user: input.user }, response: parsed, status: "completed", fallbackUsed: false, providerKey: config.providerKey, modelName: config.model }),
      recordAiUsageEvent({
        tenantId: input.tenantId, brandId: input.brandId, userId: input.userId, providerKey: config.providerKey,
        modelName: config.model, featureKey, runType: input.runType, requestType: "json", aiCategory,
        status: "completed", usage, latencyMs: Date.now() - startedAt, fallbackUsed: false,
        ownershipMode: config.ownershipMode, extraCostCents: webSearchCalls,
        metadata: { ...safeRecordedMetadata(input.metadata), webSearchCalls, sourceCount: sources.length, liveExternalResearch: true }
      })
    ]);
    return { data: parsed, sources, searched: webSearchCalls > 0, fallbackUsed: false };
  } catch (error) {
    await handleFallback(input, "failed", error instanceof Error ? error.message : "AI web research failed.", { ...safeRecordedMetadata(input.metadata), latencyMs: Date.now() - startedAt }, config);
    return { data: input.fallback, sources: [], searched: false, fallbackUsed: true };
  } finally {
    activeAiRequests = Math.max(0, activeAiRequests - 1);
  }
}

export async function recordAiGenerationRun(input: {
  tenantId: string;
  brandId?: string | null;
  runType: string;
  prompt: Record<string, unknown>;
  response: Record<string, unknown>;
  status: AiStatus;
  fallbackUsed: boolean;
  errorMessage?: string | null;
  providerKey?: string;
  modelName?: string;
}) {
  const config = providerConfig({ runType: input.runType });
  await queryPostgres(
    `
    insert into public.ai_generation_runs (
      tenant_id,
      brand_id,
      provider,
      model,
      run_type,
      status,
      prompt_json,
      response_json,
      fallback_used,
      error_message
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
    `,
    [
      input.tenantId,
      input.brandId ?? null,
      input.providerKey ?? config.provider,
      input.modelName ?? config.model,
      input.runType,
      input.status,
      JSON.stringify(input.prompt),
      JSON.stringify(input.response),
      input.fallbackUsed,
      input.errorMessage ?? null
    ]
  );
}

async function handleFallback<T extends Record<string, unknown>>(
  input: AiJsonRequest<T>,
  status: AiStatus,
  reason: string,
  metadata?: Record<string, unknown>,
  executionConfig?: AiExecutionConfiguration
) {
  const config = executionConfig ?? managedAiConfiguration(input.requestType ?? "json", input.runType);
  await Promise.all([
    recordAiGenerationRun({
      tenantId: input.tenantId,
      brandId: input.brandId,
      runType: input.runType,
      prompt: { system: input.system, user: input.user },
      response: input.fallback,
      status,
      fallbackUsed: true,
      errorMessage: reason,
      providerKey: config.providerKey,
      modelName: config.model
    }),
    recordAiUsageEvent({
      tenantId: input.tenantId,
      brandId: input.brandId,
      userId: input.userId,
      providerKey: config.providerKey,
      modelName: config.model,
      featureKey: input.featureKey ?? "ai_generation",
      runType: input.runType,
      requestType: input.requestType ?? "json",
      aiCategory: input.aiCategory ?? "core",
      status,
      fallbackUsed: true,
      ownershipMode: config.ownershipMode,
      errorCategory: status === "failed" ? safeErrorCategory(new Error(reason)) : "fallback",
      metadata: {
        reason,
        ownershipMode: config.ownershipMode,
        byoAiUsed: config.providerKey === "openai_byok",
        ...safeRecordedMetadata(metadata ?? input.metadata)
      }
    })
  ]);

  return input.fallback;
}

export async function generateJsonWithAiService<T extends Record<string, unknown>>(input: AiJsonRequest<T>): Promise<T> {
  const featureKey = input.featureKey ?? "ai_generation";
  const requestType = input.requestType ?? "json";
  const aiCategory = input.aiCategory ?? "core";
  const gate = await getServiceGate(input.tenantId, featureKey);

  if (!gate.enabled) {
    return handleFallback(input, "fallback", `AI generation skipped: ${gate.reason}`, { gate });
  }

  const budget = await getAiBudgetDecision(input.tenantId, aiCategory);
  if (!budget.allowed) {
    return handleFallback(input, "fallback", `AI generation skipped: ${budget.reason}`, { budget });
  }

  const config = await resolveAiExecutionConfiguration({
    tenantId: input.tenantId,
    runType: input.runType,
    requestType
  });
  if (!config.apiKey) {
    return handleFallback(
      input,
      "fallback",
      "No usable AI provider credential is configured.",
      undefined,
      config
    );
  }

  if (activeAiRequests >= maxConcurrentAiRequests()) {
    return handleFallback(
      input,
      "fallback",
      "AI provider capacity is busy; Ferocity returned the safe workflow fallback instead of delaying the customer.",
      { errorCategory: "local_capacity_limit" },
      config
    );
  }

  const startedAt = Date.now();
  activeAiRequests += 1;

  try {
    const visionUrls = requestType === "vision_json"
      ? (Array.isArray(input.metadata?.imageUrls)
          ? input.metadata.imageUrls.filter((value): value is string => typeof value === "string" && value.length > 0)
          : typeof input.metadata?.imageUrl === "string" ? [input.metadata.imageUrl] : [])
      : [];
    const userContent = visionUrls.length
      ? [
          { type: "text", text: input.user },
          ...visionUrls.map((url) => ({ type: "image_url", image_url: { url } }))
        ]
      : input.user;
    const usesAstra = /^gpt-6-astra(?:-|$)/i.test(config.model);
    const configuredAstraEffort = process.env.AI_REASONING_EFFORT_ADVANCED;
    const astraEffort = ["low", "medium", "high", "xhigh", "max"].includes(configuredAstraEffort ?? "")
      ? configuredAstraEffort
      : "low";

    const response = await resilientFetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        // GPT-6 Astra rejects temperature/top-p controls. Low is the official
        // migration starting point when the previous model had no reasoning.
        ...(usesAstra ? { reasoning_effort: astraEffort } : { temperature: input.temperature ?? 0.4 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ensureJsonInstruction(input.system) },
          { role: "user", content: userContent }
        ]
      })
    }, { timeoutMs: input.timeoutMs ?? (usesAstra ? 60_000 : 18_000) });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText.slice(0, 500));
    }

    const data = (await response.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonObject<T>(content);

    if (!parsed) {
      throw new Error("Provider returned non-JSON content.");
    }

    await Promise.all([
      recordAiGenerationRun({
        tenantId: input.tenantId,
        brandId: input.brandId,
        runType: input.runType,
        prompt: { system: input.system, user: input.user },
        response: parsed,
        status: "completed",
        fallbackUsed: false,
        providerKey: config.providerKey,
        modelName: config.model
      }),
      recordAiUsageEvent({
        tenantId: input.tenantId,
        brandId: input.brandId,
        userId: input.userId,
        providerKey: config.providerKey,
        modelName: config.model,
        featureKey,
        runType: input.runType,
        requestType,
        aiCategory,
        status: "completed",
        usage: data.usage,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: false,
        ownershipMode: config.ownershipMode,
        metadata: {
          ...safeRecordedMetadata(input.metadata),
          ownershipMode: config.ownershipMode,
          byoAiUsed: config.providerKey === "openai_byok",
          providerCostBilledBy: config.ownershipMode === "workspace" ? "customer_provider" : "ferocity"
        }
      })
    ]);

    return parsed;
  } catch (error) {
    return handleFallback(input, "failed", error instanceof Error ? error.message : "AI provider call failed.", {
      ...safeRecordedMetadata(input.metadata),
      errorCategory: safeErrorCategory(error),
      latencyMs: Date.now() - startedAt
    }, config);
  } finally {
    activeAiRequests = Math.max(0, activeAiRequests - 1);
  }
}

export async function generateVisionJsonWithAiService<T extends Record<string, unknown>>(input: AiVisionJsonRequest<T>): Promise<T> {
  const request: AiJsonRequest<T> = {
    ...input,
    requestType: "vision_json",
    user: input.userText,
    metadata: {
      ...input.metadata,
      imageUrl: input.imageUrl,
      imageUrls: input.imageUrls,
      imageUrlPresent: Boolean(input.imageUrl),
      mimeType: input.mimeType ?? null
    },
    system: input.system
  };
  if (input.mimeType && !input.mimeType.startsWith("image/")) {
    return handleFallback(
      request,
      "fallback",
      `Vision generation skipped because ${input.mimeType} is not a supported image MIME type.`,
      { errorCategory: "unsupported_media_type", mimeType: input.mimeType },
    );
  }

  return generateJsonWithAiService<T>(request);
}
