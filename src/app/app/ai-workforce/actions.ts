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
    return `${command}. Set up marketing campaign drafts, landing page targets, source tracking, social/GBP/email/SMS/ad copy, and keep publishing or spend behind approval.`;
  }
  if (hasAny(lower, ["website", "homepage", "site", "wordpress", "webflow", "landing page"])) {
    return `${command}. Set up website connector, lead forms, page drafts, SEO targets, source tracking, and draft-first publishing controls.`;
  }
  if (hasAny(lower, ["follow", "reactivate", "old lead", "stale", "last month", "missed call", "callback", "estimate", "invoice"])) {
    return `${command}. Set up lead recovery, missed callback, estimate follow-up, invoice follow-up, review timing, and approval-first customer message drafts.`;
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

export async function executeAiWorkforceCommandAction(_state: AiWorkforceState, formData: FormData): Promise<AiWorkforceState> {
  await requirePermission("ai:queue");
  const parsed = commandSchema.safeParse({ command: formData.get("command") });
  if (!parsed.success) {
    return { ok: false, message: "Tell the AI Workforce what you want done in normal words." };
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
    prepared.push("Ran AI Mode monitoring scans across lead-to-job, growth, service ops, and action queue systems.");
  }

  await timeline(
    workspaceId,
    "AI Workforce prepared work",
    "AI Mode translated an owner command into existing Ferocity setup, marketing, SEO, action queue, and timeline records.",
    {
      command,
      prepared,
      blocked,
      noDuplicateSystems: true,
      liveActionsStillRequireApproval: true
    }
  );

  revalidatePath("/app/ai-workforce");
  revalidatePath("/app");
  revalidatePath("/app/build-system");
  revalidatePath("/app/marketing-os");
  revalidatePath("/app/actions");
  revalidatePath("/app/seo");
  revalidatePath("/app/operator");
  revalidatePath("/app/reports");

  return {
    ok: blocked.length === 0,
    message: blocked.length === 0 ? "AI Mode prepared work inside existing Ferocity systems. Review before anything goes live." : "AI Mode prepared some work, but one or more steps need attention.",
    prepared,
    blocked
  };
}
