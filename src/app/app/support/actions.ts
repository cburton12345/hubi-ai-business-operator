"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { createSupportIssue } from "@/lib/support/create-support-issue";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

const schema = z.object({
  issueType: z.enum(["account", "billing", "technical", "workflow", "integration", "other"]),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(12).max(5000)
});

export async function submitWorkspaceSupportAction(formData: FormData) {
  const [session, workspace] = await Promise.all([getCurrentAppSession(), getCurrentWorkspace()]);
  if (!session) redirect("/login?next=/app/support");

  const parsed = schema.safeParse({
    issueType: formData.get("issueType"),
    subject: formData.get("subject"),
    message: formData.get("message")
  });
  if (!parsed.success) redirect("/app/support?error=invalid");

  let issueId: string;
  try {
    const result = await createSupportIssue({
      tenantId: workspace.id,
      source: "internal",
      issueType: parsed.data.issueType,
      requesterName: session.name,
      requesterEmail: session.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      metadata: { requesterUserId: session.userId, workspaceSlug: workspace.slug }
    });
    issueId = result.issueId;
  } catch {
    redirect("/app/support?error=unavailable");
  }
  redirect(`/app/support?sent=1&reference=${encodeURIComponent(issueId)}`);
}
