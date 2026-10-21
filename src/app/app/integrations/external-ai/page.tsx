import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { CreateExternalAiCredentialForm, RotateExternalAiCredentialForm } from "./ExternalAiCredentialForms";
import { revokeExternalAiCredentialAction } from "./actions";

type CredentialRow = {
  id: string;
  providerKey: string;
  label: string;
  tokenPrefix: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  dailyRequestLimit: number;
  dailyRecordLimit: number;
  callsToday: number;
  recordsToday: number;
  lastCallStatus: string | null;
  lastCallAt: string | null;
};

function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
}

export default async function ExternalAiIntegrationsPage() {
  const actor = await requirePermission("tenant:manage");
  const result = await queryPostgres<CredentialRow>(
    `select credential.id,credential.provider_key as "providerKey",credential.label,
       credential.token_prefix as "tokenPrefix",credential.scopes,credential.status,
       credential.expires_at as "expiresAt",credential.last_used_at as "lastUsedAt",
       credential.created_at as "createdAt",credential.daily_request_limit as "dailyRequestLimit",
       credential.daily_record_limit as "dailyRecordLimit",coalesce(usage.calls_today,0)::int as "callsToday",
       coalesce(usage.records_today,0)::int as "recordsToday",latest.status as "lastCallStatus",
       latest.created_at as "lastCallAt"
     from public.external_ai_credentials credential
     left join lateral (
       select count(*) filter (where created_at>=date_trunc('day',now())) as calls_today,
         coalesce(sum(returned_record_count) filter (where created_at>=date_trunc('day',now())),0) as records_today
       from public.external_ai_tool_invocations invocation where invocation.credential_id=credential.id
     ) usage on true
     left join lateral (
       select status,created_at from public.external_ai_tool_invocations invocation
       where invocation.credential_id=credential.id order by created_at desc limit 1
     ) latest on true
     where credential.tenant_id=$1 order by credential.created_at desc limit 100`,
    [actor.workspace.id],
  );
  const credentials = result?.rows ?? [];
  return (
    <QueuePageShell
      eyebrow="External AI"
      title="Authorized AI Assistants"
      description="Let a compatible assistant use a narrow set of Ferocity tools without exposing passwords, database access, provider secrets, or unrestricted business actions."
    >
      <div className="inline-actions">
        <Link className="button secondary-button" href="/app/integrations"><ArrowLeft size={16} /> Connections</Link>
        <span className="pill"><ShieldCheck size={15} /> Ferocity remains authoritative</span>
      </div>

      <section className="panel subtle-panel section-actions">
        <h2>Ferocity already includes AI</h2>
        <p>You do not need to connect another assistant. Ferocity&apos;s native AI, workflows, controls, and business memory continue working normally without one.</p>
        <p className="muted">Connect an outside AI only if you want to keep using an assistant you already pay for. It receives selected business results through narrow tools; it does not receive Ferocity source code, private prompts, credentials, database access, or proprietary orchestration logic.</p>
      </section>

      <section className="panel subtle-panel section-actions">
        <h2>Connect your AI, or keep Ferocity only</h2>
        <ol>
          <li>Keep Ferocity as-is if you do not want another assistant connected. No setup is required.</li>
          <li>If you already use Muse or another MCP assistant, create a narrow credential below.</li>
          <li>Review the exact tools, limits, and protected actions before granting access.</li>
          <li>Test <code>get_business_summary</code> here, then test it from your assistant.</li>
        </ol>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Create a scoped connection</h2>
            <p className="muted">The token is displayed once. Ferocity stores only its hash and rechecks this workspace, user, expiration, revocation, and scope on every call.</p>
          </div>
          <KeyRound size={24} />
        </div>
        <CreateExternalAiCredentialForm />
      </section>

      <section className="panel section-actions">
        <div>
          <h2>Existing connections</h2>
          <p className="muted">Rotate a token if it may have been exposed. Revocation takes effect on the next request.</p>
        </div>
        {credentials.length ? (
          <ul className="list">
            {credentials.map((credential) => (
              <li className="list-row" key={credential.id}>
                <div className="form-stack">
                  <strong>{credential.label}</strong>
                  <span className="muted">{credential.providerKey.replaceAll("_", " ")} · {credential.tokenPrefix}… · {credential.status}</span>
                  <span className="muted">Scopes: {credential.scopes.join(", ")}</span>
                  <span className="muted">Created {displayDate(credential.createdAt)} · expires {displayDate(credential.expiresAt)} · last used {displayDate(credential.lastUsedAt)}</span>
                  <span className="muted">Today: {credential.callsToday}/{credential.dailyRequestLimit} calls · {credential.recordsToday}/{credential.dailyRecordLimit} records</span>
                  <span className="muted">Health: {credential.status !== "active" ? credential.status : credential.lastCallStatus === "failed" || credential.lastCallStatus === "timed_out" ? "needs attention" : credential.lastUsedAt ? "active" : "not tested yet"} · last call {credential.lastCallStatus ?? "none"} at {displayDate(credential.lastCallAt)}</span>
                </div>
                {credential.status === "active" ? (
                  <div className="inline-actions">
                    <RotateExternalAiCredentialForm credentialId={credential.id} />
                    <form action={revokeExternalAiCredentialAction}>
                      <input type="hidden" name="credentialId" value={credential.id} />
                      <PendingSubmitButton className="button danger-button" pendingLabel="Revoking…">Revoke</PendingSubmitButton>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted">No external assistant credentials have been created for this workspace.</p>}
      </section>

      <section className="panel subtle-panel section-actions">
        <h2>Client connection</h2>
        <p><strong>Endpoint:</strong> <code>https://api.ferocity.live/mcp</code></p>
        <p className="muted">This endpoint is proposed and remains unavailable until the MCP release is deployed, DNS/TLS are configured, and a real client handshake is certified.</p>
        <p className="muted">Customer-facing OAuth authorization-code + PKCE is planned. Today, owners create revocable bearer credentials here; Ferocity stores only their hashes.</p>
      </section>
    </QueuePageShell>
  );
}
