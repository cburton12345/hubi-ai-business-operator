import { hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type TenantProviderCredentialRow = {
  id: string;
  providerKey: string;
  credentialLabel: string;
  credentialKind: string;
  status: string;
  secretPreview: string;
  rotationDueAt: string | null;
  updatedAt: string;
};

export async function getTenantProviderCredentials() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    provider_key: string;
    credential_label: string;
    credential_kind: string;
    status: string;
    secret_preview: string | null;
    rotation_due_at: string | null;
    updated_at: string;
  }>(
    `
    select id, provider_key, credential_label, credential_kind, status, secret_preview, rotation_due_at, updated_at
    from public.tenant_provider_credentials
    where tenant_id = $1 and status <> 'archived'
    order by provider_key, credential_label
    `,
    [workspaceId]
  );

  return {
    encryptionReady: hasCredentialEncryptionKey(),
    credentials: (result?.rows ?? []).map((row) => ({
      id: row.id,
      providerKey: row.provider_key,
      credentialLabel: row.credential_label,
      credentialKind: row.credential_kind,
      status: row.status,
      secretPreview: row.secret_preview ?? "stored",
      rotationDueAt: row.rotation_due_at,
      updatedAt: row.updated_at
    })) satisfies TenantProviderCredentialRow[]
  };
}
