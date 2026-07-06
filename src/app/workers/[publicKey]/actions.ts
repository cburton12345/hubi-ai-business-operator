"use server";

import { redirect } from "next/navigation";
import {
  createPublicWorkerAvailability,
  publicWorkerIntakeSchema
} from "@/lib/labor-bench/public-worker-intake";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export async function submitPublicWorkerIntake(formData: FormData) {
  const publicKey = String(formData.get("formPublicKey") ?? "");
  const parsed = publicWorkerIntakeSchema.safeParse({
    formPublicKey: publicKey,
    website: value(formData, "website"),
    submittedAt: value(formData, "submittedAt"),
    name: value(formData, "name"),
    trade: value(formData, "trade"),
    serviceArea: value(formData, "serviceArea"),
    homeLocation: value(formData, "homeLocation"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
    availabilityLabel: value(formData, "availabilityLabel"),
    travelRadiusMiles: value(formData, "travelRadiusMiles"),
    rateLabel: value(formData, "rateLabel"),
    experienceLabel: value(formData, "experienceLabel"),
    toolsAndInsurance: value(formData, "toolsAndInsurance"),
    notes: value(formData, "notes"),
    consentToContact: formData.get("consentToContact") === "on",
    utmSource: value(formData, "utmSource"),
    utmMedium: value(formData, "utmMedium"),
    utmCampaign: value(formData, "utmCampaign"),
    pageUrl: value(formData, "pageUrl"),
    referrer: value(formData, "referrer")
  });

  if (!parsed.success) {
    redirect(`/workers/${encodeURIComponent(publicKey)}?error=1`);
  }

  const result = await createPublicWorkerAvailability(parsed.data);
  if (!result.ok) {
    if (result.reason === "limit") {
      redirect(`/workers/${encodeURIComponent(publicKey)}?error=limit`);
    }
    redirect(`/workers/${encodeURIComponent(publicKey)}?error=1`);
  }

  redirect(`/workers/${encodeURIComponent(publicKey)}/thanks`);
}
