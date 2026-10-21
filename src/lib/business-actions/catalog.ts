export type BusinessActionRisk = "read" | "low" | "medium" | "high";

export type BusinessActionDefinition = {
  key: BusinessActionKey;
  title: string;
  description: string;
  scope: string;
  mode: "read" | "execute" | "prepare_for_approval";
  risk: BusinessActionRisk;
  externalReady: boolean;
};

export type BusinessActionKey =
  | "getBusinessSummary"
  | "listCustomers"
  | "listJobs"
  | "listInvoices"
  | "getOpenLeads"
  | "getStaleLeads"
  | "getUnsoldEstimates"
  | "getCustomerHistory"
  | "getScheduleAvailability"
  | "getJobStatus"
  | "createFollowUp"
  | "updateJob"
  | "scheduleJob"
  | "requestApproval"
  | "getOutstandingInvoices"
  | "getOpenCommitments"
  | "createCommitment"
  | "updateCommitment"
  | "startWorkflow";

export const businessActionCatalog: Record<
  BusinessActionKey,
  BusinessActionDefinition
> = {
  getBusinessSummary: {
    key: "getBusinessSummary",
    title: "Get business summary",
    description: "Return a minimized operational summary for the authorized workspace.",
    scope: "business:read",
    mode: "read",
    risk: "read",
    externalReady: true,
  },
  listCustomers: {
    key: "listCustomers",
    title: "List customers",
    description: "Return a paginated, minimized customer directory without contact secrets.",
    scope: "customers:read",
    mode: "read",
    risk: "read",
    externalReady: true,
  },
  listJobs: {
    key: "listJobs",
    title: "List jobs",
    description: "Return paginated workspace jobs and their current operating status.",
    scope: "jobs:read",
    mode: "read",
    risk: "read",
    externalReady: true,
  },
  listInvoices: {
    key: "listInvoices",
    title: "List invoices",
    description: "Return paginated invoice status and balances without payment credentials.",
    scope: "invoices:read",
    mode: "read",
    risk: "read",
    externalReady: true,
  },
  getOpenLeads: {
    key: "getOpenLeads",
    title: "Get open leads",
    description: "Return open leads for the authorized workspace.",
    scope: "leads:read",
    mode: "read",
    risk: "read",
    externalReady: false,
  },
  getStaleLeads: {
    key: "getStaleLeads",
    title: "Get stale leads",
    description:
      "Return open leads that have gone without progress for a supplied age.",
    scope: "leads:read",
    mode: "read",
    risk: "read",
    externalReady: false,
  },
  getUnsoldEstimates: {
    key: "getUnsoldEstimates",
    title: "Get unsold estimates",
    description:
      "Return draft or sent estimates that have not become approved work.",
    scope: "estimates:read",
    mode: "read",
    risk: "read",
    externalReady: false,
  },
  getCustomerHistory: {
    key: "getCustomerHistory",
    title: "Get customer history",
    description:
      "Return a minimized customer, job, estimate, invoice, and follow-up history.",
    scope: "customers:read",
    mode: "read",
    risk: "read",
    externalReady: true,
  },
  getScheduleAvailability: {
    key: "getScheduleAvailability",
    title: "Get schedule availability",
    description:
      "Return occupied visit windows so an authorized worker can reason about availability.",
    scope: "schedule:read",
    mode: "read",
    risk: "read",
    externalReady: false,
  },
  getJobStatus: {
    key: "getJobStatus",
    title: "Get job status",
    description: "Return the current state and schedule of one workspace job.",
    scope: "jobs:read",
    mode: "read",
    risk: "read",
    externalReady: true,
  },
  createFollowUp: {
    key: "createFollowUp",
    title: "Create follow-up",
    description:
      "Create a reversible internal follow-up record without contacting anyone.",
    scope: "followups:write",
    mode: "execute",
    risk: "low",
    externalReady: false,
  },
  updateJob: {
    key: "updateJob",
    title: "Request job update",
    description:
      "Prepare a governed job-update request for review instead of silently changing work.",
    scope: "jobs:write",
    mode: "prepare_for_approval",
    risk: "high",
    externalReady: false,
  },
  scheduleJob: {
    key: "scheduleJob",
    title: "Request job scheduling",
    description:
      "Prepare a governed scheduling request with owner approval and conflict checks still required.",
    scope: "schedule:write",
    mode: "prepare_for_approval",
    risk: "high",
    externalReady: false,
  },
  requestApproval: {
    key: "requestApproval",
    title: "Request approval",
    description:
      "Place a proposed consequential action in Ferocity's existing approval surface.",
    scope: "approvals:write",
    mode: "prepare_for_approval",
    risk: "medium",
    externalReady: false,
  },
  getOutstandingInvoices: {
    key: "getOutstandingInvoices",
    title: "Get outstanding invoices",
    description:
      "Return unpaid balances and due dates without exposing payment credentials.",
    scope: "invoices:read",
    mode: "read",
    risk: "read",
    externalReady: false,
  },
  getOpenCommitments: {
    key: "getOpenCommitments",
    title: "Get open commitments",
    description:
      "Return promises Ferocity is actively following through to a verified outcome.",
    scope: "commitments:read",
    mode: "read",
    risk: "read",
    externalReady: true,
  },
  createCommitment: {
    key: "createCommitment",
    title: "Create commitment",
    description:
      "Record a reversible internal promise with a responsible party, deadline, and expected result.",
    scope: "commitments:write",
    mode: "execute",
    risk: "low",
    externalReady: true,
  },
  updateCommitment: {
    key: "updateCommitment",
    title: "Update task",
    description: "Update a reversible internal commitment while preserving status history.",
    scope: "commitments:write",
    mode: "execute",
    risk: "low",
    externalReady: true,
  },
  startWorkflow: {
    key: "startWorkflow",
    title: "Start governed workflow",
    description: "Create or resume a durable Ferocity operating goal in observe or prepare mode.",
    scope: "workflows:write",
    mode: "execute",
    risk: "low",
    externalReady: true,
  },
};

export function listBusinessActionDefinitions() {
  return Object.values(businessActionCatalog);
}
