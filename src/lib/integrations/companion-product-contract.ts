export type CompanionActionMode = "read" | "prepare_for_approval" | "execute" | "system_workflow_only";
export type CompanionActionRisk = "read" | "low" | "medium" | "high" | "critical";

export type CompanionActionDefinition = {
  key: string;
  title: string;
  mode: CompanionActionMode;
  risk: CompanionActionRisk;
  authoritativeSystem: string;
  idempotencyRequired: boolean;
  approvalGateRequired: boolean;
  authoritativeVerificationRequired: boolean;
  description: string;
};

export type CompanionDomainDefinition = {
  key: string;
  authoritativeResources: string[];
  contextMode: "aggregate" | "event" | "record_reference";
  containsSensitiveData: boolean;
};

export type CompanionProductContract = {
  productKey: string;
  productName: string;
  authorityRule: string;
  domains: CompanionDomainDefinition[];
  actions: CompanionActionDefinition[];
  forbiddenDirectActions: string[];
};

export const homes4RentCompanionContract: CompanionProductContract = {
  productKey: "h4r",
  productName: "Homes4Rent",
  authorityRule: "Homes4Rent remains authoritative for rental, ledger, payment, notice, lease, tenant, and signature state.",
  domains: [
    { key: "portfolio", authoritativeResources: ["properties", "units", "tenants"], contextMode: "aggregate", containsSensitiveData: false },
    { key: "leasing", authoritativeResources: ["rental_applications", "showing_requests", "leases", "lease_signers", "lease_fields"], contextMode: "event", containsSensitiveData: true },
    { key: "payments", authoritativeResources: ["ledger_entries", "unit_balances", "payment_provider_records"], contextMode: "aggregate", containsSensitiveData: true },
    { key: "collections", authoritativeResources: ["collection_cases", "collection_promises", "collection_payment_plans"], contextMode: "event", containsSensitiveData: true },
    { key: "documents", authoritativeResources: ["tenant_documents", "lease_documents", "lease_signature_events", "tenant_insurance_records"], contextMode: "record_reference", containsSensitiveData: true },
    { key: "notices", authoritativeResources: ["notices_outbox", "owner_notifications"], contextMode: "event", containsSensitiveData: true },
    { key: "communications", authoritativeResources: ["sms_outbox", "conversations", "workspace_messaging_connectors"], contextMode: "event", containsSensitiveData: true },
    { key: "providers", authoritativeResources: ["workspace_provider_connectors", "provider_actions"], contextMode: "aggregate", containsSensitiveData: false },
  ],
  actions: [
    { key: "record_owner_confirmed_payment", title: "Record an owner-confirmed received payment", mode: "system_workflow_only", risk: "high", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: true, authoritativeVerificationRequired: true, description: "H4R prepares an immutable tenant/unit/payment preview and posts it only after owner confirmation through its authoritative RPC; Ferocity never edits balances directly." },
    { key: "read_context", title: "Read minimized operating context", mode: "read", risk: "read", authoritativeSystem: "h4r", idempotencyRequired: false, approvalGateRequired: false, authoritativeVerificationRequired: false, description: "Read aggregate operating state and references without copying H4R domain records." },
      { key: "analyze_lease_document", title: "Analyze a lease document", mode: "prepare_for_approval", risk: "medium", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: true, authoritativeVerificationRequired: false, description: "Prepare terms and field suggestions; H4R accepts or rejects them through its existing lease workflow." },
      { key: "analyze_insurance_document", title: "Analyze a renters-insurance document", mode: "prepare_for_approval", risk: "high", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: true, authoritativeVerificationRequired: false, description: "Extract review suggestions from private proof; H4R and a human remain authoritative for verification, dates, and coverage status." },
      { key: "analyze_financial_document", title: "Analyze a financial source document", mode: "prepare_for_approval", risk: "high", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: true, authoritativeVerificationRequired: false, description: "Return review-only receipt or statement extraction; never post an expense, tenant payment or tax determination." },
    { key: "prepare_tenant_communication", title: "Prepare tenant communication", mode: "prepare_for_approval", risk: "high", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: true, authoritativeVerificationRequired: false, description: "Prepare a draft through existing consent and message-review controls." },
    { key: "prepare_collection_step", title: "Prepare collection follow-up", mode: "prepare_for_approval", risk: "critical", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: true, authoritativeVerificationRequired: false, description: "Prepare a collection step without making legal, payment, or tenant-accounting decisions." },
    { key: "refresh_derived_notifications", title: "Refresh derived owner notifications", mode: "execute", risk: "low", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: false, authoritativeVerificationRequired: false, description: "Refresh derived notifications without changing the underlying lease, ledger, payment, or legal record." },
    { key: "run_authorized_operator", title: "Run H4R's configured operator", mode: "system_workflow_only", risk: "critical", authoritativeSystem: "h4r", idempotencyRequired: true, approvalGateRequired: true, authoritativeVerificationRequired: false, description: "Invoke H4R's existing configured operator; H4R re-enforces mode, authorization, and canonical workflow rules." },
  ],
  forbiddenDirectActions: [
    "edit_ledger_balance", "post_or_reverse_payment", "change_rent_calculation", "change_late_fee_calculation",
    "mark_lease_signed", "alter_signature_evidence", "make_screening_decision", "make_legal_determination",
    "delete_tenant_record", "replace_h4r_identity", "write_provider_credentials",
  ],
};

export const companionProductContracts = {
  h4r: homes4RentCompanionContract,
} as const;

export function companionAction(productKey: keyof typeof companionProductContracts, actionKey: string) {
  return companionProductContracts[productKey].actions.find((action) => action.key === actionKey) ?? null;
}

export function assertCompanionActionPermitted(input: {
  productKey: keyof typeof companionProductContracts;
  actionKey: string;
  requestedMode: "read" | "prepare" | "execute";
  idempotencyKey?: string | null;
  approvalGatePresent?: boolean;
  authoritativeVerificationPresent?: boolean;
  systemWorkflow?: boolean;
}) {
  const contract = companionProductContracts[input.productKey];
  if (contract.forbiddenDirectActions.includes(input.actionKey)) throw new Error(`Direct companion action is forbidden: ${input.actionKey}.`);
  const action = companionAction(input.productKey, input.actionKey);
  if (!action) throw new Error(`Companion action is not declared: ${input.actionKey}.`);
  if (input.requestedMode === "execute" && !["execute", "system_workflow_only"].includes(action.mode)) {
    throw new Error(`Companion action ${input.actionKey} cannot execute directly.`);
  }
  if (action.mode === "system_workflow_only" && !input.systemWorkflow) throw new Error(`Companion action ${input.actionKey} requires the authoritative system workflow.`);
  if (action.idempotencyRequired && !input.idempotencyKey?.trim()) throw new Error(`Companion action ${input.actionKey} requires an idempotency key.`);
  if (action.approvalGateRequired && !input.approvalGatePresent) throw new Error(`Companion action ${input.actionKey} requires its existing approval gate.`);
  if (action.authoritativeVerificationRequired && !input.authoritativeVerificationPresent) {
    throw new Error(`Companion action ${input.actionKey} requires verification from ${action.authoritativeSystem}.`);
  }
  return action;
}
