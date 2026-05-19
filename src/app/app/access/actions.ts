"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(160),
  password: z.string().min(8).max(200),
  role: z.enum(["owner", "admin", "operator", "viewer"])
});

export async function createWorkspaceUserAction(formData: FormData) {
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
