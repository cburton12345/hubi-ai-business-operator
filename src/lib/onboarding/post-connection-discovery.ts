import { queryPostgres } from "@/lib/db/postgres";
import { discoverProviderCalendars } from "@/lib/integrations/calendar/sync";
import { syncMailbox } from "@/lib/integrations/mailbox/sync";
import type { StandardOAuthProvider } from "@/lib/integrations/standard-oauth";

export type PostConnectionDiscoveryResult = {
  status: "completed" | "ready_for_selection" | "not_applicable" | "failed";
  summary: string;
  recordsDiscovered: number;
  href?: string;
};

export async function discoverConnectedProviderContext(input: {
  tenantId: string;
  provider: StandardOAuthProvider;
}): Promise<PostConnectionDiscoveryResult> {
  try {
    if (input.provider === "gmail_mailbox" || input.provider === "microsoft_mailbox") {
      const result = await syncMailbox({ tenantId: input.tenantId, provider: input.provider, limit: 25 });
      const discovery = {
        status: "completed" as const,
        summary: result.seen
          ? `Ferocity securely reviewed ${result.seen} recent inbox message${result.seen === 1 ? "" : "s"} and saved ${result.saved} for business discovery.`
          : "The inbox connection is healthy. No recent messages were available for business discovery yet.",
        recordsDiscovered: result.saved,
        href: "/app/email-watch",
      };
      await saveDiscoveryEvidence(input, discovery);
      await recordDiscoveryReceipt(input, discovery, "mailbox_messages");
      return discovery;
    }

    if (input.provider === "google_calendar" || input.provider === "microsoft_calendar") {
      const calendars = await discoverProviderCalendars(input.tenantId, input.provider);
      await queryPostgres(
        `update public.integration_connections
         set metadata_json=metadata_json || $3::jsonb,last_checked_at=now(),updated_at=now()
         where tenant_id=$1 and provider=$2 and status='connected'`,
        [input.tenantId, input.provider, JSON.stringify({
          calendarChoices: calendars,
          calendarChoicesRefreshedAt: new Date().toISOString(),
          onboardingDiscoveryStatus: "ready_for_selection",
          onboardingDiscoverySummary: `Found ${calendars.length} calendar${calendars.length === 1 ? "" : "s"}; select one to begin read-only event discovery.`,
          onboardingDiscoveryHref: "/app/integrations/calendar?onboarding=1",
        })],
      );
      const discovery = {
        status: "ready_for_selection",
        summary: `Found ${calendars.length} calendar${calendars.length === 1 ? "" : "s"}. Select the operating calendar to begin read-only discovery.`,
        recordsDiscovered: 0,
        href: "/app/integrations/calendar?onboarding=1",
      } as const;
      await recordDiscoveryReceipt(input, discovery, "external_calendars");
      return discovery;
    }

    return {
      status: "not_applicable",
      summary: "The account is connected. Provider-specific account discovery is recorded with the connection.",
      recordsDiscovered: 0,
    };
  } catch (error) {
    const discovery = {
      status: "failed" as const,
      summary: error instanceof Error ? error.message : "The first read-only discovery check did not finish.",
      recordsDiscovered: 0,
    };
    await saveDiscoveryEvidence(input, discovery).catch(() => null);
    return discovery;
  }
}

async function saveDiscoveryEvidence(
  input: { tenantId: string; provider: StandardOAuthProvider },
  discovery: PostConnectionDiscoveryResult,
) {
  await queryPostgres(
    `update public.integration_connections
     set metadata_json=metadata_json || $3::jsonb,last_checked_at=now(),updated_at=now()
     where tenant_id=$1 and provider=$2`,
    [input.tenantId, input.provider, JSON.stringify({
      onboardingDiscoveryStatus: discovery.status,
      onboardingDiscoverySummary: discovery.summary,
      onboardingRecordsDiscovered: discovery.recordsDiscovered,
      onboardingDiscoveryCheckedAt: new Date().toISOString(),
      onboardingDiscoveryHref: discovery.href ?? null,
    })],
  );
}

async function recordDiscoveryReceipt(
  input: { tenantId: string; provider: StandardOAuthProvider },
  discovery: PostConnectionDiscoveryResult,
  targetTable: string,
) {
  await queryPostgres(
    `insert into public.ferocity_chat_action_receipts
       (tenant_id,receipt_kind,title,summary,status,href,target_table,target_id,evidence_json)
     values ($1,'inspection',$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      input.tenantId,
      `${input.provider.replaceAll("_", " ")} business discovery`,
      discovery.summary,
      discovery.status === "completed" ? "completed" : "needs_input",
      discovery.href ?? "/app/integrations",
      targetTable,
      input.provider,
      JSON.stringify({
        provider: input.provider,
        readOnly: true,
        discoveryStatus: discovery.status,
        recordsDiscovered: discovery.recordsDiscovered,
        authoritativeRecordsRemainWithProvider: true,
      }),
    ],
  );
}
