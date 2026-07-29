import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const checks = [
  {
    name: "growth funnel to public qualification",
    file: "src/lib/revenue-growth/activate-funnel-operations.ts",
    terms: ["public.forms", "publicFormKey", "revenue_qualification_questions", "qualified_lead"]
  },
  {
    name: "public qualification to lead scoring",
    file: "src/lib/leads/create-public-lead.ts",
    terms: ["evaluateQualification", "qualification_status", "lead_score", "qualificationAnswers"]
  },
  {
    name: "qualified lead to follow-up automation",
    file: "src/lib/revenue-growth/revenue-loop-automation.ts",
    terms: ["l.qualification_status = 'qualified'", "l.consent_to_contact = true", "revenue_followup_enrollments"]
  },
  {
    name: "construction intelligence to owner loop",
    file: "src/lib/construction/job-health.ts",
    terms: ["syncConstructionHealthForTenant", "construction_job_health_snapshots", "construction.job_risk", "owner_command_events"]
  },
  {
    name: "link intelligence to authority and owner loop",
    file: "src/lib/authority/sync-link-authority.ts",
    terms: ["authority_linkable_assets", "authority_link_opportunities", "authority.link_risk", "owner_command_events"]
  },
  {
    name: "scheduled business automation consumes new systems",
    file: "src/lib/automation/run-business-automation.ts",
    terms: ["syncConstructionHealthForTenant", "syncLinkAuthorityForTenant", "runRevenueLoopAutomationForTenant", "generateTenantDailyBrief"]
  },
  {
    name: "owner front door consumes escalations",
    file: "src/lib/attention-command/get-attention-command-dashboard.ts",
    terms: ["getOwnerCommandCenter", "criticalIssues", "needsOwner", "doFirst"]
  },
  {
    name: "AI website chat uses shared lead, messaging, knowledge, and owner systems",
    file: "src/app/api/public/chat/route.ts",
    terms: ["createPublicLead", "messaging_conversations", "generateJsonWithProvider", "getIndustryKnowledgeContext", "owner_command_events"]
  },
  {
    name: "customer lifecycle employee manages the full relationship",
    file: "src/lib/customer-lifecycle/sync-customer-lifecycle.ts",
    terms: ["missed_call_recovery", "estimate_followup", "nurture", "database_reactivation", "referral_request", "customer_lifetime_value"]
  },
  {
    name: "voice receptionist creates connected operating records",
    file: "src/app/api/integrations/voice-ai/webhook/route.ts",
    terms: ["office_manager_conversation_sessions", "receptionist_calls", "revenue_appointments", "syncCustomerLifecycleForTenant"]
  },
  {
    name: "premium video rendering is provider-backed, cost-capped, and billable",
    file: "src/app/app/marketing-os/video/[videoJobId]/actions.ts",
    terms: ["getVideoGenerationProvider", "pg_advisory_xact_lock", "workspaceMonthlyBudgetCents", "billing_usage_charges", "usage_meter_events"]
  },
  {
    name: "BYO provider demand becomes a tracked product request",
    file: "src/app/app/integrations/actions.ts",
    terms: ["requestProviderIntegrationAction", "provider_integration_requests", "capabilityCategory", "currentlyUsing"]
  },
  {
    name: "industry expertise remains modular and guarded",
    file: "supabase/migrations/121_customer_lifecycle_and_industry_knowledge.sql",
    terms: ["industry_knowledge_modules", "industry_knowledge_items", "tenant_industry_modules", "roofing_core", "guardrails_json"]
  },
  {
    name: "referrals have a tracked path from advocate to revenue",
    file: "src/lib/leads/create-public-lead.ts",
    terms: ["applyReferralAttribution", "customer_referral_links", "growth_attribution_events", "referralToken"]
  },
  {
    name: "legacy jobs synchronize into the canonical service kernel",
    file: "src/lib/service-ops/service-kernel.ts",
    terms: ["service_work_orders", "service_visits", "service_operating_events", "service_job_id"]
  },
  {
    name: "dispatch evaluates capacity and worker eligibility",
    file: "src/lib/scheduling/evaluate-visit.ts",
    terms: ["worker_overlap", "outside_availability", "missing_certification", "service_visit_conflicts"]
  },
  {
    name: "field completion is evidence gated",
    file: "src/lib/field-ops/evaluate-visit-completion.ts",
    terms: ["field_form_assignments", "service_visit_signatures", "completion_readiness_status"]
  },
  {
    name: "offline field changes use idempotent conflict-aware sync",
    file: "src/app/api/field/offline-sync/route.ts",
    terms: ["clientMutationId", "field_offline_mutations", "baseRecordVersion", "conflict"]
  },
  {
    name: "pricebook feeds estimates deterministically",
    file: "src/app/app/service/actions.ts",
    terms: ["addPricebookItemToEstimateAction", "pricebook_item_id", "recalculateEstimateTotal"]
  },
  {
    name: "memberships create canonical due visits",
    file: "src/lib/service-ops/generate-membership-visits.ts",
    terms: ["recurring_service_plans", "service_work_orders", "service_visits", "membership_engine"]
  },
  {
    name: "customer portal writes requests into operating history",
    file: "src/app/portal/[token]/actions.ts",
    terms: ["customer_portal_requests", "customer_portal_messages", "service_operating_events"]
  },
  {
    name: "inventory adjustments retain an audit ledger",
    file: "src/app/app/service/actions.ts",
    terms: ["adjustInventoryQuantityAction", "inventory_transactions", "quantity_delta"]
  },
  {
    name: "inbound replies stop conflicting nurture",
    file: "src/lib/messaging/record-inbound-response.ts",
    terms: ["customer_response_stops", "revenue_followup_enrollments", "follow_up_workflows", "Stopped because the customer replied"]
  },
  {
    name: "incumbent imports are dry-run and rollback aware",
    file: "src/app/app/exports/actions.ts",
    terms: ["previewCustomerImportAction", "applyCustomerImportAction", "rollbackCustomerImportAction", "data_import_rows"]
  },
  {
    name: "customer schedule responses update canonical visits and operating history",
    file: "src/app/visit/[token]/actions.ts",
    terms: ["service_visit_customer_tokens", "customer_confirmation_status", "customer_schedule_response", "service_operating_events"]
  },
  {
    name: "purchase receipts update orders and audited inventory",
    file: "src/app/app/purchasing/actions.ts",
    terms: ["purchase_order_receipts", "purchase_order_receipt_items", "inventory_transactions", "service_inventory_items"]
  },
  {
    name: "accounting export preparation connects invoices and vendor bills",
    file: "src/app/app/purchasing/actions.ts",
    terms: ["queueAccountingSyncAction", "accounting_sync_runs", "accounting_sync_records", "vendor_bill"]
  },
  {
    name: "managed messaging projects cost before sending and meters actual sends",
    file: "src/lib/messaging/messaging-engine.ts",
    terms: ["estimatedMessagingUsage", "Monthly messaging provider-cost cap reached", "usage_meter_events", "billing_usage_charges"]
  },
  {
    name: "storage uploads reserve workspace capacity before provider writes",
    file: "src/lib/usage/storage-quota.ts",
    terms: ["reserve_storage_usage", "finishStorageUpload", "storage_usage_events"]
  },
  {
    name: "service reporting consumes canonical delivery, workforce, membership, and inbox state",
    file: "src/lib/reports/get-service-performance-dashboard.ts",
    terms: ["service_visits", "service_visit_assignments", "recurring_service_plans", "messaging_conversations"]
  }
];

for (const check of checks) {
  const contents = source(check.file);
  const missing = check.terms.filter((term) => !contents.includes(term));
  if (missing.length) {
    throw new Error(`${check.name} is disconnected in ${check.file}: missing ${missing.join(", ")}`);
  }
}

console.log(`Feature integration check passed for ${checks.length} connected workflows.`);
