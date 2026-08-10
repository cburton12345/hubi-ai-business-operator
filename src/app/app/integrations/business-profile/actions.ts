"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { discoverBusinessProfileLocations, selectBusinessProfileLocation, syncBusinessProfileReviews } from "@/lib/integrations/google-business-profile/sync";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function discoverBusinessProfileLocationsAction() {
  await requirePermission("tenant:manage");
  const tenantId = await getCurrentWorkspaceId();
  const count = await discoverBusinessProfileLocations(tenantId);
  revalidatePath("/app/integrations/business-profile");
  redirect(`/app/integrations/business-profile?locations=${count}`);
}

export async function selectBusinessProfileLocationAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = z.string().uuid().safeParse(formData.get("locationId"));
  if (!parsed.success) redirect("/app/integrations/business-profile?setup=invalid_location");
  await selectBusinessProfileLocation(await getCurrentWorkspaceId(), parsed.data);
  revalidatePath("/app/integrations/business-profile");
}

export async function syncBusinessProfileReviewsAction() {
  await requirePermission("tenant:manage");
  const count = await syncBusinessProfileReviews(await getCurrentWorkspaceId());
  revalidatePath("/app/integrations/business-profile");
  redirect(`/app/integrations/business-profile?reviews=${count}`);
}
