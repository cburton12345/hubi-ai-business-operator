"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgresRequired } from "@/lib/db/postgres";

const revokeSchema = z.object({ sessionId: z.string().uuid() });

export async function revokeTrustedDeviceAction(formData: FormData) {
  const session = await getCurrentAppSession();
  if (!session) return;
  const parsed = revokeSchema.safeParse({ sessionId: formData.get("sessionId") });
  if (!parsed.success || parsed.data.sessionId === session.sessionId) return;
  await queryPostgresRequired(
    `update public.app_sessions set revoked_at=now()
     where id=$1 and user_id=$2 and revoked_at is null`,
    [parsed.data.sessionId, session.userId],
    "trusted-device-revoke",
  );
  revalidatePath("/app/devices");
}

export async function revokeOtherTrustedDevicesAction() {
  const session = await getCurrentAppSession();
  if (!session) return;
  await queryPostgresRequired(
    `update public.app_sessions set revoked_at=now()
     where user_id=$1 and id<>$2 and revoked_at is null`,
    [session.userId, session.sessionId],
    "trusted-device-revoke-others",
  );
  revalidatePath("/app/devices");
}
