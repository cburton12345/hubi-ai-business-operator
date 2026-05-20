import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type WorkspaceInviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  inviteLink: string;
  createdAt: string;
};

export async function getWorkspaceInviteRows(): Promise<WorkspaceInviteRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    email: string;
    role: string;
    status: string;
    expires_at: Date | null;
    invite_token_hash: string | null;
    created_at: Date;
  }>(
    `
    select id, email, role, status, expires_at, invite_token_hash, created_at
    from public.workspace_invites
    where tenant_id = $1
    order by created_at desc
    limit 20
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : "",
    inviteLink: row.invite_token_hash ? "Created. Copy the link immediately from the confirmation after creating an invite." : "No link token",
    createdAt: row.created_at.toISOString()
  }));
}
