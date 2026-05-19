import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type IntegrationRow = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  credentialsStatus: string;
  notes: string;
};

const plannedConnections = [
  { provider: "google_ads", displayName: "Google Ads", notes: "Campaign and budget sync later. No API connection in this phase." },
  { provider: "facebook", displayName: "Facebook / Meta", notes: "Social publishing and ads later. Drafts remain manual for now." },
  { provider: "google_business_profile", displayName: "Google Business Profile", notes: "GBP post publishing later. Drafts remain internal." },
  { provider: "twilio", displayName: "Twilio", notes: "SMS delivery later. Lead replies are draft-only now." },
  { provider: "stripe", displayName: "Stripe Billing", notes: "Billing later. Workspace plans are tracked without Stripe." },
  { provider: "external_publishing", displayName: "External Publishing", notes: "CMS/social publishing later. Export packages are manual." }
];

export async function ensurePlannedIntegrationConnections() {
  const workspaceId = await getCurrentWorkspaceId();
  for (const connection of plannedConnections) {
    await queryPostgres(
      `
      insert into public.integration_connections (tenant_id, provider, display_name, status, credentials_status, metadata_json)
      values ($1, $2, $3, 'planned', 'not_configured', $4::jsonb)
      on conflict (tenant_id, provider) do update
      set display_name = excluded.display_name,
          metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, connection.provider, connection.displayName, JSON.stringify({ notes: connection.notes, apiConnected: false })]
    );
  }
}

export async function getIntegrationRows(): Promise<IntegrationRow[]> {
  await ensurePlannedIntegrationConnections();
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    provider: string;
    display_name: string;
    status: string;
    credentials_status: string;
    metadata_json: { notes?: string } | null;
  }>(
    `
    select id, provider, display_name, status, credentials_status, metadata_json
    from public.integration_connections
    where tenant_id = $1
    order by display_name
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    displayName: row.display_name,
    status: row.status,
    credentialsStatus: row.credentials_status,
    notes: row.metadata_json?.notes ?? "Prepared for a later integration phase."
  }));
}
