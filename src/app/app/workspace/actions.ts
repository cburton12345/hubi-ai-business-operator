"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appSessionCookieName, getCurrentAppSession } from "@/lib/auth/session";
import { hashSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { selectedWorkspaceCookieName } from "@/lib/workspace/current-workspace";

const schema = z.object({
  workspaceId: z.string().min(1),
  next: z.string().optional()
});

export async function switchWorkspaceAction(formData: FormData) {
  const parsed = schema.safeParse({
    workspaceId: formData.get("workspaceId"),
    next: formData.get("next")?.toString()
  });

  if (!parsed.success) return;

  const cookieStore = await cookies();
  const session = await getCurrentAppSession();
  const token = cookieStore.get(appSessionCookieName)?.value;

  if (session && token) {
    const allowed = await queryPostgres(
      session.platformRole === "super_admin"
        ? "select id from public.tenants where id = $1 limit 1"
        : `
          select t.id
          from public.tenants t
          join public.tenant_users tu on tu.tenant_id = t.id
          where t.id = $1 and tu.user_id = $2 and tu.status = 'active'
          limit 1
          `,
      session.platformRole === "super_admin" ? [parsed.data.workspaceId] : [parsed.data.workspaceId, session.userId]
    );

    if ((allowed?.rowCount ?? 0) > 0) {
      await queryPostgres(
        `
        update public.app_sessions
        set selected_tenant_id = $2
        where session_token_hash = $1 and revoked_at is null
        `,
        [hashSessionToken(token), parsed.data.workspaceId]
      );
    }
  }

  cookieStore.set(selectedWorkspaceCookieName, parsed.data.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  revalidatePath("/app");
  redirect(parsed.data.next?.startsWith("/app") ? parsed.data.next : "/app");
}
