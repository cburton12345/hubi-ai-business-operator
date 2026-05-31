"use server";

import { redirect } from "next/navigation";
import { createPublicLead } from "@/lib/leads/create-public-lead";
import { publicLeadSchema } from "@/lib/leads/schemas";
import { evaluateLeadSubmission } from "@/lib/leads/spam-guard";

export async function submitHostedPageLeadAction(formData: FormData) {
  const brandSlug = String(formData.get("brandSlug") ?? "");
  const pageSlug = String(formData.get("pageSlug") ?? "");
  const formPublicKey = String(formData.get("formPublicKey") ?? "");
  const pagePath = `/sites/${brandSlug}/${pageSlug}`;

  const parsed = publicLeadSchema.safeParse({
    formPublicKey,
    source: "ferocity_landing_page",
    sourceDetail: pagePath,
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
    leadType: String(formData.get("leadType") ?? "quote"),
    consentToContact: formData.get("consentToContact") === "on",
    details: {
      serviceInterest: String(formData.get("serviceInterest") ?? "") || undefined,
      location: String(formData.get("location") ?? "") || undefined,
      landingPageId: String(formData.get("landingPageId") ?? "") || undefined,
      landingPagePath: pagePath,
      trackingCode: String(formData.get("trackingCode") ?? "") || undefined
    }
  });

  if (!parsed.success) {
    redirect(`${pagePath}?error=1`);
  }

  const guard = evaluateLeadSubmission(parsed.data, {});
  if (!guard.ok) {
    redirect(`${pagePath}?error=1`);
  }

  const result = await createPublicLead(parsed.data, {});
  if (!result.ok) {
    redirect(`${pagePath}?error=1`);
  }

  redirect(`${pagePath}?thanks=1`);
}
