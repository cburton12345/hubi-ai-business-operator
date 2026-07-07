"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scanActionQueueAction } from "@/app/app/actions/actions";
import { applySetupPlanAction } from "@/app/app/build-system/actions";
import { scanGrowthLoopAction } from "@/app/app/growth/actions";
import { createContentStudioCampaignAction, createOneClickCampaignAction, refreshBusinessProfileMemoryAction, requestWebsiteImportAction } from "@/app/app/marketing-os/actions";
import { scanLeadToJobLoopAction } from "@/app/app/operator/actions";
import { generateSeoAutopilotAction } from "@/app/app/seo/actions";
import { scanServiceOpsAction } from "@/app/app/service/actions";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { processNewestWebsiteImportForUrl } from "@/lib/marketing-os/website-import-processor";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type AiWorkforceState = {
  ok: boolean;
  message?: string;
  prepared?: string[];
  blocked?: string[];
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

async function timeline(workspaceId: string, title: string, body: string, metadata: Record<string, unknown>) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'system', 'ai_workforce_command', $2, $3, $4::jsonb)
    `,
    [workspaceId, title, body, JSON.stringify(metadata)]
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

export async function executeAiWorkforceCommandAction(_state: AiWorkforceState, formData: FormData): Promise<AiWorkforceState> {
  await requirePermission("ai:queue");
  const parsed = commandSchema.safeParse({ command: formData.get("command") });
  if (!parsed.success) {
    return { ok: false, message: "Tell the Ask AI what you want done in normal words." };
  }

  const workspaceId = await getCurrentWorkspaceId();
  const command = parsed.data.command;
  const lower = command.toLowerCase();
  const prepared: string[] = [];
  const blocked: string[] = [];

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

  if (hasAny(lower, ["campaign", "storm", "hail", "facebook", "instagram", "ad", "promotion", "content", "blog", "gbp", "email", "sms", "referral"])) {
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

  if (hasAny(lower, ["monitor", "optimize", "improve", "audit", "check everything", "run scans", "command center"])) {
    await scanLeadToJobLoopAction();
    await scanGrowthLoopAction();
    await scanServiceOpsAction();
    await scanActionQueueAction();
    prepared.push("Ran Guided setup monitoring scans across lead-to-job, growth, service ops, and action queue systems.");
  }

  await timeline(
    workspaceId,
    "Ask AI prepared work",
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

  revalidatePath("/app/ai-workforce");
  revalidatePath("/app");
  revalidatePath("/app/build-system");
  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/marketing-os");
  revalidatePath("/app/actions");
  revalidatePath("/app/seo");
  revalidatePath("/app/operator");
  revalidatePath("/app/reports");

  return {
    ok: blocked.length === 0,
    message: blocked.length === 0 ? "Guided setup prepared work inside existing Ferocity systems. Review before anything goes live." : "Guided setup prepared some work, but one or more steps need attention.",
    prepared,
    blocked
  };
}
