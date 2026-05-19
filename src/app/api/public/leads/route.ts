import { NextRequest, NextResponse } from "next/server";
import { createPublicLead } from "@/lib/leads/create-public-lead";
import { publicLeadSchema } from "@/lib/leads/schemas";
import { evaluateLeadSubmission } from "@/lib/leads/spam-guard";
import { logAppError } from "@/lib/observability/log-error";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = publicLeadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid lead payload.",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const requestMeta = {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined
  };
  const guard = evaluateLeadSubmission(parsed.data, requestMeta);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: guard.status });
  }

  const result = await createPublicLead(parsed.data, requestMeta);

  if (!result.ok) {
    await logAppError({
      source: "api.public.leads",
      message: result.error ?? "Unable to create lead.",
      severity: result.status >= 500 ? "error" : "warning",
      metadata: { formPublicKey: parsed.data.formPublicKey, status: result.status }
    });
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ leadId: result.leadId }, { status: result.status });
}
