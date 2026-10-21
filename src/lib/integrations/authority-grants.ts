import { queryPostgres } from "@/lib/db/postgres";

export type IntegrationAuthorityCapability = "read" | "monitor" | "draft" | "write" | "communicate" | "publish" | "spend" | "move_money";

export async function recordInitialOAuthAuthority(input: {
  tenantId: string;
  provider: string;
  scopes: string[];
  actorKey?: string | null;
}) {
  const readExplanation = "Ferocity may read this connected account to discover business context and report what it finds.";
  const monitorExplanation = "Ferocity may monitor this connected account for relevant changes. It may not send, publish, spend, or move money.";
  const denied: Array<{ capability: IntegrationAuthorityCapability; explanation: string }> = [
    { capability: "write", explanation: "Connection alone does not authorize Ferocity to change provider data." },
    { capability: "communicate", explanation: "Connection alone does not authorize Ferocity to send messages or place calls." },
    { capability: "publish", explanation: "Connection alone does not authorize Ferocity to publish publicly." },
    { capability: "spend", explanation: "Connection alone does not authorize advertising spend or budget changes." },
    { capability: "move_money", explanation: "Connection alone never authorizes Ferocity to move money." },
  ];
  const entries: Array<{ capability: IntegrationAuthorityCapability; decision: "granted_until_revoked" | "denied"; explanation: string }> = [
    { capability: "read", decision: "granted_until_revoked", explanation: readExplanation },
    { capability: "monitor", decision: "granted_until_revoked", explanation: monitorExplanation },
    { capability: "draft", decision: "granted_until_revoked", explanation: "Ferocity may prepare internal drafts from connected context; drafts are not sent or published." },
    ...denied.map((item) => ({ ...item, decision: "denied" as const })),
  ];
  await Promise.all(entries.map((entry) => queryPostgres(`
    insert into public.integration_authority_grants
      (tenant_id,provider_key,capability,decision,technical_scopes_json,explanation,source,actor_key,granted_at,revoked_at)
    values ($1,$2,$3,$4,$5::jsonb,$6,'oauth_connection',$7,
      case when $4='granted_until_revoked' then now() else null end,
      case when $4 in ('denied','revoked') then now() else null end)
    on conflict (tenant_id,provider_key,capability) do update set
      decision=excluded.decision,technical_scopes_json=excluded.technical_scopes_json,
      explanation=excluded.explanation,source=excluded.source,actor_key=excluded.actor_key,
      granted_at=excluded.granted_at,revoked_at=excluded.revoked_at,updated_at=now()`,
    [input.tenantId, input.provider, entry.capability, entry.decision, JSON.stringify(input.scopes), entry.explanation, input.actorKey ?? null])));
}
