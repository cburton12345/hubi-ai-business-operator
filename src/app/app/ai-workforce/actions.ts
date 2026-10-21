"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { scanActionQueueAction } from "@/app/app/actions/actions";
import { processCompletedJobsForAuthorityAction } from "@/app/app/authority/actions";
import { applySetupPlanAction } from "@/app/app/build-system/actions";
import { scanGrowthLoopAction } from "@/app/app/growth/actions";
import {
  createAdAutopilotPackageAction,
  createContentStudioCampaignAction,
  createOneClickCampaignAction,
  refreshBusinessProfileMemoryAction,
  requestWebsiteImportAction
} from "@/app/app/marketing-os/actions";
import { scanLeadToJobLoopAction } from "@/app/app/operator/actions";
import { generateSeoAutopilotAction } from "@/app/app/seo/actions";
import { scanServiceOpsAction } from "@/app/app/service/actions";
import { getAttentionCommandDashboard } from "@/lib/attention-command/get-attention-command-dashboard";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { classifyAiCommandIntent, readOnlyRouteForCommand, workspaceRouteForCommand } from "@/lib/ai-workforce/command-intent";
import {
  clarificationQuestionForUnderstanding,
  commandSearchText,
  groundFerocityUnderstandingInEvidence,
  understandFerocityCommand,
} from "@/lib/ai-workforce/command-understanding";
import { applyCommandActionPolicy, isFinancialDocumentCommand } from "@/lib/ai-workforce/command-action-policy";
import {
  correctLatestOperatingGoalFromThread,
  createOperatingGoal,
  getActiveOperatingGoalContextForThread,
} from "@/lib/operations/goal-engine";
import {
  correctedOperatingGoalOutcome,
  isExplicitOperatingGoalCorrection,
  operatingGoalCandidateFromCommand,
  operatingGoalCandidateFromPlannedOutcome,
} from "@/lib/operations/goal-intake";
import { discoverRelevantCapabilities, type CapabilityRecommendation } from "@/lib/ai-workforce/capability-discovery";
import { readBusinessActionForCommand, summarizeBusinessActionItems } from "@/lib/ai-workforce/business-action-routing";
import { invokeBusinessAction, type BusinessActionPrincipal } from "@/lib/business-actions/gateway";
import { queryPostgres } from "@/lib/db/postgres";
import { createOwnerGrowthObjectiveFromCommand } from "@/lib/growth/composable-growth-intelligence";
import { processNewestWebsiteImportForUrl } from "@/lib/marketing-os/website-import-processor";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getLatestCompanionContextSummaryForAi } from "@/lib/integrations/h4r/brain-context";
import {
  applyFerocityConversationMemory,
  getFerocityConversationMemory,
  getFerocityCustomerRuntime,
  recordFerocityActionReceipts,
  type FerocityActionReceiptInput,
  type FerocityArtifactLink,
  type FerocityPlannedActionKey,
} from "@/lib/ferocity/conversation-runtime";
import { independentlyReviewFerocityCommandPlan } from "@/lib/ferocity/command-plan-review";
import { collectFerocityScopedEvidence, scopedEvidencePrompt } from "@/lib/ferocity/scoped-business-evidence";

type AiWorkforceState = {
  ok: boolean;
  message?: string;
  prepared?: string[];
  blocked?: string[];
  runId?: string;
  intent?: string;
  href?: string;
  actionLabel?: string;
  needsInput?: boolean;
  recommended?: CapabilityRecommendation[];
  artifacts?: FerocityArtifactLink[];
};

function resultActionLabel(href: string) {
  if (href.startsWith("/app/leads") || href === "/app/lead-command") return "Open matching leads";
  if (href === "/app/cash-collection") return "Review balances and collections";
  if (href === "/app/expenses") return "Review documents and transactions";
  if (href === "/app/pos") return "Open sales and inventory";
  if (href === "/app/reports") return "Open reports and downloads";
  if (href === "/app/approvals") return "Review required approvals";
  if (href === "/app/integrations") return "Review provider connections";
  if (href === "/app/automation") return "Review active automations";
  if (href === "/app/email-watch") return "Open connected email";
  if (href === "/app/schedule") return "Open schedule and dispatch";
  if (href === "/app/marketing-os" || href === "/app/growth") return "Open campaign work";
  if (href === "/app/authority") return "Review proof and reputation work";
  if (href === "/app/job-tracker") return "Open job and cost work";
  if (href.startsWith("/app/operations-workforce")) return "Open team work";
  if (href === "/app/notifications") return "Open reminders";
  if (href === "/app/seo") return "Review website and SEO work";
  if (href === "/app/review" || href === "/app/actions") return "Review prepared actions";
  if (href === "/app/controls") return "Resolve required controls";
  if (href === "/app/attention-command") return "Open this priority";
  return "Open the finished work";
}

const commandSchema = z.object({
  command: z.string().trim().min(2).max(2000),
  conversationContext: z.string().trim().max(6000).optional(),
  onboardingMode: z.enum(["true", "false"]).default("false"),
  threadId: z.string().uuid().optional(),
});

function hasAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function advisoryText(answer: string, nextSteps: string[]) {
  if (!nextSteps.length) return answer;
  return `${answer}\n\nRecommended next steps:\n${nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
}

function setupRequestFor(command: string) {
  const lower = command.toLowerCase();
  if (hasAny(lower, ["review", "testimonial", "reputation"])) {
    return `${command}. Set up review requests, customer proof capture, testimonial content, reputation workflows, and approval-safe follow-up.`;
  }
  if (hasAny(lower, ["authority", "proof", "case study", "finished work", "completed job", "turn this job into marketing", "job into marketing"])) {
    return `${command}. Set up Authority Engine so completed work becomes proof requests, review requests, case studies, FAQs, posts, website trust, and video scripts with approval before publishing.`;
  }
  if (hasAny(lower, ["campaign", "storm", "hail", "facebook", "instagram", "ad", "promotion", "referral"])) {
    return `${command}. Set up marketing campaign drafts, landing page targets, source tracking, social, GBP, email, customer messages, and ad copy. Keep publishing or spend behind approval.`;
  }
  if (hasAny(lower, ["website", "homepage", "site", "wordpress", "webflow", "landing page"])) {
    return `${command}. Set up website connector, lead forms, page drafts, SEO targets, source tracking, and draft-first publishing controls.`;
  }
  if (hasAny(lower, ["follow", "reactivate", "old lead", "stale", "last month", "missed call", "callback", "estimate", "invoice"])) {
    return `${command}. Set up lead recovery, missed callback, estimate follow-up, invoice follow-up, review timing, and customer message drafts for review.`;
  }
  if (hasAny(lower, ["setup", "set up", "business", "company", "start"])) {
    return `${command}. Set up business profile, services, service areas, lead forms, reviews, SEO drafts, automations, and go-live controls.`;
  }
  return `${command}. Set up growth, lead capture, SEO, reviews, follow-up, automations, reporting, and safe provider controls.`;
}

function campaignKeyFor(command: string) {
  const lower = command.toLowerCase();
  if (hasAny(lower, ["storm", "hail", "roof"])) return "storm_campaign";
  if (hasAny(lower, ["review", "testimonial", "proof"])) return "review_campaign";
  if (hasAny(lower, ["referral"])) return "referral_campaign";
  return null;
}

function firstUrl(command: string) {
  const match = command.match(/https?:\/\/[^\s)]+/i);
  return match?.[0]?.replace(/[.,;!?]+$/, "") ?? null;
}

function moneyFrom(command: string) {
  const match = command.match(/\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/);
  if (!match) return null;
  const whole = match[1].replace(/,/g, "");
  const decimal = match[2] ?? "00";
  const amount = Number(`${whole}.${decimal.padEnd(2, "0")}`);
  return Number.isFinite(amount) ? amount : null;
}

function dueDateFrom(command: string) {
  const lower = command.toLowerCase();
  const date = new Date();
  if (lower.includes("tomorrow")) {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date;
  }
  if (lower.includes("tonight")) {
    date.setHours(18, 0, 0, 0);
    return date;
  }
  if (lower.includes("today")) {
    date.setHours(Math.max(date.getHours() + 1, 9), 0, 0, 0);
    return date;
  }
  const explicit = command.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?/i);
  if (explicit) {
    const parsed = new Date(explicit[0]);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(9, 0, 0, 0);
      return parsed;
    }
  }
  date.setHours(date.getHours() + 2, 0, 0, 0);
  return date;
}

function platformsFrom(command: string) {
  const lower = command.toLowerCase();
  const platforms: string[] = [];
  if (hasAny(lower, ["facebook", "fb", "meta"])) platforms.push("facebook", "instagram");
  if (lower.includes("instagram")) platforms.push("instagram");
  if (lower.includes("google")) platforms.push("google");
  if (lower.includes("tiktok")) platforms.push("tiktok");
  if (lower.includes("youtube")) platforms.push("youtube");
  if (lower.includes("reddit")) platforms.push("reddit");
  if (hasAny(lower, ["microsoft", "bing"])) platforms.push("microsoft");
  return [...new Set(platforms.length ? platforms : ["facebook", "instagram", "google"])];
}

function titleFromCommand(command: string, fallback: string) {
  return command
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/[^\w\s$.,:-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(" ")
    .trim() || fallback;
}

async function timeline(workspaceId: string, title: string, body: string, metadata: Record<string, unknown>) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'system', 'ai_workforce_command', $2, $3, $4::jsonb)
    `,
    [workspaceId, title, body, JSON.stringify(metadata)]
  );
}

async function createCommandTask(input: {
  workspaceId: string;
  userId: string | null;
  command: string;
  title: string;
  category: "today" | "money" | "paperwork" | "people" | "reminder" | "project" | "waiting" | "personal";
  priority?: "low" | "normal" | "high" | "critical";
  dueAt?: Date | null;
  recommendedAction: string;
  actionHref: string;
}) {
  const duplicate = await queryPostgres<{ id: string }>(
    `
    select id
    from public.personal_ops_items
    where tenant_id = $1
      and category = $2
      and title = $3
      and notes = $4
      and created_at >= now() - interval '45 seconds'
    order by created_at desc
    limit 1
    `,
    [input.workspaceId, input.category, input.title, input.command]
  );
  if (duplicate?.rows[0]?.id) return duplicate.rows[0].id;

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.personal_ops_items (
      tenant_id, owner_user_id, category, title, notes, priority, due_at, recommended_action, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    returning id
    `,
    [
      input.workspaceId,
      input.userId,
      input.category,
      input.title,
      input.command,
      input.priority ?? "normal",
      input.dueAt?.toISOString() ?? null,
      input.recommendedAction,
      JSON.stringify({ source: "ai_workforce_command", command: input.command, actionHref: input.actionHref })
    ]
  );

  const itemId = result?.rows[0]?.id ?? null;
  await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href,
      money_cents, risk_type, confidence_score, metadata_json
    )
    values ($1, 'ferocity', 'Ferocity', $2, 'ai.command.task_created', $3, $4, $5, 'needs_owner', true, false, $6, $7, $8, 0, $9, 82, $10::jsonb)
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
    do update set
      title = excluded.title,
      summary = excluded.summary,
      recommended_action = excluded.recommended_action,
      action_href = excluded.action_href,
      metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [
      input.workspaceId,
      `ai-command-task:${Buffer.from(`${input.command}:${input.title}`).toString("base64url").slice(0, 72)}`,
      input.title,
      input.recommendedAction,
      input.priority === "critical" ? "critical" : input.priority === "high" ? "high" : "medium",
      "Ferocity created a task because the request needs details or approval before it can be completed safely.",
      input.recommendedAction,
      input.actionHref,
      input.category === "money" ? "financial" : input.category === "people" ? "approval" : null,
      JSON.stringify({ source: "ai_workforce_command", personalOpsItemId: itemId, command: input.command })
    ]
  );

  return itemId;
}

async function createCommandReminder(input: {
  workspaceId: string;
  userId: string | null;
  command: string;
  title: string;
  body: string;
  reminderType: "meeting" | "goal" | "task" | "follow_up" | "payment" | "personal" | "custom";
  priority?: "low" | "medium" | "high" | "critical";
  remindAt: Date;
  actionUrl: string;
}) {
  const duplicate = await queryPostgres<{ id: string }>(
    `
    select id
    from public.owner_reminders
    where tenant_id = $1
      and coalesce(user_id::text, '') = coalesce($2::text, '')
      and title = $3
      and body = $4
      and reminder_type = $5
      and remind_at = $6
      and created_at >= now() - interval '45 seconds'
    order by created_at desc
    limit 1
    `,
    [input.workspaceId, input.userId, input.title, input.body, input.reminderType, input.remindAt.toISOString()]
  );
  if (duplicate?.rows[0]?.id) return duplicate.rows[0].id;

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.owner_reminders (
      tenant_id, user_id, title, body, reminder_type, priority, remind_at, recurrence,
      push_enabled, action_url, next_due_at, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, 'none', true, $8, $7, $9::jsonb)
    returning id
    `,
    [
      input.workspaceId,
      input.userId,
      input.title,
      input.body,
      input.reminderType,
      input.priority ?? "medium",
      input.remindAt.toISOString(),
      input.actionUrl,
      JSON.stringify({ source: "ai_workforce_command", command: input.command })
    ]
  );
  return result?.rows[0]?.id ?? null;
}

