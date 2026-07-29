import { NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getManagedVideoAccessConfiguration } from "@/lib/providers/video-adapters";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ videoJobId: string }> }
) {
  const session = await getCurrentAppSession();
  if (!session?.userId) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  const configuration = getManagedVideoAccessConfiguration();
  if (!configuration) {
    return NextResponse.json({ ok: false, error: "The video provider is not connected." }, { status: 409 });
  }
  const [{ videoJobId }, tenantId] = await Promise.all([params, getCurrentWorkspaceId()]);
  const result = await queryPostgres<{
    provider_key: string;
    status: string;
    provider_response_json: unknown;
  }>(
    `
    select provider_key, status, provider_response_json
    from public.marketing_video_jobs
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [tenantId, videoJobId]
  );
  const job = result?.rows[0];
  const response = record(job?.provider_response_json);
  const providerJobId = typeof response.providerJobId === "string" ? response.providerJobId : null;
  if (!job || job.provider_key !== configuration.providerKey || job.status !== "completed" || !providerJobId) {
    return NextResponse.json({ ok: false, error: "The rendered video is not available." }, { status: 404 });
  }

  const providerResponse = await fetch(
    `https://api.openai.com/v1/videos/${encodeURIComponent(providerJobId)}/content`,
    {
      headers: { Authorization: `Bearer ${configuration.apiKey}` },
      cache: "no-store"
    }
  );
  if (!providerResponse.ok || !providerResponse.body) {
    return NextResponse.json(
      { ok: false, error: "The provider could not return this rendered video." },
      { status: providerResponse.status === 404 ? 404 : 502 }
    );
  }

  return new Response(providerResponse.body, {
    status: 200,
    headers: {
      "Content-Type": providerResponse.headers.get("content-type") || "video/mp4",
      "Content-Disposition": `inline; filename="ferocity-video-${videoJobId}.mp4"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
