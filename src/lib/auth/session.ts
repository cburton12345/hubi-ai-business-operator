import { cookies } from "next/headers";
import { queryPostgres } from "@/lib/db/postgres";
import { hashSessionToken } from "@/lib/auth/password";
import type { PlatformRole } from "@/types/core";

export const appSessionCookieName = "hubi_app_session";

export type CurrentAppSession = {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  selectedTenantId: string | null;
};

export async function getCurrentAppSession(): Promise<CurrentAppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(appSessionCookieName)?.value;
  if (!token) return null;

  const result = await queryPostgres<{
    session_id: string;
    user_id: string;
    email: string;
    name: string | null;
    platform_role: PlatformRole;
    selected_tenant_id: string | null;
  }>(
    `
    select
      s.id as session_id,
      u.id as user_id,
      u.email,
      u.name,
      u.platform_role,
      s.selected_tenant_id
    from public.app_sessions s
    join public.users u on u.id = s.user_id
    where s.session_token_hash = $1
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
    `,
    [hashSessionToken(token)]
  );
  const row = result?.rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    name: row.name ?? row.email,
    platformRole: row.platform_role,
    selectedTenantId: row.selected_tenant_id
  };
}
