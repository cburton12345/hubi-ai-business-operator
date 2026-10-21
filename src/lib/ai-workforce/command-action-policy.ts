import type { FerocityPlannedActionKey } from "@/lib/ferocity/conversation-runtime";
import {
  hasDocumentIntelligenceIntent,
  requestsExistingFinancialReport,
} from "@/lib/document-intelligence/chat-intent";

const financialDocumentActions = new Set<FerocityPlannedActionKey>([
  "inspect_workspace",
  "create_expense_review_task",
]);

export function explicitlyRequestsReadOnly(command: string) {
  return /\b(?:read[ -]?only|do not (?:change|create|update|send|publish|schedule|modify|delete|write)|don't (?:change|create|update|send|publish|schedule|modify|delete|write)|without (?:changing|creating|updating|sending|publishing|scheduling|modifying|deleting|writing)|no changes?)\b/i.test(command);
}

export function isFinancialDocumentCommand(input: {
  command: string;
  conversationContext?: string | null;
}) {
  const combined = `${input.conversationContext ?? ""}\n${input.command}`;
  return hasDocumentIntelligenceIntent(combined)
    || requestsExistingFinancialReport(input);
}

export function applyCommandActionPolicy(input: {
  command: string;
  conversationContext?: string | null;
  plannedActions: readonly FerocityPlannedActionKey[];
}) {
  const financialDocumentScope = isFinancialDocumentCommand(input);
  const existingFinancialReport = requestsExistingFinancialReport(input);
  const readOnlyRequested = explicitlyRequestsReadOnly(input.command);
  const plannedActions = financialDocumentScope
    ? input.plannedActions.filter((action) => financialDocumentActions.has(action))
    : [...input.plannedActions];

  return {
    financialDocumentScope,
    existingFinancialReport,
    readOnlyRequested,
    plannedActions: readOnlyRequested
      ? []
      : existingFinancialReport
      ? plannedActions.filter((action) => action !== "create_expense_review_task")
      : plannedActions,
  };
}
