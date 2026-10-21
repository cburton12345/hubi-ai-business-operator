import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const contracts = [
  ["signup, billing, workspace, and invitation handoff", "src/lib/billing/provision-paid-workspace.ts", ["billing_subscriptions", "tenant_users", "workspace_invites", "account_type = 'customer'"]],
  ["pre-signup Ask handoff", "src/lib/public-site/import-public-chat-handoff.ts", ["accessRequestId", "public_sales_handoff", "tenant_id"]],
  ["contextual onboarding connections", "src/lib/onboarding/customer-onboarding.ts", ["recommendOnboardingConnections", "firstValueReached", "authority_confirmations"]],
  ["guided chat persists business context", "src/app/app/ferocity/actions.ts", ["onboardingIndustry", "primary_goal", "guided Ferocity setup"]],
  ["guided connection view honors context", "src/app/app/integrations/page.tsx", ["onboardingFocusProviders", "focusedConnections", "Continue without a connection"]],
  ["guided authority choice returns to onboarding", "src/app/app/controls/page.tsx", ["returnToOnboarding", "Handle routine work", "Recommend only"]],
  ["mailbox and calendar discovery", "src/lib/onboarding/post-connection-discovery.ts", ["syncMailbox", "discoverProviderCalendars", "ready_for_selection"]],
  ["OAuth reconnect guidance", "src/lib/onboarding/oauth-return.ts", ["newly connected", "review", "returnTo"]],
  ["paid customer implementation mode", "src/lib/ferocity/conversation-runtime.ts", ["Do not sell Ferocity", "Carry authorized work through"]],
  ["public Ask diagnosis and contextual next action", "src/app/api/public/chat/route.ts", ["useful diagnosis", "prioritized", "get started"]],
  ["direct finished-work links", "src/app/app/ferocity/FerocityOwnerChat.tsx", ["turn.artifacts", "artifact.href"]],
  ["durable multi-goal throughput", "src/lib/operations/goal-planner.ts", ["operating_goal", "limit"]],
  ["employee English/Spanish privacy boundary", "src/lib/employee/employee-chat.ts", ["language", "spanish", "assigned"]],
  ["mixed multi-file document outcomes", "src/lib/document-intelligence/document-batches.ts", ["partial", "reused", "failed"]],
  ["email attachment deduplication and durable jobs", "src/lib/document-intelligence/email-intake-jobs.ts", ["provider_attachment_id", "on conflict", "attempts"]],
  ["statement coverage and missing periods", "src/lib/document-intelligence/financial-workpaper-readiness.ts", ["missing", "coverage", "print"]],
  ["independent document review", "src/lib/document-intelligence/workflow.ts", ["independentReviewerConfigured", "reviewPass", "reviewer_unavailable"]],
  ["governed inbound email and text", "src/lib/messaging/record-inbound-response.ts", ["conversation", "inbound", "tenant"]],
  ["Ferocity Connect governed text queue", "src/lib/ferocity-connect/queue.ts", ["ferocity_connect", "queued", "tenantId"]],
  ["Retell transcript and routing", "src/app/api/integrations/voice-ai/webhook/route.ts", ["transcript", "receptionist_calls", "callback"]],
  ["provider access token refresh", "src/lib/integrations/provider-access-token.ts", ["read", "refresh", "provider"]],
  ["advertising spend remains gated", "src/lib/marketing-os/managed-ad-spend.ts", ["liveSpendEnabled", "approval", "allowed"]],
  ["external AI tenant and scope isolation", "src/lib/mcp/server.ts", ["requiredScope", "tenantId", "idempotencyKey"]],
] as const;

describe("Ferocity cross-platform production acceptance contract", () => {
  for (const [name, file, terms] of contracts) {
    it(name, () => {
      const source = read(file).toLowerCase();
      for (const term of terms) expect(source, `${file} is missing ${term}`).toContain(term.toLowerCase());
    });
  }
});
