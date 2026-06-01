"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { encryptSecret, previewSecret } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const saveCredentialSchema = z.object({
  providerKey: z.string().trim().min(2).max(120),
  credentialLabel: z.string().trim().min(2).max(160),
  credentialKind: z.enum(["api_key", "oauth_client_secret", "webhook_secret", "account_sid", "auth_token", "refresh_token", "other"]),
  secretValue: z.string().trim().min(4).max(10000),
  rotationDueAt: z.string().optional()
});

const archiveCredentialSchema = z.object({
  credentialId: z.string().uuid()
});

export async function saveTenantProviderCredentialAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = saveCredentialSchema.safeParse({
    providerKey: formData.get("providerKey"),
    credentialLabel: formData.get("credentialLabel"),
    credentialKind: formData.get("credentialKind"),
    secretValue: formData.get("secretValue"),
    rotationDueAt: formData.get("rotationDueAt")?.toString() || undefined
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const encrypted = encryptSecret(parsed.data.secretValue);
  const status = encrypted ? "configured" : "needs_encryption_key";
  const rotationDueAt = parsed.data.rotationDueAt ? new Date(parsed.data.rotationDueAt).toISOString() : null;

  await queryPostgres(
    `
    insert into public.tenant_provider_credentials (
      tenant_id, provider_key, credential_label, credential_kind, status, secret_preview, secret_fingerprint,
      encrypted_secret, encryption_iv, encryption_tag, rotation_due_at, created_by_user_id, updated_by_user_id, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12, $12, $13::jsonb)
    on conflict (tenant_id, provider_key, credential_label) do update
    set credential_kind = excluded.credential_kind,
        status = excluded.status,
        secret_preview = excluded.secret_preview,
        secret_fingerprint = excluded.secret_fingerprint,
        encrypted_secret = excluded.encrypted_secret,
        encryption_iv = excluded.encryption_iv,
        encryption_tag = excluded.encryption_tag,
        rotation_due_at = excluded.rotation_due_at,
        updated_by_user_id = excluded.updated_by_user_id,
        metadata_json = public.tenant_provider_credentials.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      workspaceId,
      parsed.data.providerKey,
      parsed.data.credentialLabel,
      parsed.data.credentialKind,
      status,
      encrypted?.secretPreview ?? previewSecret(parsed.data.secretValue),
      encrypted?.secretFingerprint ?? null,
      encrypted?.encryptedSecret ?? null,
      encrypted?.encryptionIv ?? null,
      encrypted?.encryptionTag ?? null,
      rotationDueAt,
      session?.userId ?? null,
      JSON.stringify({ savedFrom: "credentials_page", secretStored: Boolean(encrypted), liveActionsStillDisabled: true })
    ]
  );

  if (encrypted) {
    await queryPostgres(
      `
      insert into public.provider_accounts (tenant_id, provider_key, display_name, status, credentials_status, live_actions_enabled, metadata_json)
      values ($1, $2, $3, 'paused', 'configured', false, $4::jsonb)
      on conflict (tenant_id, provider_key) do update
      set credentials_status = 'configured',
          status = case when public.provider_accounts.status = 'planned' then 'paused' else public.provider_accounts.status end,
          live_actions_enabled = false,
          metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [
        workspaceId,
        parsed.data.providerKey,
        parsed.data.providerKey.replaceAll("_", " "),
        JSON.stringify({ tenantCredentialStored: true, credentialLabel: parsed.data.credentialLabel })
      ]
    );

    await queryPostgres(
      `
      update public.integration_connections
      set credentials_status = 'configured',
          status = case when status = 'not_connected' then 'planned' else status end,
          updated_at = now(),
          metadata_json = metadata_json || $3::jsonb
      where tenant_id = $1 and provider = $2
      `,
      [workspaceId, parsed.data.providerKey, JSON.stringify({ tenantCredentialStored: true })]
    );
  }

  revalidatePath("/app/credentials");
  revalidatePath("/app/integrations");
  revalidatePath("/app/system-health");
}

export async function archiveTenantProviderCredentialAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = archiveCredentialSchema.safeParse({
    credentialId: formData.get("credentialId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  await queryPostgres(
    `
    update public.tenant_provider_credentials
    set status = 'archived',
        encrypted_secret = null,
        encryption_iv = null,
        encryption_tag = null,
        updated_by_user_id = $3,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.credentialId, session?.userId ?? null, JSON.stringify({ archivedFrom: "credentials_page" })]
  );

  revalidatePath("/app/credentials");
  revalidatePath("/app/integrations");
  revalidatePath("/app/system-health");
}
