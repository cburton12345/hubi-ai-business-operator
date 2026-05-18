"use server";

import { redirect } from "next/navigation";
import { createPublicLead } from "@/lib/leads/create-public-lead";
import { publicLeadSchema } from "@/lib/leads/schemas";
import { evaluateLeadSubmission } from "@/lib/leads/spam-guard";

export async function submitPublicLeadForm(formData: FormData) {
  const publicKey = String(formData.get("formPublicKey") ?? "");
  const parsed = publicLeadSchema.safeParse({
    formPublicKey: publicKey,
    source: "public_form",
    sourceDetail: publicKey,
    website: String(formData.get("website") ?? "") || undefined,
    submittedAt: String(formData.get("submittedAt") ?? "") || undefined,
    utm: {
      source: String(formData.get("utmSource") ?? "") || undefined,
      medium: String(formData.get("utmMedium") ?? "") || undefined,
      campaign: String(formData.get("utmCampaign") ?? "") || undefined,
      term: String(formData.get("utmTerm") ?? "") || undefined,
      content: String(formData.get("utmContent") ?? "") || undefined
    },
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

  if (!parsed.success) {
    redirect(`/forms/${encodeURIComponent(publicKey)}?error=1`);
  }

  const guard = evaluateLeadSubmission(parsed.data, {});

  if (!guard.ok) {
    redirect(`/forms/${encodeURIComponent(publicKey)}?error=1`);
  }

  const result = await createPublicLead(parsed.data, {});

  if (!result.ok) {
    redirect(`/forms/${encodeURIComponent(publicKey)}?error=1`);
  }

  redirect(`/forms/${encodeURIComponent(publicKey)}/thanks`);
}
