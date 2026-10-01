"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { syncMailbox } from "@/lib/integrations/mailbox/sync";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.enum(["gmail_mailbox", "microsoft_mailbox"]);

export async function syncMailboxAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = schema.safeParse(formData.get("provider"));
  if (!parsed.success) redirect("/app/email-watch?error=provider");
  try {
    const result = await syncMailbox({ tenantId: await getCurrentWorkspaceId(), provider: parsed.data });
    redirect(`/app/email-watch?synced=${result.seen}&saved=${result.saved}`);
  } catch {
    redirect("/app/email-watch?error=sync");
  }
}
