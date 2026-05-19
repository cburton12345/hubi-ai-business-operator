"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const rotateSchema = z.object({
  formId: z.string().uuid()
});

export async function rotateFormPublicKeyAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = rotateSchema.safeParse({ formId: formData.get("formId") });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const formResult = await queryPostgres<{ id: string; tenant_id: string; public_key: string }>(
    "select id, tenant_id, public_key from public.forms where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, parsed.data.formId]
  );
  const form = formResult?.rows[0];
  if (!form) return;

  const nextKey = `form_${randomBytes(18).toString("hex")}`;
  await queryPostgres("update public.forms set public_key = $3 where tenant_id = $1 and id = $2", [
    workspaceId,
    form.id,
    nextKey
  ]);
  await queryPostgres(
    `
    insert into public.form_key_rotations (tenant_id, form_id, previous_public_key, new_public_key, rotated_by_user_id)
    values ($1, $2, $3, $4, $5)
    `,
    [workspaceId, form.id, form.public_key, nextKey, session?.userId ?? null]
  );

  revalidatePath("/app/forms");
}
