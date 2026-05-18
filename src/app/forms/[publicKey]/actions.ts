"use server";

import { redirect } from "next/navigation";
import { createPublicLead } from "@/lib/leads/create-public-lead";
import { publicLeadSchema } from "@/lib/leads/schemas";

export async function submitPublicLeadForm(formData: FormData) {
  const publicKey = String(formData.get("formPublicKey") ?? "");
  const parsed = publicLeadSchema.safeParse({
    formPublicKey: publicKey,
    source: "public_form",
    sourceDetail: publicKey,
    name: String(formData.get("name") ?? "") || undefined,
    email: String(formData.get("email") ?? "") || undefined,
    phone: String(formData.get("phone") ?? "") || undefined,
    message: String(formData.get("message") ?? "") || undefined,
    leadType: String(formData.get("leadType") ?? "general"),
    consentToContact: formData.get("consentToContact") === "on",
    details: {
      serviceInterest: String(formData.get("serviceInterest") ?? "") || undefined,
      location: String(formData.get("location") ?? "") || undefined,
      rentalItemType: String(formData.get("rentalItemType") ?? "") || undefined,
      companyName: String(formData.get("companyName") ?? "") || undefined,
      role: String(formData.get("role") ?? "") || undefined,
      intent: String(formData.get("intent") ?? "") || undefined,
      assetCategory: String(formData.get("assetCategory") ?? "") || undefined,
      caseType: String(formData.get("caseType") ?? "") || undefined,
      state: String(formData.get("state") ?? "") || undefined,
      injuryType: String(formData.get("injuryType") ?? "") || undefined,
      legalDisclaimerAcknowledged: formData.get("legalDisclaimerAcknowledged") === "on"
    }
  });

  if (!parsed.success || (!parsed.data.email && !parsed.data.phone)) {
    redirect(`/forms/${encodeURIComponent(publicKey)}?error=1`);
  }

  const result = await createPublicLead(parsed.data, {});

  if (!result.ok) {
    redirect(`/forms/${encodeURIComponent(publicKey)}?error=1`);
  }

  redirect(`/forms/${encodeURIComponent(publicKey)}/thanks`);
}
