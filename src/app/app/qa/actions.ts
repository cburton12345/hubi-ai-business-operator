"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { runOperationalQa } from "@/lib/qa/run-operational-qa";

export async function runOperationalQaAction() {
  await requirePermission("tenant:manage");
  const session = await getCurrentAppSession();
  await runOperationalQa(session?.userId ?? null);
  revalidatePath("/app/qa");
  revalidatePath("/app/beta");
}
