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
  | "createCommitment";

export const businessActionCatalog: Record<
  BusinessActionKey,
  BusinessActionDefinition
> = {
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
    externalReady: false,
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
    externalReady: false,
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
    externalReady: false,
  },
  createCommitment: {
    key: "createCommitment",
    title: "Create commitment",
    description:
      "Record a reversible internal promise with a responsible party, deadline, and expected result.",
    scope: "commitments:write",
    mode: "execute",
    risk: "low",
    externalReady: false,
  },
};

export function listBusinessActionDefinitions() {
  return Object.values(businessActionCatalog);
}
