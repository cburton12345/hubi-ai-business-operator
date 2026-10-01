import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { syncMailbox } from "@/lib/integrations/mailbox/sync";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const bodySchema = z.object({ provider: z.enum(["gmail_mailbox", "microsoft_mailbox"]), limit: z.number().int().min(1).max(50).optional() });

export async function POST(request: Request) {
  await requirePermission("tenant:manage");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Choose a supported inbox and try again." }, { status: 400 });
  try {
    const tenantId = await getCurrentWorkspaceId();
    const result = await syncMailbox({ tenantId, ...parsed.data });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Mailbox sync failed." }, { status: 502 });
  }
}
