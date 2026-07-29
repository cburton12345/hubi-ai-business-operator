import { decryptSecret } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";

type CredentialRow = {
  credential_label: string;
  credential_kind: string;
  encrypted_secret: string | null;
  encryption_iv: string | null;
  encryption_tag: string | null;
};

export type ResolvedProviderSecret = {
  label: string;
  kind: string;
  value: string;
};

export function normalizeCredentialLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export async function resolveTenantProviderSecrets(tenantId: string, providerKey: string) {
  const result = await queryPostgres<CredentialRow>(
    `
    select credential_label, credential_kind, encrypted_secret, encryption_iv, encryption_tag
    from public.tenant_provider_credentials
    where tenant_id = $1
      and provider_key = $2
      and status = 'configured'
      and encrypted_secret is not null
      and encryption_iv is not null
      and encryption_tag is not null
    order by updated_at desc
    `,
    [tenantId, providerKey]
  );

  const secrets: ResolvedProviderSecret[] = [];
  for (const row of result?.rows ?? []) {
    if (!row.encrypted_secret || !row.encryption_iv || !row.encryption_tag) continue;
    const value = decryptSecret({
      encryptedSecret: row.encrypted_secret,
      encryptionIv: row.encryption_iv,
      encryptionTag: row.encryption_tag
    });
    if (!value) continue;
    secrets.push({
      label: normalizeCredentialLabel(row.credential_label),
      kind: row.credential_kind,
      value
    });
  }
  return secrets;
}

export function secretByAliases(
  secrets: ResolvedProviderSecret[],
  aliases: string[],
  kind?: string
) {
  const normalizedAliases = aliases.map(normalizeCredentialLabel);
  return secrets.find((secret) =>
    normalizedAliases.includes(secret.label) || (kind ? secret.kind === kind : false)
  )?.value ?? null;
}
