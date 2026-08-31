"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";

const schema = z.object({
  issueId: z.string().uuid(),
  status: z.enum(["open", "reviewing", "resolved", "dismissed", "archived"])
});

export async function updatePlatformSupportStatusAction(formData: FormData) {
  const [session, legacyAdmin] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);
  if (!legacyAdmin && session?.platformRole !== "super_admin") throw new Error("Platform administrator access is required.");
  const parsed = schema.safeParse({ issueId: formData.get("issueId"), status: formData.get("status") });
  if (!parsed.success) throw new Error("Choose a valid support request and status.");
  await queryPostgres(
    `update public.support_issue_queue set status=$2,
       resolved_at=case when $2 in ('resolved','dismissed','archived') then now() else null end,
       metadata_json=metadata_json || $3::jsonb,updated_at=now() where id=$1`,
    [parsed.data.issueId, parsed.data.status, JSON.stringify({ lastUpdatedByPlatformUserId: session?.userId ?? null })]
  );
  revalidatePath("/app/platform-activity");
}
