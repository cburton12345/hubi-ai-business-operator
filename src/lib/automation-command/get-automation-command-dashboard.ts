import { getActionQueueDashboard } from "@/lib/actions-queue/get-action-queue";
import { getAgentWorkflowDashboard } from "@/lib/ai-workforce/agent-workflows";
import { getMarketingAutomationRuleRows, getMarketingAutomationRunRows } from "@/lib/automation/get-marketing-automation";
import { getServiceControls } from "@/lib/controls/get-service-controls";
import { getBusinessWorkflowRows } from "@/lib/workflows/get-business-workflows";

export type AutomationCommandAction = {
  title: string;
  detail: string;
  href: string;
  urgency: "high" | "medium" | "low";
};

export type AutomationCommandDashboard = {
  metrics: {
    aiWorkflows: number;
    openAgentOutputs: number;
    automationRules: number;
    queuedActions: number;
    needsReview: number;
    blockedActions: number;
    liveProviders: number;
    missingConsent: number;
    controlsNearLimit: number;
    activeBusinessWorkflows: number;
  };
  nextActions: AutomationCommandAction[];
  agentWorkflows: Awaited<ReturnType<typeof getAgentWorkflowDashboard>>["workflows"];
  automationRules: Awaited<ReturnType<typeof getMarketingAutomationRuleRows>>;
  recentRuns: Awaited<ReturnType<typeof getMarketingAutomationRunRows>>;
  queuedActions: Awaited<ReturnType<typeof getActionQueueDashboard>>["actions"];
  policies: Awaited<ReturnType<typeof getActionQueueDashboard>>["policies"];
};

function metricValue(metrics: Awaited<ReturnType<typeof getActionQueueDashboard>>["metrics"], label: string) {
  return metrics.find((metric) => metric.label === label)?.value ?? 0;
}

export async function getAutomationCommandDashboard(): Promise<AutomationCommandDashboard> {
  const [actionQueue, agents, rules, runs, controls, workflows] = await Promise.all([
    getActionQueueDashboard(),
    getAgentWorkflowDashboard(),
    getMarketingAutomationRuleRows(),
    getMarketingAutomationRunRows(),
    getServiceControls(),
    getBusinessWorkflowRows()
  ]);

  const needsReview = metricValue(actionQueue.metrics, "Needs review");
  const blockedActions = metricValue(actionQueue.metrics, "Blocked");
  const liveProviders = metricValue(actionQueue.metrics, "Live providers");
  const missingConsent = metricValue(actionQueue.metrics, "Missing consent");
  const openAgentOutputs = agents.workflows.reduce((sum, workflow) => sum + workflow.openOutputs, 0);
  const queuedActions = actionQueue.actions.filter((action) => ["needs_review", "approved", "queued", "failed", "blocked"].includes(action.status)).length;
  const controlsNearLimit = controls.summary.warnings;
  const activeBusinessWorkflows = workflows.filter((workflow) => workflow.active).length;

  const nextActions: AutomationCommandAction[] = [
    blockedActions > 0
      ? {
          title: `${blockedActions} automation action${blockedActions === 1 ? "" : "s"} blocked`,
          detail: "Fix blocked queue items before trusting automation.",
          href: "/app/actions",
          urgency: "high"
        }
      : {
          title: "No blocked automation actions",
          detail: "Keep approval and provider checks visible before live sends.",
          href: "/app/actions",
          urgency: "low"
        },
    needsReview > 0
      ? {
          title: `${needsReview} action${needsReview === 1 ? "" : "s"} need review`,
          detail: "Email, manual text drafts, review requests, publishing, billing, and sync work should be reviewed before going live.",
          href: "/app/actions",
          urgency: "high"
        }
      : {
          title: "No action queue review backlog",
          detail: "Run scans after leads, estimates, invoices, reviews, or publishing work changes.",
          href: "/app/actions",
          urgency: "low"
        },
    missingConsent > 0
      ? {
          title: `${missingConsent} send action${missingConsent === 1 ? "" : "s"} missing consent`,
          detail: "Do not send customer emails, review requests, or optional SMS until consent is recorded. Manual text drafts stay review-only.",
          href: "/app/actions",
          urgency: "high"
        }
      : {
          title: "Consent blockers are clear",
          detail: "Continue using consent checks before live communication.",
          href: "/app/actions",
          urgency: "low"
        },
    openAgentOutputs > 0
      ? {
          title: `${openAgentOutputs} AI output${openAgentOutputs === 1 ? "" : "s"} waiting`,
          detail: "Review prepared AI outputs from lead response, follow-up, reviews, invoices, and SEO agents.",
          href: "/app/ai-workforce",
          urgency: "medium"
        }
      : {
          title: "AI outputs are clear",
          detail: "Run the agent workflows when new work arrives.",
          href: "/app/ai-workforce",
          urgency: "low"
        },
    controlsNearLimit > 0
      ? {
          title: `${controlsNearLimit} service control${controlsNearLimit === 1 ? "" : "s"} near limit`,
          detail: "Check usage limits before AI, email, manual text drafts, publishing, video, or provider work runs.",
          href: "/app/controls",
          urgency: "medium"
        }
      : {
          title: "Usage limits are not near warning",
          detail: "Review controls before changing tiers, overages, or live modes.",
          href: "/app/controls",
          urgency: "low"
        }
  ];

  return {
    metrics: {
      aiWorkflows: agents.workflows.length,
      openAgentOutputs,
      automationRules: rules.length,
      queuedActions,
      needsReview,
      blockedActions,
      liveProviders,
      missingConsent,
      controlsNearLimit,
      activeBusinessWorkflows
    },
    nextActions,
    agentWorkflows: agents.workflows,
    automationRules: rules.slice(0, 8),
    recentRuns: runs.slice(0, 8),
    queuedActions: actionQueue.actions.slice(0, 8),
    policies: actionQueue.policies.slice(0, 8)
  };
}
