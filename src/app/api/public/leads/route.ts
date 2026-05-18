import { NextRequest, NextResponse } from "next/server";
import { createPublicLead } from "@/lib/leads/create-public-lead";
import { publicLeadSchema } from "@/lib/leads/schemas";

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

  if (!parsed.data.email && !parsed.data.phone) {
    return NextResponse.json({ error: "Either email or phone is required." }, { status: 400 });
  }

  const result = await createPublicLead(parsed.data, {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ leadId: result.leadId }, { status: result.status });
}
