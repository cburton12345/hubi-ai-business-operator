export type SupportGuidance = {
  key: string;
  title: string;
  steps: string[];
  escalationRequired: boolean;
  safetyNote: string;
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function supportGuidanceFor(input: { issueType?: string | null; description: string }): SupportGuidance {
  const type = (input.issueType || "other").toLowerCase();
  const text = `${type} ${input.description}`.toLowerCase();

  if (includesAny(text, ["security", "hacked", "breach", "stolen", "unauthorized", "data deletion", "delete my data", "privacy request"])) {
    return {
      key: "security_or_privacy_review",
      title: "Security or privacy review required",
      steps: ["Do not collect credentials or sensitive payment details.", "Record the affected account, what the caller observed, and when it happened."],
      escalationRequired: true,
      safetyNote: "A platform administrator must review this request. Do not promise deletion, reimbursement, or a security conclusion."
    };
  }
  if (includesAny(text, ["refund", "chargeback", "dispute", "charged twice", "unknown charge", "cancel and refund"])) {
    return {
      key: "billing_dispute_review",
      title: "Billing review required",
      steps: ["Ask only for the account email and a general description of the charge.", "Never request a full card number or banking credential."],
      escalationRequired: true,
      safetyNote: "A verified administrator must review refunds, disputed charges, and payment ownership."
    };
  }
  if (type === "account" || includesAny(text, ["password", "sign in", "login", "locked out"])) {
    return {
      key: "account_access",
      title: "Restore account access",
      steps: ["Open ferocity.live/reset-password and request a fresh reset email.", "Use the newest reset email and check spam or junk if it does not arrive.", "Return to ferocity.live/login after the password is saved."],
      escalationRequired: false,
      safetyNote: "Never ask the caller to read a password or verification code aloud. Workspace ownership changes require human review."
    };
  }
  if (type === "billing") {
    return {
      key: "billing_self_service",
      title: "Review billing safely",
      steps: ["Sign in and open Billing.", "Use the billing portal to update the payment method, view invoices, or manage the subscription.", "Return to Ferocity and confirm the billing status refreshed."],
      escalationRequired: false,
      safetyNote: "Refunds, disputes, ownership changes, and unexplained charges require verified review."
    };
  }
  if (type === "integration") {
    return {
      key: "integration_reconnect",
      title: "Reconnect a service",
      steps: ["Open Integrations and select the affected service.", "Review its connection status and required permissions.", "Reconnect or reauthorize from Ferocity, then run the available connection check."],
      escalationRequired: false,
      safetyNote: "Do not ask the caller to read API keys, OAuth codes, or secrets aloud."
    };
  }
  if (type === "workflow") {
    return {
      key: "workflow_attention",
      title: "Find why work paused",
      steps: ["Open Actions and look for Needs review, Blocked, or Needs attention.", "Open Approvals for work waiting on a human decision.", "Check the related provider connection, customer consent, authority rule, and spending limit before retrying."],
      escalationRequired: false,
      safetyNote: "Do not bypass consent, authority, billing, or provider safety controls."
    };
  }
  return {
    key: "technical_basics",
    title: "Basic Ferocity troubleshooting",
    steps: ["Open ferocity.live/status to check service availability.", "Refresh the page once and sign back in if the session expired.", "Retry the exact action once, then note the page, time, and error message if it still fails."],
    escalationRequired: false,
    safetyNote: "Do not repeatedly retry money movement, publishing, messaging, or other consequential actions."
  };
}
