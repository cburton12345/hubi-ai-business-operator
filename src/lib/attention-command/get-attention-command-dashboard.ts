import { getActionQueueDashboard } from "@/lib/actions-queue/get-action-queue";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getJobTrackerDashboard } from "@/lib/job-tracker/get-job-tracker-dashboard";
import { getManualTextQueue } from "@/lib/manual-text-queue/get-manual-text-queue";
import { getOwnerCommandCenter } from "@/lib/owner-command-center/get-owner-command-center";
import { getOwnerNeeds } from "@/lib/owner-command-center/get-owner-needs";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import { getOwnerRemindersDashboard } from "@/lib/reminders/owner-reminders";
import { getSafetyReadinessDashboard } from "@/lib/safety-readiness/get-safety-readiness-dashboard";

export type AttentionCommandAction = {
  title: string;
  detail: string;
  href: string;
  urgency: "critical" | "high" | "medium" | "low";
};

export type AttentionCommandNudge = AttentionCommandAction & {
  nudgeMode: "interrupt" | "today" | "daily_brief" | "watch";
  reason: string;
};

export type AttentionCommandChecklistItem = AttentionCommandAction & {
  id: string;
  count: number;
  buttonLabel: string;
  doneWhen: string;
};

export type AttentionCommandDashboard = {
  workspaceName: string;
  briefing: string;
  direction: AttentionCommandAction;
  nudges: AttentionCommandNudge[];
  metrics: {
    ownerNeeds: number;
    criticalIssues: number;
    blockedActions: number;
    needsReview: number;
    activeAlerts: number;
    openPipelineCents: number;
    collectedRevenueCents: number;
    unpaidInvoices: number;
    providerGaps: number;
    aiHandled: number;
    safetyBlocked: number;
    nudges: number;
    activeReminders: number;
    dueReminders: number;
  };
  doFirst: AttentionCommandAction[];
  checklist: AttentionCommandChecklistItem[];
  reminders: Awaited<ReturnType<typeof getOwnerRemindersDashboard>>["reminders"];
  moneyMoves: AttentionCommandAction[];
  ownerNeeds: Awaited<ReturnType<typeof getOwnerNeeds>>;
  criticalIssues: Awaited<ReturnType<typeof getOwnerCommandCenter>>["criticalIssues"];
  aiActions: Awaited<ReturnType<typeof getOwnerCommandCenter>>["aiActions"];
  providerGaps: Awaited<ReturnType<typeof getReportingDashboard>>["providerGaps"];
  channelRoi: Awaited<ReturnType<typeof getReportingDashboard>>["channelRoi"];
  safetyNeeds: Awaited<ReturnType<typeof getSafetyReadinessDashboard>>["topNeeds"];
};

