import { getActionQueueDashboard } from "@/lib/actions-queue/get-action-queue";
import { getLeadDashboardRows, type LeadDashboardRow } from "@/lib/leads/get-lead-dashboard";
import { getOperatorConsoleDashboard, type CommunicationThreadRow, type OpportunityStageRow } from "@/lib/operator/get-operator-console";

export type LeadCommandAction = {
  title: string;
  detail: string;
  href: string;
  urgency: "high" | "medium" | "low";
};

export type LeadCommandDashboard = {
  metrics: {
    newLeads: number;
    highPriorityLeads: number;
    unassignedLeads: number;
    openThreads: number;
    unansweredThreads: number;
    followUpsDue: number;
    openOpportunities: number;
    pipelineValue: string;
    queuedActions: number;
  };
  nextActions: LeadCommandAction[];
  leads: LeadDashboardRow[];
  threads: CommunicationThreadRow[];
  stages: OpportunityStageRow[];
  queuedActions: {
    id: string;
    subject: string;
    status: string;
    riskLevel: string;
    providerKey: string;
    href: string;
  }[];
};

function metricValue(metrics: Awaited<ReturnType<typeof getOperatorConsoleDashboard>>["metrics"], label: string) {
  return metrics.find((metric) => metric.label === label)?.value ?? 0;
}

function moneyFromOperatorValue(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export async function getLeadCommandDashboard(): Promise<LeadCommandDashboard> {
  const [leads, operator, actionQueue] = await Promise.all([
    getLeadDashboardRows(),
    getOperatorConsoleDashboard(),
    getActionQueueDashboard()
  ]);

  const newLeads = leads.filter((lead) => ["new", "open", "qualified"].includes(lead.status)).length;
  const highPriorityLeads = leads.filter((lead) => lead.priority === "high" || lead.grade === "hot").length;
  const unassignedLeads = leads.filter((lead) => lead.assignedTo === "Unassigned").length;
  const openThreads = metricValue(operator.metrics, "Open conversations");
  const unansweredThreads = metricValue(operator.metrics, "Unanswered");
  const followUpsDue = metricValue(operator.metrics, "Due in 24h");
  const openOpportunities = metricValue(operator.metrics, "Open opportunities");
  const pipelineValueRaw = metricValue(operator.metrics, "Pipeline value");
  const queuedActions = actionQueue.actions.filter((action) => ["needs_review", "approved", "queued", "failed"].includes(action.status)).length;

  const nextActions: LeadCommandAction[] = [
    unansweredThreads > 0
      ? {
          title: `${unansweredThreads} conversation${unansweredThreads === 1 ? "" : "s"} need a reply`,
          detail: "Start with unanswered messages before they become stale leads.",
          href: "/app/operator",
          urgency: "high"
        }
      : {
          title: "No unanswered conversations found",
          detail: "Keep response speed strong by checking new leads and queued drafts.",
          href: "/app/operator",
          urgency: "low"
        },
    highPriorityLeads > 0
      ? {
          title: `${highPriorityLeads} hot or high-priority lead${highPriorityLeads === 1 ? "" : "s"}`,
          detail: "Review the lead, confirm source and service, then move real opportunities into follow-up.",
          href: "/app/leads?priority=high",
          urgency: "high"
        }
      : {
          title: "Score the newest leads",
          detail: "Use lead score, source, service type, and contact quality to decide what deserves attention first.",
          href: "/app/leads",
          urgency: "medium"
        },
    unassignedLeads > 0
      ? {
          title: `${unassignedLeads} lead${unassignedLeads === 1 ? "" : "s"} unassigned`,
          detail: "Assign ownership so callbacks, estimates, and notes do not float around.",
          href: "/app/leads",
          urgency: "medium"
        }
      : {
          title: "Lead ownership looks clear",
          detail: "Check the pipeline and queued actions next.",
          href: "/app/operator",
          urgency: "low"
        },
    followUpsDue > 0
      ? {
          title: `${followUpsDue} callback or appointment item${followUpsDue === 1 ? "" : "s"} due soon`,
          detail: "Open scheduled work before today gets away from the team.",
          href: "/app/operator",
          urgency: "high"
        }
      : {
          title: "No callbacks due in the next 24 hours",
          detail: "Set callback rules if leads are arriving without a next step.",
          href: "/app/build-system",
          urgency: "low"
        },
    queuedActions > 0
      ? {
          title: `${queuedActions} message or action${queuedActions === 1 ? "" : "s"} waiting`,
          detail: "Review queued email, manual text drafts, publishing, review, or follow-up work before anything goes live.",
          href: "/app/actions",
          urgency: "medium"
        }
      : {
          title: "No queued sends waiting",
          detail: "Provider sends stay controlled by approvals, consent, and usage limits.",
          href: "/app/actions",
          urgency: "low"
        }
  ];

  return {
    metrics: {
      newLeads,
      highPriorityLeads,
      unassignedLeads,
      openThreads,
      unansweredThreads,
      followUpsDue,
      openOpportunities,
      pipelineValue: moneyFromOperatorValue(pipelineValueRaw),
      queuedActions
    },
    nextActions,
    leads: leads.slice(0, 8),
    threads: operator.threads.slice(0, 6),
    stages: operator.stages,
    queuedActions: actionQueue.actions.slice(0, 6).map((action) => ({
      id: action.id,
      subject: action.subject || action.actionType,
      status: action.status,
      riskLevel: action.riskLevel,
      providerKey: action.providerKey,
      href: "/app/actions"
    }))
  };
}
