import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePublicRateLimit } from "@/lib/security/rate-limit";
import { createSupportIssue } from "@/lib/support/create-support-issue";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  issueType: z.enum(["account", "billing", "technical", "privacy", "other"]),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(12).max(5000),
  website: z.string().max(0).optional()
});

export async function POST(request: NextRequest) {
  const limit = await consumePublicRateLimit({
    request,
    scope: "public-support",
    limit: 6,
    windowSeconds: 60 * 60
  });
  if (!limit.allowed) return NextResponse.redirect(new URL("/support?error=limit", request.url), 303);

  const formData = await request.formData().catch(() => null);
  const parsed = schema.safeParse(formData ? {
    name: formData.get("name"),
    email: formData.get("email"),
    issueType: formData.get("issueType"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    website: String(formData.get("website") ?? "")
  } : null);
  if (!parsed.success || parsed.data.website) {
    return NextResponse.redirect(new URL("/support?error=invalid", request.url), 303);
  }

  try {
    const result = await createSupportIssue({
      source: "public_form",
      issueType: parsed.data.issueType,
      requesterName: parsed.data.name,
      requesterEmail: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      metadata: { sourcePath: "/support" }
    });
    return NextResponse.redirect(new URL(`/support?sent=1&reference=${encodeURIComponent(result.issueId)}`, request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/support?error=unavailable", request.url), 303);
  }
}