function actionMetric(metrics: Awaited<ReturnType<typeof getActionQueueDashboard>>["metrics"], label: string) {
  return metrics.find((metric) => metric.label === label)?.value ?? 0;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function nudgeModeFor(urgency: AttentionCommandAction["urgency"]): AttentionCommandNudge["nudgeMode"] {
  if (urgency === "critical") return "interrupt";
  if (urgency === "high") return "today";
  if (urgency === "medium") return "daily_brief";
  return "watch";
}

function nudgeLabel(mode: AttentionCommandNudge["nudgeMode"]) {
  if (mode === "interrupt") return "Interrupt now";
  if (mode === "today") return "Nudge today";
  if (mode === "daily_brief") return "Daily brief";
  return "Watch";
}

export async function getAttentionCommandDashboard(): Promise<AttentionCommandDashboard> {
  const [snapshot, ownerCenter, ownerNeeds, reports, actionQueue, safety, textQueue, jobTracker, reminders] = await Promise.all([
    getDashboardSnapshot(),
    getOwnerCommandCenter(),
    getOwnerNeeds(),
    getReportingDashboard(),
    getActionQueueDashboard(),
    getSafetyReadinessDashboard(),
    getManualTextQueue(),
    getJobTrackerDashboard(),
    getOwnerRemindersDashboard()
  ]);

  const blockedActions = actionMetric(actionQueue.metrics, "Blocked");
  const needsReview = actionMetric(actionQueue.metrics, "Needs review");
  const safetyBlocked = safety.metrics.blocked;

  const doFirstRaw: Array<AttentionCommandAction | null> = [
    ...ownerNeeds.slice(0, 4).map((need) => ({
      title: need.title,
      detail: need.detail,
      href: need.href,
      urgency: need.priority
    })),
    ...ownerCenter.criticalIssues.slice(0, 3).map((event) => ({
      title: event.title,
      detail: event.recommendedAction ?? event.summary,
      href: event.actionHref,
      urgency: "critical" as const
    })),
    blockedActions > 0
      ? {
          title: "Automation is blocked",
          detail: `${blockedActions} action queue item${blockedActions === 1 ? "" : "s"} stopped by policy, consent, provider setup, or limits.`,
          href: "/app/automation-command",
          urgency: "high" as const
        }
      : null,
    safetyBlocked > 0
      ? {
          title: "Safety checks are blocking launch",
          detail: `${safetyBlocked} safety item${safetyBlocked === 1 ? "" : "s"} must be fixed before live actions are trusted.`,
          href: "/app/safety-readiness",
          urgency: "high" as const
        }
      : null
  ];
  const doFirst = doFirstRaw.filter((item): item is AttentionCommandAction => Boolean(item)).slice(0, 8);

  const moneyMovesRaw: Array<AttentionCommandAction | null> = [
    ...ownerCenter.makeMoneyNext.slice(0, 4).map((item) => ({
      title: item.title,
      detail: item.valueCents ? `${money(item.valueCents)} attached. ${item.detail}` : item.detail,
      href: item.href,
      urgency: item.valueCents > 0 ? ("high" as const) : ("medium" as const)
    })),
    reports.leadToRevenue.unpaidInvoices > 0
      ? {
          title: "Collect unpaid invoices",
          detail: `${reports.leadToRevenue.unpaidInvoices} invoice${reports.leadToRevenue.unpaidInvoices === 1 ? "" : "s"} still need payment follow-up.`,
          href: "/app/cash-collection",
          urgency: "high" as const
        }
      : null,
    reports.leadToRevenue.openEstimates > 0
      ? {
          title: "Follow up open estimates",
          detail: `${reports.leadToRevenue.openEstimates} estimate${reports.leadToRevenue.openEstimates === 1 ? "" : "s"} can still turn into booked work.`,
          href: "/app/service-command",
          urgency: "medium" as const
        }
      : null,
    snapshot.metrics.openLeads > 0
      ? {
          title: "Work open leads",
          detail: `${snapshot.metrics.openLeads} open lead${snapshot.metrics.openLeads === 1 ? "" : "s"} ${snapshot.metrics.openLeads === 1 ? "needs" : "need"} response, routing, or follow-up.`,
          href: "/app/lead-command",
          urgency: "medium" as const
        }
      : null
  ];
  const moneyMoves = moneyMovesRaw.filter((item): item is AttentionCommandAction => Boolean(item)).slice(0, 8);

  const ownerSummary = snapshot.operator.ownerSummary;
  const checklistRaw: Array<AttentionCommandChecklistItem | null> = [
    reminders.metrics.dueNow > 0
      ? {
          id: "owner-reminders-due",
          title: "Handle due reminders",
          detail: `${reminders.metrics.dueNow} reminder${reminders.metrics.dueNow === 1 ? "" : "s"} or goal${reminders.metrics.dueNow === 1 ? " is" : "s are"} due now, including calls, meetings, daily priorities, or employee prompts.`,
          href: "/app/notifications",
          urgency: "high",
          count: reminders.metrics.dueNow,
          buttonLabel: "Open reminders",
          doneWhen: "Each due reminder is completed, rescheduled, paused, or assigned."
        }
      : null,
    textQueue.metrics.readyTexts > 0
      ? {
          id: "manual-texts-ready",
          title: "Send prepared follow-up texts",
          detail: `${textQueue.metrics.readyTexts} one-to-one text draft${textQueue.metrics.readyTexts === 1 ? "" : "s"} are ready for leads or bills. Open each, send from your phone, then save the outcome.`,
          href: "/app/text-queue",
          urgency: textQueue.metrics.invoiceTexts > 0 ? "high" : "medium",
          count: textQueue.metrics.readyTexts,
          buttonLabel: "Open texts",
          doneWhen: "Each text is sent, canceled, or marked with an outcome."
        }
      : null,
    Number(jobTracker.metrics.receiptsNeedReview) > 0
      ? {
          id: "receipts-review",
          title: "Review submitted receipts",
          detail: `${jobTracker.metrics.receiptsNeedReview} receipt${jobTracker.metrics.receiptsNeedReview === 1 ? "" : "s"} need review before they become trusted job costs or reimbursements.`,
          href: "/app/job-tracker",
          urgency: "high",
          count: jobTracker.metrics.receiptsNeedReview,
          buttonLabel: "Review receipts",
          doneWhen: "Receipts are approved, rejected, or marked paid back."
        }
      : null,
    jobTracker.metrics.reimbursementPending !== "$0"
      ? {
          id: "reimbursements-pending",
          title: "Pay back approved receipts",
          detail: `${jobTracker.metrics.reimbursementPending} is waiting in employee/subcontractor reimbursement status.`,
          href: "/app/job-tracker",
          urgency: "medium",
          count: 1,
          buttonLabel: "Open paybacks",
          doneWhen: "Each reimbursement is paid, rejected, or scheduled."
        }
      : null,
    jobTracker.metrics.overdueInvoices > 0
      ? {
          id: "overdue-invoices",
          title: "Collect overdue invoices",
          detail: `${jobTracker.metrics.overdueInvoices} overdue invoice${jobTracker.metrics.overdueInvoices === 1 ? "" : "s"} and ${jobTracker.metrics.moneyCustomersOwe} still owed by customers.`,
          href: "/app/cash-collection",
          urgency: "high",
          count: jobTracker.metrics.overdueInvoices,
          buttonLabel: "Collect money",
          doneWhen: "Payment is recorded, reminder is sent, or a promise date is noted."
        }
      : null,
    ownerSummary.itineraryNeeded > 0
      ? {
          id: "worker-itineraries",
          title: "Plan today for unassigned workers",
          detail: `${ownerSummary.itineraryNeeded} available worker${ownerSummary.itineraryNeeded === 1 ? "" : "s"} may still need an assignment or day plan.`,
          href: "/app/operations-workforce#schedule",
          urgency: "high",
          count: ownerSummary.itineraryNeeded,
          buttonLabel: "Plan work",
          doneWhen: "Everyone working today has a job, assignment, or is marked off."
        }
      : null,
    ownerSummary.expenseReview > 0
      ? {
          id: "expense-review",
          title: "Approve job costs",
          detail: `${ownerSummary.expenseReview} expense, mileage, or material item${ownerSummary.expenseReview === 1 ? "" : "s"} need review before reports are trustworthy.`,
          href: "/app/operations-workforce#field-work",
          urgency: "medium",
          count: ownerSummary.expenseReview,
          buttonLabel: "Review costs",
          doneWhen: "Each cost is approved, rejected, or corrected."
        }
      : null,
    needsReview > 0
      ? {
          id: "action-review",
          title: "Review AI-prepared actions",
          detail: `${needsReview} action${needsReview === 1 ? "" : "s"} are waiting before messages, publishing, payments, or sync can move.`,
          href: "/app/actions",
          urgency: "medium",
          count: needsReview,
          buttonLabel: "Review actions",
          doneWhen: "Each action is approved, sent manually, blocked, or canceled."
        }
      : null
  ];
  const checklist = checklistRaw.filter((item): item is AttentionCommandChecklistItem => Boolean(item)).slice(0, 10);

  const direction =
    doFirst[0] ??
    moneyMoves[0] ??
    ({
      title: "Keep building the operating system",
      detail: "No urgent owner decision is blocking Ferocity right now. Next best step is to connect the remaining business systems and let Ferocity keep watching.",
      href: "/app/build-system",
      urgency: "low" as const
    });

  const nudges: AttentionCommandNudge[] = [
    ...reminders.reminders
      .filter((item) => item.status === "active" && new Date(item.nextDueAt).getTime() <= Date.now())
      .slice(0, 3)
      .map((item) => ({
        title: item.title,
        detail: item.body ?? `Reminder due for ${item.assigneeName ?? item.assigneeEmail ?? "the owner"}.`,
        href: item.actionUrl || "/app/notifications",
        urgency: item.priority === "urgent" || item.priority === "high" ? ("high" as const) : ("medium" as const),
        nudgeMode: "today" as const,
        reason: "This is on today's reminder list and should not require opening the reminder page to notice it."
      })),
    ...doFirst.map((item) => ({
      ...item,
      nudgeMode: nudgeModeFor(item.urgency),
      reason: item.urgency === "critical" ? "Money, safety, customer trust, or a blocked decision may be at risk." : "Ferocity needs a decision or setup step before it can finish the work."
    })),
    ...moneyMoves.map((item) => ({
      ...item,
      nudgeMode: item.urgency === "high" ? ("today" as const) : ("daily_brief" as const),
      reason: "This can affect revenue, collections, booked work, or lead conversion."
    }))
  ]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.title === item.title && candidate.href === item.href) === index)
    .slice(0, 10);

  const briefing = [
    ownerCenter.briefing,
    `Direction: ${direction.title}.`,
    nudges.length ? `${nudges.length} nudge${nudges.length === 1 ? "" : "s"} are active.` : "No nudges are needed right now.",
    reminders.metrics.dueNow ? `${reminders.metrics.dueNow} reminder${reminders.metrics.dueNow === 1 ? "" : "s"} ${reminders.metrics.dueNow === 1 ? "is" : "are"} due now.` : "No reminders are due now.",
    blockedActions ? `${blockedActions} automation item${blockedActions === 1 ? "" : "s"} blocked.` : "No automation blocks found.",
    safetyBlocked ? `${safetyBlocked} safety block${safetyBlocked === 1 ? "" : "s"} ${safetyBlocked === 1 ? "needs" : "need"} attention.` : "Safety board is not blocking live readiness.",
    reports.providerGaps.length ? `${reports.providerGaps.length} provider gap${reports.providerGaps.length === 1 ? "" : "s"} ${reports.providerGaps.length === 1 ? "keeps" : "keep"} some work manual.` : "Provider gaps are clear."
  ].join(" ");

  return {
    workspaceName: ownerCenter.workspaceName,
    briefing,
    direction,
    nudges,
    metrics: {
      ownerNeeds: ownerNeeds.length + ownerCenter.needsOwner.length,
      criticalIssues: ownerCenter.criticalIssues.length,
      blockedActions,
      needsReview,
      activeAlerts: reports.activeAlerts,
      openPipelineCents: reports.leadToRevenue.openPipelineCents,
      collectedRevenueCents: reports.leadToRevenue.collectedRevenueCents,
      unpaidInvoices: reports.leadToRevenue.unpaidInvoices,
      providerGaps: reports.providerGaps.length,
      aiHandled: ownerCenter.aiActions.length,
      safetyBlocked,
      nudges: nudges.length,
      activeReminders: reminders.metrics.active,
      dueReminders: reminders.metrics.dueNow
    },
    doFirst,
    checklist,
    reminders: reminders.reminders.slice(0, 8),
    moneyMoves,
    ownerNeeds: ownerNeeds.slice(0, 8),
    criticalIssues: ownerCenter.criticalIssues.slice(0, 8),
    aiActions: ownerCenter.aiActions.slice(0, 8),
    providerGaps: reports.providerGaps.slice(0, 8),
    channelRoi: reports.channelRoi.slice(0, 6),
    safetyNeeds: safety.topNeeds.slice(0, 8)
  };
}

export { nudgeLabel };