async function ownerCommandEvent(workspaceId: string, command: string, prepared: string[], blocked: string[]) {
  const hasBlocked = blocked.length > 0;
  const summary = hasBlocked
    ? `AI prepared ${prepared.length} item(s), but ${blocked.length} item(s) need owner review before the setup can continue.`
    : `AI prepared ${prepared.length} item(s) inside existing Ferocity systems. Review the prepared work before anything goes live.`;

  await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href,
      money_cents, risk_type, confidence_score, metadata_json
    )
    values (
      $1, 'ferocity', 'Ferocity', $2, 'ai.command.prepared', $3, $4,
      $5, $6, $7, $8, $9, $10, '/app/build-system',
      0, $11, $12, $13::jsonb
    )
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
    do update set
      title = excluded.title,
      summary = excluded.summary,
      severity = excluded.severity,
      status = excluded.status,
      owner_attention = excluded.owner_attention,
      ai_handled = excluded.ai_handled,
      ai_summary = excluded.ai_summary,
      recommended_action = excluded.recommended_action,
      risk_type = excluded.risk_type,
      confidence_score = excluded.confidence_score,
      metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [
      workspaceId,
      `ai-command:${Buffer.from(command).toString("base64url").slice(0, 48)}:${Date.now()}`,
      hasBlocked ? "AI command needs review" : "AI command prepared work",
      summary,
      hasBlocked ? "high" : "medium",
      hasBlocked ? "needs_owner" : "ai_handled",
      hasBlocked,
      !hasBlocked,
      summary,
      hasBlocked ? "Open Setup Assistant and resolve the blocked setup items." : "Open Setup Assistant to review the prepared setup, marketing, SEO, and workflow records.",
      hasBlocked ? "approval" : null,
      hasBlocked ? 78 : 88,
      JSON.stringify({
        source: "ai_workforce_command",
        command,
        prepared,
        blocked,
        noLiveActions: true,
        reviewRoutes: ["/app/build-system", "/app/owner-command-center", "/app/actions", "/app/review", "/app/publishing-hub"]
      })
    ]
  );
}

function routesForCommand(command: string, blocked: string[]) {
  const lower = command.toLowerCase();
  const routes: Array<{ label: string; href: string; reason: string }> = [
    { label: "Needs Attention", href: "/app/attention-command", reason: "See what needs the owner now." },
    { label: "Review Queue", href: "/app/review", reason: "Approve or export prepared public/customer-facing work." }
  ];
  if (hasAny(lower, ["video", "ad", "campaign", "facebook", "instagram", "google", "tiktok", "youtube", "reddit"])) {
    routes.unshift({ label: "Marketing OS", href: "/app/marketing-os", reason: "Review campaign, ad, video, and platform assets." });
  }
  if (hasAny(lower, ["authority", "proof", "case study", "finished work", "completed job", "job into marketing", "turn this job into marketing", "reviews from jobs"])) {
    routes.unshift({ label: "Authority Engine", href: "/app/authority", reason: "Turn completed work into proof, reviews, case studies, posts, website trust, and video scripts." });
  }
  if (hasAny(lower, ["receipt", "expense", "tax", "deduction", "deposit", "statement"])) {
    routes.unshift({ label: "Expenses", href: "/app/expenses", reason: "Review imported documents and classified transactions." });
  }
  if (hasAny(lower, ["print", "report", "summary", "download", "export"]) && hasAny(lower, ["expense", "tax", "deposit", "statement"])) {
    routes.unshift({ label: "Reports", href: "/app/reports", reason: "Open printable summaries and downloads." });
  }
  if (hasAny(lower, ["bid", "quote", "material", "profit", "job cost"])) {
    routes.unshift({ label: "Jobs & Money", href: "/app/job-tracker", reason: "Finish job money, material, bid, or profit details." });
  }
  if (hasAny(lower, ["hours", "clock", "timesheet", "worker", "crew", "schedule", "dispatch"])) {
    routes.unshift({ label: "Team", href: "/app/operations-workforce", reason: "Finish time, crew, assignment, or field details." });
  }
  if (hasAny(lower, ["remind", "reminder", "tomorrow", "goal", "meeting"])) {
    routes.unshift({ label: "Notifications", href: "/app/notifications", reason: "Review or adjust reminders and push settings." });
  }
  if (hasAny(lower, ["website", "seo", "rank", "page", "homepage"])) {
    routes.unshift({ label: "Website / SEO", href: "/app/seo", reason: "Review website import, SEO drafts, and page work." });
  }
  if (blocked.length > 0) {
    routes.push({ label: "Setup Controls", href: "/app/controls", reason: "Resolve approval, provider, or usage blockers." });
  }
  return routes.filter((route, index, list) => list.findIndex((item) => item.href === route.href) === index).slice(0, 6);
}

function missingInfoForCommand(command: string, blocked: string[]) {
  const lower = command.toLowerCase();
  const missing = [...blocked];
  if (hasAny(lower, ["receipt", "expense"]) && !moneyFrom(command)) {
    missing.push("Receipt amount, vendor, job/customer, category, and photo may still need review.");
  }
  if (hasAny(lower, ["hours", "clock", "timesheet", "punch"])) {
    missing.push("Worker, job/assignment, clock time, break time, and payroll status need confirmation.");
  }
  if (hasAny(lower, ["video", "ad", "post", "platforms"]) && hasAny(lower, ["auto post", "post it", "automatically post"])) {
    missing.push("Live posting needs connected platform accounts, approval controls, and provider adapters.");
  }
  if (hasAny(lower, ["authority", "proof", "case study", "completed job", "job into marketing"])) {
    missing.push("Authority assets need completed jobs, real proof, customer permission, and owner review before public use.");
  }
  if (hasAny(lower, ["website", "homepage", "site"]) && !firstUrl(command)) {
    missing.push("Website URL is needed before Ferocity can import and improve the site context.");
  }
  return [...new Set(missing)];
}

