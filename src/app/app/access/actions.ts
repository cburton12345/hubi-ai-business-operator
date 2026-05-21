"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(160),
  password: z.string().min(8).max(200),
  role: z.enum(["owner", "admin", "operator", "viewer"])
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "operator", "viewer"])
});

const brandAccessSchema = z.object({
  brandId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "operator", "viewer"]),
  notes: z.string().max(600).optional()
});

export async function createWorkspaceUserAction(formData: FormData) {
  await requirePermission("tenant:manage");

  const parsed = schema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role")
  });

  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const userResult = await queryPostgres<{ id: string }>(
    `
    insert into public.users (email, name, platform_role)
    values (lower($1), $2, 'user')
    on conflict (email) do update
    set name = excluded.name, updated_at = now()
    returning id
    `,
    [parsed.data.email, parsed.data.name]
  );
  const userId = userResult?.rows[0]?.id;
  if (!userId) return;

  const credential = hashPassword(parsed.data.password);
  await queryPostgres(
    `
    insert into public.user_password_credentials (user_id, password_hash, password_salt, password_iterations, must_reset_password)
    values ($1, $2, $3, $4, false)
    on conflict (user_id) do update
    set password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        password_iterations = excluded.password_iterations,
        must_reset_password = false,
        updated_at = now()
    `,
    [userId, credential.hash, credential.salt, credential.iterations]
  );

  await queryPostgres(
    `
    insert into public.tenant_users (tenant_id, user_id, role, status)
    values ($1, $2, $3, 'active')
    on conflict (tenant_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now()
    `,
    [workspaceId, userId, parsed.data.role]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, user_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, 'user', 'workspace_user.created', 'user', $2, $3::jsonb)
    `,
    [workspaceId, userId, JSON.stringify({ role: parsed.data.role, email: parsed.data.email })]
  );

  revalidatePath("/app/access");
}

export async function createWorkspaceInviteAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = inviteSchema.safeParse({
    email: formData.get("inviteEmail"),
    role: formData.get("inviteRole")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const token = randomSessionToken();
  await queryPostgres(
    `
    insert into public.workspace_invites (tenant_id, email, role, status, invited_by_user_id, invite_token_hash, expires_at, updated_at)
    values ($1, lower($2), $3, 'pending', $4, $5, now() + interval '14 days', now())
    on conflict (tenant_id, email) do update
    set role = excluded.role,
        status = 'pending',
        invited_by_user_id = excluded.invited_by_user_id,
        invite_token_hash = excluded.invite_token_hash,
        expires_at = excluded.expires_at,
        revoked_at = null,
        updated_at = now()
    `,
    [workspaceId, parsed.data.email, parsed.data.role, session?.userId ?? null, hashSessionToken(token)]
  );

  revalidatePath("/app/access");
  redirect(`/app/access?invite=${encodeURIComponent(token)}`);
}

export async function grantBrandAccessAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = brandAccessSchema.safeParse({
    brandId: formData.get("brandId"),
    userId: formData.get("userId"),
    role: formData.get("brandRole"),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.brand_user_access (tenant_id, brand_id, user_id, role, status, notes, updated_at)
    values ($1, $2, $3, $4, 'active', $5, now())
    on conflict (tenant_id, brand_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        notes = excluded.notes,
        updated_at = now()
    `,
    [workspaceId, parsed.data.brandId, parsed.data.userId, parsed.data.role, parsed.data.notes?.trim() || null]
  );
  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, user_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, 'user', 'brand_access.granted', 'brand', $3, $4::jsonb)
    `,
    [
      workspaceId,
      parsed.data.userId,
      parsed.data.brandId,
      JSON.stringify({ role: parsed.data.role, notes: parsed.data.notes ?? "" })
    ]
  );
  revalidatePath("/app/access");
}
