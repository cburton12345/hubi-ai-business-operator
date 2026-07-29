"use server";

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
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { classifyAiCommandIntent, readOnlyRouteForCommand } from "@/lib/ai-workforce/command-intent";
import { queryPostgres } from "@/lib/db/postgres";
import { processNewestWebsiteImportForUrl } from "@/lib/marketing-os/website-import-processor";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type AiWorkforceState = {
  ok: boolean;
  message?: string;
  prepared?: string[];
  blocked?: string[];
  runId?: string;
  intent?: string;
  href?: string;
};

const commandSchema = z.object({
  command: z.string().trim().min(8).max(2000)
});

function hasAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
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
    on conflict (tenant_id, platform_key, external_event_id)
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
  if (duplicate?.rows[0]?.id) return;

  await queryPostgres(
    `
    insert into public.owner_reminders (
      tenant_id, user_id, title, body, reminder_type, priority, remind_at, recurrence,
      push_enabled, action_url, next_due_at, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, 'none', true, $8, $7, $9::jsonb)
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
    on conflict (tenant_id, platform_key, external_event_id)
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
  if (hasAny(lower, ["receipt", "expense", "bid", "quote", "material", "profit", "job cost"])) {
    routes.unshift({ label: "Jobs & Money", href: "/app/job-tracker", reason: "Finish job money, receipt, material, or bid details." });
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
  const parsed = commandSchema.safeParse({ command: formData.get("command") });
  if (!parsed.success) {
    return { ok: false, message: "Tell the AI Workforce what you want done in normal words." };
  }

  const command = parsed.data.command;
  const intent = classifyAiCommandIntent(command);
  if (intent === "read_only") {
    const href = readOnlyRouteForCommand(command);
    return {
      ok: true,
      intent,
      href,
      message: "Read-only request. Ferocity did not create, update, apply, send, publish, or schedule anything.",
      prepared: [`Open ${href} to review the current workspace state.`],
      blocked: []
    };
  }

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const lower = command.toLowerCase();
  const prepared: string[] = [];
  const blocked: string[] = [];

  if (intent === "external") {
    blocked.push("External actions stay gated. Ferocity can prepare drafts and review records, but sending, publishing, ad spend, payments, and payouts require separate provider approval.");
  }

  const setupForm = new FormData();
  setupForm.set("request", setupRequestFor(command));
  const setupResult = await applySetupPlanAction({ ok: false }, setupForm);
  if (setupResult.ok) {
    prepared.push("Applied a reviewed setup plan using existing setup, service control, workflow, page, source, and template records.");
  } else if (setupResult.error) {
    blocked.push(setupResult.error);
  }

  await refreshBusinessProfileMemoryAction(new FormData());
  prepared.push("Refreshed business profile memory from existing brand, services, areas, proof, offers, and marketing settings.");

  const websiteUrl = firstUrl(command);
  if (websiteUrl) {
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
  } else if (hasAny(lower, ["website", "homepage", "site", "wordpress", "webflow"])) {
    blocked.push("Website import needs the site URL. Add the URL to the command, such as: Improve my website https://example.com.");
  }

  if (hasAny(lower, ["video", "ad video", "commercial", "youtube short", "tiktok", "reel", "platforms", "post it", "auto post", "advertise"])) {
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
  } else if (hasAny(lower, ["campaign", "storm", "hail", "facebook", "instagram", "ad", "promotion", "content", "blog", "gbp", "email", "sms", "referral"])) {
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

  if (hasAny(lower, ["seo", "rank", "city", "service page", "location", "website", "homepage", "blog"])) {
    await generateSeoAutopilotAction();
    prepared.push("Ran SEO autopilot through existing draft/page/calendar systems.");
  }

  if (hasAny(lower, ["follow", "reactivate", "old lead", "stale", "missed call", "callback", "estimate", "invoice", "review"])) {
    await scanLeadToJobLoopAction();
    prepared.push("Scanned lead-to-job records for conversations, opportunities, callbacks, and scheduled work.");
    await scanGrowthLoopAction();
    prepared.push("Scanned growth loop records for stale leads, reviews, invoices, attribution, and content gaps.");
    await scanServiceOpsAction();
    prepared.push("Scanned service operations for jobs, estimates, invoices, reviews, recurring service, and inventory tasks.");
    await scanActionQueueAction();
    prepared.push("Scanned action queue for follow-up, review, publishing, calendar, and consent-ready work.");
  }

  if (hasAny(lower, ["authority", "proof", "case study", "finished work", "completed job", "job into marketing", "turn this job into marketing", "reviews from jobs"])) {
    await processCompletedJobsForAuthorityAction();
    prepared.push("Ran Authority Engine against completed jobs and prepared proof, review, content, publishing, score, and timeline records.");
  }

  if (hasAny(lower, ["receipt", "expense", "reimburse", "reimbursement", "tax", "deduct", "deduction"])) {
    const amount = moneyFrom(command);
    await createCommandTask({
      workspaceId,
      userId: session?.userId ?? null,
      command,
      title: titleFromCommand(command, amount ? `Review receipt for $${amount.toFixed(2)}` : "Review receipt or expense"),
      category: "money",
      priority: "high",
      dueAt: dueDateFrom(command),
      recommendedAction: "Open Jobs & Money or Team to attach the receipt/photo, confirm amount, category, reimbursement, job, and tax/P&L treatment.",
      actionHref: "/app/job-tracker"
    });
    prepared.push("Created a money task for receipt, reimbursement, tax, and P&L review. Add the photo/details in Jobs & Money or Team.");
  }

  if (hasAny(lower, ["log my hours", "hours", "clock in", "clock out", "time card", "timesheet", "punch in", "punch out"])) {
    await createCommandTask({
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
  }

  if (hasAny(lower, ["remind", "reminder", "call", "meeting", "goal", "tomorrow", "today"])) {
    const remindAt = dueDateFrom(command);
    const isPayment = hasAny(lower, ["pay", "invoice", "bill", "owe", "owed"]);
    await createCommandReminder({
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
  }

  if (hasAny(lower, ["bid", "quote", "material list", "materials", "scope", "estimate"])) {
    await createCommandTask({
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
  }

  if (hasAny(lower, ["monitor", "optimize", "improve", "audit", "check everything", "run scans", "command center"])) {
    await scanLeadToJobLoopAction();
    await scanGrowthLoopAction();
    await scanServiceOpsAction();
    await scanActionQueueAction();
    prepared.push("Ran Guided setup monitoring scans across lead-to-job, growth, service ops, and action queue systems.");
  }

  await timeline(
    workspaceId,
    "AI Workforce prepared work",
    "Guided setup translated an owner command into existing Ferocity setup, marketing, SEO, action queue, and timeline records.",
    {
      command,
      prepared,
      blocked,
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

  return {
    ok: blocked.length === 0,
    message: blocked.length === 0 ? "Guided setup prepared work inside existing Ferocity systems. Review before anything goes live." : "Guided setup prepared some work, but one or more steps need attention.",
    prepared,
    blocked,
    runId: runId ?? undefined
  };
}

export async function executeAiWorkforceCommandSimpleAction(formData: FormData) {
  const command = formData.get("command")?.toString() ?? "";
  if (classifyAiCommandIntent(command) === "read_only") {
    redirect(readOnlyRouteForCommand(command));
  }
  redirect(`/app/ai-workforce?command=${encodeURIComponent(command)}`);
}
