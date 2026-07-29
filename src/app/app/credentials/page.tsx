import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import Link from "next/link";
import { getIntegrationRows, type IntegrationRow } from "@/lib/integrations/get-integrations";
import {
  getProviderCapabilityReadiness,
  providerLaneStatusLabel,
  providerLaneTone
} from "@/lib/integrations/provider-lane-readiness";
import { getTenantProviderCredentials, type TenantProviderCredentialRow } from "@/lib/credentials/get-tenant-provider-credentials";
import { listVoiceAgentProviders } from "@/lib/providers/voice-adapters";
import {
  archiveTenantProviderCredentialAction,
  saveTenantProviderCredentialAction,
  verifyAndActivateByoAiAction,
  verifyAndActivateByoProviderAction
} from "./actions";

export default async function CredentialsPage() {
  const [rows, vault, lanes] = await Promise.all([getIntegrationRows(), getTenantProviderCredentials(), getProviderCapabilityReadiness()]);
  const missingCount = rows.reduce((count, row) => count + row.missingEnvVars.length, 0);
  const readyCount = rows.filter((row) => row.envVars.length === 0 || row.missingEnvVars.length === 0).length;
  const voiceProviders = listVoiceAgentProviders();
  const credentialProviderOptions = [
    { provider: "twilio", displayName: "Customer Twilio SMS" },
    { provider: "openai_byok", displayName: "Customer OpenAI (Advanced)" },
    ...voiceProviders.map((provider) => ({
      provider: provider.providerKey,
      displayName: `Customer ${provider.displayName} Voice`
    })),
    ...rows.map((row) => ({ provider: row.provider, displayName: row.displayName }))
  ].filter((option, index, options) => options.findIndex((item) => item.provider === option.provider) === index);

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
            <h2>Provider Setup Packet</h2>
            <p className="muted">
              Use this when creating Reddit, Google, Meta, Microsoft, Yahoo, and calendar apps. It has the exact redirect URLs and env var names.
            </p>
          </div>
          <Link className="button secondary-button" href="/docs/provider-account-setup">
            Open setup packet
          </Link>
          <Link className="button secondary-button" href="/docs/ad-credit-promotion-tracker">
            Check ad credits
          </Link>
          <Link className="button secondary-button" href="/docs/ferocity-env-key-checklist">
            Env key checklist
          </Link>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Add Or Rotate Keys</h2>
            <p className="muted">
              Providers already shown here can usually be connected by adding env vars or saved credentials. New providers, new routes, or renamed env vars still need a code update.
            </p>
          </div>
          <span className="pill">no secrets shown</span>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Use Sign-In First</h2>
            <p className="muted">
              Regular customers should connect accounts from Integrations when a provider supports it. This vault is for advanced setup,
              restricted keys, webhook secrets, or provider apps that Ferocity cannot connect with one click yet.
            </p>
          </div>
          <Link className="button" href="/app/integrations">
            Open integrations
          </Link>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Account Connection Lanes</h2>
            <p className="muted">
              Customer-owned keys and Ferocity-managed options are tracked separately. Saving a key here updates the customer lane, but live actions stay off
              until the connection is reviewed.
            </p>
          </div>
          <Link className="button secondary-button" href="/app/integrations">
            Full connection view
          </Link>
        </div>
        <div className="grid">
          {lanes.slice(0, 6).map((capability) => (
            <section className="span-6" key={capability.capabilityKey}>
              <div className="list-row flush-row">
                <div>
                  <strong>{capability.label}</strong>
                  <p className="muted">Customer: {providerLaneStatusLabel(capability.customerOwned)}</p>
                  <p className="muted">Ferocity: {providerLaneStatusLabel(capability.ferocityManaged)}</p>
                </div>
                <span className={`pill ${providerLaneTone(capability.customerOwned)}`}>{capability.customerOwned.providerKey}</span>
              </div>
            </section>
          ))}
        </div>
      </section>

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
                {credentialProviderOptions.map((provider) => (
                  <option key={provider.provider} value={provider.provider}>
                    {provider.displayName}
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
        <details className="panel subtle-panel section-actions">
          <summary>Exact credential labels for supported provider adapters</summary>
          <div className="grid section-actions">
            <section className="span-6">
              <h3>Customer Twilio</h3>
              <p className="muted">
                Save <strong>account_sid</strong>, then either <strong>api_key_sid</strong> and <strong>api_key_secret</strong>
                or <strong>auth_token</strong>. Always save <strong>auth_token</strong> for webhook verification and
                <strong>from_number</strong> for tenant routing. Optional: <strong>messaging_service_sid</strong>.
              </p>
              <p className="muted">Inbound and delivery webhook: <code>/api/messaging/webhooks/twilio</code></p>
            </section>
            <section className="span-6">
              <h3>Customer Vapi</h3>
              <p className="muted">
                Save <strong>api_key</strong>, <strong>phone_number</strong>, <strong>phone_number_id</strong>, and <strong>webhook_secret</strong>.
                Create a Vapi Custom Credential that sends that secret as a Bearer token or X-Vapi-Secret, then save its
                ID as <strong>webhook_credential_id</strong>.
              </p>
            </section>
            <section className="span-6">
              <h3>Customer Retell AI</h3>
              <p className="muted">
                Save <strong>api_key</strong>, <strong>webhook_api_key</strong>, and <strong>phone_number</strong>.
                The webhook key must be the API key designated for webhook authentication in Retell. Optional:
                <strong>voice_id</strong>; otherwise Ferocity uses Retell&apos;s Cimo voice.
              </p>
            </section>
            <section className="span-6">
              <h3>Customer OpenAI</h3>
              <p className="muted">
                Save <strong>api_key</strong>. Optional: save <strong>model</strong>. Ferocity uses this only for selected
                drafting and extraction jobs; owner decisions, public agents, safeguards, and proprietary orchestration stay on Ferocity&apos;s protected route.
              </p>
              <p className="muted">The customer pays OpenAI directly and their provider account may retain task content under its own settings.</p>
            </section>
            <section className="span-6">
              <h3>Ferocity-Managed OpenAI Video</h3>
              <p className="muted">
                Set <strong>VIDEO_PROVIDER=openai</strong>, <strong>VIDEO_API_KEY</strong>, and <strong>VIDEO_MODEL</strong>
                in the server environment. Rendering also requires <strong>VIDEO_RENDERING_ENABLED=true</strong>,
                global and per-workspace monthly cost caps, provider cost per second, and a higher customer price per second.
              </p>
              <p className="muted">
                Briefs and storyboards keep working when these values are absent. Adding a key alone never enables paid renders.
              </p>
            </section>
          </div>
        </details>
      </section>

      <section className="panel section-actions">
        <div>
          <h2>Verify And Activate A Customer Provider</h2>
          <p className="muted">
            This makes a real read-only provider verification request, then enables the customer-owned route. Do this only
            after sender registration, customer consent, opt-out handling, call disclosure, budgets, and fallback behavior are ready.
          </p>
          <p className="muted">For a live voice adapter, save credentials, select it in Receptionist Setup, synchronize the assistant, complete an authorized test call, then return here to activate the number.</p>
        </div>
        <div className="grid section-actions">
          <form action={verifyAndActivateByoAiAction} className="panel span-6 subtle-panel form-stack">
            <div>
              <h3>Customer OpenAI account</h3>
              <p className="muted">
                Advanced option for selected drafting and extraction work. It never receives Ferocity&apos;s owner-decision engine or complete orchestration layer.
              </p>
            </div>
            <label className="checkbox-row">
              <input name="disclosureAccepted" type="checkbox" value="true" required />
              <span>I understand this provider bills our account and may retain task content according to our provider settings.</span>
            </label>
            <button className="button" type="submit">Verify customer OpenAI</button>
          </form>
          {[
            { key: "twilio", label: "Verify and activate Twilio" },
            ...voiceProviders
              .filter((provider) => provider.adapterStatus === "live")
              .map((provider) => ({
                key: provider.providerKey,
                label: `Verify and activate ${provider.displayName}`
              }))
          ].map((provider) => (
            <form action={verifyAndActivateByoProviderAction} className="panel span-6 subtle-panel form-stack" key={provider.key}>
              <input name="providerKey" type="hidden" value={provider.key} />
              <label className="checkbox-row">
                <input name="complianceAttestation" type="checkbox" value="true" required />
                <span>I confirm provider registration, consent/disclosure, budgets, suppression, fallback, and test-call requirements are complete.</span>
              </label>
              <button className="button" type="submit">{provider.label}</button>
            </form>
          ))}
        </div>
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