async function saveCommandRun(input: {
  workspaceId: string;
  userId: string | null;
  command: string;
  prepared: string[];
  blocked: string[];
}) {
  const missingInfo = missingInfoForCommand(input.command, input.blocked);
  const status = input.blocked.length || missingInfo.length ? "needs_attention" : "prepared";
  const routes = routesForCommand(input.command, missingInfo);
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.ai_command_runs (
      tenant_id, user_id, command, status, prepared_json, blocked_json, missing_info_json, routes_json, metadata_json
    )
    values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)
    returning id
    `,
    [
      input.workspaceId,
      input.userId,
      input.command,
      status,
      JSON.stringify(input.prepared),
      JSON.stringify(input.blocked),
      JSON.stringify(missingInfo),
      JSON.stringify(routes),
      JSON.stringify({ createdBy: "ai_workforce_command", noLiveActions: true })
    ]
  );
  return result?.rows[0]?.id ?? null;
}

export async function executeAiWorkforceCommandAction(_state: AiWorkforceState, formData: FormData): Promise<AiWorkforceState> {
  await requirePermission("ai:queue");
  const parsed = commandSchema.safeParse({
    command: formData.get("command"),
    conversationContext: formData.get("conversationContext") || undefined,
    onboardingMode: formData.get("onboardingMode") ?? "false",
    threadId: formData.get("threadId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "Tell the AI Workforce what you want done in normal words." };
  }

  const command = parsed.data.command;
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const threadId = parsed.data.threadId ?? null;
  const discoveryState = await queryPostgres<Record<string, string>>(`
    select
      (select count(*) from public.workspace_feature_entitlements where tenant_id=$1 and feature_key='closed_loop_growth_controller' and status <> 'disabled')::text has_growth_controller,
      (select count(*) from public.growth_objectives where tenant_id=$1 and status='active')::text active_growth_objectives,
      (select count(*) from public.workspace_feature_entitlements where tenant_id=$1 and feature_key='expense_document_intelligence' and status <> 'disabled')::text has_expense_intelligence,
      (select count(*) from public.document_intelligence_documents where tenant_id=$1)::text imported_expense_documents,
      (select count(*) from public.workspace_feature_entitlements where tenant_id=$1 and feature_key='sms_send' and status <> 'disabled')::text has_ferocity_connect,
      (select count(*) from public.ferocity_connect_devices where tenant_id=$1 and status in ('active','paired','offline'))::text paired_android_devices
  `, [workspaceId]);
  const discovery = discoveryState?.rows[0] ?? {};
  const recommended = discoverRelevantCapabilities(command, {
    hasGrowthController: Number(discovery.has_growth_controller ?? 0) > 0,
    hasActiveGrowthObjective: Number(discovery.active_growth_objectives ?? 0) > 0,
    hasExpenseIntelligence: Number(discovery.has_expense_intelligence ?? 0) > 0,
    hasImportedExpenseDocuments: Number(discovery.imported_expense_documents ?? 0) > 0,
    hasFerocityConnect: Number(discovery.has_ferocity_connect ?? 0) > 0,
    hasPairedAndroidDevice: Number(discovery.paired_android_devices ?? 0) > 0
  });
  const [brandResult, companionContext, customerRuntime, memoryContext, activeGoalContext] = await Promise.all([
    queryPostgres<{ id: string; name: string; industry: string | null; business_model: string | null }>(
      `select id, name, industry, business_model from public.brands where tenant_id = $1 order by created_at asc limit 1`,
      [workspaceId]
    ),
    getLatestCompanionContextSummaryForAi(workspaceId),
    getFerocityCustomerRuntime(workspaceId),
    getFerocityConversationMemory({
      tenantId: workspaceId,
      userId: session?.userId ?? null,
      query: command,
    }),
    getActiveOperatingGoalContextForThread({ tenantId: workspaceId, threadId }),
  ]);
  const brand = brandResult?.rows[0];
  const initialUnderstanding = await understandFerocityCommand({
    tenantId: workspaceId,
    userId: session?.userId ?? null,
    command,
    conversationContext: parsed.data.conversationContext,
    memoryContext,
    customerContext: customerRuntime.promptContext,
    businessContext: [
      brand
        ? `Business: ${brand.name}. Industry: ${brand.industry ?? "not set"}. Business model: ${brand.business_model ?? "not set"}.`
        : "No business profile is available yet.",
      companionContext,
      activeGoalContext,
    ].filter(Boolean).join("\n")
  });
  const preliminaryFinancialDocumentScope = isFinancialDocumentCommand({
    command,
    conversationContext: parsed.data.conversationContext,
  });
  const scopedEvidence = await collectFerocityScopedEvidence({
    tenantId: workspaceId,
    command,
    // A model may infer adjacent capabilities, but a narrowly financial question
    // must not surface unrelated growth, workforce, or customer evidence.
    capabilities: preliminaryFinancialDocumentScope ? [] : initialUnderstanding.capabilities,
  });
  const understanding = await groundFerocityUnderstandingInEvidence({
    tenantId: workspaceId,
    userId: session?.userId ?? null,
    command,
    understanding: initialUnderstanding,
    evidence: scopedEvidencePrompt(scopedEvidence),
    customerContext: customerRuntime.promptContext,
  });
  const memoryChange = await applyFerocityConversationMemory({
    tenantId: workspaceId,
    userId: session?.userId ?? null,
    threadId,
    command,
    candidates: understanding.memoryCandidates,
  });
  const independentReview = await independentlyReviewFerocityCommandPlan({
    tenantId: workspaceId,
    userId: session?.userId ?? null,
    command,
    understanding,
    evidence: scopedEvidence.map((item) => ({ key: item.key, status: item.status, summary: item.summary })),
  });
  const reviewedAnswerText = independentReview.status === "passed" || independentReview.status === "not_required"
    ? understanding.answer
    : `${understanding.answer}\n\nIndependent review ${independentReview.status === "disagreed" ? "found a disagreement" : "is currently unavailable"}. Ferocity will keep consequential ${independentReview.domain.replaceAll("_", " ")} work in review instead of treating this analysis as final.`;
  const aiStatusNotice = understanding.planningAiStatus === "fallback"
    ? "Workspace evidence was still checked, but AI action planning used the safe fallback. I did not execute an inferred action plan."
    : understanding.responseAiStatus === "fallback"
      ? "Workspace evidence was checked, but the evidence-synthesis model was unavailable. The response below uses the safe interpretation plus the verified facts listed with it."
      : "";
  const requestedMemoryChange = /^\s*(?:remember|forget)\b/i.test(command);
  const memoryConfirmation = memoryChange.forgotten > 0
    ? `I removed ${memoryChange.forgotten} remembered item${memoryChange.forgotten === 1 ? "" : "s"}.`
    : memoryChange.saved > 0
      ? `I saved ${memoryChange.saved} durable ${memoryChange.saved === 1 ? "memory" : "memories"} for this workspace.`
      : requestedMemoryChange && !memoryChange.available
        ? "Durable memory storage is not available yet, so I did not claim that this was remembered."
        : "";
  const answerText = [reviewedAnswerText, aiStatusNotice, memoryConfirmation].filter(Boolean).join("\n\n");
  const actionPolicy = applyCommandActionPolicy({
    command,
    conversationContext: parsed.data.conversationContext,
    plannedActions: understanding.plannedActions.map((item) => item.key),
  });
  const financialDocumentScope = actionPolicy.financialDocumentScope;
  const plannedActionKeys = new Set<FerocityPlannedActionKey>(actionPolicy.plannedActions);
  const plans = (key: FerocityPlannedActionKey) => plannedActionKeys.has(key);
  const readOnlyArtifacts = (receipt: FerocityActionReceiptInput) => recordFerocityActionReceipts({
    tenantId: workspaceId,
    threadId,
    receipts: [receipt],
  });
  const clarifyingQuestion = clarificationQuestionForUnderstanding({
    needsClarification: understanding.needsClarification,
    clarifyingQuestion: understanding.clarifyingQuestion,
    safePlannedActionCount: actionPolicy.plannedActions.length,
  });
  if (clarifyingQuestion) {
    return {
      ok: true,
      needsInput: true,
      message: clarifyingQuestion,
      prepared: [],
      blocked: []
    };
  }
  const interpretedCommand = commandSearchText(command, understanding.capabilities);
  const literalIntent = classifyAiCommandIntent(command);
  const intent = actionPolicy.readOnlyRequested
    ? "read_only"
    : literalIntent === "read_only" && ["draft_preparation", "workspace_changing"].includes(understanding.requestedMode)
    ? understanding.requestedMode
    : literalIntent;
  if (intent === "read_only") {
    const businessRead = readBusinessActionForCommand(interpretedCommand);
    if (businessRead && session?.userId && scopedEvidence.length <= 1) {
      const principal: BusinessActionPrincipal = {
        principalId: `user:${session.userId}`,
        principalType: "user",
        tenantId: workspaceId,
        userId: session.userId,
        scopes: ["business:*"],
        authorization: { verified: true, source: "authenticated_user_session" },
        metadata: { source: "ask_ferocity" },
      };
      const actionResult = await invokeBusinessAction(principal, {
        action: businessRead.action,
        input: businessRead.action === "getStaleLeads" ? { olderThanDays: 1, limit: 25 } : { limit: 25 },
        idempotencyKey: `ask-ferocity:${randomUUID()}`,
        source: "ask_ferocity_read",
      });
      if (actionResult.ok) {
        const prepared = summarizeBusinessActionItems(businessRead.action, actionResult.data);
        const artifacts = await readOnlyArtifacts({
          receiptKind: "inspection",
          title: resultActionLabel(businessRead.href),
          summary: answerText,
          status: "completed",
          href: businessRead.href,
          evidence: { action: businessRead.action, itemCount: prepared.length },
        });
        return {
          ok: true,
          intent,
          href: businessRead.href,
          actionLabel: resultActionLabel(businessRead.href),
          message: `${answerText}\n\nI checked the authorized workspace records directly and did not change or contact anything.`,
          prepared: prepared.length ? prepared : ["No matching records currently need attention."],
          blocked: [],
          recommended,
          artifacts,
        };
      }
    }
    if (scopedEvidence.length) {
      const artifacts = await recordFerocityActionReceipts({
        tenantId: workspaceId,
        threadId,
        receipts: scopedEvidence.map((item): FerocityActionReceiptInput => ({
          receiptKind: "inspection",
          title: item.title,
          summary: item.summary,
          status: item.status === "unavailable" ? "failed" : "completed",
          href: item.href,
          evidence: {
            evidenceDomain: item.key,
            checkedAt: item.checkedAt,
            status: item.status,
            facts: item.facts,
          },
        })),
      });
      const verified = scopedEvidence.filter((item) => item.status !== "unavailable");
      const unavailable = scopedEvidence.filter((item) => item.status === "unavailable");
      const primaryHref = financialDocumentScope
        ? "/app/expenses"
        : verified[0]?.href ?? scopedEvidence[0].href;
      return {
        ok: unavailable.length === 0,
        intent,
        href: primaryHref,
        actionLabel: resultActionLabel(primaryHref),
        message: unavailable.length
          ? `${answerText}\n\nI checked ${verified.length} workspace area${verified.length === 1 ? "" : "s"}; ${unavailable.length} could not be verified during this request and is not being treated as empty.`
          : `${answerText}\n\nI checked the relevant workspace records directly and did not change or contact anything.`,
        prepared: scopedEvidence.flatMap((item) => [item.summary, ...item.facts]).slice(0, 12),
        blocked: unavailable.map((item) => `${item.title} could not be verified during this request.`),
        recommended,
        artifacts,
      };
    }
    const href = readOnlyRouteForCommand(interpretedCommand);
    const canAnswerFromOperatingSnapshot = hasAny(interpretedCommand, [
      "attention", "today", "priority", "money", "revenue", "invoice", "paid", "lead", "opportunit", "report", "audit", "what next"
    ]);
    if (canAnswerFromOperatingSnapshot) {
      const dashboard = await getAttentionCommandDashboard();
      const items = hasAny(interpretedCommand, ["money", "revenue", "invoice", "paid", "lead", "opportunit"])
        ? dashboard.moneyMoves
        : dashboard.doFirst;
      const resultHref = items[0]?.href ?? dashboard.direction.href;
      const artifacts = await readOnlyArtifacts({
        receiptKind: "inspection",
        title: dashboard.direction.title,
        summary: dashboard.direction.detail,
        status: "completed",
        href: resultHref,
        evidence: { itemCount: items.length, source: "attention_command" },
      });
      return {
        ok: true,
        intent,
        href: resultHref,
        actionLabel: resultActionLabel(resultHref),
        message: `${answerText}\n\nCurrent workspace evidence — ${dashboard.direction.title}: ${dashboard.direction.detail}`,
        prepared: items.slice(0, 4).map((item) => `${item.title} — ${item.detail}`),
        blocked: [],
        recommended,
        artifacts,
      };
    }
    return {
      ok: true,
      intent,
      href,
      actionLabel: resultActionLabel(href),
      message: `${advisoryText(answerText, understanding.nextSteps)}\n\nI kept this read-only and did not create, update, send, publish, or schedule anything.`,
      prepared: [`Open ${href} to review the current workspace state.`],
      blocked: [],
      recommended,
      artifacts: [],
    };
  }

  const lower = interpretedCommand.toLowerCase();
  const prepared: string[] = [];
  const blocked: string[] = [];
  const verifiedActionReceipts: FerocityActionReceiptInput[] = [];
  if (independentReview.tier === "critical" && independentReview.status !== "passed") {
    blocked.push(
      independentReview.status === "disagreed"
        ? `Independent review found ${independentReview.issues.length || 1} issue(s) in this ${independentReview.domain.replaceAll("_", " ")} plan. Consequential execution remains blocked for human review.`
        : `The independent reviewer is unavailable for this critical ${independentReview.domain.replaceAll("_", " ")} request. Ferocity can prepare review work, but consequential execution remains blocked.`,
    );
  }

  if (!financialDocumentScope && isExplicitOperatingGoalCorrection(command)) {
    const correctedOutcome = correctedOperatingGoalOutcome(command);
    if (!threadId || !correctedOutcome) {
      return {
        ok: false,
        message: "I recognized this as a correction, but I could not identify an active outcome in this chat safely. Name the outcome you want corrected in one sentence.",
        prepared: [],
        blocked: ["No active chat outcome was identified, so no record or workflow was changed."],
        needsInput: true,
        recommended,
        artifacts: [],
      };
    }
    const correctedGoal = await correctLatestOperatingGoalFromThread({
      tenantId: workspaceId,
      threadId,
      correctedOutcome,
      correctedTitle: understanding.goalTitle,
      actorUserId: session?.userId ?? null,
    });
    if (!correctedGoal) {
      return {
        ok: false,
        message: "I recognized this as a correction, but this chat has no active persistent outcome to update. Tell me which existing outcome this replaces.",
        prepared: [],
        blocked: ["No active persistent outcome in this chat was changed."],
        needsInput: true,
        recommended,
        artifacts: [],
      };
    }
    const correctionBlocked = correctedGoal.inProgressStepCount > 0
      ? [`${correctedGoal.inProgressStepCount} already-running step${correctedGoal.inProgressStepCount === 1 ? " needs" : "s need"} review; Ferocity did not silently cancel work that may already have changed an external system.`]
      : [];
    const artifacts = await recordFerocityActionReceipts({
      tenantId: workspaceId,
      threadId,
      receipts: [{
        receiptKind: "goal",
        title: correctedGoal.title,
        summary: correctedGoal.desiredOutcome,
        status: correctionBlocked.length ? "blocked" : "prepared",
        href: "/app/attention-command",
        targetTable: "operating_goals",
        targetId: correctedGoal.id,
        operatingGoalId: correctedGoal.id,
        evidence: {
          correctedExistingGoal: true,
          canceledUnstartedStepCount: correctedGoal.canceledUnstartedStepCount,
          inProgressStepCount: correctedGoal.inProgressStepCount,
        },
      }],
    });
    revalidatePath("/app/attention-command");
    revalidatePath("/app/ferocity");
    return {
      ok: correctionBlocked.length === 0,
      message: correctionBlocked.length
        ? "I updated the existing outcome and stopped its unstarted stale plan. Work already in progress remains visible for review instead of being hidden or canceled blindly."
        : "I updated the existing outcome in this chat, canceled its unstarted stale plan, and queued the corrected outcome for replanning.",
      prepared: [`Updated outcome: ${correctedGoal.desiredOutcome}`, `${correctedGoal.canceledUnstartedStepCount} unstarted stale step${correctedGoal.canceledUnstartedStepCount === 1 ? " was" : "s were"} canceled.`],
      blocked: correctionBlocked,
      recommended,
      href: "/app/attention-command",
      actionLabel: "Review the corrected outcome",
      artifacts,
    };
  }

  const goalCandidate = financialDocumentScope ? null : operatingGoalCandidateFromCommand(command) ?? operatingGoalCandidateFromPlannedOutcome({
    command,
    goalIntent: understanding.goalIntent,
    goalTitle: understanding.goalTitle,
    desiredOutcome: understanding.desiredOutcome,
    capabilities: understanding.capabilities,
  });
  let operatingGoalId: string | null = null;
  if (goalCandidate) {
    const goal = await createOperatingGoal({
      tenantId: workspaceId,
      brandId: brand?.id ?? null,
      ...goalCandidate,
      authorityMode: "prepare",
      sourceType: "ask_ferocity",
      completionRules: {
        requiresOutcomeEvidence: true,
        actionCompletionIsNotOutcomeCompletion: true,
      },
      constraints: {
        preserveAuthoritativeDomainState: true,
        externalAndConsequentialActionsRemainApprovalGated: true,
        ...(threadId ? { sourceThreadId: threadId } : {}),
      },
    });
    operatingGoalId = goal.id;
    prepared.push(`Started a persistent outcome (${goal.id}). Ferocity will keep its state, dependencies, next check, and completion evidence instead of treating this message as a one-time task.`);
  }

  const isExplicitGrowthOutcome = hasAny(command.toLowerCase(), [
    "fill next week", "fill our schedule", "fill my schedule", "fill the calendar", "fill our calendar",
    "get me more", "get us more", "grow ", "more profitable jobs", "without increasing ad spend",
    "improve our google visibility", "improve my google visibility", "improve our search visibility", "improve my search visibility"
  ]);
  if (!financialDocumentScope && brand?.id && isExplicitGrowthOutcome && understanding.capabilities.some((capability) => ["growth_revenue", "marketing", "seo"].includes(capability))) {
    const objective = await createOwnerGrowthObjectiveFromCommand({
      tenantId: workspaceId,
      brandId: brand.id,
      userId: session?.userId ?? null,
      command
    });
    prepared.push(`Created a measurable growth objective and composed ${objective.playbookRunIds.length} versioned playbook${objective.playbookRunIds.length === 1 ? "" : "s"} around it.`);
  }

  if (intent === "external") {
    blocked.push("External actions stay gated. Ferocity can prepare drafts and review records, but sending, publishing, ad spend, payments, and payouts require separate provider approval.");
  }

  const explicitlyRequestsSetup = plans("apply_setup_plan") || understanding.capabilities.includes("setup") || hasAny(command.toLowerCase(), ["set up", "setup", "configure", "onboard"]);
  if (!financialDocumentScope && explicitlyRequestsSetup) {
    const setupForm = new FormData();
    setupForm.set("request", setupRequestFor(command));
    const setupResult = await applySetupPlanAction({ ok: false }, setupForm);
    if (setupResult.ok) {
      prepared.push("Applied a reviewed setup plan using existing setup, service control, workflow, page, source, and template records.");
    } else if (setupResult.error) {
      blocked.push(setupResult.error);
    }
  }

  if (!financialDocumentScope && (plans("refresh_business_memory") || understanding.capabilities.some((capability) => ["setup", "growth_revenue", "marketing", "seo", "website", "reporting_attention"].includes(capability)))) {
    await refreshBusinessProfileMemoryAction(new FormData());
    prepared.push("Refreshed business profile memory from existing brand, services, areas, proof, offers, and marketing settings.");
  }

  const websiteUrl = firstUrl(command);
  if (!financialDocumentScope && websiteUrl && (plans("import_website") || understanding.capabilities.includes("website") || hasAny(lower, ["website", "homepage", "site", "wordpress", "webflow"]))) {
    const websiteForm = new FormData();
    websiteForm.set("websiteUrl", websiteUrl);
    await requestWebsiteImportAction(websiteForm);
    prepared.push("Queued a reviewed website import through Marketing OS.");
    const importResult = await processNewestWebsiteImportForUrl(workspaceId, websiteUrl);
    if (importResult.ok) {
      prepared.push("Imported public website facts into Marketing OS for review. Nothing was published.");
    } else {
      blocked.push(`Website import needs attention: ${importResult.message}`);
    }
  } else if (!financialDocumentScope && hasAny(lower, ["website", "homepage", "site", "wordpress", "webflow"])) {
    blocked.push("Website import needs the site URL. Add the URL to the command, such as: Improve my website https://example.com.");
  }

  if (!financialDocumentScope && hasAny(lower, ["video", "ad video", "commercial", "youtube short", "tiktok", "reel", "platforms", "post it", "auto post", "advertise"])) {
    const adForm = new FormData();
    adForm.set("businessThought", command);
    adForm.set("publishMode", hasAny(lower, ["auto post", "post it", "automatically post"]) ? "auto_when_connected" : "approval_required");
    adForm.set("durationSeconds", hasAny(lower, ["60 second", "one minute"]) ? "60" : hasAny(lower, ["30 second"]) ? "30" : "15");
    const url = firstUrl(command);
    if (url) adForm.set("sourceUrl", url);
    const amount = moneyFrom(command);
    if (amount) adForm.set("budgetDollars", String(amount));
    for (const platform of platformsFrom(command)) adForm.append("platforms", platform);
    await createAdAutopilotPackageAction(adForm);
    prepared.push("Created an Ad Autopilot package with platform variants, video brief, review queue item, and publish-mode record.");
  } else if (!financialDocumentScope && (plans("prepare_marketing") || hasAny(lower, ["campaign", "storm", "hail", "facebook", "instagram", "ad", "promotion", "content", "blog", "gbp", "email", "sms", "referral"]))) {
    const blueprintKey = campaignKeyFor(command);
    if (blueprintKey) {
      const campaignForm = new FormData();
      campaignForm.set("campaignKey", blueprintKey);
      await createOneClickCampaignAction(campaignForm);
      prepared.push("Created one-click campaign drafts through Marketing OS.");
    } else {
      const campaignForm = new FormData();
      campaignForm.set("prompt", command);
      campaignForm.set("campaignName", command.split(/\s+/).slice(0, 8).join(" "));
      await createContentStudioCampaignAction(campaignForm);
      prepared.push("Created reviewed content, calendar, draft, and export-queue items through Marketing OS.");
    }
  }

  if (!financialDocumentScope && (plans("prepare_seo") || hasAny(lower, ["seo", "rank", "city", "service page", "location", "website", "homepage", "blog"]))) {
    await generateSeoAutopilotAction();
    prepared.push("Ran SEO autopilot through existing draft/page/calendar systems.");
  }

  if (!financialDocumentScope && (plans("scan_revenue_loop") || hasAny(lower, [
    "follow", "reactivate", "old lead", "stale", "missed call", "callback", "estimate", "invoice", "review",
    "make more money", "revenue opportunit", "new customers", "bring in more", "get paid faster", "growth system"
  ]))) {
    await scanLeadToJobLoopAction();
    await scanGrowthLoopAction();
    await scanServiceOpsAction();
    await scanActionQueueAction();
    prepared.push("Checked the full revenue path for lead gaps, stalled follow-up, estimates, scheduled work, invoices, reviews, attribution, and approval-ready opportunities.");
  }

  if (!financialDocumentScope && (plans("prepare_authority") || hasAny(lower, ["authority", "proof", "case study", "finished work", "completed job", "job into marketing", "turn this job into marketing", "reviews from jobs"]))) {
    await processCompletedJobsForAuthorityAction();
    prepared.push("Ran Authority Engine against completed jobs and prepared proof, review, content, publishing, score, and timeline records.");
  }

  if (plans("create_expense_review_task") || hasAny(lower, ["receipt", "expense", "reimburse", "reimbursement", "tax", "deduct", "deduction"])) {
    const amount = moneyFrom(command);
    const taskId = await createCommandTask({
      workspaceId,
      userId: session?.userId ?? null,
      command,
      title: titleFromCommand(command, amount ? `Review receipt for $${amount.toFixed(2)}` : "Review receipt or expense"),
      category: "money",
      priority: "high",
      dueAt: dueDateFrom(command),
      recommendedAction: "Open Expenses to attach the source document and confirm amount, category, property or job, and tax treatment.",
      actionHref: "/app/expenses"
    });
    prepared.push("Created an expense-review task. Add or review the source document in Expenses; no tax conclusion was assumed.");
    if (taskId) verifiedActionReceipts.push({
      receiptKind: "workspace_change",
      title: "Expense and tax review task",
      summary: "Verified the internal review task exists. No tax conclusion or external action was taken.",
      status: "completed",
      href: "/app/personal-ops",
      targetTable: "personal_ops_items",
      targetId: taskId,
      evidence: { verifiedAfterWrite: true, reversibleInternalRecord: true },
    });
  }

  if (plans("create_time_review_task") || hasAny(lower, ["log my hours", "hours", "clock in", "clock out", "time card", "timesheet", "punch in", "punch out"])) {
    const taskId = await createCommandTask({
      workspaceId,
      userId: session?.userId ?? null,
      command,
      title: titleFromCommand(command, "Review time entry or hours"),
      category: "people",
      priority: "high",
      dueAt: dueDateFrom(command),
      recommendedAction: "Open Team to choose the worker, job/assignment, clock time, break time, and payroll review status.",
      actionHref: "/app/operations-workforce#time-clock"
    });
    prepared.push("Created a time/hours task and routed it to Team because worker/job/time details must be confirmed.");
    if (taskId) verifiedActionReceipts.push({
      receiptKind: "workspace_change",
      title: "Time and hours review task",
      summary: "Verified the internal time-review task exists; payroll was not changed.",
      status: "completed",
      href: "/app/personal-ops",
      targetTable: "personal_ops_items",
      targetId: taskId,
      evidence: { verifiedAfterWrite: true, payrollUnchanged: true },
    });
  }

  if (plans("create_reminder") || hasAny(lower, ["remind", "reminder", "call", "meeting", "goal", "tomorrow", "today"])) {
    const remindAt = dueDateFrom(command);
    const isPayment = hasAny(lower, ["pay", "invoice", "bill", "owe", "owed"]);
    const reminderId = await createCommandReminder({
      workspaceId,
      userId: session?.userId ?? null,
      command,
      title: titleFromCommand(command, "Ferocity reminder"),
      body: command,
      reminderType: isPayment ? "payment" : hasAny(lower, ["meeting"]) ? "meeting" : hasAny(lower, ["goal"]) ? "goal" : "task",
      priority: isPayment || hasAny(lower, ["urgent", "important"]) ? "high" : "medium",
      remindAt,
      actionUrl: isPayment ? "/app/cash-collection" : "/app/attention-command"
    });
    prepared.push(`Created an owner reminder for ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(remindAt)}.`);
    if (reminderId) verifiedActionReceipts.push({
      receiptKind: "workspace_change",
      title: "Owner reminder",
      summary: "Verified the reminder exists in the workspace notification system.",
      status: "completed",
      href: "/app/notifications",
      targetTable: "owner_reminders",
      targetId: reminderId,
      evidence: { verifiedAfterWrite: true, remindAt: remindAt.toISOString() },
    });
  }

  if (plans("create_job_estimate_task") || hasAny(lower, ["bid", "quote", "material list", "materials", "scope", "estimate"])) {
    const taskId = await createCommandTask({
      workspaceId,
      userId: session?.userId ?? null,
      command,
      title: titleFromCommand(command, "Prepare bid, estimate, or material list"),
      category: "project",
      priority: "high",
      dueAt: dueDateFrom(command),
      recommendedAction: "Open Jobs & Money to create the bid, material list, customer balance, payment terms, and profit tracking.",
      actionHref: "/app/job-tracker"
    });
    prepared.push("Created a job/bid task routed to Jobs & Money for scope, materials, payment terms, and profit tracking.");
    if (taskId) verifiedActionReceipts.push({
      receiptKind: "workspace_change",
      title: "Estimate and materials task",
      summary: "Verified the internal estimate/materials task exists. No customer quote was sent.",
      status: "completed",
      href: "/app/personal-ops",
      targetTable: "personal_ops_items",
      targetId: taskId,
      evidence: { verifiedAfterWrite: true, customerContacted: false },
    });
  }

  if (!financialDocumentScope && (plans("scan_business") || hasAny(lower, ["monitor", "optimize", "improve", "audit", "check everything", "run scans", "business scan", "connected area", "command center"]))) {
    await scanLeadToJobLoopAction();
    await scanGrowthLoopAction();
    await scanServiceOpsAction();
    await scanActionQueueAction();
    prepared.push("Ran Guided setup monitoring scans across lead-to-job, growth, service ops, and action queue systems.");
  }

  const didPrepareWork = prepared.length > 0;
  await timeline(
    workspaceId,
    didPrepareWork ? "AI Workforce prepared work" : "AI Workforce answered an owner request",
    didPrepareWork
      ? "Ferocity translated an owner command into existing operating records and preserved all authority boundaries."
      : "Ferocity answered from available business context without claiming an execution occurred.",
    {
      command,
      prepared,
      blocked,
      evidenceDomains: scopedEvidence.map((item) => ({ key: item.key, status: item.status })),
      noDuplicateSystems: true,
      liveActionsStillRequireApproval: true
    }
  );
  await ownerCommandEvent(workspaceId, command, prepared, blocked);
  const runId = await saveCommandRun({ workspaceId, userId: session?.userId ?? null, command, prepared, blocked });

  revalidatePath("/app/ai-workforce");
  revalidatePath("/app/ai-workforce/results/latest");
  revalidatePath("/app");
  revalidatePath("/app/build-system");
  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/marketing-os");
  revalidatePath("/app/review");
  revalidatePath("/app/actions");
  revalidatePath("/app/seo");
  revalidatePath("/app/operator");
  revalidatePath("/app/reports");
  revalidatePath("/app/notifications");
  revalidatePath("/app/personal-ops");
  revalidatePath("/app/job-tracker");
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app/authority");
  revalidatePath("/app/automation-timeline");

  const resultRoute = routesForCommand(interpretedCommand, blocked)[0];
  const resultHref = resultRoute?.href ?? workspaceRouteForCommand(interpretedCommand);
  const receiptInputs: FerocityActionReceiptInput[] = [...verifiedActionReceipts];
  if (operatingGoalId) {
    receiptInputs.push({
      receiptKind: "goal",
      title: understanding.goalTitle || goalCandidate?.title || "Persistent Ferocity outcome",
      summary: understanding.desiredOutcome || goalCandidate?.desiredOutcome || command,
      status: "prepared",
      href: "/app/attention-command",
      targetTable: "operating_goals",
      targetId: operatingGoalId,
      operatingGoalId,
      evidence: { persistent: true, authorityMode: "prepare" },
    });
  }
  if (runId) {
    receiptInputs.push({
      receiptKind: intent === "workspace_changing" ? "workspace_change" : "draft",
      title: understanding.goalTitle || titleFromCommand(command, "Ferocity command result"),
      summary: answerText,
      status: blocked.length ? "blocked" : verifiedActionReceipts.some((receipt) => receipt.status === "completed") ? "completed" : "prepared",
      href: `/app/ai-workforce/results/${runId}`,
      targetTable: "ai_command_runs",
      targetId: runId,
      evidence: {
        preparedCount: prepared.length,
        blockedCount: blocked.length,
        verifiedCompletedActionCount: verifiedActionReceipts.filter((receipt) => receipt.status === "completed").length,
        planningAiStatus: understanding.planningAiStatus,
        responseAiStatus: understanding.responseAiStatus,
        independentReviewStatus: independentReview.status,
        plannedActions: [...plannedActionKeys],
        evidenceDomains: scopedEvidence.map((item) => ({ key: item.key, status: item.status, checkedAt: item.checkedAt })),
      },
    });
  }
  const artifacts = await recordFerocityActionReceipts({
    tenantId: workspaceId,
    threadId,
    commandRunId: runId,
    receipts: receiptInputs,
  });
  return {
    ok: blocked.length === 0,
    message: blocked.length === 0
      ? didPrepareWork
        ? `${answerText}\n\nI prepared the work listed below. Nothing consequential went live without your approval.`
        : `${advisoryText(answerText, understanding.nextSteps)}\n\nI did not claim or record an execution because this request did not map to a verified action.`
      : `${answerText}\n\nI prepared what I safely could. One or more decisions still need your attention.`,
    prepared,
    blocked,
    recommended,
    runId: runId ?? undefined,
    href: resultHref,
    actionLabel: resultRoute?.label ? `Open ${resultRoute.label}` : resultActionLabel(resultHref),
    artifacts,
  };
}

export async function executeAiWorkforceCommandSimpleAction(formData: FormData) {
  const command = formData.get("command")?.toString() ?? "";
  if (classifyAiCommandIntent(command) === "read_only") {
    redirect(readOnlyRouteForCommand(command));
  }
  redirect(`/app/ferocity?command=${encodeURIComponent(command)}`);
}
