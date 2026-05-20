import { hashSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";

export type InviteTokenProfile = {
  id: string;
  email: string;
  role: string;
  status: string;
  workspaceName: string;
  expiresAt: string;
};

export async function getInviteByToken(token: string): Promise<InviteTokenProfile | null> {
  const result = await queryPostgres<{
    id: string;
    email: string;
    role: string;
    status: string;
    workspace_name: string;
    expires_at: Date | null;
  }>(
    `
    select i.id, i.email, i.role, i.status, t.name as workspace_name, i.expires_at
    from public.workspace_invites i
    join public.tenants t on t.id = i.tenant_id
    where i.invite_token_hash = $1
      and i.status = 'pending'
      and (i.expires_at is null or i.expires_at > now())
    limit 1
    `,
    [hashSessionToken(token)]
  );
  const invite = result?.rows[0];
  if (!invite) return null;

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    workspaceName: invite.workspace_name,
    expiresAt: invite.expires_at ? invite.expires_at.toISOString() : ""
  };
}
