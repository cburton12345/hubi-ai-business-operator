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
    terms: [
      "public.forms",
      "publicFormKey",
      "revenue_qualification_questions",
      "qualified_lead",
    ],
  },
  {
    name: "public qualification to lead scoring",
    file: "src/lib/leads/create-public-lead.ts",
    terms: [
      "evaluateQualification",
      "qualification_status",
      "lead_score",
      "qualificationAnswers",
    ],
  },
  {
    name: "qualified lead to follow-up automation",
    file: "src/lib/revenue-growth/revenue-loop-automation.ts",
    terms: [
      "l.qualification_status = 'qualified'",
      "l.consent_to_contact = true",
      "revenue_followup_enrollments",
    ],
  },
  {
    name: "construction intelligence to owner loop",
    file: "src/lib/construction/job-health.ts",
    terms: [
      "syncConstructionHealthForTenant",
      "construction_job_health_snapshots",
      "construction.job_risk",
      "owner_command_events",
    ],
  },
  {
    name: "link intelligence to authority and owner loop",
    file: "src/lib/authority/sync-link-authority.ts",
    terms: [
      "authority_linkable_assets",
      "authority_link_opportunities",
      "authority.link_risk",
      "owner_command_events",
    ],
  },
  {
    name: "scheduled business automation consumes new systems",
    file: "src/lib/automation/run-business-automation.ts",
    terms: [
      "syncConstructionHealthForTenant",
      "syncLinkAuthorityForTenant",
      "runRevenueLoopAutomationForTenant",
      "generateTenantDailyBrief",
    ],
  },
  {
    name: "owner front door consumes escalations",
    file: "src/lib/attention-command/get-attention-command-dashboard.ts",
    terms: ["getOwnerCommandCenter", "criticalIssues", "needsOwner", "doFirst"],
  },
  {
    name: "AI website chat uses shared lead, messaging, knowledge, and owner systems",
    file: "src/app/api/public/chat/route.ts",
    terms: [
      "createPublicLead",
      "messaging_conversations",
      "generateJsonWithProvider",
      "getIndustryKnowledgeContext",
      "owner_command_events",
    ],
  },
  {
    name: "customer lifecycle employee manages the full relationship",
    file: "src/lib/customer-lifecycle/sync-customer-lifecycle.ts",
    terms: [
      "missed_call_recovery",
      "estimate_followup",
      "prepareContextAwareLeadFollowUps",
      "referral_request",
      "customer_lifetime_value",
    ],
  },
  {
    name: "context-aware lifecycle follow-up preserves nurture and database reactivation",
    file: "src/lib/customer-lifecycle/prepare-context-aware-followups.ts",
    terms: [
      "stale_lead_recovery",
      "nurture",
      "database_reactivation",
      "frequency_cap_review",
      "open_conversation",
    ],
  },
  {
    name: "voice receptionist creates connected operating records",
    file: "src/app/api/integrations/voice-ai/webhook/route.ts",
    terms: [
      "office_manager_conversation_sessions",
      "receptionist_calls",
      "createVoiceAppointment",
      "syncCustomerLifecycleForTenant",
    ],
  },
  {
    name: "voice appointment booking is idempotent and conflict-aware",
    file: "src/lib/phone/voice-scheduling.ts",
    terms: [
      "revenue_appointments",
      "service_visits",
      "pg_advisory_xact_lock",
      "providerCallId",
      "availabilityConflictDetected",
    ],
  },
  {
    name: "premium video rendering is provider-backed, cost-capped, and billable",
    file: "src/app/app/marketing-os/video/[videoJobId]/actions.ts",
    terms: [
      "getVideoGenerationProvider",
      "pg_advisory_xact_lock",
      "workspaceMonthlyBudgetCents",
      "billing_usage_charges",
      "usage_meter_events",
    ],
  },
  {
    name: "BYO provider demand becomes a tracked product request",
    file: "src/app/app/integrations/actions.ts",
    terms: [
      "requestProviderIntegrationAction",
      "provider_integration_requests",
      "capabilityCategory",
      "currentlyUsing",
    ],
  },
  {
    name: "requested providers enter a guarded non-executable adapter factory",
    file: "src/lib/integrations/adapter-factory.ts",
    terms: [
      "queueAdapterFactoryBuild",
      "processAdapterFactoryQueueForTenant",
      "validateAdapterDocumentationUrl",
      "writesDisabledByDefault",
      "productionAutoDeploy",
      "markAdapterBuildReleased",
    ],
  },
  {
    name: "BYO AI is restricted, tenant-vaulted, and never receives protected orchestration",
    file: "src/lib/ai/byo-ai.ts",
    terms: [
      "resolveTenantProviderSecrets",
      "isByoAiEligibleRunType",
      "owner_command_event_triage",
      "openai_byok",
    ],
  },
  {
    name: "unfinished connectors cannot masquerade as executable",
    file: "src/lib/integrations/connector-runtime.ts",
    terms: [
      "executable_adapter",
      "native_fallback",
      "setup_only",
      "connectorCanBeMarkedReady",
    ],
  },
  {
    name: "industry expertise remains modular and guarded",
    file: "supabase/migrations/121_customer_lifecycle_and_industry_knowledge.sql",
    terms: [
      "industry_knowledge_modules",
      "industry_knowledge_items",
      "tenant_industry_modules",
      "roofing_core",
      "guardrails_json",
    ],
  },
  {
    name: "referrals have a tracked path from advocate to revenue",
    file: "src/lib/leads/create-public-lead.ts",
    terms: [
      "applyReferralAttribution",
      "customer_referral_links",
      "growth_attribution_events",
      "referralToken",
    ],
  },
  {
    name: "legacy jobs synchronize into the canonical service kernel",
    file: "src/lib/service-ops/service-kernel.ts",
    terms: [
      "service_work_orders",
      "service_visits",
      "service_operating_events",
      "service_job_id",
    ],
  },
  {
    name: "dispatch evaluates capacity and worker eligibility",
    file: "src/lib/scheduling/evaluate-visit.ts",
    terms: [
      "worker_overlap",
      "outside_availability",
      "missing_certification",
      "service_visit_conflicts",
    ],
  },
  {
    name: "field completion is evidence gated",
    file: "src/lib/field-ops/evaluate-visit-completion.ts",
    terms: [
      "field_form_assignments",
      "service_visit_signatures",
      "completion_readiness_status",
    ],
  },
  {
    name: "offline field changes use idempotent conflict-aware sync",
    file: "src/app/api/field/offline-sync/route.ts",
    terms: [
      "clientMutationId",
      "field_offline_mutations",
      "baseRecordVersion",
      "conflict",
    ],
  },
  {
    name: "pricebook feeds estimates deterministically",
    file: "src/app/app/service/actions.ts",
    terms: [
      "addPricebookItemToEstimateAction",
      "pricebook_item_id",
      "recalculateEstimatePricing",
    ],
  },
  {
    name: "memberships create canonical due visits",
    file: "src/lib/service-ops/generate-membership-visits.ts",
    terms: [
      "recurring_service_plans",
      "service_work_orders",
      "service_visits",
      "membership_engine",
    ],
  },
  {
    name: "customer portal writes requests into operating history",
    file: "src/app/portal/[token]/actions.ts",
    terms: [
      "customer_portal_requests",
      "customer_portal_messages",
      "service_operating_events",
    ],
  },
  {
    name: "inventory adjustments retain an audit ledger",
    file: "src/app/app/service/actions.ts",
    terms: [
      "adjustInventoryQuantityAction",
      "inventory_transactions",
      "quantity_delta",
    ],
  },
  {
    name: "POS stock changes preserve authoritative location balances",
    file: "src/app/app/pos/actions.ts",
    terms: [
      "inventory_location_balances",
      "inventory_reservations",
      "from_location_id",
      "to_location_id",
      "unit_cost_cents",
    ],
  },
  {
    name: "multi-location inventory protects reserved stock and preserves count traceability",
    file: "src/lib/service-ops/inventory-control.ts",
    terms: [
      "inventory_location_balances",
      "inventory_reservations",
      "inventory_stock_counts",
      "pg_advisory_xact_lock",
      "service_work_orders",
      "Inventory totals are inconsistent",
    ],
  },
  {
    name: "supplier returns and unequal material splits preserve source quantity and job-cost evidence",
    file: "src/lib/service-ops/inventory-cost-control.ts",
    terms: [
      "supplier_return_items",
      "inventory_material_allocations",
      "purchase_order_receipt_items",
      "inventory_location_balances",
      "job_material_list_items",
      "allocated_cost_cents",
      "cancellation_idempotency_key",
      "Inventory totals are inconsistent",
    ],
  },
  {
    name: "inbound replies stop conflicting nurture",
    file: "src/lib/messaging/record-inbound-response.ts",
    terms: [
      "customer_response_stops",
      "revenue_followup_enrollments",
      "follow_up_workflows",
      "Stopped because the customer replied",
    ],
  },
  {
    name: "incumbent imports are dry-run and rollback aware",
    file: "src/app/app/exports/actions.ts",
    terms: [
      "previewCustomerImportAction",
      "applyCustomerImportAction",
      "rollbackCustomerImportAction",
      "data_import_rows",
    ],
  },
  {
    name: "customer schedule responses update canonical visits and operating history",
    file: "src/app/visit/[token]/actions.ts",
    terms: [
      "service_visit_customer_tokens",
      "customer_confirmation_status",
      "customer_schedule_response",
      "service_operating_events",
    ],
  },
  {
    name: "purchase receipts update orders and audited inventory",
    file: "src/app/app/purchasing/actions.ts",
    terms: [
      "purchase_order_receipts",
      "purchase_order_receipt_items",
      "inventory_transactions",
      "service_inventory_items",
    ],
  },
  {
    name: "signed change orders propagate through canonical service records exactly once",
    file: "src/lib/service-ops/change-orders.ts",
    terms: [
      "decision_document_sha256",
      "public.service_jobs",
      "public.service_work_orders",
      "public.service_visits",
      "status='draft'",
      "public.invoice_line_items",
      "public.service_operating_events",
      "already_decided",
    ],
  },
  {
    name: "portable accounting exports only authoritative invoices and vendor bills",
    file: "src/app/api/reports/accounting-export/route.ts",
    terms: [
      "sent_manually",
      "partially_paid",
      "written_off",
      "b.status in ('approved','exported','paid')",
    ],
  },
  {
    name: "purchasing does not expose an uncertified accounting synchronization queue",
    file: "src/app/app/purchasing/actions.ts",
    terms: ["createVendorBillAction", "updateVendorBillStatusAction"],
    absentTerms: [
      "queueAccountingSyncAction",
      "accounting_sync_runs",
      "accounting_sync_records",
    ],
  },
  {
    name: "managed messaging projects cost before sending and meters actual sends",
    file: "src/lib/messaging/messaging-engine.ts",
    terms: [
      "estimatedMessagingUsage",
      "Monthly messaging provider-cost cap reached",
      "usage_meter_events",
      "billing_usage_charges",
    ],
  },
  {
    name: "storage uploads reserve workspace capacity before provider writes",
    file: "src/lib/usage/storage-quota.ts",
    terms: [
      "reserve_storage_usage",
      "finishStorageUpload",
      "storage_usage_events",
    ],
  },
  {
    name: "service reporting consumes canonical delivery, workforce, membership, and inbox state",
    file: "src/lib/reports/get-service-performance-dashboard.ts",
    terms: [
      "service_visits",
      "service_visit_assignments",
      "recurring_service_plans",
      "messaging_conversations",
    ],
  },
  {
    name: "featured public demo is admin-controlled, versioned, and deployless",
    file: "src/app/app/settings/actions.ts",
    terms: [
      "platform:manage",
      "platform_public_content",
      "platform_public_content_versions",
      "normalizeDemoEmbedUrl",
      'revalidatePath("/demo")',
    ],
  },
  {
    name: "provider promotions feed guarded ad budgets without enabling spend",
    file: "src/app/app/marketing/actions.ts",
    terms: [
      "provider_promotion_opportunities",
      "analyzeProviderPromotion",
      "managed_ad_budget_controls",
      "live_spend_enabled",
      "provider_promotion_events",
    ],
  },
  {
    name: "native calendars use one provider-independent sync ledger",
    file: "src/lib/integrations/calendar/sync.ts",
    terms: [
      "integration_sync_cursors",
      "external_calendar_events",
      "integration_object_mappings",
      "integration_dead_letters",
      "createCalendarProvider",
    ],
  },
  {
    name: "Google Business Profile reads tenant-owned locations and reviews without enabling public writes",
    file: "src/lib/integrations/google-business-profile/sync.ts",
    terms: [
      "business_profile_locations",
      "business_profile_reviews",
      "getFreshProviderAccessToken",
      'reviewSyncMode: "read_only"',
    ],
  },
  {
    name: "invoice delivery and payment enroll eligible customers into the existing review lifecycle",
    file: "src/lib/reviews/invoice-review-enrollment.ts",
    terms: [
      "review_request_workflows",
      "invoice_sent",
      "invoice_paid",
      "work_not_complete",
      "already_enrolled",
    ],
  },
  {
    name: "incumbent service platforms coexist through tenant-scoped idempotent mappings",
    file: "src/lib/integrations/service-platform-bridge.ts",
    terms: [
      "integration_object_mappings",
      "ownership_mode",
      "provider",
      "contact",
      "lead",
      "job",
      "provider_deleted_at",
    ],
  },
  {
    name: "the golden business loop proves every native handoff without bypassing live-action gates",
    file: "src/lib/business-loop/sync-golden-loop.ts",
    terms: [
      "demand_source_recorded",
      "margin_recorded",
      "review_requested",
      "proof_repurposed",
      "growth_restarted",
      "livePublishing",
      "liveAdSpend",
    ],
  },
  {
    name: "manual and autonomous proof preparation share one consent-aware implementation",
    file: "src/lib/ugc/prepare-proof-content.ts",
    terms: [
      "permission_marketing",
      "permission_use_name",
      "permission_use_location",
      "livePublishing",
      "ugc_content_outputs",
    ],
  },
];

for (const check of checks) {
  const contents = source(check.file);
  const missing = check.terms.filter((term) => !contents.includes(term));
  const forbidden = (check.absentTerms ?? []).filter((term) => contents.includes(term));
  if (missing.length || forbidden.length) {
    const failures = [
      missing.length ? `missing ${missing.join(", ")}` : "",
      forbidden.length ? `unexpected ${forbidden.join(", ")}` : "",
    ].filter(Boolean);
    throw new Error(
      `${check.name} is disconnected in ${check.file}: ${failures.join("; ")}`,
    );
  }
}

console.log(
  `Architecture connection guard passed for ${checks.length} source-level workflow assertions.`,
);
console.log("This verifies required code connections exist; it is not runtime or provider certification.");
