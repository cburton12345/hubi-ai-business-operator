import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getIntegrationRows, type IntegrationRow } from "@/lib/integrations/get-integrations";
import { getTenantProviderCredentials, type TenantProviderCredentialRow } from "@/lib/credentials/get-tenant-provider-credentials";
import { archiveTenantProviderCredentialAction, saveTenantProviderCredentialAction } from "./actions";

export default async function CredentialsPage() {
  const [rows, vault] = await Promise.all([getIntegrationRows(), getTenantProviderCredentials()]);
  const missingCount = rows.reduce((count, row) => count + row.missingEnvVars.length, 0);
  const readyCount = rows.filter((row) => row.envVars.length === 0 || row.missingEnvVars.length === 0).length;

  return (
    <QueuePageShell
      eyebrow="Credentials"
      title="Provider Credential Checklist"
      description="See which connected-account secrets are configured without exposing secret values. Live actions stay disabled until each integration is reviewed."
    >
      <div className="grid section-actions">
        <section className="panel span-4">
          <h2>{readyCount}</h2>
          <p className="muted">Provider groups ready or no-key</p>
        </section>
        <section className="panel span-4">
          <h2>{missingCount}</h2>
          <p className="muted">Missing environment variables</p>
        </section>
        <section className="panel span-4">
          <h2>0</h2>
          <p className="muted">Live external actions enabled by default</p>
        </section>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Bring Your Own Keys Vault</h2>
            <p className="muted">
              Add customer-owned provider credentials without showing secrets back. Live actions remain off until integrations and controls are reviewed.
            </p>
          </div>
          <span className={`pill ${vault.encryptionReady ? "" : "high"}`}>
            {vault.encryptionReady ? "encryption ready" : "needs CREDENTIAL_ENCRYPTION_KEY"}
          </span>
        </div>
        <form action={saveTenantProviderCredentialAction} className="form-stack">
          <div className="three-col">
            <label>
              Provider
              <select name="providerKey" defaultValue="email_provider">
                {rows.map((row) => (
                  <option key={row.id} value={row.provider}>
                    {row.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Label
              <input name="credentialLabel" placeholder="API key, webhook secret, account SID" required />
            </label>
            <label>
              Type
              <select name="credentialKind" defaultValue="api_key">
                <option value="api_key">API key</option>
                <option value="oauth_client_secret">OAuth client secret</option>
                <option value="webhook_secret">Webhook secret</option>
                <option value="account_sid">Account SID</option>
                <option value="auth_token">Auth token</option>
                <option value="refresh_token">Refresh token</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <div className="two-col">
            <label>
              Secret value
              <input name="secretValue" type="password" placeholder="Paste secret. It will not be shown again." required />
            </label>
            <label>
              Rotation due
              <input name="rotationDueAt" type="date" />
            </label>
          </div>
          <button className="button" type="submit">Save encrypted credential</button>
          <p className="muted">
            If encryption is not configured, Ferocity records the attempt as needing setup and does not store usable secret ciphertext.
          </p>
        </form>
      </section>

      <QueueTable<TenantProviderCredentialRow>
        rows={vault.credentials}
        columns={[
          {
            key: "provider",
            label: "Stored Credential",
            render: (row) => (
              <>
                <strong>{row.providerKey}</strong>
                <span className="muted">{row.credentialLabel} / {row.credentialKind}</span>
              </>
            )
          },
          { key: "preview", label: "Secret", render: (row) => row.secretPreview },
          { key: "status", label: "Status", render: (row) => <span className={`pill ${row.status === "needs_encryption_key" ? "high" : ""}`}>{row.status}</span> },
          { key: "rotation", label: "Rotation", render: (row) => row.rotationDueAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.rotationDueAt)) : "Not set" },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <form action={archiveTenantProviderCredentialAction}>
                <input name="credentialId" type="hidden" value={row.id} />
                <button className="mini-button" type="submit">Archive</button>
              </form>
            )
          }
        ]}
      />

      <QueueTable<IntegrationRow>
        rows={rows}
        columns={[
          {
            key: "provider",
            label: "Provider",
            render: (row) => (
              <>
                <strong>{row.displayName}</strong>
                <span className="muted">{row.provider}</span>
              </>
            )
          },
          {
            key: "configured",
            label: "Configured",
            render: (row) => row.configuredEnvVars.length > 0 ? row.configuredEnvVars.join(", ") : "No configured env vars detected"
          },
          {
            key: "missing",
            label: "Missing",
            render: (row) => row.missingEnvVars.length > 0 ? row.missingEnvVars.join(", ") : "None"
          },
          {
            key: "actions",
            label: "Safety",
            render: (row) => <span className={`pill ${row.liveActionsEnabled ? "high" : ""}`}>{row.liveActionsEnabled ? "live actions on" : "live actions off"}</span>
          }
        ]}
      />
    </QueuePageShell>
  );
}
